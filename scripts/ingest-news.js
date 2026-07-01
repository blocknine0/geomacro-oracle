import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// ১. সুপাবেস ও গ্রোক ইনিশিয়ালাইজেশন (Timeout ও Max Retries সহ)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  timeout: 20 * 1000, // ২০ সেকেন্ড টাইমআউট লিমিট
  maxRetries: 3,       // কানেকশন ড্রপ করলে অটো ৩ বার ট্রাই করবে
  fetch: fetch          // 🛠️ undici (built-in fetch)-এর POST premature-close bug
                         // এড়াতে node-fetch explicitly পাস করা হলো
});

// ২. সম্পূর্ণ আন্তর্জাতিক লেভেলের গ্লোবাল ক্যাটাগরি এবং কুয়েরি সেট
const CATEGORIES = [
  {
    name: "geopolitics",
    queries: [
      "global war military conflict ceasefire",
      "NATO Russia China Taiwan Middle East sanctions",
      "nuclear weapons diplomacy multilateral treaty UN",
      "BRICS global south bilateral security pact",
    ],
  },
  {
    name: "macro",
    queries: [
      "Federal Reserve ECB BOJ interest rates inflation central bank",
      "global recession GDP stagflation IMF World Bank forecast",
      "sovereign debt default restructuring IMF bailout emerging markets",
      "currency war dollar dominance yuan yen currency devaluation",
      "supply chain shock shipping disruption energy crisis oil prices",
      "global banking crisis contagion systemic risk credit crunch",
    ],
  },
  {
    name: "rare_earth",
    queries: [
      "semiconductor ASML TSMC chips export controls",
      "lithium cobalt nickel critical minerals mining policy",
      "rare earth refining monopoly processing export ban China",
      "global tech war technology decoupling supply chain localization",
      "US EU Africa South America critical raw materials trade agreement",
    ],
  },
  {
    name: "crypto",
    queries: [
      "global crypto regulation SEC MiCA cross border payment",
      "Bitcoin Ethereum institutional adoption spot ETF volume",
      "stablecoin CBDC DeFi blockchain policy global financial system",
      "crypto exchange liquidity crisis hack exploit enforcement action",
    ],
  },
];

// ৩. টাইটেল নরমালাইজেশন ফাংশন
function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// প্রপার ডিলে ফাংশন
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ৪. Groq LLM এর মাধ্যমে রিলেভেন্স ও সিভিয়ারিটি স্কোরিং মেথড
// এখন narrative + summary + stage + confidence ও রিটার্ন করে, যাতে
// events টেবিলের NOT NULL কলামগুলো ঠিকভাবে পূরণ করা যায়।
async function checkArticleRelevance(title, description, category) {
  try {
    // 💡 ফ্রি টায়ারের রেট ও নেটওয়ার্ক স্ট্যাবিলিটির জন্য ১.৫ সেকেন্ড ডিলে
    await delay(1500);

    const prompt = `You are an expert financial and geopolitical risk analyst. Analyze the following article for the category "${category}".

    Title: "${title}"
    Description: "${description}"

    Determine if this article represents a significant macro/geopolitical trend or shock. Discard sports, celebrity gossip, local crimes, or casual entertainment reviews.

    Respond STRICTLY in JSON format with these keys:
    - "relevant": boolean
    - "severity": number (0-100, where 100 is catastrophic global impact, e.g., world war or global systemic market crash)
    - "confidence": number (0-100, how confident you are in this assessment)
    - "narrative": string (a short one-sentence framing of what risk/trend this event represents, e.g. "Escalating US-Iran military tension raises oil supply shock risk")
    - "summary": string (2-3 sentence neutral summary of the article's core facts)

    JSON format example:
    { "relevant": true, "severity": 65, "confidence": 70, "narrative": "...", "summary": "..." }`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(chatCompletion.choices[0].message.content);

    // ডিফেন্সিভ ডিফল্ট, যাতে LLM কোনো কী মিস করলেও insert ফেইল না করে
    return {
      relevant: !!result.relevant,
      severity: Number.isFinite(result.severity) ? result.severity : 0,
      confidence: Number.isFinite(result.confidence) ? result.confidence : 50,
      narrative: result.narrative || title,
      summary: result.summary || description || title,
    };
  } catch (error) {
    console.error(`❌ LLM check failed for "${title}":`, error.message);
    return { relevant: false, severity: 0, confidence: 0, narrative: title, summary: description || title };
  }
}

// ৫. এপিআই ফেচিং হ্যান্ডলার (NewsAPI ফলব্যাক টু দ্য গার্ডিয়ান)
async function fetchArticlesFromApis(query) {
  let articles = [];

  try {
    const newsApiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${process.env.NEWSAPI_KEY}`;
    const response = await fetch(newsApiUrl);

    if (response.status === 429) {
      throw new Error("NewsAPI rate limit hit");
    }

    const data = await response.json();
    if (data.articles) {
      return data.articles.map(a => ({
        title: a.title,
        description: a.description || "",
        url: a.url,
        publishedAt: a.publishedAt || new Date().toISOString(),
        source: 'newsapi'
      }));
    }
  } catch (e) {
    console.log(`   NewsAPI rate limit hit for query "${query}". Trying Guardian...`);

    try {
      const guardianUrl = `https://content.guardianapis.com/search?q=${encodeURIComponent(query)}&show-fields=trailText&page-size=10&api-key=${process.env.GUARDIAN_API_KEY}`;
      const response = await fetch(guardianUrl);
      const data = await response.json();

      if (data.response && data.response.results) {
        return data.response.results.map(a => ({
          title: a.webTitle,
          description: a.fields?.trailText || "",
          url: a.webUrl,
          publishedAt: a.webPublicationDate || new Date().toISOString(),
          source: 'guardian'
        }));
      }
    } catch (ge) {
      console.error(`   Failed fetching from Guardian for query "${query}":`, ge.message);
    }
  }

  return articles;
}

// ৬. মেইন ইনজেকশন রান ফাংশন
async function ingestNews() {
  console.log("Run node scripts/ingest-news.js");

  const { data: existingEvents, error: fetchError } = await supabase
    .from('events')
    .select('source_url, source_title');

  if (fetchError) {
    console.error("❌ Failed to fetch existing entries from Supabase:", fetchError.message);
    return;
  }

  const existingUrls = new Set(existingEvents.map(e => e.source_url));
  const existingTitles = new Set(existingEvents.map(e => normalizeTitle(e.source_title)));

  console.log(`${existingUrls.size} existing unique URLs and ${existingTitles.size} existing titles fetched from Supabase.`);

  let totalInserted = 0;

  for (const category of CATEGORIES) {
    console.log(`\nProcessing category: ${category.name}`);
    let categoryInserted = 0;
    let seenInCurrentRun = new Set();

    for (const query of category.queries) {
      const fetched = await fetchArticlesFromApis(query);

      for (const article of fetched) {
        const normTitle = normalizeTitle(article.title);

        if (existingUrls.has(article.url) || existingTitles.has(normTitle) || seenInCurrentRun.has(normTitle)) {
          continue;
        }

        seenInCurrentRun.add(normTitle);

        const assessment = await checkArticleRelevance(article.title, article.description, category.name);

        if (assessment.relevant) {
          const { error: insertError } = await supabase
            .from('events')
            .insert([{
              source_url: article.url,
              source_title: article.title,
              source_name: article.source,
              category: category.name,
              narrative: assessment.narrative,
              summary: assessment.summary,
              stage: 'new',
              severity: assessment.severity,
              confidence: assessment.confidence,
              delta: 0,
              published_at: article.publishedAt,
              market_created: false,
              created_at: new Date().toISOString()
            }]);

          if (!insertError) {
            console.log(`  ✅ Successfully Inserted: "${article.title}" (severity ${assessment.severity})`);
            categoryInserted++;
            totalInserted++;
            existingTitles.add(normTitle);
            existingUrls.add(article.url);
          } else {
            console.error(`  ❌ Database insertion failed:`, insertError.message);
          }
        } else {
          console.log(`  Rejected by LLM relevance check: "${article.title}"`);
        }
      }
    }
    console.log(`Inserted ${categoryInserted} events for ${category.name}.`);
  }

  console.log(`\nDone. Total unique inserted: ${totalInserted} events.`);
}

ingestNews().catch(console.error);
