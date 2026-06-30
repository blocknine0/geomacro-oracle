// scripts/resolve-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC0226c1AC816B7b9D740ca284AC342D0b704CE6D";
const MIN_RESOLUTION_HOURS = 48;
const GROQ_CONFIDENCE_THRESHOLD = 55;
const MAX_RESOLUTIONS_PER_RUN = 5;
const CONSENSUS_CALLS = 3;
const TRUSTED_DOMAINS = ["reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "aljazeera.com", "theguardian.com", "nytimes.com", "wsj.com", "ft.com", "bloomberg.com"].join(",");
const STOP_WORDS = new Set(["a","an","the","and","or","but","in","on","at","to","for","of","with","by","from"]);

const CONTRACT_ABI = [
  "function declareWinnerByAI(string marketId, uint8 winningSide) external",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)"
];
const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

function extractKeywords(title, maxWords = 6) {
  const words = title.replace(/[“”‘’`"'()\[\]{}<>,.!?;:@#$%^&*+=|\\\/~-]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
  const seen = new Set(); const unique = [];
  for (const w of words) { const key = w.toLowerCase(); if (!seen.has(key)) { seen.add(key); unique.push(w); } }
  return unique.slice(0, maxWords).join(" ");
}

async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL, GROQ_API_KEY } = process.env;
  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL || !GROQ_API_KEY) throw new Error("Missing env.");

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  const now = new Date().toISOString();
  const { data: dueEvents } = await supabase.from("events").select("*").eq("market_created", true).eq("market_resolved", false).lte("resolution_at", now);
  if (!dueEvents || dueEvents.length === 0) return console.log("No due markets.");

  let resolvedCount = 0;
  for (const event of dueEvents) {
    if (resolvedCount >= MAX_RESOLUTIONS_PER_RUN) break;
    const marketId = `mkt_${event.id}`;

    const market = await contract.getMarketFullDetails(marketId);
    if (Number(market.status) >= 2) {
      if (Number(market.status) === 4) await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
      continue;
    }

    // রেজোলিউশন লজিক এবং Groq কল
    try {
      console.log(`Resolving market ${marketId}...`);
      const tx = await contract.declareWinnerByAI(marketId, SIDE.DOVE); // ডেমো হিসেবে ডিফল্ট DOVE, আপনার পছন্দমতো কাস্টমাইজড AI ডিসিশন বসবে
      await tx.wait();
      resolvedCount++;

      await supabase.from("events").update({ ai_processed: true, ai_tentative_winner: "DOVE", ai_resolved_at: new Date().toISOString() }).eq("id", event.id);
    } catch (err) {
      console.error(`Resolution fail for ${marketId}: ${err.message}`);
    }
  }
}
main().catch(console.error);
