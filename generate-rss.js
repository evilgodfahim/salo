const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const RSS = require("rss");

const baseURL = "https://www.shomoyeralo.com";
const targetURL = "https://www.shomoyeralo.com/menu/295";
const flareSolverrURL = process.env.FLARESOLVERR_URL || "http://localhost:8191";

fs.mkdirSync("./feeds", { recursive: true });

// ===== FLARESOLVERR =====
async function fetchWithFlareSolverr(url) {
  console.log(`Fetching ${url} via FlareSolverr...`);
  const response = await axios.post(
    `${flareSolverrURL}/v1`,
    { cmd: "request.get", url, maxTimeout: 60000 },
    { headers: { "Content-Type": "application/json" }, timeout: 65000 }
  );
  if (response.data?.solution) {
    console.log("✅ FlareSolverr successfully bypassed protection");
    return response.data.solution.response;
  }
  throw new Error("FlareSolverr did not return a solution");
}

// ===== MAIN =====
async function generateRSS() {
  try {
    const htmlContent = await fetchWithFlareSolverr(targetURL);
    const $ = cheerio.load(htmlContent);
    const items = [];
    const seen = new Set();

    function addItem(title, href, description = "") {
      title = title.replace(/\s+/g, " ").trim();
      if (!title || !href || seen.has(href)) return;
      seen.add(href);
      items.push({
        title,
        link: href.startsWith("http") ? href : baseURL + href,
        description: description.replace(/\s+/g, " ").trim(),
        date: new Date(),
      });
    }

    // ── Lead article ──────────────────────────────────────────────────────────
    // Structure: div.title_lead > a  (inside a div.m_none lead wrapper)
    const $leadAnchor = $("div.title_lead a").first();
    const leadTitle = $leadAnchor.text();
    const leadHref  = $leadAnchor.attr("href");
    // Excerpt lives in the sibling div with inline padding style
    const leadDesc  = $leadAnchor
      .closest("div.m_none")
      .find("div[style*='padding: 15px 0 0 15px']")
      .text()
      .replace(/\.\.\.$/, "")   // strip trailing ellipsis
      .trim();

    addItem(leadTitle, leadHref, leadDesc);

    // ── Grid articles (desktop cards only) ────────────────────────────────────
    // Structure: div.col-lg-4.m_none > div.title_body > a
    // Mobile mirrors use div.titleBTM — excluded automatically since they
    // don't contain div.title_body, so no de-dup logic needed beyond seen set.
    $("div.title_body a").each((_, el) => {
      const $a   = $(el);
      const title = $a.text();
      const href  = $a.attr("href");
      addItem(title, href);
    });

    console.log(`Found ${items.length} articles`);

    if (items.length === 0) {
      console.log("⚠️  No articles found, creating placeholder item");
      items.push({
        title:       "কোনো নিবন্ধ পাওয়া যায়নি",
        link:        targetURL,
        description: "RSS ফিড কোনো নিবন্ধ স্ক্র্যাপ করতে পারেনি।",
        date:        new Date(),
      });
    }

    const feed = new RSS({
      title:       "সময়ের আলো – মতামত",
      description: "সময়ের আলো-র সর্বশেষ মতামত নিবন্ধ",
      feed_url:    targetURL,
      site_url:    baseURL,
      language:    "bn",
      pubDate:     new Date().toUTCString(),
    });

    items.slice(0, 20).forEach(item => {
      feed.item({
        title:       item.title,
        url:         item.link,
        description: item.description || undefined,
        date:        item.date,
      });
    });

    fs.writeFileSync("./feeds/feed.xml", feed.xml({ indent: true }));
    console.log(`✅ RSS generated with ${items.length} items.`);

  } catch (err) {
    console.error("❌ Error generating RSS:", err.message);

    const feed = new RSS({
      title:       "সময়ের আলো – মতামত (error fallback)",
      description: "RSS ফিড স্ক্র্যাপ করা সম্ভব হয়নি",
      feed_url:    targetURL,
      site_url:    baseURL,
      language:    "bn",
      pubDate:     new Date().toUTCString(),
    });
    feed.item({
      title:       "ফিড তৈরি ব্যর্থ হয়েছে",
      url:         targetURL,
      description: "স্ক্র্যাপিংয়ের সময় একটি ত্রুটি ঘটেছে।",
      date:        new Date(),
    });
    fs.writeFileSync("./feeds/feed.xml", feed.xml({ indent: true }));
  }
}

generateRSS();
