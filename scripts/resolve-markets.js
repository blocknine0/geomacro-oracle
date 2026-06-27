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

const CONTRACT_ABI = [
  "event MarketCreated(string marketId)",
  "function markets(string) view returns (string marketId, uint8 status, uint8 winner, uint256 hawkTotal, uint256 doveTotal, bool exists)",
  "function declareWinner(string marketId, uint8 winningSide) external",
];

const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

// ── RPC helper with retry ─────────────────────────────────────────────────────
async function queryFilterWithRetry(contract, filter, fromBlock, toBlock, retries = 4) {
  let delay = 3000;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await contract.queryFilter(filter, fromBlock, toBlock);
    } catch (err) {
      const isRateLimit =
        err?.error?.code === -32007 ||
        err?.message?.includes("rate limit") ||
        err?.message?.includes("100/second");
      if (isRateLimit && attempt < retries) {
        console.warn(`  RPC rate limit hit. Waiting ${delay / 1000}s before retry ${attempt}/${retries}...`);
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
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

    // Rate limited — wait and retry
    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000 + 1000
        : delay;
      console.warn(
        `  ${label} Rate limited (429). Waiting ${(waitMs / 1000).toFixed(0)}s before retry ${attempt}/${GROQ_MAX_RETRIES}...`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      delay *= GROQ_BACKOFF_FACTOR;
      continue;
    }

    // Server error — retry with backoff
    if (res.status >= 500) {
      console.warn(
        `  ${label} Groq server error ${res.status}. Waiting ${(delay / 1000).toFixed(0)}s before retry ${attempt}/${GROQ_MAX_RETRIES}...`
      );
      await new Promise((r) => setTimeout(r, delay));
      delay *= GROQ_BACKOFF_FACTOR;
      continue;
    }

    // Any other non-200 — don't retry
    if (!res.ok) {
      throw new Error(`Groq error ${res.status}`);
    }

    return await res.json();
  }

  throw new Error(`Groq: max retries (${GROQ_MAX_RETRIES}) exceeded for ${label}`);
}

// ── NewsAPI context fetch ─────────────────────────────────────────────────────
async function fetchLatestNewsContext(event, newsApiKey) {
  const keywords = event.source_title
    .replace(/['"]/g, "")
    .split(" ")
    .slice(0, 6)
    .join(" ");

  const from = new Date(
    new Date(event.created_at).getTime() - 24 * 60 * 60 * 1000
  ).toISOString();

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(keywords)}&from=${from}&sortBy=publishedAt&pageSize=5&language=en&apiKey=${newsApiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NewsAPI error: ${res.status}`);
    const data = await res.json();
    const articles = (data.articles || []).slice(0, 5);

    if (articles.length === 0) {
      return { context: "No recent news found for this story.", sources: [] };
    }

    const sources = articles.map((a) => a.source?.name || "Unknown");
    const context = articles
      .map((a, i) => `[${i + 1}] ${a.source?.name}: ${a.title}. ${a.description || ""}`)
      .join("\n");

    return { context, sources };
  } catch (err) {
    console.warn(`  NewsAPI fetch failed: ${err.message}. Proceeding without news context.`);
    return { context: "NewsAPI unavailable for this resolution.", sources: [] };
  }
}

// ── Single Groq verdict with retry ────────────────────────────────────────────
async function singleGroqVerdict(event, newsContext, threshold, groqKey, callIndex) {
  const prompt = `You are an impartial judge settling a prediction market. Base your verdict ONLY on the news articles provided below. Do not use your own knowledge or assumptions.

Market question: Did "${event.source_title}" escalate past severity ${threshold}/100 within 48 hours?

Category: ${event.category}
Severity when market opened: ${event.severity}/100
Escalation threshold: ${threshold}/100

Latest verified news about this story:
${newsContext}

Rules:
- HAWK wins if the news shows clear escalation: more conflict, military action, talks collapsed, sanctions imposed, market panic
- DOVE wins if the news shows de-escalation, talks progressed, situation held steady, or no major developments
- If news context is insufficient or unclear, choose DOVE
- Base verdict ONLY on the provided news, not your prior knowledge

Respond ONLY with valid JSON:
{
  "outcome": "HAWK" or "DOVE",
  "confidence": integer 0-100,
  "reasoning": "one sentence citing a specific headline from the news provided above"
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
      // Max retries exceeded for this call — count as DOVE and continue
      console.warn(`  Call ${i + 1} failed after retries: ${err.message}. Counting as DOVE.`);
      verdicts.push({ outcome: "DOVE", confidence: 0, reasoning: `error: ${err.message}` });
    }

    // Inter-call delay (longer to stay inside free-tier limits)
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
  } = process.env;

  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY) {
    throw new Error("Missing required environment variables.");
  }

  if (!NEWSAPI_KEY) {
    console.warn("NEWSAPI_KEY not set. Resolving without verified news context.");
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  console.log(`Using wallet: ${wallet.address}`);

  const deployBlock = 47800000;
  const latestBlock = await provider.getBlockNumber();
  const filter = contract.filters.MarketCreated();

  const marketIds = [];
  let fromBlock = deployBlock;
  const CHUNK = 10000;
  while (fromBlock <= latestBlock) {
    const toBlock = Math.min(fromBlock + CHUNK - 1, latestBlock);
    const events = await queryFilterWithRetry(contract, filter, fromBlock, toBlock);
    for (const e of events) marketIds.push(e.args.marketId);
    fromBlock = toBlock + 1;
    // Small delay between chunks to avoid RPC rate limits
    await new Promise((r) => setTimeout(r, 200));
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

    const market = await contract.markets(marketId);
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

    // Fetch verified news context
    console.log(`  Fetching latest news context from NewsAPI...`);
    const { context: newsContext, sources } = NEWSAPI_KEY
      ? await fetchLatestNewsContext(event, NEWSAPI_KEY)
      : { context: "NewsAPI not configured.", sources: [] };

    if (sources.length > 0) {
      console.log(`  Verified sources: ${sources.join(", ")}`);
    }

    // 3-call consensus with retry
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

    // Delay between markets
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
