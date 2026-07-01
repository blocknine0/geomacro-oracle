// scripts/resolve-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";

// Checksum সুরক্ষিত করার জন্য তো লোয়ারকেস করে getAddress-এ নেওয়া হলো
const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const MIN_RESOLUTION_HOURS = 48;
const MAX_RESOLUTIONS_PER_RUN = 5;

// নতুন কাস্টম ভিউ ফাংশন (getMarketFullDetails) সহ ABI
const CONTRACT_ABI = [
  "function declareWinnerByAI(string marketId, uint8 winningSide) external",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)"
];

const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

// 💡 পার্মানেন্ট ফিক্স: Groq দিয়ে রিয়াল রি-জাজমেন্ট।
// HAWK = রিস্ক/সিভিয়ারিটি বেড়েছে বা এখনও এস্কেলেটিং।
// DOVE = রিস্ক কমেছে, সমাধান হয়েছে, বা de-escalate করেছে।
async function judgeOutcome(groq, event) {
  const prompt = `You are a geopolitical/macro risk analyst judging the outcome of a prediction market, 48 hours after the original event was reported.

Original event details:
- Category: ${event.category}
- Headline: "${event.source_title}"
- Narrative (the risk claim being staked on): "${event.narrative}"
- Summary at time of publication: "${event.summary}"
- Original severity score (0-100): ${event.severity}

Task: Based on your knowledge and reasoning about how this situation has likely evolved in the 48 hours since, judge whether the risk/narrative described has:
- ESCALATED or remained highly active/unresolved → side "HAWK"
- DE-ESCALATED, been resolved, or proven overstated → side "DOVE"

If you are genuinely uncertain or have no information suggesting a clear direction, default to "DOVE" (the conservative/no-escalation outcome).

Respond STRICTLY in JSON format:
{ "side": "HAWK" | "DOVE", "reasoning": "one sentence justification" }`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "groq/compound", // built-in web-search-capable model — এটা রিসেন্ট তথ্য নিয়েও রিজন করতে পারে
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0].message.content);
    const side = result.side === "HAWK" ? SIDE.HAWK : SIDE.DOVE;
    return { side, sideLabel: result.side === "HAWK" ? "HAWK" : "DOVE", reasoning: result.reasoning || "" };
  } catch (err) {
    console.error(`  ⚠️ AI judgment failed for "${event.source_title}", defaulting to DOVE:`, err.message);
    return { side: SIDE.DOVE, sideLabel: "DOVE", reasoning: "AI judgment failed — conservative fallback" };
  }
}

async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL, GROQ_API_KEY } = process.env;
  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY) throw new Error("Missing env.");

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const groq = new Groq({ apiKey: GROQ_API_KEY, timeout: 30 * 1000, maxRetries: 3 });

  const network = await provider.getNetwork();
  console.log(`Connected to Chain ID: ${network.chainId.toString()}`);
  console.log(`Using contract address: ${CONTRACT_ADDRESS}`);

  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  const now = new Date().toISOString();
  const { data: dueEvents, error: fetchError } = await supabase
    .from("events")
    .select("*")
    .eq("market_created", true)
    .eq("market_resolved", false)
    .lte("resolution_at", now);

  if (fetchError) throw new Error(`Supabase error: ${fetchError.message}`);
  if (!dueEvents || dueEvents.length === 0) return console.log("No due markets for resolution.");

  console.log(`Found ${dueEvents.length} market(s) to process.`);
  let resolvedCount = 0;

  for (const event of dueEvents) {
    if (resolvedCount >= MAX_RESOLUTIONS_PER_RUN) break;
    const marketId = `mkt_${event.id}`;

    try {
      let marketStatus = 0;
      try {
        // ওল্ড ডিকোড এরর এড়াতে ট্রাই-ক্যাচ প্রোটেকশন
        const market = await contract.getMarketFullDetails(marketId);
        marketStatus = Number(market.status);
      } catch (decodeErr) {
        console.log(`⚠️ Warning: Could not fetch details for ${marketId}. Skipping.`);
        continue;
      }

      // 2 = AI_RESOLVED, 3 = DISPUTED, 4 = FINALIZED
      if (marketStatus >= 2) {
        if (marketStatus === 4) {
          const { error: syncErr } = await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
          if (syncErr) console.error(`  ⚠️ Failed to sync market_resolved for ${marketId}:`, syncErr.message);
        }
        continue;
      }

      console.log(`Judging outcome for ${marketId}: "${event.source_title}"...`);
      const judgment = await judgeOutcome(groq, event);
      console.log(`  AI verdict: ${judgment.sideLabel} — ${judgment.reasoning}`);

      console.log(`Resolving market ${marketId} as ${judgment.sideLabel}...`);
      const tx = await contract.declareWinnerByAI(marketId, judgment.side);
      console.log(`  Transaction sent: ${tx.hash}`);
      await tx.wait();
      resolvedCount++;

      const { error: updateErr } = await supabase.from("events").update({
        ai_processed: true,
        ai_tentative_winner: judgment.sideLabel,
        ai_resolved_at: new Date().toISOString()
      }).eq("id", event.id);

      if (updateErr) console.error(`  ⚠️ On-chain resolve succeeded but Supabase update failed for ${marketId}:`, updateErr.message);
      console.log(`  Successfully resolved on-chain: ${marketId}`);
    } catch (err) {
      console.error(`❌ Resolution failed for ${marketId}: ${err.message}`);
    }
  }

  console.log("Done.");
}

main().catch(console.error);
