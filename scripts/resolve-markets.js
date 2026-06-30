// scripts/resolve-markets.js
//
// Automation script for Geomacro Agent Arena.
//
// Resolution logic (Option A + C):
// 1. Fetch latest news about the story from NewsAPI (verified real sources)
// 2. Pass those articles to Groq as context (not just Groq's own knowledge)
// 3. Run 3 independent Groq calls with the same context (consensus)
// 4. 2/3 majority wins. If no consensus → DOVE (conservative default)
// 5. Exponential backoff on rate limit errors — never crashes the pipeline
// 6. Log all verdicts and sources for full transparency/auditability
//
// Required environment variables:
//   OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY,
//   ARC_RPC_URL, GROQ_API_KEY, NEWSAPI_KEY

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const CONTRACT_ADDRESS = "0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D";
const MIN_RESOLUTION_HOURS = 48;
const GROQ_CONFIDENCE_THRESHOLD = 55;
const MAX_RESOLUTIONS_PER_RUN = 5;
const CONSENSUS_CALLS = 3;

// Rate limit / retry config
const GROQ_MAX_RETRIES = 4;
const GROQ_BASE_DELAY_MS = 8000;  // 8s base — Groq free tier resets every 60s
const GROQ_BACKOFF_FACTOR = 2;    // 8s → 16s → 32s → 64s

// RPC chunking config — kept conservative to stay under QuickNode's 100 req/s limit
const BLOCK_CHUNK_SIZE = 5000;         // smaller = fewer calls per chunk
const INTER_CHUNK_DELAY_MS = 1000;     // 1s breathing room between chunks
const INTER_MARKET_RPC_DELAY_MS = 300; // delay after each contract.markets() call

// Trusted news domains for geopolitical/financial events (NewsAPI `domains` filter)
const TRUSTED_DOMAINS = [
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk",
  "aljazeera.com", "theguardian.com", "nytimes.com",
  "wsj.com", "ft.com", "bloomberg.com", "economist.com",
  "foreignpolicy.com", "politico.com", "axios.com",
].join(",");

// Stop words stripped from source_title before building search queries
const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "by","from","as","is","was","are","were","be","been","being","have",
  "has","had","do","does","did","will","would","could","should","may",
  "might","shall","can","its","it","this","that","these","those","after",
  "amid","new","says","say","over","under","into","out","up","down",
]);

const CONTRACT_ABI = [
  "event MarketCreated(string marketId)",
  "function markets(string) view returns (string marketId, uint8 status, uint8 winner, uint256 hawkTotal, uint256 doveTotal, bool exists)",
  "function declareWinner(string marketId, uint8 winningSide) external",
];

const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

// ── Keyword extraction ────────────────────────────────────────────────────────
// Strips stop words and punctuation, returns top N meaningful keywords.
// Example: "Federal Reserve faces uncertainty under new chairman Kevin Warsh"
//          → "Federal Reserve Kevin Warsh interest rate"
function extractKeywords(title, maxWords = 6) {
  const words = title
    .replace(/['"(),]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
  // Deduplicate while preserving order
  const seen = new Set();
  const unique = [];
  for (const w of words) {
    const key = w.toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(w); }
  }
  return unique.slice(0, maxWords).join(" ");
}

// ── Relevance check ───────────────────────────────────────────────────────────
// Returns true if at least `minMatches` keywords from the event title appear
// in the article text (title + description/trailText). Prevents Guardian/NewsAPI
// from returning completely unrelated trending articles.
function isArticleRelevant(articleText, eventTitle, minMatches = 2) {
  const keywords = extractKeywords(eventTitle, 8)
    .toLowerCase()
    .split(/\s+/);
  const haystack = articleText.toLowerCase();
  const matches = keywords.filter((kw) => haystack.includes(kw)).length;
  return matches >= minMatches;
}

// ── RPC helpers with retry ────────────────────────────────────────────────────
function isRpcRateLimit(err) {
  return (
    err?.error?.code === -32007 ||
    (err?.code === "UNKNOWN_ERROR" && err?.error?.code === -32007) ||
    err?.message?.includes("rate limit") ||
    err?.message?.includes("100/second")
  );
}

async function rpcWithRetry(fn, label = "RPC call", retries = 5) {
  let delay = 3000;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isRpcRateLimit(err) && attempt < retries) {
        console.warn(`  ${label}: RPC rate limit hit. Waiting ${delay / 1000}s before retry ${attempt}/${retries}...`);
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 30000);
        continue;
      }
      throw err;
    }
  }
}

async function queryFilterWithRetry(contract, filter, fromBlock, toBlock, retries = 5) {
  return rpcWithRetry(
    () => contract.queryFilter(filter, fromBlock, toBlock),
    `queryFilter(${fromBlock}-${toBlock})`,
    retries
  );
}

async function groqWithRetry(payload, groqKey, label = "") {
  let delay = GROQ_BASE_DELAY_MS;

  for (let attempt = 1; attempt <= GROQ_MAX_RETRIES; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 + 1000 : delay;
      console.warn(`  ${label} Rate limited (429). Waiting ${(waitMs / 1000).toFixed(0)}s before retry ${attempt}/${GROQ_MAX_RETRIES}...`);
      await new Promise((r) => setTimeout(r, waitMs));
      delay *= GROQ_BACKOFF_FACTOR;
      continue;
    }

    if (res.status >= 500) {
      console.warn(`  ${label} Groq server error ${res.status}. Waiting ${(delay / 1000).toFixed(0)}s before retry ${attempt}/${GROQ_MAX_RETRIES}...`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= GROQ_BACKOFF_FACTOR;
      continue;
    }

    if (!res.ok) throw new Error(`Groq error ${res.status}`);

    return await res.json();
  }

  throw new Error(`Groq: max retries (${GROQ_MAX_RETRIES}) exceeded for ${label}`);
}

// ── NewsAPI fetch ─────────────────────────────────────────────────────────────
// Uses smart keyword extraction + trusted domains + relevance filtering.
async function fetchFromNewsAPI(event, newsApiKey, from) {
  const query = extractKeywords(event.source_title, 6);
  console.log(`  NewsAPI query: "${query}"`);

  // First try: focused query on trusted domains
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${from}&sortBy=publishedAt&pageSize=10&language=en&domains=${encodeURIComponent(TRUSTED_DOMAINS)}&apiKey=${newsApiKey}`;
  const res = await fetch(url);

  if (res.status === 429) {
    console.warn(`  NewsAPI 429 (rate limit).`);
    return null;
  }
  if (!res.ok) throw new Error(`NewsAPI error: ${res.status}`);

  const data = await res.json();
  let articles = (data.articles || []);

  // Filter to relevant articles only
  const relevant = articles.filter((a) => {
    const text = `${a.title || ""} ${a.description || ""}`;
    return isArticleRelevant(text, event.source_title);
  });

  // If trusted-domain search returned nothing relevant, retry without domain filter
  if (relevant.length === 0 && articles.length === 0) {
    console.warn(`  NewsAPI: no results on trusted domains, retrying without domain filter...`);
    const url2 = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${from}&sortBy=publishedAt&pageSize=10&language=en&apiKey=${newsApiKey}`;
    const res2 = await fetch(url2);
    if (res2.ok) {
      const data2 = await res2.json();
      const all = (data2.articles || []);
      const rel2 = all.filter((a) => {
        const text = `${a.title || ""} ${a.description || ""}`;
        return isArticleRelevant(text, event.source_title);
      });
      if (rel2.length > 0) return rel2.slice(0, 5);
    }
    return null; // nothing useful
  }

  if (relevant.length === 0) {
    console.warn(`  NewsAPI: ${articles.length} articles returned but none are relevant to this event.`);
    return null;
  }

  return relevant.slice(0, 5);
}

// ── Guardian API fetch ────────────────────────────────────────────────────────
async function fetchFromGuardian(event, guardianApiKey, fromDate) {
  const query = extractKeywords(event.source_title, 6);
  console.log(`  Guardian query: "${query}"`);

  const url = `https://content.guardianapis.com/search?q=${encodeURIComponent(query)}&from-date=${fromDate}&order-by=newest&page-size=10&show-fields=trailText&api-key=${guardianApiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Guardian API error: ${res.status}`);

  const data = await res.json();
  const articles = (data.response?.results || []);

  // Relevance filter — same logic as NewsAPI
  const relevant = articles.filter((a) => {
    const text = `${a.webTitle || ""} ${a.fields?.trailText || ""}`;
    return isArticleRelevant(text, event.source_title);
  });

  if (relevant.length === 0) {
    console.warn(`  Guardian: ${articles.length} articles returned but none are relevant to this event.`);
    return null;
  }

  return relevant.slice(0, 5);
}

// ── Combined news context fetch ───────────────────────────────────────────────
async function fetchLatestNewsContext(event, newsApiKey, guardianApiKey) {
  // Search from 24h before the event was created up to now
  const fromTs = new Date(event.created_at).getTime() - 24 * 60 * 60 * 1000;
  const fromISO = new Date(fromTs).toISOString();
  const fromDate = fromISO.split("T")[0];

  // Try NewsAPI first
  if (newsApiKey) {
    try {
      const articles = await fetchFromNewsAPI(event, newsApiKey, fromISO);
      if (articles && articles.length > 0) {
        const sources = articles.map((a) => a.source?.name || "Unknown");
        const context = articles
          .map((a, i) => `[${i + 1}] ${a.source?.name}: ${a.title}. ${a.description || ""}`)
          .join("\n");
        console.log(`  News source: NewsAPI (${articles.length} relevant articles)`);
        return { context, sources };
      }
    } catch (err) {
      console.warn(`  NewsAPI failed: ${err.message}. Trying Guardian API...`);
    }
  }

  // Fallback: Guardian API
  if (guardianApiKey) {
    try {
      const articles = await fetchFromGuardian(event, guardianApiKey, fromDate);
      if (articles && articles.length > 0) {
        const sources = articles.map(() => "The Guardian");
        const context = articles
          .map((a, i) => `[${i + 1}] The Guardian: ${a.webTitle}. ${a.fields?.trailText || ""}`)
          .join("\n");
        console.log(`  News source: Guardian API (${articles.length} relevant articles)`);
        return { context, sources };
      }
    } catch (err) {
      console.warn(`  Guardian API failed: ${err.message}.`);
    }
  }

  console.warn(`  No relevant news context found. Proceeding without.`);
  return { context: "No relevant recent news found for this story.", sources: [] };
}

// ── Single Groq verdict with retry ────────────────────────────────────────────
async function singleGroqVerdict(event, newsContext, threshold, groqKey, callIndex) {
  const hasRealNews = !newsContext.startsWith("No relevant");

  const prompt = `You are an impartial judge settling a prediction market.
${hasRealNews
  ? "Base your verdict ONLY on the news articles provided below. Do not use your own knowledge or assumptions."
  : "No recent news was found. Use your own knowledge of the event to make a best-effort determination, but apply a conservative bias toward DOVE."}

Market question: Did "${event.source_title}" escalate past severity ${threshold}/100 within 48 hours of the market opening?

Category: ${event.category}
Severity when market opened: ${event.severity}/100
Escalation threshold: ${threshold}/100

${hasRealNews ? `Latest verified news about this story:\n${newsContext}` : `Context: ${newsContext}`}

Rules:
- HAWK wins if there is clear escalation: more conflict, military action, talks collapsed, sanctions imposed, market panic
- DOVE wins if there is de-escalation, talks progressed, situation held steady, or no major developments
- If context is insufficient or unclear, choose DOVE with low confidence
${hasRealNews ? "- IMPORTANT: Only cite headlines that are actually about this specific story. If none of the provided articles are about this story, choose DOVE." : ""}

Respond ONLY with valid JSON:
{
  "outcome": "HAWK" or "DOVE",
  "confidence": integer 0-100,
  "reasoning": "one sentence${hasRealNews ? " citing a specific relevant headline from the news provided above" : " explaining your best-effort assessment"}"
}`;

  const label = `[Call ${callIndex + 1}/${CONSENSUS_CALLS}]`;

  const data = await groqWithRetry(
    {
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2 + callIndex * 0.1,
      max_tokens: 150,
    },
    groqKey,
    label
  );

  const text = data.choices?.[0]?.message?.content || "";

  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    console.warn(`  ${label} Unparseable JSON, counting as DOVE.`);
    return { outcome: "DOVE", confidence: 0, reasoning: "parse error" };
  }
}

// ── 3-call consensus ──────────────────────────────────────────────────────────
async function getConsensusVerdict(event, newsContext, threshold, groqKey) {
  const verdicts = [];

  for (let i = 0; i < CONSENSUS_CALLS; i++) {
    try {
      const verdict = await singleGroqVerdict(event, newsContext, threshold, groqKey, i);
      verdicts.push(verdict);
      console.log(
        `  Call ${i + 1}/${CONSENSUS_CALLS}: ${verdict.outcome} (confidence ${verdict.confidence}%) — ${verdict.reasoning}`
      );
    } catch (err) {
      console.warn(`  Call ${i + 1} failed after retries: ${err.message}. Counting as DOVE.`);
      verdicts.push({ outcome: "DOVE", confidence: 0, reasoning: `error: ${err.message}` });
    }

    if (i < CONSENSUS_CALLS - 1) {
      console.log(`  Waiting 10s before next consensus call...`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  const hawkVotes = verdicts.filter((v) => v.outcome === "HAWK").length;
  const doveVotes = verdicts.filter((v) => v.outcome === "DOVE").length;
  const avgConfidence = Math.round(
    verdicts.reduce((sum, v) => sum + v.confidence, 0) / verdicts.length
  );

  console.log(
    `  Consensus: HAWK ${hawkVotes}/${CONSENSUS_CALLS}, DOVE ${doveVotes}/${CONSENSUS_CALLS}, avg confidence ${avgConfidence}%`
  );

  let finalOutcome;
  if (hawkVotes > doveVotes) {
    finalOutcome = "HAWK";
  } else if (doveVotes > hawkVotes) {
    finalOutcome = "DOVE";
  } else {
    console.log(`  Tie vote → defaulting to DOVE (conservative).`);
    finalOutcome = "DOVE";
  }

  if (avgConfidence < GROQ_CONFIDENCE_THRESHOLD) {
    console.log(`  Low avg confidence (${avgConfidence}%) → overriding to DOVE.`);
    finalOutcome = "DOVE";
  }

  return { outcome: finalOutcome, hawkVotes, doveVotes, avgConfidence };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const {
    OWNER_PRIVATE_KEY,
    APP_SUPABASE_URL,
    APP_SUPABASE_ANON_KEY,
    ARC_RPC_URL,
    GROQ_API_KEY,
    NEWSAPI_KEY,
    GUARDIAN_API_KEY,
  } = process.env;

  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY) {
    throw new Error("Missing required environment variables.");
  }

  if (!NEWSAPI_KEY && !GUARDIAN_API_KEY) {
    console.warn("Neither NEWSAPI_KEY nor GUARDIAN_API_KEY set. Resolving without verified news context.");
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  console.log(`Using wallet: ${wallet.address}`);

  const deployBlock = 47800000;
  const latestBlock = await rpcWithRetry(
    () => provider.getBlockNumber(),
    "getBlockNumber"
  );
  const filter = contract.filters.MarketCreated();

  const marketIds = [];
  let fromBlock = deployBlock;
  let chunkCount = 0;
  while (fromBlock <= latestBlock) {
    const toBlock = Math.min(fromBlock + BLOCK_CHUNK_SIZE - 1, latestBlock);
    const events = await queryFilterWithRetry(contract, filter, fromBlock, toBlock);
    for (const e of events) marketIds.push(e.args.marketId);
    fromBlock = toBlock + 1;
    chunkCount++;
    if (chunkCount % 10 === 0) {
      console.log(`  Scanned up to block ${toBlock} (${marketIds.length} markets found so far)...`);
    }
    await new Promise((r) => setTimeout(r, INTER_CHUNK_DELAY_MS));
  }

  console.log(`Found ${marketIds.length} total market(s) ever created.`);

  let resolvedCount = 0;

  for (const marketId of marketIds) {
    if (resolvedCount >= MAX_RESOLUTIONS_PER_RUN) {
      console.log(
        `Reached max resolutions per run (${MAX_RESOLUTIONS_PER_RUN}). Remaining markets will resolve next run.`
      );
      break;
    }

    const market = await rpcWithRetry(
      () => contract.markets(marketId),
      `markets(${marketId})`
    );
    await new Promise((r) => setTimeout(r, INTER_MARKET_RPC_DELAY_MS));

    if (Number(market.status) !== 0) continue;

    const eventId = marketId.startsWith("mkt_") ? marketId.slice(4) : null;
    if (!eventId) {
      console.log(`Skipping ${marketId}: not a Supabase-linked market.`);
      continue;
    }

    const { data: event, error } = await supabase
      .from("events")
      .select("id, severity, created_at, source_title, category, market_threshold, resolution_at")
      .eq("id", eventId)
      .single();

    if (error || !event) {
      console.log(`Skipping ${marketId}: no matching Supabase event.`);
      continue;
    }

    const resolutionAt = event.resolution_at
      ? new Date(event.resolution_at)
      : new Date(new Date(event.created_at).getTime() + MIN_RESOLUTION_HOURS * 60 * 60 * 1000);

    if (Date.now() < resolutionAt.getTime()) {
      const hoursLeft = (resolutionAt.getTime() - Date.now()) / (1000 * 60 * 60);
      console.log(`Skipping ${marketId}: resolves in ${hoursLeft.toFixed(1)}h.`);
      continue;
    }

    const threshold = event.market_threshold ?? (event.severity + 5);
    console.log(`\nResolving ${marketId} ("${event.source_title}")`);
    console.log(`  Threshold: ${threshold}, Severity at creation: ${event.severity}`);

    console.log(`  Fetching latest news context...`);
    const { context: newsContext, sources } = (NEWSAPI_KEY || GUARDIAN_API_KEY)
      ? await fetchLatestNewsContext(event, NEWSAPI_KEY, GUARDIAN_API_KEY)
      : { context: "No news API configured.", sources: [] };

    if (sources.length > 0) {
      console.log(`  Verified sources: ${sources.join(", ")}`);
    }

    console.log(`  Running ${CONSENSUS_CALLS}-call consensus (with exponential backoff)...`);
    const consensus = await getConsensusVerdict(event, newsContext, threshold, GROQ_API_KEY);

    const winningSide = consensus.outcome === "HAWK" ? SIDE.HAWK : SIDE.DOVE;

    console.log(
      `  Final verdict: ${consensus.outcome} (HAWK ${consensus.hawkVotes}/${CONSENSUS_CALLS}, avg confidence ${consensus.avgConfidence}%)`
    );

    try {
      const tx = await contract.declareWinner(marketId, winningSide);
      console.log(`  tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  confirmed in block ${receipt.blockNumber}. Winner: ${consensus.outcome}`);
      resolvedCount++;
    } catch (err) {
      console.error(`  Failed to resolve ${marketId}: ${err.message}`);
    }

    if (resolvedCount < MAX_RESOLUTIONS_PER_RUN) {
      console.log(`  Waiting 5s before next market...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  console.log(`\nDone. Resolved ${resolvedCount} market(s) this run.`);
}

main().catch((err) => {
  console.error("Fatal error in resolve-markets script:", err);
  process.exit(1);
});
