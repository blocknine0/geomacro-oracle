// scripts/resolve-markets.js
//
// Automation script for Geomacro Agent Arena.
// Runs on a schedule via GitHub Actions, separate from create-markets.js.
//
// What it does:
// 1. Finds all OPEN markets on the AgentArena contract that were created
//    more than 24 hours ago (the standard prediction window).
// 2. For each one, looks up the latest severity reading for the linked
//    Supabase event (severity can be re-classified/updated over time as
//    more news comes in on the same story).
// 3. Compares that severity against the market's threshold (parsed from
//    the original event's `severity` at creation time + a fixed margin,
//    OR a stored threshold if you add one to the events table).
// 4. Calls declareWinner(marketId, side) using the SAME owner wallet
//    used for market creation. HAWK wins if severity crossed the
//    threshold, DOVE wins if it didn't.
//
// Required environment variables (same as create-markets.js):
//   OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const CONTRACT_ADDRESS = "0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D";
const RESOLUTION_WINDOW_HOURS = 24; // markets resolve 24h after creation
const SEVERITY_MARGIN = 5; // small buffer so a severity exactly at threshold doesn't flip-flop

const CONTRACT_ABI = [
  "event MarketCreated(string marketId)",
  "function markets(string) view returns (string marketId, uint8 status, uint8 winner, uint256 hawkTotal, uint256 doveTotal, bool exists)",
  "function declareWinner(string marketId, uint8 winningSide) external",
];

const SIDE = { NONE: 0, HAWK: 1, DOVE: 2 };

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

  // 1. Discover all markets ever created (same pagination pattern as the frontend).
  const deployBlock = 47800000;
  const latestBlock = await provider.getBlockNumber();
  const filter = contract.filters.MarketCreated();

  const marketIds = [];
  let fromBlock = deployBlock;
  const CHUNK = 10000;
  while (fromBlock <= latestBlock) {
    const toBlock = Math.min(fromBlock + CHUNK - 1, latestBlock);
    const events = await contract.queryFilter(filter, fromBlock, toBlock);
    for (const e of events) {
      marketIds.push(e.args.marketId);
    }
    fromBlock = toBlock + 1;
  }

  console.log(`Found ${marketIds.length} total market(s) ever created.`);

  let resolvedCount = 0;

  for (const marketId of marketIds) {
    const market = await contract.markets(marketId);

    // Skip if already resolved.
    if (Number(market.status) !== 0) continue;

    // marketId format is mkt_<uuid> for automated markets. Legacy/manual
    // markets like "mkt_001" won't match a Supabase row and are skipped,
    // they need manual resolution.
    const eventId = marketId.startsWith("mkt_") ? marketId.slice(4) : null;
    if (!eventId) {
      console.log(`Skipping ${marketId}: not a Supabase-linked market id.`);
      continue;
    }

    const { data: event, error } = await supabase
      .from("events")
      .select("id, severity, created_at, source_title, market_threshold")
      .eq("id", eventId)
      .single();

    if (error || !event) {
      console.log(`Skipping ${marketId}: no matching Supabase event found.`);
      continue;
    }

    if (event.market_threshold === null || event.market_threshold === undefined) {
      console.log(
        `Skipping ${marketId}: no stored market_threshold (likely created before this column existed). Needs manual resolution.`
      );
      continue;
    }

    const createdAt = new Date(event.created_at);
    const hoursSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceCreation < RESOLUTION_WINDOW_HOURS) {
      console.log(
        `Skipping ${marketId}: only ${hoursSinceCreation.toFixed(1)}h old, waiting for ${RESOLUTION_WINDOW_HOURS}h window.`
      );
      continue;
    }

    // Use the exact threshold that was stored when the market was created,
    // not an approximation.
    const threshold = event.market_threshold;
    const currentSeverity = event.severity; // re-fetches the latest stored value, in case it was reclassified

    const winningSide = currentSeverity >= threshold - SEVERITY_MARGIN ? SIDE.HAWK : SIDE.DOVE;

    console.log(
      `Resolving ${marketId} ("${event.source_title}") — severity ${currentSeverity} vs threshold ~${threshold} → winner ${
        winningSide === SIDE.HAWK ? "HAWK" : "DOVE"
      }`
    );

    try {
      const tx = await contract.declareWinner(marketId, winningSide);
      console.log(`  tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  confirmed in block ${receipt.blockNumber}`);
      resolvedCount++;
    } catch (err) {
      console.error(`  Failed to resolve ${marketId}: ${err.message}`);
    }
  }

  console.log(`Done. Resolved ${resolvedCount} market(s) this run.`);
}

main().catch((err) => {
  console.error("Fatal error in resolve-markets script:", err);
  process.exit(1);
});
