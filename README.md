# Aetheria Exchange

**AI Market Co-Pilot + Outcome Exchange on X Layer, with 1-click OKX DEX
execution.**

Users bet YES/NO on real-world events on a parimutuel outcome venue. An AI
co-pilot turns plain English into executable trades - "bet 2 OKB YES on the
Fed market and hedge it" becomes a signed outcome bet plus a correlated hedge
routed to OKX DEX. Four autonomous AI components run the venue end to end:
**the AI trades, creates, makes, and settles the markets.**

Built for the **X Layer AI Season Hackathon**. Submission details:
[SUBMISSION.md](SUBMISSION.md).

| | |
|---|---|
| Testnet venue (chain 1952) | [`0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d`](https://www.oklink.com/xlayer-test/address/0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d) - live with seeded markets |
| Mainnet venue (chain 196) | launching after submission |
| X | [@AetheriaEx](https://x.com/AetheriaEx) |

> Unaudited hackathon software on testnet. Prediction markets and spot trades
> carry risk of total loss. Nothing here is financial advice.

---

## Contents

- [How it works](#how-it-works)
- [The four AI agents](#the-four-ai-agents)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Deploying and operating the venue](#deploying-and-operating-the-venue)
- [HTTP API](#http-api)
- [Telegram bot](#telegram-bot)
- [Persistent memory on 0G Storage](#persistent-memory-on-0g-storage)
- [Architecture](#architecture)
- [The Launch Grant volume thesis](#the-launch-grant-volume-thesis)
- [Engineering quality](#engineering-quality)
- [Roadmap](#roadmap)

---

## How it works

1. **Markets.** `OutcomeMarket.sol` is a permissionless parimutuel venue
   settled in native OKB: anyone creates a YES/NO market; stakes pool per
   side; winners split the losing pool pro-rata minus a 2% protocol fee.
   Cancelled and one-sided markets refund everyone in full.
2. **Ask.** The co-pilot parses natural language into structured intent via a
   schema-constrained LLM: an outcome trade, an optional correlated OKX DEX
   hedge, or a draft for a brand-new market - with implied odds and estimated
   payout quoted before anything is signed.
3. **Execute.** The execution ticket signs each leg in the user's own wallet:
   the bet on the venue, and the hedge via a prefilled **OKX DEX interface
   deep link** (the Launch-Grant-eligible path) or in-app aggregator-API
   routing as a fallback (with automatic ERC-20 allowance handling). Every
   leg links to its OKLink confirmation. Keys never leave the wallet.
4. **Track.** Positions with live payout estimates and 1-click claims, a
   real-time on-chain activity ticker, market detail views with orderflow,
   and wallet-keyed persistent chat memory.

**PULSE markets** are the venue's signature category: short-dated (usually
24h) markets on X Layer's own public metrics - daily active wallets, OKB DEX
volume - drafted daily by the AI, seeded by the market maker, and settled by
the resolver. The chain speculating on itself, on a loop.

## The four AI agents

| Agent | Role | Where |
|---|---|---|
| **Co-Pilot** | *Trades.* Parses intent into tickets, quotes odds/payouts, drafts markets on request, remembers context across sessions | in-app chat + `/api/ai/intent` |
| **Pulse Drafter** | *Creates.* Asks the intent engine for the day's machine-resolvable PULSE markets and deploys them onchain via permissionless `createMarket` | `contracts/scripts/pulse-drafter.js` (cron) |
| **Market Maker** | *Makes.* Seeds two-sided liquidity and tops up thin sides under hard budget caps; opens fresh markets at AI-estimated fair odds via `/api/ai/odds` | `contracts/scripts/market-maker.js` (loop) |
| **Resolver** | *Settles.* Parses the drafter's machine-resolvable questions, fetches the metric from public data, resolves onchain - and refuses to guess (strict guards, manual list for everything else) | `contracts/scripts/resolver.js` (cron) |

The AI layer runs on a **provider abstraction**: Anthropic (schema-guaranteed
structured outputs) or **0G Compute** (decentralized inference via its
OpenAI-compatible router), selected per environment. Every AI-produced intent
is re-validated server-side before it can reach the execution flow.

A **Telegram bot** ([bots/telegram](bots/telegram)) bridges the co-pilot to
chat, replying with tickets and deep-link execute buttons.

## Repository layout

```
contracts/            Hardhat project
  contracts/OutcomeMarket.sol     parimutuel venue (8/8 tests passing)
  scripts/deploy.js               deploy + write address/ABI to frontend
  scripts/seed.js                 create demo + PULSE markets
  scripts/market-maker.js         liquidity agent
  scripts/pulse-drafter.js        AI market-creation agent
  scripts/resolver.js             settlement agent
frontend/             Next.js 14 dApp (App Router)
  src/app/api/ai/intent           AI intent engine (Anthropic | 0G)
  src/app/api/ai/odds             fair-odds estimates
  src/app/api/dex/swap            OKX DEX aggregator proxy (server-side HMAC)
  src/app/api/markets             public on-chain market list
  src/app/api/memory              0G Storage memory sync (encrypted blobs)
  src/components                  terminal-style UI
  src/lib                         chains, payout math, AI provider, memory store
bots/telegram/        zero-dependency Telegram bot
SUBMISSION.md         hackathon submission package
app_breakdown.md / master_plan.md / claude_execution.md   original planning docs
```

## Quick start

Requirements: Node 18+ (Node 22+ recommended).

```bash
# 1. Contracts - compile, test, export the ABI to the frontend
cd contracts
npm install
npm test                  # 8 passing
npm run export-abi

# 2. Frontend - runs against the LIVE testnet venue out of the box
cd ../frontend
npm install
npm run dev               # http://localhost:3000
```

With zero configuration the app reads the deployed testnet venue (markets,
odds, activity) and the co-pilot answers in a clearly-labeled offline mode.
Add an AI provider key (below) for real analysis; connect OKX Wallet or
MetaMask on X Layer Testnet (chain 1952, faucet linked in the app footer) to
trade.

## Environment variables

### `frontend/.env.local`

| Variable | Required | Purpose |
|---|---|---|
| `AI_PROVIDER` | no | `anthropic` or `0g`; auto-picks by which key is set |
| `ANTHROPIC_API_KEY` | one provider | Claude with schema-guaranteed structured outputs |
| `ZG_COMPUTE_BASE_URL` | one provider | 0G Compute router, e.g. `https://router-api.0g.ai/v1` |
| `ZG_COMPUTE_API_KEY` | with 0G | from the 0G Compute dashboard |
| `ZG_COMPUTE_MODEL` | with 0G | e.g. `gpt-5.6-luna` (verified good fit) |
| `ZG_STORAGE_PRIVATE_KEY` | no | funded 0G-testnet wallet; enables decentralized memory sync ([faucet](https://faucet.0g.ai)) |
| `ZG_STORAGE_RPC` / `ZG_STORAGE_INDEXER` | no | 0G endpoints (sane testnet defaults) |
| `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_API_PASSPHRASE` / `OKX_PROJECT_ID` | no | in-app aggregator fallback routing only; the grant-eligible interface deep link needs no keys |

### `contracts/.env`

| Variable | Required | Purpose |
|---|---|---|
| `PRIVATE_KEY` | to deploy | deployer / venue owner / resolver signer |
| `MM_PRIVATE_KEY` | recommended | dedicated market-maker wallet (falls back to `PRIVATE_KEY`) |
| `AETHERIA_API_URL` | for agents | frontend base URL (default `http://localhost:3000`) |
| `MM_BUDGET_OKB` etc. | no | agent knobs - see script headers |
| `DRAFTER_TOPICS` | no | semicolon-separated PULSE topics |
| `RESOLVER_ALLOWED_CREATORS` / `RESOLVER_MAX_STALENESS_SEC` / `RESOLVER_DRY_RUN` | no | settlement guards |
| `OKLINK_API_KEY` | no | contract verification |

### `bots/` (Telegram)

| Variable | Required | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | from @BotFather |
| `AETHERIA_API_URL` | yes | deployed frontend base URL |

`.env` files are gitignored; `.env.example` templates ship in each package.

## Deploying and operating the venue

```bash
cd contracts

# Deploy + seed (writes the address into frontend/src/contracts/config.json)
npm run deploy:testnet
npm run seed:testnet

# Agent fleet
npm run mm:testnet          # market maker - long-running loop
npm run draft:testnet       # pulse drafter - run daily (cron)
npm run resolve:testnet     # resolver - run hourly (cron)

# Mainnet equivalents: deploy:mainnet, mm:mainnet, draft:mainnet, resolve:mainnet
```

Operational notes that matter:

- **The resolver never guesses.** It only auto-settles PULSE markets from
  allowlisted creators with exactly one unambiguous metric adapter, a plain
  "above X" comparator, a parseable threshold, and a fresh close (staleness
  bound). Everything else is printed for manual resolution. `resolveMarket`
  is final onchain - run with `RESOLVER_DRY_RUN=1` first.
- **The market maker takes real inventory risk** under a lifetime budget cap
  with broadcast-time spend accounting, per-market fault isolation, and a
  gas-reserve floor. It trades only on the venue - zero DEX volume by design.
- **X Layer public RPCs cap `eth_getLogs` at 100 blocks** - the activity
  feed backfills a bounded recent window and streams live events; full
  history needs an indexer (roadmap).

## HTTP API

| Route | Method | Purpose |
|---|---|---|
| `/api/ai/intent` | POST | prompt + market context + history → validated structured intent (`OUTCOME_BET`, `DEX_HEDGE`, `DUAL_STRATEGY`, `MARKET_ANALYSIS`, `MARKET_DRAFT`) |
| `/api/ai/odds` | POST | market title → calibrated fair YES probability (strictly validated; neutral 0.5 prior when unavailable) |
| `/api/markets` | GET | live on-chain market list (`?chainId=` optional) |
| `/api/dex/swap` | POST | OKX aggregator swap tx + ERC-20 approval spender (server-side HMAC; keys never reach the client) |
| `/api/memory` | GET/POST | encrypted memory blob sync to 0G Storage (rate-budgeted; `?probe=1` for availability) |

All AI routes degrade to labeled offline behavior when no provider is
configured - they never fabricate trades on runtime errors.

## Telegram bot

```bash
TELEGRAM_BOT_TOKEN=123:abc AETHERIA_API_URL=https://your-app node bots/telegram/bot.mjs
```

Free text goes through the same intent engine as the dApp (with live market
context); replies carry the ticket summary and inline **Execute on Aetheria**
deep links. `/markets` lists live odds. The bot holds no keys and signs
nothing - execution always happens in the user's wallet on the dApp.

## Persistent memory on 0G Storage

Co-pilot chats are wallet-keyed and survive reloads and account switches.
localStorage is the hot store; when `ZG_STORAGE_PRIVATE_KEY` is configured, a
write-behind sync pushes **AES-GCM-encrypted** snapshots to 0G decentralized
storage and keeps only the blob's root-hash pointer client-side. The server
and 0G ever see ciphertext only. Race-safe by construction: per-key epoch
counters prevent a RESET from being resurrected by an in-flight upload and
stop stale uploads from overwriting newer snapshots, and persistence is
gated on load completion so a wallet switch can never leak one account's
chat into another's storage.

## Architecture

```
User wallet ──────────── AI intent engine ─────────── 0G Compute / Anthropic
     │                    (schema-validated)                (inference)
     │ signs                     │
     ▼                           ▼
Execution ticket ── leg 1 ─► OutcomeMarket.sol (parimutuel, native OKB)
     │                           ▲          ▲
     │ leg 2                     │          │
     ▼                     Market Maker   Resolver ◄── public metric data
OKX DEX interface          (AI odds)      (guarded)
(grant-eligible link)            ▲
     │                     Pulse Drafter ◄── intent engine (MARKET_DRAFT)
     ▼                           │
X Layer EVM (196 mainnet / 1952 testnet) ◄──────────── all settlement
                                                        chat memory ► 0G Storage
```

Stack: Solidity 0.8.24 + Hardhat · Next.js 14 · wagmi v2 / viem · Anthropic
structured outputs / 0G Compute · 0G Storage TS SDK · OKX DEX aggregator API.

## The Launch Grant volume thesis

Outcome bets create conviction; conviction wants a hedge. Every position the
co-pilot builds can carry a correlated OKX DEX leg. Per the hackathon FAQ,
only swaps executed **through the OKX DEX interface** count toward Launch
Grant volume (API-executed swaps are excluded) - so the ticket routes hedges
to a prefilled OKX DEX interface deep link as the primary path.

**Anti-wash stance, explicitly:** the market maker trades only on the venue
and generates zero DEX volume by design. All OKX DEX volume is user-signed,
economically motivated flow - the only kind the rules count.

## Engineering quality

- 8/8 contract tests: payout math, refunds, access control, one-sided
  auto-cancel, double-claim protection.
- **Five adversarial multi-agent review rounds; 30 verified findings fixed**,
  including money-losing bugs caught before they shipped: an execution-retry
  double-spend, missing wallet-chain gating (funds broadcast to the wrong
  chain), a resolver threshold parser that read "above $50 by" as $50
  billion, and a wallet-switch chat-memory leak. Each finding was confirmed
  by an independent adversarial verifier before being fixed.
- Every AI output crossing into the execution flow is schema-validated or
  coerced server-side; open-model outputs are never trusted raw.
- Graceful degradation at every layer: no deployment → labeled preview; no
  AI key → labeled offline parser; no OKX keys → interface routing only; no
  0G storage key → local-only memory.

## Roadmap

**Launch window**
- Mainnet launch on X Layer (chain 196) + OKLink contract verification
- Hosted deployment + activated @AetheriaEx presence

**Mass-market onboarding**
- Social-login **embedded wallets** (Privy-class) with **sponsored gas** via
  a relayer/paymaster - Polymarket-style "Continue with Google" onboarding
  without breaking self-custody
- WalletConnect support for mobile wallets alongside injected discovery

**Venue depth**
- **Scalar PULSE pools**: bucketed range markets ("predict the number") as a
  multi-outcome parimutuel evolution of the current contract
- Decentralized resolution: migrate the resolver's adapters to oracle feeds
  and open resolution beyond the owner key
- Indexer-backed full activity history and leaderboards

**Distribution**
- Telegram bot public launch; OKX Wallet dApp discovery listing; registration
  in OKX's onchain AI-agent economy; Farcaster frames and embeddable market
  widgets

**Decentralized AI stack**
- Cross-device memory: pointer portability for the 0G Storage sync (on-chain
  or 0G-KV pointer registry) with wallet-signature-derived encryption keys
- Agent decisioning fully on 0G Compute, with reasoning receipts published
  to 0G Storage for auditability
