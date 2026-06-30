// scripts/finalize-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const CONTRACT_ADDRESS = (process.env.CONTRACT_ADDRESS || "0xC0226c1AC816B7b9D740ca284AC342D0b704CE6D").toLowerCase();

const CONTRACT_ABI = [
  "function finalizeMarket(string marketId) external",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)"
];

async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL } = process.env;
  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL) throw new Error("Missing Env.");

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  const { data: pendingMarkets } = await supabase.from("events").select("id").eq("market_created", true).eq("market_resolved", false).eq("ai_processed", true);
  if (!pendingMarkets || pendingMarkets.length === 0) return;

  for (const event of pendingMarkets) {
    const marketId = `mkt_${event.id}`;
    try {
      const onChainMarket = await contract.getMarketFullDetails(marketId);
      if (Number(onChainMarket.status) === 4) {
        await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
        continue;
      }

      console.log(`Finalizing ${marketId}...`);
      const tx = await contract.finalizeMarket(marketId);
      await tx.wait();
      await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
    } catch (err) {
      console.log(`Skipping ${marketId}: Phase active.`);
    }
  }
}
main().catch(console.error);// scripts/finalize-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const CONTRACT_ADDRESS = (process.env.CONTRACT_ADDRESS || "0xC0226c1AC816B7b9D740ca284AC342D0b704CE6D").toLowerCase();

const CONTRACT_ABI = [
  "function finalizeMarket(string marketId) external",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)"
];

async function main() {
  const { OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL } = process.env;
  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL) throw new Error("Missing Env.");

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  const { data: pendingMarkets } = await supabase.from("events").select("id").eq("market_created", true).eq("market_resolved", false).eq("ai_processed", true);
  if (!pendingMarkets || pendingMarkets.length === 0) return;

  for (const event of pendingMarkets) {
    const marketId = `mkt_${event.id}`;
    try {
      const onChainMarket = await contract.getMarketFullDetails(marketId);
      if (Number(onChainMarket.status) === 4) {
        await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
        continue;
      }

      console.log(`Finalizing ${marketId}...`);
      const tx = await contract.finalizeMarket(marketId);
      await tx.wait();
      await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
    } catch (err) {
      console.log(`Skipping ${marketId}: Phase active.`);
    }
  }
}
main().catch(console.error);
