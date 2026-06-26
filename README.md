<div align="center">

# Geomacro

### Onchain geopolitical risk intelligence, settled in USDC, on Arc.

[![Live App](https://img.shields.io/badge/Live-geomacro.live-FF6B00?style=for-the-badge)](https://www.geomacro.live)
[![Arc Testnet](https://img.shields.io/badge/Arc-Testnet-1E90FF?style=for-the-badge)](https://testnet.arcscan.app/address/0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D)
[![Contract Verified](https://img.shields.io/badge/Contract-Verified-success?style=for-the-badge)](https://testnet.arcscan.app/address/0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D)

**[www.geomacro.live](https://www.geomacro.live)**

</div>

---

Geomacro reads the news, scores the risk and lets two AI agents argue about what happens next. Agent Hawk bets on escalation. Agent Dove bets on calm. Every market opens automatically from live news, settles in USDC on Arc and resolves in 48 hours.

> **Live site:** https://www.geomacro.live
> **Contract:** `0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D` on Arc Testnet

---

## What this is

Most prediction markets wait for humans to notice the news. Here, markets open themselves. An LLM scores every breaking story, two AI agents argue opposite outcomes and anyone can stake real USDC on who is right. Everything settles onchain in USDC on Arc. No custodian, no middleman.

I built Geomacro because the gap between "news breaks" and "market opens" is where the real signal lives. By the time a human-curated platform lists a market, the uncertainty has already partially resolved. Geomacro closes that gap.

## How it fits together

```
NewsAPI  →  Groq (llama-3.3-70b)  →  Supabase  →  Live Feed
                                          │
                                          ▼
                       GitHub Actions, every ~2 hours
                         (ingest → create → resolve)
                                          │
                                          ▼
                        AgentArena.sol on Arc Testnet
                    createMarket → stake → declareWinner → claim
```

**Ingestion.** NewsAPI pulls fresh articles across four categories: geopolitics, macro, rare-earth/commodities and crypto. Off-topic articles are rejected before they reach the feed, not just filtered by keyword.

**Classification.** Groq scores each article for severity, confidence and relevance. This part took a few iterations to get right. Early on it was letting through celebrity gossip and exam results tagged as "macro," so there is now a fairly strict relevance gate before anything reaches the feed.

**Storage.** Supabase holds the event log. The frontend reads straight from it.

**Market automation.** Three independent GitHub Actions workflows run on a schedule. One ingests fresh news every two hours. A second scans for high-severity events without a market and opens one on Arc. A third checks markets that have passed their 48-hour window, asks Groq to judge which side aged better and calls declareWinner() automatically. No human approval step in any of them.

**Settlement.** AgentArena.sol holds staked USDC until a market resolves, then pays out proportionally to whoever backed the winning side. Winners receive their original stake plus a proportional share of the losing pool.

## The contract

Kept this intentionally small. No governance token, no oracle network, no multisig. Just enough to prove the settlement loop actually works end to end before adding more moving parts.

```solidity
createMarket(marketId)          // owner opens a market
stake(marketId, side) payable   // anyone backs HAWK or DOVE with USDC
declareWinner(marketId, side)   // automated resolver declares outcome
claim(marketId)                 // winners withdraw their share
```

USDC is Arc's native gas token, so staking is just a payable call. No approve step, no ERC-20 friction.

**One honest tradeoff worth calling out:** resolution right now uses Groq to re-read the original story 48 hours later and judge which call aged better. This is more informative than a raw severity comparison but still relies on an LLM judgment rather than a dispute-based mechanism like UMA. Decentralizing resolution is the obvious next step and it is on the roadmap below.

## Repo layout

```
src/                              Frontend. Live Feed, Agent Arena, wallet connection
scripts/
  ingest-news.js                  Pulls NewsAPI articles, classifies with Groq, inserts to Supabase
  create-markets.js               Scans for high-severity events, opens markets on Arc
  resolve-markets.js              Checks 48h+ markets, asks Groq for verdict, calls declareWinner()
.github/workflows/
  auto-ingest-news.yml            Runs ingest-news.js every ~2 hours
  auto-create-markets.yml         Runs create-markets.js every ~2 hours (30 min after ingest)
  auto-resolve-markets.yml        Runs resolve-markets.js every ~2 hours (30 min after create)
```

## Running it locally

```bash
git clone https://github.com/blocknine0/geomacro-oracle.git
cd geomacro-oracle
bun install
bun run dev
```

You will need your own `NEWSAPI_KEY`, `GROQ_API_KEY`, and a Supabase project. See `.env.example`.

## Roadmap

- [x] Live feed pipeline with relevance-gated classification across 4 categories
- [x] Smart contract deployed and verified on Arc Testnet
- [x] Full create, stake, resolve and claim cycle tested onchain
- [x] Automated market creation from live events via GitHub Actions
- [x] Automated market resolution via Groq judgment after 48 hour window
- [x] Dynamic Arena with no hardcoded markets, pure on-chain discovery
- [x] AI Duel feature showing market-specific Hawk and Dove arguments before staking
- [ ] Decentralized dispute-based resolution instead of LLM-attested settlement
- [ ] Mainnet deployment
- [ ] Public track record showing how often Hawk vs. Dove actually calls it right
- [ ] Full mobile wallet support via WalletConnect for external browsers

## Why Arc

Risk markets like this live or die on settlement cost and speed. Arc's native USDC gas means every stake, claim and market creation is just one cheap, stablecoin-denominated transaction. No bridging, no wrapped tokens, no separate gas token to keep topped up. That is basically the whole bet here. The chain should stay out of the way of the prediction, not add friction on top of it.

---

<div align="center">

Built by [@blocknine0](https://github.com/blocknine0) · Questions or bugs? [Open an issue](../../issues)

</div>
