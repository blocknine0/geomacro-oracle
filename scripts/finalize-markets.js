// scripts/finalize-markets.js
//
// Automated finalizer script for Geomacro Agent Arena.
// Runs via GitHub Actions to close markets whose 24h dispute window has ended.

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const CONTRACT_ADDRESS = "0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D";

const CONTRACT_ABI = [
  "function finalizeMarket(string marketId) external",
  "function markets(string) view returns (string marketId, uint8 status, uint8 winner, uint8 tentativeWinner, uint256 hawkTotal, uint256 doveTotal, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer, uint256 hawkVotes, uint256 doveVotes, bool exists)"
];

async function main() {
  const {
    OWNER_PRIVATE_KEY,
    APP_SUPABASE_URL,
    APP_SUPABASE_ANON_KEY,
    ARC_RPC_URL,
  } = process.env;

  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL) {
    throw new Error("Missing required environment variables.");
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  console.log(`Finalizer running with wallet: ${wallet.address}`);

  // Supabase থেকে এমন ইভেন্টগুলো নিন যেগুলো AI প্রসেস করেছে কিন্তু এখনো ফাইনাল সেটেলমেন্ট হয়নি
  const { data: pendingMarkets, error } = await supabase
    .from("events")
    .select("id, source_title")
    .eq("market_created", true)
    .eq("market_resolved", false)
    .eq("ai_processed", true);

  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  if (!pendingMarkets || pendingMarkets.length === 0) {
    console.log("No pending markets waiting to be finalized.");
    return;
  }

  console.log(`Found ${pendingMarkets.length} candidate market(s) to check for finalization.`);

  for (const event of pendingMarkets) {
    const marketId = `mkt_${event.id}`;
    
    try {
      // অন-চেইন স্ট্যাটাস চেক
      const onChainMarket = await contract.markets(marketId);
      
      // যদি অন-চেইনে অলরেডি FINALIZED (status: 4) হয়ে থাকে, ডাটাবেজ ব্যাকফিল করুন
      if (Number(onChainMarket.status) === 4) {
        console.log(`Market ${marketId} already finalized on-chain. Syncing DB...`);
        await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
        continue;
      }

      console.log(`Attempting to finalize ${marketId} on-chain...`);
      const tx = await contract.finalizeMarket(marketId);
      console.log(`  tx sent: ${tx.hash}`);
      await tx.wait();
      
      // সাকসেসফুল হলে Supabase-এ ফাইনাল ক্লোজ মারুন
      await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
      console.log(`  Successfully finalized market ${marketId}!`);
      
    } catch (err) {
      // যদি অন-চেইনে এখনও ২৪ ঘণ্টার উইন্ডো শেষ না হয়, কন্ট্রাক্ট রিভার্ট করবে। সেটা এখানে হ্যান্ডেল হবে।
      console.log(`  Skipping ${marketId}: Dispute window still active or voting in progress. (${err.message})`);
    }
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error in finalizer script:", err);
  process.exit(1);
});
