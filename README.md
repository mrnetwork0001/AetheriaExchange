# Aetheria Exchange (@AetheriaEx)

**AI Market Co-Pilot + Outcome Exchange on X Layer, with 1-click OKX DEX execution.**

Users bet YES/NO on real-world events on a parimutuel outcome venue, and the AI
co-pilot converts each position into a correlated OKX DEX spot trade — executed
non-custodially in the user's own wallet.

Built for the X Layer AI Season Hackathon. See [app_breakdown.md](app_breakdown.md)
and [master_plan.md](master_plan.md) for the full product thesis.

## Repository layout

```
contracts/   Hardhat project — OutcomeMarket.sol (parimutuel YES/NO venue, native OKB)
frontend/    Next.js 14 dApp — terminal-style dashboard, AI co-pilot, execution modal
             + serverless AI intent engine (/api/ai/intent, Claude structured outputs)
             + OKX DEX aggregator proxy (/api/dex/swap, server-side HMAC signing)
```

## Quick start

```bash
# 1. Contracts — compile, test, export ABI to the frontend
cd contracts
npm install
npm test
npm run export-abi

# 2. Frontend — run the dApp (works in offline preview mode with zero config)
cd ../frontend
npm install
npm run dev        # http://localhost:3000
```

### Going live

```bash
# Deploy the outcome venue to X Layer Testnet (chain 195)
cd contracts
cp .env.example .env          # add PRIVATE_KEY
npm run deploy:testnet        # writes address + ABI into frontend/src/contracts/config.json
npm run seed:testnet          # creates 4 demo markets

# Enable the live AI engine + DEX routing
cd ../frontend
cp .env.example .env.local    # add ANTHROPIC_API_KEY and OKX DEX API credentials
npm run dev
```

The frontend degrades gracefully: without a deployed contract it shows an
**OFFLINE PREVIEW** market grid; without an `ANTHROPIC_API_KEY` the co-pilot
uses a labeled deterministic fallback; without OKX API keys the DEX leg reports
**DEX ROUTING OFFLINE** instead of failing.

## Networks

| Network         | Chain ID | RPC                          |
| --------------- | -------- | ---------------------------- |
| X Layer Testnet | 195      | https://testrpc.xlayer.tech  |
| X Layer Mainnet | 196      | https://rpc.xlayer.tech      |

Native gas/settlement token: **OKB**. Explorer: OKLink (X Layer).

## How a trade flows

1. User picks an outcome (market card) or asks the co-pilot in natural language.
2. `/api/ai/intent` parses intent into structured JSON (Claude, JSON-schema-constrained):
   `{ intentType, outcomeTrade, dexTrade, explanation }`.
3. The Execution Ticket modal shows both legs; **Approve & Trade** signs them
   sequentially in the user's wallet:
   - Leg 1 — `OutcomeMarket.buyShares(marketId, isYes)` with native OKB.
   - Leg 2 — swap tx built by the OKX DEX aggregator (server-signed API request,
     user-signed transaction).
4. Each leg links to its OKLink confirmation. Keys never leave the wallet.
