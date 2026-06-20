<div align="center">

# Geomacro

### Onchain geopolitical risk intelligence, settled in USDC, on Arc.

[![Live App](https://img.shields.io/badge/Live-geomacrooracle.lovable.app-FF6B00?style=for-the-badge)](https://geomacrooracle.lovable.app)
[![Arc Testnet](https://img.shields.io/badge/Arc-Testnet-1E90FF?style=for-the-badge)](https://testnet.arcscan.app/address/0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D)
[![Contract Verified](https://img.shields.io/badge/Contract-Verified-success?style=for-the-badge)](https://testnet.arcscan.app/address/0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D)

</div>

---

Geomacro watches the news, scores the risk, and lets two AI agents argue about where things are headed. Real money sits behind it, and everything settles onchain.

> **Contract:** `0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D`

## What this is

Most "AI news" tools just summarize headlines and stop there. I wanted something that actually *does* something with the read. So Geomacro pulls live geopolitical, macro, rare-earth, and crypto news, scores each story for severity and confidence, and once something crosses a threshold it opens a market automatically. No human has to notice the news and decide to act on it. The pipeline handles that part.

From there, two agents take opposite sides:

| | Predicts | |
|:---:|:---|:---:|
| 🦅 **Agent Hawk** | risk *escalates*, severity rising, ceasefires breaking | |
| 🕊️ **Agent Dove** | risk *cools*, de-escalation, mediation, ceasefires holding | |

Anyone can stake real USDC on Arc Testnet behind whichever side they think is right. When the outcome's clear, the market resolves and winners claim their payout straight from the contract.

**Nothing here is a mockup.** The contract is deployed and verified. The ingest pipeline runs on a public schedule you can go check right now. The whole stake, resolve, and claim loop has been tested onchain with real transactions.

## How it fits together

```
NewsAPI  →  Groq (llama-3.3-70b)  →  Supabase  →  Live Feed
                                          │
                                          ▼
                          GitHub Actions, every 30 min
                                          │
                                          ▼
                        AgentArena.sol on Arc Testnet
                    createMarket → stake → declareWinner → claim
```

A few notes on each piece:

🔍 **Ingestion.** NewsAPI pulls fresh articles across four categories on a loop. Nothing fancy, just polling.

🧠 **Classification.** Groq scores each article for severity, confidence, and relevance. This part took a few iterations to get right. Early on it was letting through celebrity gossip and exam results tagged as "macro," so there's now a fairly strict relevance gate before anything reaches the feed.

🗄️ **Storage.** Supabase holds the event log. The frontend reads straight from it.

⚙️ **Market automation.** A scheduled GitHub Action checks for high-severity events that don't have a market yet and opens one on Arc directly. No manual step. You can see the actual run logs in the [Actions tab](../../actions) of this repo.

💰 **Settlement.** `AgentArena.sol` holds staked USDC until a market resolves, then pays out proportionally to whoever backed the winning side.

## The contract

Kept this intentionally small. No governance token, no oracle network, no multisig. Just enough to prove the settlement loop actually works end to end before adding more moving parts:

```solidity
createMarket(marketId)          // owner opens a market
stake(marketId, side) payable   // anyone backs HAWK or DOVE with USDC
declareWinner(marketId, side)   // owner resolves once the outcome is clear
claim(marketId)                 // winners withdraw their share
```

USDC is Arc's native gas token, so staking is just a payable call. No approve step, no ERC-20 friction to deal with.

**One honest tradeoff worth calling out:** resolution right now is owner-attested rather than dispute-based like UMA. For a market that settles in hours, not days, a full dispute window adds latency without buying much trust at this stage of the project. Decentralizing that is the obvious next step. It's on the roadmap below, not pretending to be solved already.

## Repo layout

```
src/                          Frontend. Live Feed, Agent Arena, wallet connection
scripts/create-markets.js     Checks Supabase for new high-severity events,
                               opens markets onchain automatically
.github/workflows/
  auto-create-markets.yml     Runs the script above every 30 minutes
```

## Running it locally

```bash
git clone https://github.com/blocknine0/geomacro-oracle.git
cd geomacro-oracle
bun install
bun run dev
```

You'll need your own `NEWSAPI_KEY`, `GROQ_API_KEY`, and a Supabase project. See `.env.example`.

## Roadmap

- [x] Live feed with relevance-gated classification across 4 categories
- [x] Smart contract deployed and verified on Arc Testnet
- [x] Full stake, resolve, claim cycle tested onchain
- [x] Automated market creation from live events, via GitHub Actions
- [ ] Decentralized / dispute-based resolution instead of owner-attested
- [ ] Mainnet deployment
- [ ] Public track record. How often does Hawk vs. Dove actually call it right?

## Why Arc

Risk markets like this live or die on settlement cost and speed. Arc's native USDC gas means every stake, claim, and market creation is just one cheap, stablecoin-denominated transaction. No bridging, no wrapped tokens, no separate gas token to keep topped up. That's basically the whole bet here. The chain should stay out of the way of the prediction, not add friction on top of it.

---

<div align="center">

Built by [@blocknine0](https://github.com/blocknine0) · Questions or bugs? [Open an issue](../../issues)

</div>
