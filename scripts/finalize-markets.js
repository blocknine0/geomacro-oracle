// scripts/finalize-markets.js
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const PROTOCOL_FEE_BPS = 150n; // 1.5% — must mirror AgentArena.sol PROTOCOL_FEE_BPS exactly

const CONTRACT_ABI = [
  "function finalizeMarket(string marketId) external",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)",
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)"
];

const SIDE_LABEL = { 0: "NONE", 1: "HAWK", 2: "DOVE" };

// claim()-এর সাথে হুবহু ম্যাচিং payout ফর্মুলা (parimutuel + protocol fee),
// যাতে positions টেবিলে যা "claimable" দেখানো হয় আর ইউজার আসলে অনচেইন যা পাবে তা এক থাকে।
function computePayout(userStaked, winningPoolTotal, losingPoolTotal) {
  let payout = userStaked;
  if (winningPoolTotal > 0n && losingPoolTotal > 0n) {
    payout += (userStaked * losingPoolTotal) / winningPoolTotal;
  }
  const platformFee = (payout * PROTOCOL_FEE_BPS) / 10000n;
  return payout - platformFee;
}

// একটি রিজলভড মার্কেটের জন্য সব wallet-এর positions আপডেট করে +
// প্রতিটির জন্য একটি balance-history ইভেন্ট বসায়। প্রতিটি wallet × market independent —
// একজনের পজিশন আরেকজনকে টাচ করে না।
async function syncPositionsForMarket(adminSupabase, eventId, winSideLabel, hawkTotal, doveTotal) {
  const { data: activePositions, error } = await adminSupabase
    .from("positions")
    .select("*")
    .eq("market_id", eventId)
    .eq("status", "active");

  if (error) {
    console.error(`  ⚠️ Could not fetch positions for event ${eventId}: ${error.message}`);
    return;
  }
  if (!activePositions || activePositions.length === 0) return;

  const winningPoolTotal = winSideLabel === "HAWK" ? hawkTotal : doveTotal;
  const losingPoolTotal = winSideLabel === "HAWK" ? doveTotal : hawkTotal;

  for (const position of activePositions) {
    const won = position.side === winSideLabel;
    const nowIso = new Date().toISOString();

    if (won) {
      const staked = BigInt(position.staked_amount_raw); // ৬ ডেসিমেল রঢ ইউনিটে সংরক্ষিত মান
      const payoutRaw = computePayout(staked, winningPoolTotal, losingPoolTotal);
      const payoutDisplay = Number(ethers.formatUnits(payoutRaw, 6));

      const { error: updErr } = await adminSupabase
        .from("positions")
        .update({
          status: "pending_claim",
          resolved_outcome: winSideLabel,
          payout_amount: payoutDisplay,
          updated_at: nowIso
        })
        .eq("id", position.id);

      if (updErr) {
        console.error(`  ⚠️ Failed updating won position ${position.id}: ${updErr.message}`);
        continue;
      }

      await adminSupabase.from("wallet_balance_history").insert({
        wallet_address: position.wallet_address,
        balance: payoutDisplay, // pending — claim tx এর পরেই actual wallet balance বাড়বে; এটা claimable snapshot
        event_type: "resolve",
        market_id: eventId,
        amount_delta: payoutDisplay
      });
    } else {
      const { error: updErr } = await adminSupabase
        .from("positions")
        .update({
          status: "lost",
          resolved_outcome: winSideLabel,
          payout_amount: 0,
          updated_at: nowIso
        })
        .eq("id", position.id);

      if (updErr) {
        console.error(`  ⚠️ Failed updating lost position ${position.id}: ${updErr.message}`);
        continue;
      }

      const stakedDisplay = Number(ethers.formatUnits(position.staked_amount_raw, 6));
      await adminSupabase.from("wallet_balance_history").insert({
        wallet_address: position.wallet_address,
        balance: 0,
        event_type: "resolve",
        market_id: eventId,
        amount_delta: -stakedDisplay
      });
    }
  }

  console.log(`  Synced ${activePositions.length} position(s) for event ${eventId} (winner: ${winSideLabel})`);
}

async function main() {
  const {
    OWNER_PRIVATE_KEY,
    APP_SUPABASE_URL,
    APP_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY, // নতুন — positions/wallet_balance_history-এ লিখতে লাগবে, RLS bypass করার জন্য
    ARC_RPC_URL
  } = process.env;

  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL) {
    throw new Error("Missing Env.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY missing — positions/balance-history sync will be skipped this run.");
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  // service-role client শুধু positions / wallet_balance_history-এর জন্য — events টেবিলের বাকি সব কাজ আগের মতোই anon client দিয়ে
  const adminSupabase = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  const { data: pendingMarkets } = await supabase
    .from("events")
    .select("id")
    .eq("market_created", true)
    .eq("market_resolved", false)
    .eq("ai_processed", true);

  if (!pendingMarkets || pendingMarkets.length === 0) return;

  for (const event of pendingMarkets) {
    const marketId = `mkt_${event.id}`;
    try {
      const onChainMarket = await contract.getMarketFullDetails(marketId);
      const status = Number(onChainMarket.status);

      if (status === 4) {
        // ইতিমধ্যে finalized on-chain (আগের রান মিস হয়ে থাকতে পারে) — শুধু sync করে দাও
        if (adminSupabase) {
          const winLabel = SIDE_LABEL[Number(onChainMarket.winner)];
          if (winLabel && winLabel !== "NONE") {
            const pools = await contract.getMarket(marketId);
            await syncPositionsForMarket(adminSupabase, event.id, winLabel, pools.hawkTotal, pools.doveTotal);
          }
        }
        await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
        continue;
      }

      console.log(`Finalizing ${marketId}...`);
      const tx = await contract.finalizeMarket(marketId);
      await tx.wait();

      // finalize এর পরে fresh state পড়ে নাও যাতে real m.winner + pool totals পাওয়া যায়
      const finalized = await contract.getMarketFullDetails(marketId);
      const finalStatus = Number(finalized.status);

      if (finalStatus === 4) {
        const winLabel = SIDE_LABEL[Number(finalized.winner)];
        if (adminSupabase && winLabel && winLabel !== "NONE") {
          const pools = await contract.getMarket(marketId);
          await syncPositionsForMarket(adminSupabase, event.id, winLabel, pools.hawkTotal, pools.doveTotal);
        }
        await supabase.from("events").update({ market_resolved: true }).eq("id", event.id);
      }
      // finalStatus 4 না হলে (এখনো DISPUTED phase চলছে) — market_resolved false-ই থাকবে,
      // পরের cron run-এ আবার চেষ্টা হবে যতক্ষণ না dispute window শেষ হয়।
    } catch (err) {
      console.log(`Skipping ${marketId}: Phase active.`);
    }
  }
}

main().catch(console.error);
