// scripts/create-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

// গিটহাব সিক্রেটস থেকে রিড করার জন্য প্র্যাকটিস, ব্যাকআপ হিসেবে হার্ডকোডেড অ্যাড্রেস বদলানো সহজ
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D";
const MAX_NEW_MARKETS_PER_RUN = 10; 
const THRESHOLD_STEP = 5; 

// ৪৬ ঘণ্টা স্ট্যাকিং উইন্ডো এবং ৪৮ ঘণ্টা টোটাল রেজোলিউশন উইন্ডো (সেকেন্ডে রূপান্তরিত)
const STAKING_DURATION_SEC = 46 * 60 * 60;   
const RESOLUTION_DURATION_SEC = 48 * 60 * 60; 

// নতুন কাস্টম ভিউ ফাংশন (getMarket) সহ ABI
const CONTRACT_ABI = [
  "function createMarket(string marketId, uint256 stakingDuration, uint256 resolutionDuration) external",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)",
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

  console.log(`Using wallet: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet balance: ${ethers.formatUnits(balance, 18)} USDC`);

  const { data: events, error } = await supabase
    .from("events")
    .select("id, source_title, category, severity, created_at, market_created")
    .or("market_created.is.null,market_created.eq.false")
    .order("created_at", { ascending: false })
    .limit(MAX_NEW_MARKETS_PER_RUN);

  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  if (!events || events.length === 0) {
    console.log("No new events without a market.");
    return;
  }

  console.log(`Found ${events.length} candidate event(s) for new markets.`);

  for (const event of events) {
    const marketId = `mkt_${event.id}`;
    const marketThreshold = event.severity + THRESHOLD_STEP;

    const resolutionAt = new Date(
      new Date(event.created_at).getTime() + RESOLUTION_DURATION_SEC * 1000
    ).toISOString();

    try {
      // ওল্ড markets() এর বদলে getMarket() দিয়ে অন-চেইন চেক
      const existing = await contract.getMarket(marketId);
      if (existing.exists) {
        console.log(`Market ${marketId} already exists on-chain. Syncing DB...`);
        await supabase
          .from("events")
          .update({
            market_created: true,
            market_threshold: marketThreshold,
            resolution_at: resolutionAt,
          })
          .eq("id", event.id);
        continue;
      }

      console.log(`Creating market ${marketId} for "${event.source_title}"...`);
      
      const tx = await contract.createMarket(marketId, STAKING_DURATION_SEC, RESOLUTION_DURATION_SEC);
      console.log(`  tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  confirmed in block ${receipt.blockNumber}`);

      await supabase
        .from("events")
        .update({
          market_created: true,
          market_threshold: marketThreshold,
          resolution_at: resolutionAt,
          market_address: CONTRACT_ADDRESS
        })
        .eq("id", event.id);

    } catch (err) {
      console.error(`Failed to create market for event ${event.id}: ${err.message}`);
    }
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
