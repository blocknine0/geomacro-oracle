// scripts/ingest-news.js
//
// Standalone news ingestion script for Geomacro.
// Runs via GitHub Actions on a schedule, replacing the manual "Refresh"
// button trigger that Lovable's live-feed.functions.ts used before.
//
// Pipeline:
// 1. Fetches recent articles from NewsAPI across 4 categories
// 2. Deduplicates against what's already in Supabase (by URL & normalized Title)
// 3. Sends each new article to Groq for severity/confidence/relevance scoring
// 4. Rejects off-topic articles before they reach the feed
// 5. Inserts passing articles into the Supabase events table

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const CATEGORIES = [
  {
    name: "geopolitics",
    queries: [
      "war ceasefire military conflict",
      "NATO Russia China Taiwan sanctions",
      "nuclear weapons diplomacy treaty",
    ],
  },
  {
    name: "macro",
    queries: [
      "Federal Reserve interest rates inflation",
      "recession GDP unemployment central bank",
      "dollar yuan yen currency forex",
    ],
  },
  {
    name: "rare_earth",
    queries: [
      "rare earth minerals lithium cobalt nickel supply chain",
      "semiconductor chips export controls ASML",
      "critical minerals mining battery materials",
      "strategic industrial policy chip war",
      "EV battery supply chain disruption",
    ],
  },
  {
    name: "crypto",
    queries: [
      "Bitcoin Ethereum regulation SEC crypto",
      "stablecoin CBDC DeFi blockchain policy",
      "crypto exchange hack fraud",
    ],
  },
];

const MAX_PER_CATEGORY = 2; // reduced to avoid Groq rate limits
const HOURS_BACK = 48;

// টাইটেল ম্যাচিং নিখুঁত করার জন্য স্ট্রিং নরমালাইজ করার ফাংশন
function normalizeTitle(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // শুধু আলফানিউমেরিক ক্যারেক্টার রাখবে (স্পেস বা স্পেশাল সাইন বাদ)
    .trim();
}

async function fetchNewsAPI(query, apiKey) {
  const from = new Date(Date.now() - HOURS_BACK * 60 * 60 * 1000).toISOString();
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${from}&sortBy=publishedAt&pageSize=5&language=en&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) throw new Error(`NewsAPI error: ${res.status}`);
  const data = await res.json();
  return data.articles || [];
}

async function fetchGuardianAPI(query, apiKey) {
  const from = new Date(Date.now() - HOURS_BACK * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const url = `https://content.guardianapis.com/search?q=${encodeURIComponent(query)}&from-date=${from}&order-by=newest&page-size=5&show-fields=trailText&api-key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Guardian API error: ${res.status}`);
  const data = await res.json();
  return (data.response?.results || []).map((a) => ({
    url: a.webUrl,
    title: a.webTitle,
    description: a.fields?.trailText || "",
    source: { name: "The Guardian" },
    publishedAt: a.webPublicationDate,
  }));
}

async function fetchArticles(query, newsApiKey, guardianApiKey) {
  if (newsApiKey) {
    try {
      const articles = await fetchNewsAPI(query, newsApiKey);
      return articles;
    } catch (err) {
      if (err.message === "RATE_LIMIT") {
        console.warn(`  NewsAPI rate limit hit for query "${query}". Trying Guardian...`);
      } else {
        console.warn(`  NewsAPI error: ${err.message}. Trying Guardian...`);
      }
    }
  }
  if (guardianApiKey) {
    try {
      return await fetchGuardianAPI(query, guardianApiKey);
    } catch (err) {
      console.warn(`  Guardian API error: ${err.message}.`);
    }
  }
  return [];
}

async function classifyWithGroq(article, category, groqKey) {
  const categoryContext = category === "rare_earth"
    ? `rare_earth (includes: rare earth minerals, lithium, cobalt, nickel, critical minerals, semiconductors, chips, ASML, chip export controls, AI hardware supply chains, battery materials, EV supply chains, strategic industrial policy, mining policy)`
    : category;

  const prompt = `You are a geopolitical risk classifier. Analyze this news article and respond ONLY with valid JSON, no markdown, no explanation.

Article title: ${article.title}
Article description: ${article.description || ""}
Category context: ${categoryContext}

Respond with this exact JSON structure:
{
  "relevant": true or false,
  "severity": integer 0-100,
  "confidence": integer 0-100,
  "narrative": "one sentence summary of the risk",
  "stage": "one of: Emerging, Building, Active Escalation, De-escalation, Resolved"
}

Severity guide: 0-20 noise, 21-40 minor, 41-60 moderate, 61-80 significant, 81-100 critical.
Mark relevant false if the article is not genuinely about ${categoryContext} risk at a macro level.
For rare_earth category: semiconductors, chip export controls, ASML, critical minerals, battery supply chains and strategic industrial policy ARE relevant. Lifestyle, entertainment, sports are NOT relevant.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    }),
  });

  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";

  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    console.warn("Groq returned unparseable JSON, skipping article.");
    return null;
  }
}

async function main() {
  const { NEWSAPI_KEY, GROQ_API_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, GUARDIAN_API_KEY } = process.env;

  if (!GROQ_API_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY) {
    throw new Error("Missing required environment variables.");
  }

  if (!NEWSAPI_KEY && !GUARDIAN_API_KEY) {
    throw new Error("At least one of NEWSAPI_KEY or GUARDIAN_API_KEY is required.");
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);

  // 🛑 পার্মানেন্ট ফিক্স: ইউআরএল এর সাথে সোর্স টাইটেলও তুলে আনা হচ্ছে ডুপ্লিকেট চেকের জন্য
  const { data: existing } = await supabase
    .from("events")
    .select("source_url, source_title")
    .order("created_at", { ascending: false })
    .limit(500);

  const existingUrls = new Set((existing || []).map((e) => e.source_url));
  
  // 🛑 পার্মানেন্ট ফিক্স: এক্সিস্টিং টাইটেলগুলোকে নরমালাইজ করে হ্যাশ সেটে রাখা
  const existingTitles = new Set((existing || []).map((e) => normalizeTitle(e.source_title)));
  
  console.log(`${existingUrls.size} existing unique URLs and ${existingTitles.size} existing titles fetched from Supabase.`);

  let totalInserted = 0;

  for (const category of CATEGORIES) {
    console.log(`\nProcessing category: ${category.name}`);
    const seenUrls = new Set();
    const seenTitles = new Set();
    const candidates = [];

    for (const query of category.queries) {
      let articles;
      try {
        articles = await fetchArticles(query, NEWSAPI_KEY, GUARDIAN_API_KEY);
      } catch (err) {
        console.warn(`  Error fetching articles for query "${query}": ${err.message}`);
        continue;
      }

      for (const article of articles) {
        if (!article.url || !article.title) continue;
        
        const normTitle = normalizeTitle(article.title);

        // 🛑 ১. ইউআরএল অথবা টাইটেল আগে থেকেই সুপাবেসে আছে কিনা চেক করা
        if (existingUrls.has(article.url) || existingTitles.has(normTitle)) continue;
        
        // 🛑 ২. এই কারেন্ট রান বা লুপের মধ্যে ইতিমধ্যে দেখা হয়েছে কিনা চেক করা
        if (seenUrls.has(article.url) || seenTitles.has(normTitle)) continue;
        
        seenUrls.add(article.url);
        seenTitles.add(normTitle);
        candidates.push(article);
      }
    }

    console.log(`  ${candidates.length} new clean candidate articles found.`);

    let insertedThisCategory = 0;

    for (const article of candidates) {
      if (insertedThisCategory >= MAX_PER_CATEGORY) break;

      let classification;
      try {
        classification = await classifyWithGroq(article, category.name, GROQ_API_KEY);
      } catch (err) {
        console.warn(`  Groq error for "${article.title}": ${err.message}`);
        continue;
      }

      if (!classification || !classification.relevant) {
        console.log(`  Rejected by LLM relevance check: "${article.title}"`);
        continue;
      }

      const event = {
        id: crypto.randomUUID(),
        source_url: article.url,
        source_title: article.title,
        source_name: article.source?.name || "Unknown",
        category: category.name,
        narrative: classification.narrative,
        summary: article.description || "",
        stage: classification.stage,
        severity: classification.severity,
        confidence: classification.confidence,
        delta: 0,
        published_at: article.publishedAt || new Date().toISOString(),
        created_at: new Date().toISOString(),
        market_created: false,
        market_threshold: null,
      };

      const { error } = await supabase.from("events").insert(event);

      if (error) {
        console.warn(`  Insert error for "${article.title}": ${error.message}`);
        continue;
      }

      console.log(
        `  ✅ Successfully Inserted: "${article.title}" (severity ${classification.severity})`
      );
      
      existingUrls.add(article.url);
      existingTitles.add(normalizeTitle(article.title));
      insertedThisCategory++;
      totalInserted++;

      // Delay to avoid Groq rate limits
      await new Promise((r) => setTimeout(r, 1500));
    }

    console.log(`  Inserted ${insertedThisCategory} events for ${category.name}.`);
  }

  console.log(`\nDone. Total unique inserted: ${totalInserted} events.`);
}

main().catch((err) => {
  console.error("Fatal error in ingest-news script:", err);
  process.exit(1);
});
