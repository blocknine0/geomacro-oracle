// scripts/create-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

// EIP-55 Checksum ফরম্যাট নিশ্চিত করার জন্য ethers.getAddress ব্যবহার
const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC0226c1AC816B7b9D740ca284AC342D0b704CE6D";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS); 

const MAX_NEW_MARKETS_PER_RUN = 10; 
const THRESHOLD_STEP = 5; 

const STAKING_DURATION_SEC = 46 * 60 * 60;   
const RESOLUTION_DURATION_SEC = 48 * 60 * 60; 

const CONTRACT_ABI = [
  "function createMarket(string marketId, uint256 stakingDuration, uint256 resolutionDuration) external",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)",
];

async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL } = process.env;
  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL) throw new Error("Missing env.");

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  
  // নেটওয়ার্ক যাচাইয়ের জন্য লগ
  const network = await provider.getNetwork();
  console.log(`Connected to Chain ID: ${network.chainId.toString()}`);
  console.log(`Using contract address: ${CONTRACT_ADDRESS}`);

  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  // চেইনে কন্ট্রাক্টের বাইটকোড চেক
  const code = await provider.getCode(CONTRACT_ADDRESS);
  if (code === "0x" || code === "0x00") {
    console.error("❌ ERROR: No contract bytecode found at this address on this network! Check ARC_RPC_URL or deployment.");
    process.exit(1);
  }

  const { data: events, error } = await supabase
    .from("events")
    .select("id, source_title, category, severity, created_at, market_created")
    .or("market_created.is.null,market_created.eq.false")
    .order("created_at", { ascending: false })
    .limit(MAX_NEW_MARKETS_PER_RUN);

  if (error) throw new Error(`Supabase error: ${error.message}`);
  if (!events || events.length === 0) return console.log("No new events.");

  for (const event of events) {
    const marketId = `mkt_${event.id}`;
    const marketThreshold = event.severity + THRESHOLD_STEP;
    const resolutionAt = new Date(new Date(event.created_at).getTime() + RESOLUTION_DURATION_SEC * 1000).toISOString();

    try {
      let marketExists = false;
      try {
        const existing = await contract.getMarket(marketId);
        marketExists = existing.exists;
      } catch (decodeErr) {
        // যদি চেইন নোড রিড করতে সাময়িক সমস্যা করে, তবে সেটিকে false ধরে নতুন মার্কেট ক্রিয়েট করতে পুশ করবে
        console.log(`On-chain view query skipped or empty for ${marketId}. Proceeding with fresh creation request.`);
      }

      if (marketExists) {
        console.log(`Market ${marketId} already exists. Syncing Supabase.`);
        await supabase.from("events").update({ market_created: true, market_threshold: marketThreshold, resolution_at: resolutionAt }).eq("id", event.id);
        continue;
      }

      console.log(`Creating market ${marketId}...`);
      const tx = await contract.createMarket(marketId, STAKING_DURATION_SEC, RESOLUTION_DURATION_SEC);
      console.log(`  Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  Confirmed in block ${receipt.blockNumber}`);

      await supabase.from("events").update({
        market_created: true,
        market_threshold: marketThreshold,
        resolution_at: resolutionAt,
        market_address: CONTRACT_ADDRESS
      }).eq("id", event.id);

    } catch (err) {
      console.error(`Failed to create market for event ${event.id}: ${err.message}`);
    }
  }
  console.log("Done.");
}
main().catch(console.error);
