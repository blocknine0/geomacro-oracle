# Geomacro

### Financializing global risk narratives. Onchain, in USDC, on Arc.

[![Live App](https://img.shields.io/badge/Live-geomacro.live-FF6B00?style=for-the-badge)](https://www.geomacro.live)
[![Arc Testnet](https://img.shields.io/badge/Arc-Testnet-1E90FF?style=for-the-badge)](https://testnet.arcscan.app/address/0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe)
[![Contract Verified](https://img.shields.io/badge/Contract-Verified-success?style=for-the-badge)](https://testnet.arcscan.app/address/0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe)
[![X](https://img.shields.io/badge/X-@GeomacroLive-000000?style=for-the-badge&logo=x)](https://x.com/GeomacroLive)

**[www.geomacro.live](https://www.geomacro.live)**

---

Geomacro is a real-time intelligence terminal and prediction market across the four pillars that move global risk: **geopolitics, rare earth supply, macroeconomics and crypto liquidity.**

Every breaking headline becomes a tradable 48-hour contract on Arc. An LLM scores each event for severity. The USDC staked on each side (HAWK vs DOVE) becomes the live implied probability of escalation. Settle onchain, no custodian, no middleman.

---

## What this is

Most prediction markets wait for humans to notice the news. Here, markets open themselves. An LLM scores every breaking story and anyone can stake real USDC on whether the risk it describes will escalate (HAWK) or de-escalate (DOVE). Everything settles onchain in USDC on Arc. No custodian, no middleman.

We built Geomacro because the gap between "news breaks" and "market opens" is where the real signal lives. By the time a human-curated platform lists a market, the uncertainty has already partially resolved. Geomacro closes that gap.

---

## How it fits together

```
NewsAPI / Guardian  →  Groq (llama-3.1-8b-instant)  →  Supabase  →  Live Feed
                                              │
                                              ▼
                          GitHub Actions, on independent ~2h cron schedules
              (ingest → create markets → resolve via AI → finalize)
                                              │
                                              ▼
                            AgentArena.sol on Arc Testnet
        createMarket → stake → declareWinnerByAI → (optional dispute/vote) → finalizeMarket → claim
```

**Ingestion.** NewsAPI (falling back to The Guardian on rate limits) pulls fresh articles across four categories: geopolitics, macro, rare-earth/commodities and crypto. Off-topic articles are rejected before they reach the feed via an LLM relevance gate, not just keyword filtering.

**Classification.** Groq (`llama-3.1-8b-instant`) scores each article for severity (0-100), confidence (0-100), and generates a short narrative + summary — all stored directly on the event row.

**Storage.** Supabase holds the event log (`events` table). The frontend reads straight from it, with Realtime subscriptions for instant updates.

**Market automation.** Four independent GitHub Actions workflows run on a schedule:
1. **Ingest** = pulls fresh news every ~2 hours, classifies, and inserts into Supabase.
2. **Create markets** = scans for high-severity events (severity ≥ 40) without a market and opens one on Arc via `createMarket()`, with a 46-hour staking window and 48-hour resolution window.
3. **Resolve** = checks markets past their `resolution_at` time, asks Groq to judge HAWK vs DOVE based on how the situation has evolved, and calls `declareWinnerByAI()`. This sets a *tentative* winner and opens a 24-hour public dispute window, it is not final yet.
4. **Finalize** = checks markets whose dispute window has passed and calls `finalizeMarket()`, locking in the winner and making it claimable.

No human approval step in any of them.

**Settlement.** `AgentArena.sol` holds staked USDC until a market finalizes, then pays out proportionally to whoever backed the winning side. Winners receive their original stake plus a proportional share of the losing pool, minus a 1.5% protocol fee.

---

## Live terminal

| Page | What it shows |
|------|--------------|
| [Active Narratives](https://www.geomacro.live/feed) | Live feed of AI-classified events with severity scores |
| [Analyst Panel](https://www.geomacro.live/arena) | HAWK vs DOVE staking interface with live lifecycle state (Staking Open → Closed → Tentative → Finalized) |
| [Data Pipeline](https://www.geomacro.live/pipeline) | Ingestion and classification pipeline status |
| [Onchain](https://www.geomacro.live/onchain) | On-chain market data and contract activity |
| [Roadmap](https://www.geomacro.live/roadmap) | What's shipped and what's next |

---

## The contract

Kept intentionally small like no governance token, no oracle network, no multisig. Enough to prove the settlement loop works end to end, with a built-in optimistic-dispute layer for community pushback on the AI's tentative verdict.

```solidity
createMarket(marketId, stakingDuration, resolutionDuration)  // owner opens a market
stake(marketId, side) payable                                // anyone backs HAWK or DOVE with USDC
declareWinnerByAI(marketId, winningSide)                     // automated resolver sets a tentative winner
disputeMarket(marketId) payable                               // anyone can challenge the tentative winner (fee-gated)
voteOnDispute(marketId, side) payable                         // community votes if a dispute is raised
finalizeMarket(marketId)                                      // locks in the final winner after the dispute window
claim(marketId)                                                // winners withdraw their share
```

**Contract:** `0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe` on Arc Testnet
**[View on Arcscan →](https://testnet.arcscan.app/address/0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe)**

USDC is Arc's native gas token, so staking is just a payable call — no `approve()` step, no ERC-20 friction. Native-currency values on Arc use **18 decimals** (not 6, despite USDC's ERC-20 interface using 6) — this matters for anyone integrating directly with the contract's `payable` functions.

**Known issue (testnet, not yet mainnet-blocking):** the `DISPUTE_FEE`, `MIN_VOTE_AMOUNT`, and `MIN_VOLUME_FOR_DISPUTE` constants were originally written assuming 6-decimal precision (e.g. `50 * 10**6`), but since native values use 18 decimals, these currently resolve to near-zero amounts on-chain — the dispute/vote gating is not economically meaningful in the current testnet deployment. A corrected version (`10**18` scale) is ready and will ship with the next redeploy (planned alongside mainnet).

**One honest tradeoff worth calling out:** resolution uses a single Groq call (`groq/compound`, which has built-in web search) to judge how the original story has evolved 48 hours later. This is more informative than a raw severity comparison but still relies on an LLM judgment rather than a dispute-based oracle like UMA. The contract does have an on-chain dispute/vote mechanism as a backstop (see above), but the constant-scaling bug currently limits its practical use on testnet. Fully decentralizing resolution remains on the roadmap.

---

## Repo layout

```
src/                              Frontend — Live Feed, Analyst Panel, wallet connection
contracts/
  AgentArena.sol                  Market creation, staking, AI resolution, dispute/vote, claim
scripts/
  ingest-news.js                  Pulls NewsAPI/Guardian articles, classifies with Groq, inserts to Supabase
  create-markets.js               Scans for high-severity events, opens markets on Arc
  resolve-markets.js              Checks due markets, Groq judges HAWK/DOVE, calls declareWinnerByAI()
  finalize-markets.js             Checks AI-resolved markets past the dispute window, calls finalizeMarket()
  debug-schema.js                 Verifies live Supabase schema matches what each script expects
.github/workflows/
  auto-ingest-news.yml            Runs ingest-news.js every ~2 hours
  auto-create-markets.yml         Runs create-markets.js on its own ~2-hour schedule
  auto-resolve-markets.yml        Runs resolve-markets.js on its own ~2-hour schedule
  auto-finalize-markets.yml       Runs finalize-markets.js every ~2 hours
  debug-schema.yml                Manual-trigger schema drift check
```



## Roadmap

- [x] Live feed pipeline with relevance-gated classification across 4 categories
- [x] Smart contract deployed and verified on Arc Testnet
- [x] Full create, stake, resolve and claim cycle tested onchain
- [x] Automated market creation from live events via GitHub Actions
- [x] Automated tentative resolution via Groq after the 48-hour window
- [x] Automated finalization after the 24-hour public dispute window
- [x] Dynamic Arena with no hardcoded markets, pure on-chain discovery
- [x] Supabase schema-drift checker to catch backend/script mismatches early
- [ ] On-chain dispute fee/threshold decimal fix (`10**6` → `10**18`) — ready, pending redeploy
- [ ] Fully decentralized dispute-based resolution as the primary mechanism (currently AI-first with an on-chain dispute backstop)
- [ ] Mainnet deployment
- [ ] Public track record showing how often HAWK vs. DOVE actually calls it right
- [ ] Full mobile wallet support via WalletConnect for external browsers

---

## Why Arc

Risk markets like this live or die on settlement cost and speed. Arc's native USDC gas means every stake, claim and market creation is just one cheap, stablecoin-denominated transaction. No bridging, no wrapped tokens, no separate gas token to keep topped up. That is basically the whole bet here. The chain should stay out of the way of the prediction, not add friction on top of it.

---

Built by [@blocknine0](https://github.com/blocknine0) · Follow on X: [@GeomacroLive](https://x.com/GeomacroLive) · Questions or bugs? [Open an issue](https://github.com/blocknine0/geomacro/issues)
