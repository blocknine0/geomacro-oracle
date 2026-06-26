// scripts/resolve-markets.js
//
// Automation script for Geomacro Agent Arena.
// Runs on a schedule via GitHub Actions, separate from create-markets.js.
//
// Resolution logic:
// - Markets resolve between 48h and 72h after creation.
// - Groq is given the exact market question, original severity and threshold.
// - Groq judges whether severity crossed the threshold, based on the story.
// - If Groq confidence < 60, DOVE wins (conservative default).
// - market_threshold is always passed explicitly — no guessing.
//
// Required environment variables:
//   OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY,
//   ARC_RPC_URL, GROQ_API_KEY

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const CONTRACT_ADDRESS = "0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D";
const MIN_RESOLUTION_HOURS = 48;
const GROQ_CONFIDENCE_THRESHOLD = 60;
const MAX_RESOLUTIONS_PER_RUN = 5; // cap to avoid Groq rate limits

const CONTRACT_ABI = [
  "event MarketCreated(string marketId)",
  "function markets(string) view returns (string marketId, uint8 status, uint8 winner, uint256 hawkTotal, uint256 doveTotal, bool exists)",
  "function declareWinner(string marketId, uint8 winningSide) external",
];

const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

async function askGroqForOutcome(event, groqKey) {
  const threshold = event.market_threshold ?? (event.severity + 5);

  // Groq is given the exact market question and threshold.
  // It judges whether the situation crossed the threshold, not a generic opinion.
  const prompt = `You are settling a prediction market. Answer based on real-world outcomes.

Market question: Did "${event.source_title}" escalate past severity ${threshold}/100 within 48 hours of opening?

Context:
- Category: ${event.category}
- Severity when market opened: ${event.severity}/100
- Escalation threshold: ${threshold}/100
- HAWK wins if severity crossed ${threshold} (conflict escalated, talks collapsed, military action, sanctions imposed, market panic)
- DOVE wins if severity stayed below ${threshold} (de-escalation, talks progressed, situation held steady, ceasefire held)

Base your judgment on what actually happened with this specific story.
If you are uncertain, default to DOVE.

Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{
  "outcome": "HAWK" or "DOVE",
  "confidence": integer 0-100,
  "reasoning": "one sentence citing a specific real-world development"
}`;

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
      max_tokens: 150,
    }),
  });

  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";

  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    // Try extracting first JSON object from response
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    console.warn("  Groq returned unparseable JSON, defaulting to DOVE.");
    return { outcome: "DOVE", confidence: 0, reasoning: "parse error, defaulting to DOVE" };
  }
}

async function main() {
  const {
    OWNER_PRIVATE_KEY,
    APP_SUPABASE_URL,
    APP_SUPABASE_ANON_KEY,
    ARC_RPC_URL,
    GROQ_API_KEY,
  } = process.env;

  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY) {
    throw new Error("Missing required environment variables.");
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  console.log(`Using wallet: ${wallet.address}`);

  // Discover all markets ever created
  const deployBlock = 47800000;
  const latestBlock = await provider.getBlockNumber();
  const filter = contract.filters.MarketCreated();

  const marketIds = [];
  let fromBlock = deployBlock;
  const CHUNK = 10000;
  while (fromBlock <= latestBlock) {
    const toBlock = Math.min(fromBlock + CHUNK - 1, latestBlock);
    const events = await contract.queryFilter(filter, fromBlock, toBlock);
    for (const e of events) marketIds.push(e.args.marketId);
    fromBlock = toBlock + 1;
  }

  console.log(`Found ${marketIds.length} total market(s) ever created.`);

  let resolvedCount = 0;

  for (const marketId of marketIds) {
    const market = await contract.markets(marketId);

    // Skip already resolved
    if (Number(market.status) !== 0) continue;

    // Only handle Supabase-linked markets
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

    // Use resolution_at from Supabase if available (single source of truth)
    // otherwise fall back to created_at + 48h
    const resolutionAt = event.resolution_at
      ? new Date(event.resolution_at)
      : new Date(new Date(event.created_at).getTime() + MIN_RESOLUTION_HOURS * 60 * 60 * 1000);

    if (Date.now() < resolutionAt.getTime()) {
      const hoursLeft = (resolutionAt.getTime() - Date.now()) / (1000 * 60 * 60);
      console.log(`Skipping ${marketId}: resolves in ${hoursLeft.toFixed(1)}h.`);
      continue;
    }

    const threshold = event.market_threshold ?? (event.severity + 5);
    console.log(
      `Resolving ${marketId} ("${event.source_title}") — threshold ${threshold}, severity at creation ${event.severity}...`
    );

    // Ask Groq with explicit threshold and market question
    let groqResult;
    try {
      groqResult = await askGroqForOutcome(event, GROQ_API_KEY);
    } catch (err) {
      console.warn(`  Groq failed: ${err.message}. Defaulting to DOVE.`);
      groqResult = { outcome: "DOVE", confidence: 0, reasoning: "Groq error, defaulting to DOVE" };
    }

    console.log(
      `  Groq verdict: ${groqResult.outcome} (confidence ${groqResult.confidence}%) — ${groqResult.reasoning}`
    );

    // Low confidence defaults to DOVE
    let winningSide;
    if (groqResult.confidence < GROQ_CONFIDENCE_THRESHOLD) {
      console.log(`  Low confidence (${groqResult.confidence}%), defaulting to DOVE.`);
      winningSide = SIDE.DOVE;
    } else {
      winningSide = groqResult.outcome === "HAWK" ? SIDE.HAWK : SIDE.DOVE;
    }

    try {
      const tx = await contract.declareWinner(marketId, winningSide);
      console.log(`  tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(
        `  confirmed in block ${receipt.blockNumber}. Winner: ${winningSide === SIDE.HAWK ? "HAWK" : "DOVE"}`
      );
      resolvedCount++;
    } catch (err) {
      console.error(`  Failed to resolve ${marketId}: ${err.message}`);
    }

    // Longer delay to avoid Groq rate limits
    await new Promise((r) => setTimeout(r, 2000));

    if (resolvedCount >= MAX_RESOLUTIONS_PER_RUN) {
      console.log(`Reached max resolutions per run (${MAX_RESOLUTIONS_PER_RUN}). Stopping. Remaining markets will resolve next run.`);
      break;
    }
  }

  console.log(`Done. Resolved ${resolvedCount} market(s) this run.`);
}

main().catch((err) => {
  console.error("Fatal error in resolve-markets script:", err);
  process.exit(1);
});
