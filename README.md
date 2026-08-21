# Aetheria Exchange

**An AI-run prediction market, live on X Layer mainnet.**

Users bet YES/NO on real-world events on a parimutuel venue settled in native
OKB. An AI co-pilot turns plain English into executable tickets - "bet 2 OKB
YES on the Fed market and hedge it" becomes a signed outcome bet plus a
correlated OKX DEX hedge - and three autonomous agents run the venue around
the clock: **they create the markets, price them, seed the liquidity, and
settle the outcomes onchain.**

Every agent decision is posted to a public console. Every settlement is a
transaction anyone can verify. Nothing is custodial: the server holds API
credentials, never keys, and every value-bearing transaction is signed in the
user's own wallet.

| | |
|---|---|
| **Live dApp** | **[aetheria.exchange](https://www.aetheria.exchange)** |
| **Mainnet venue** (chain 196) | [`0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d`](https://web3.okx.com/explorer/x-layer/evm/address/0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d) - deployed block 68469454 |
| **Settlement receipts** | [aetheria.exchange/receipts](https://www.aetheria.exchange/receipts) - every resolution and refund, with its onchain transaction |
| **Agent console** | [aetheria.exchange/?tab=agents](https://www.aetheria.exchange/?tab=agents) - live decisions from the fleet |
| Documentation | [aetheria.exchange/docs](https://www.aetheria.exchange/docs) |
| Source | [github.com/mrnetwork0001/AetheriaExchange](https://github.com/mrnetwork0001/AetheriaExchange) |
| Testnet venue (chain 1952) | [`0xA82EDb5e…EB30d`](https://web3.okx.com/explorer/x-layer-testnet/address/0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d) - same address, still live |
| X | [@AetheriaEx](https://x.com/AetheriaEx) |

Built for the **X Layer AI Season Hackathon** - see [SUBMISSION.md](SUBMISSION.md).

> **Unaudited software handling real funds on X Layer mainnet.** Prediction
> markets and spot trades carry risk of total loss. Nothing here is financial
> advice.

## Deployment timeline

Aetheria was built on testnet, proven there, and then launched to mainnet -
in that order, with each step evidenced onchain.

| Date (UTC) | Milestone |
|---|---|
| **2026-08-12** | Venue deployed to **X Layer Testnet** (chain 1952), block 38107772 |
| **2026-08-15** | **First fully autonomous settlement.** The resolver read the Nasdaq close for TSLA, compared it to the market's threshold, and settled onchain with no human involved - [`0x7663a2bf…5333cf`](https://web3.okx.com/explorer/x-layer-testnet/tx/0x7663a2bfe58af16e1a998c5de369e62b4f244fcdf9d07a10ba00657c0d5333cf) |
| **2026-08-17** | [**Public testnet launch announced**](https://x.com/aetheriaex/status/2089417872321765883) on [@AetheriaEx](https://x.com/AetheriaEx); the agent fleet begins running 24/7 |
| **2026-08-20** | Venue deployed to **X Layer Mainnet** (chain 196), block 68469454 |
| **2026-08-21** | **First autonomous mainnet settlements.** Overnight the resolver settled three markets and declined a fourth - see [Autonomous settlement, proven](#autonomous-settlement-proven) |
| **2026-08-21** | [**Public mainnet launch announced**](https://x.com/AetheriaEx) on [@AetheriaEx](https://x.com/AetheriaEx) |

Eight days of testnet operation sit behind the mainnet launch: the same
contract, the same agents, and a settlement record that existed before any
real funds were at stake.

## Autonomous settlement, proven

On the night of **2026-08-20**, with no human involved, the venue settled
three of its own mainnet markets - and refused to settle a fourth.

| Market | Outcome | Reading vs threshold | Winners paid | Transaction |
|---|---|---|---|---|
| OKB 24h trading volume above $100M | **NO** | $44.3M vs $100M | 1.33x | [`0x77665e2e…`](https://web3.okx.com/explorer/x-layer/evm/tx/0x77665e2e24158e53141baeb5825e80e8f0c39a5b82aa9247938931d2c64425b4) |
| X Layer total DeFi TVL above $100M | **YES** | $112.6M vs $100M | 1.25x | [`0x94cd841b…`](https://web3.okx.com/explorer/x-layer/evm/tx/0x94cd841b769c8956c6072f4fd7e4a88ed385aa3beaa010fb68a639ab77500f7d) |
| X Layer stablecoin supply above $150M | **YES** | $2.07B vs $150M | 1.25x | [`0xa4f46d6c…`](https://web3.okx.com/explorer/x-layer/evm/tx/0xa4f46d6cf476ce02de9ceb3a0d808802c5513e5661f883696618da6dca6ff22d) |
| Tokenized RWA TVL above $27.5B | **refused** | $27.50B vs $27.5B | - | still open, queued for human review |

The refusal is the one worth dwelling on. The reading landed **exactly on the
threshold**. Inside a 1% dispute band the resolver declines to settle rather
than call a coin flip, and says so in its public log. Every venue claims it
settles fairly; this one can point at the market it would not guess on.

Every row is verifiable from
[aetheria.exchange/receipts](https://www.aetheria.exchange/receipts).

---

## Contents

- [Deployment timeline](#deployment-timeline)
- [Autonomous settlement, proven](#autonomous-settlement-proven)
- [What makes this different](#what-makes-this-different)
- [How it works](#how-it-works)
- [The agents](#the-agents)
- [Settlement, and refusing to guess](#settlement-and-refusing-to-guess)
- [Quick start](#quick-start)
- [Repository layout](#repository-layout)
- [HTTP API](#http-api)
- [Environment variables](#environment-variables)
- [Deploying and operating the venue](#deploying-and-operating-the-venue)
- [Persistent memory on 0G Storage](#persistent-memory-on-0g-storage)
- [Architecture](#architecture)
- [Why hedges route to the OKX DEX interface](#why-hedges-route-to-the-okx-dex-interface)
- [Engineering quality](#engineering-quality)
- [Roadmap](#roadmap)

---

## What makes this different

Most prediction markets ask you to trust that they will pay out. Most "AI"
crypto projects put a chat box over a normal app. Aetheria's claim is
narrower and checkable:

1. **The venue settles itself, and shows its work.** The resolver reads a
   public metric, compares it to the market's threshold, and writes the
   outcome onchain. [`/receipts`](https://www.aetheria.exchange/receipts)
   lists every settlement and refund with the transaction that performed it.
2. **It refuses to guess.** A reading too close to the threshold, an
   ambiguous title, a stale data source, or a category with no adapter all go
   to a human queue instead of being settled on a coin flip. The console says
   so out loud.
3. **The AI prices against live data, not vibes.** Fair-odds estimates are
   anchored to the *same* reading the resolver will settle against, and the
   rationale cites the number.
4. **It is structurally incapable of insolvency.** Parimutuel: winners are
   paid from the losing pool, never by the house. A market with no losing
   side refunds everyone.

## How it works

1. **Markets.** `OutcomeMarket.sol` is a permissionless parimutuel venue
   settled in native OKB: anyone creates a YES/NO market; stakes pool per
   side; winners split the losing pool pro-rata minus a 2% protocol fee.
   Cancelled and one-sided markets refund everyone in full. A permissionless
   `forceCancelStale` lets anyone free stakes from a market left unsettled
   past a 7-day grace period, so funds can never be stranded by an absent
   owner.
2. **Ask.** The co-pilot parses natural language into structured intent via a
   schema-constrained LLM: an outcome trade, an optional correlated OKX DEX
   hedge, or a draft for a brand-new market - with implied odds and estimated
   payout quoted before anything is signed.
3. **Execute.** The execution ticket signs each leg in the user's own wallet:
   the bet on the venue, and the hedge via a prefilled **OKX DEX interface
   deep link** or in-app aggregator routing (with automatic ERC-20 allowance
   handling). Every leg links to its onchain confirmation, and a reverted
   transaction is reported as reverted - never as confirmed.
4. **Track.** Positions with live payout estimates and 1-click claims, a
   real-time onchain activity ticker, market detail views with orderflow, and
   wallet-keyed persistent chat memory.

### Market categories

**PULSE** markets are the venue's signature: short-dated (usually 24h)
markets on X Layer's own public metrics - daily active wallets, total DeFi
TVL, stablecoin supply, OKB 24h trading volume across all venues - drafted
daily by the AI, seeded by the market maker, settled by the resolver. The
chain speculating on itself, on a loop.

**RWA** markets run the same machinery against tokenized real-world-asset
sector metrics (total RWA TVL per DefiLlama).

**EQUITY** markets close the loop with tokenized equities. An outcome bet on
"TSLA closes above $340 on 2026-08-14 (Nasdaq official close)" is hedgeable
with **wTSLAx on the same chain**: the co-pilot pairs the two legs and the
resolver settles from the official close. That makes the AI trade real-world
assets, not just markets about them.

**SPORTS** and other categories have no metric adapter by design - they are
resolved by a human from public results, and the resolver refuses to touch
them.

The USD leg is Circle's **native USDC** (X Layer replaced bridged USDC on
2026-08-07). Every token address in `frontend/src/lib/tokens.ts` was verified
by reading `symbol()`/`name()`/`decimals()` from the X Layer RPC - the
bridged and native USDC contracts both report the symbol "USDC" and differ
only by address and `name()`, so symbol matching alone is unsafe.

### The AI is visible, not just claimed

- **AGENT OPS console** (`?tab=agents`) - a live terminal where every agent
  posts every decision, with per-agent status and elapsed-time reporting.
- **Settlement receipts** (`/receipts`) - the venue's audit trail: pools, the
  winners' payout multiple, and a link to the settling transaction.
- **AI fair value** on every open market - a calibrated probability, its
  written rationale, and the edge versus the market's implied odds, anchored
  on a live reading of the metric.
- **Voice input** - the co-pilot takes spoken instructions via the browser's
  Web Speech API (feature-detected).

## The agents

Three agents run autonomously; the co-pilot is user-driven. Each runs on the
cadence its job actually needs, and the console reports that honestly rather
than showing four permanently green lights.

| Agent | Role | Cadence | Where |
|---|---|---|---|
| **Pulse Drafter** | *Creates.* Asks the intent engine for the day's machine-resolvable markets and deploys them onchain | daily 06:10 UTC (cron) | `contracts/scripts/pulse-drafter.js` |
| **Market Maker** | *Makes.* Seeds two-sided liquidity at AI fair odds, tops up thin sides, and reclaims its own settled positions | continuous loop (systemd) | `contracts/scripts/market-maker.js` |
| **Resolver** | *Settles.* Matches a market to a metric adapter, reads the public source, and resolves onchain - or refuses and queues it for a human | hourly, on the hour (cron) | `contracts/scripts/resolver.js` |
| **Co-Pilot** | *Trades.* Parses intent into tickets, quotes odds and payouts, drafts markets on request, remembers context across sessions | per request | in-app chat + `/api/ai/intent` |

Every agent posts each decision to `/api/agent-log`. The console marks an
agent **ONLINE** for the minutes around a report, then shows elapsed time
since it last worked - so a resolver reading `LAST 52M AGO` at 07:53 is not a
fault, it is the 07:00 cron having run exactly on schedule.

The market maker takes real inventory risk under a **per-run** spend cap
(`MM_BUDGET_OKB`, counted in memory and reset when the process restarts),
with broadcast-time spend accounting, per-market fault isolation, and a gas
reserve floor. Before staking, each pass sweeps its own settled markets and
claims what it is owed, so recovered capital funds the next markets rather
than the balance only ever falling. It trades exclusively on the venue and
generates zero DEX volume by design.

The AI layer runs on a **provider abstraction**: Anthropic (schema-guaranteed
structured outputs) or **0G Compute** (decentralized inference via its
OpenAI-compatible router), selected per environment. Every AI-produced intent
is re-validated server-side before it can reach the execution flow.

## Settlement, and refusing to guess

The resolver auto-settles only **PULSE, RWA and EQUITY** markets, and only
when every one of these holds:

- the market was created by an allowlisted creator
- the title matches **exactly one** metric adapter
- the comparator is a plain "above X" and the threshold parses cleanly
- the reading is fresh (staleness bound), or is a dated reading whose date
  matches the market's own
- the reading is **outside a dispute band** around the threshold
  (`RESOLVER_SETTLE_MARGIN`, default 1%; tighter for exact figures like an
  official equity close)

Everything else is printed and posted for manual resolution. `resolveMarket`
is final onchain, so the resolver treats "I am not sure" as a first-class
outcome. Run with `RESOLVER_DRY_RUN=1` first, always.

**Fair odds use the same sources.** `frontend/src/lib/liveMetrics.ts` mirrors
the resolver's adapters exactly - same endpoints, same aggregation, same
match patterns - so the model prices against the number the venue will
actually settle on. A divergence there would be worse than no reading at all,
because the market maker seeds real OKB behind those odds.

## Quick start

Requirements: Node 18+ (Node 22+ recommended).

```bash
# 1. Contracts - compile, test, export the ABI to the frontend
cd contracts
npm install
npm test                  # 11 passing
npm run export-abi

# 2. Frontend - runs against the LIVE MAINNET venue out of the box
cd ../frontend
npm install
npm run dev               # http://localhost:3003
```

With zero configuration the app reads the deployed **mainnet** venue on chain
196 - markets, odds and activity are live - and the co-pilot answers in a
clearly-labeled offline mode. Add an AI provider key (below) for real
inference. To trade, connect OKX Wallet or MetaMask on **X Layer mainnet
(chain 196)** with real OKB; a wallet on any other chain reads fine and is
prompted to switch before a write.

## Repository layout

```
contracts/            Hardhat project
  contracts/OutcomeMarket.sol     parimutuel venue (11/11 tests passing)
  scripts/deploy.js               deploy + write address/ABI to frontend
  scripts/seed.js                 create the initial market book
  scripts/create-market.js        one-off market creation (exact close times)
  scripts/market-maker.js         liquidity agent (seeds, tops up, claims)
  scripts/pulse-drafter.js        AI market-creation agent
  scripts/resolver.js             settlement agent + metric adapters
frontend/             Next.js 14 dApp (App Router)
  src/app/api/ai/intent           AI intent engine (Anthropic | 0G)
  src/app/api/ai/odds             fair-odds estimates, live-metric anchored
  src/app/api/dex/swap            OKX DEX aggregator proxy (server-side HMAC)
  src/app/api/markets             public onchain market list
  src/app/api/receipts            settlement audit trail (chain-log sweep)
  src/app/api/agent-log           AGENT OPS feed (shared via Upstash)
  src/app/api/memory              0G Storage memory sync (encrypted blobs)
  src/app/receipts                public settlement-receipts page
  src/app/docs                    statically-rendered documentation portal
  src/components                  terminal-style UI
  src/lib                         chains, payout math, AI provider, tokens,
                                  liveMetrics (odds anchoring), KV, memory
  docs-content/                   markdown source for the docs portal
ops/                  bootstrap-vps.sh, systemd unit, cron schedule
docs/                 DEPLOY.md, DELIVERY-CHECKLIST.md, brand-kit.md
bots/telegram/        zero-dependency Telegram bot
SUBMISSION.md         hackathon submission package
```

## HTTP API

| Route | Method | Purpose |
|---|---|---|
| `/api/ai/intent` | POST | prompt + market context + history → validated structured intent (`OUTCOME_BET`, `DEX_HEDGE`, `DUAL_STRATEGY`, `MARKET_ANALYSIS`, `MARKET_DRAFT`) |
| `/api/ai/odds` | POST | market title → calibrated fair YES probability, anchored on a live reading of the same metric the resolver settles against |
| `/api/markets` | GET | live onchain market list (`?chainId=` optional; defaults to mainnet) |
| `/api/receipts` | GET | settlement audit trail - every resolution and refund with its settling transaction, reconstructed from chain logs and cached in KV |
| `/api/dex/swap` | POST | OKX aggregator swap tx + ERC-20 approval spender (server-side HMAC; keys never reach the client) |
| `/api/memory` | GET/POST | encrypted memory blob sync to 0G Storage (rate-budgeted; `?probe=1` for availability) |
| `/api/agent-log` | GET/POST | AGENT OPS feed - agents POST decisions (gated by `AGENT_LOG_SECRET`), the console polls GET (`?since=` cursor) |

All AI routes degrade to labeled offline behavior when no provider is
configured - they never fabricate trades on runtime errors.

## Environment variables

### `frontend/.env.local`

| Variable | Required | Purpose |
|---|---|---|
| `AI_PROVIDER` | no | `anthropic` or `0g`; auto-picks by which key is set |
| `AGENT_LOG_SECRET` | on public hosts | required from agents posting to `/api/agent-log`; the route fails closed in production without it |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | on serverless hosts | shared store for the AGENT OPS feed and the receipts index - without it, agents and visitors hit different instances |
| `NEXT_PUBLIC_SITE_URL` | in production | canonical origin for Open Graph / social cards |
| `ANTHROPIC_API_KEY` | one provider | Claude with schema-guaranteed structured outputs |
| `ZG_COMPUTE_BASE_URL` / `ZG_COMPUTE_API_KEY` / `ZG_COMPUTE_MODEL` | one provider | 0G Compute router, key, and model |
| `ZG_STORAGE_PRIVATE_KEY` | no | funded 0G-testnet wallet; enables encrypted memory sync ([faucet](https://faucet.0g.ai)) |
| `ZG_STORAGE_RPC` / `ZG_STORAGE_INDEXER` | no | 0G endpoints (sane testnet defaults) |
| `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_API_PASSPHRASE` / `OKX_PROJECT_ID` | no | in-app aggregator routing; the interface deep link needs no keys |

### `contracts/.env`

| Variable | Required | Purpose |
|---|---|---|
| `PRIVATE_KEY` | to deploy | deployer / venue owner / resolver signer |
| `MM_PRIVATE_KEY` | recommended | dedicated market-maker wallet (falls back to `PRIVATE_KEY`) |
| `AETHERIA_API_URL` | for agents | frontend base URL (production `https://www.aetheria.exchange`) |
| `AGENT_LOG_SECRET` | on public hosts | shared secret for the AGENT OPS feed; must match the frontend's value |
| `MM_BUDGET_OKB` | no | per-run spend cap. Must be at least 20x `MM_MIN_SIDE_OKB`, or extreme-odds markets can never be seeded |
| `MM_SEED_OKB` / `MM_MIN_SIDE_OKB` / `MM_MAX_STAKE_OKB` | no | per-market seed size, depth floor per side, and single-stake ceiling |
| `MM_GAS_RESERVE_OKB` | no | balance the maker will never spend below (default 0.005). Set too high and the bot silently skips every market |
| `MM_INTERVAL_SEC` | no | seconds between book scans |
| `DRAFTER_TOPICS` | no | semicolon-separated drafter topics |
| `RESOLVER_ALLOWED_CREATORS` | no | creator allowlist for auto-settlement |
| `RESOLVER_SETTLE_MARGIN` | no | dispute band around the threshold (default 0.01); acts as a floor for adapters with tighter margins |
| `RESOLVER_MAX_STALENESS_SEC` | no | how old a live reading may be |
| `RESOLVER_DRY_RUN` | no | evaluate and print, settle nothing |
| `OKLINK_API_KEY` | no | contract source verification |

### `bots/` (Telegram)

| Variable | Required | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | from @BotFather |
| `AETHERIA_API_URL` | yes | deployed frontend base URL |

`.env` files are gitignored; `.env.example` templates ship in each package.

## Deploying and operating the venue

```bash
cd contracts

# Deploy + seed. deploy.js writes the address and ABI into the git-TRACKED
# frontend/src/contracts/config.json - commit and push it, or the hosted
# frontend will not see the new venue.
npm run deploy:mainnet
npm run seed:mainnet

# Agent fleet (manual invocation)
npm run mm:mainnet          # market maker - long-running loop
npm run draft:mainnet       # pulse drafter - daily
npm run resolve:mainnet     # resolver - hourly

# Production fleet: one command installs the market maker under systemd and
# the drafter/resolver under flock-guarded cron, running as an unprivileged
# user. Idempotent, and ends with a resolver dry run.
sudo bash ops/bootstrap-vps.sh mainnet

# Testnet equivalents: deploy:testnet, seed:testnet, mm:testnet,
# draft:testnet, resolve:testnet, bootstrap-vps.sh testnet
```

See [docs/DEPLOY.md](docs/DEPLOY.md) for the full hosted topology (Vercel +
Upstash + VPS).

Operational notes that matter:

- **The agents report what they do.** Each posts its decisions to
  `/api/agent-log`. Set `AGENT_LOG_SECRET` on both sides when the frontend is
  public. Reporting is fire-and-forget - an unreachable frontend never blocks
  trading, drafting, or settlement.
- **Run the resolver with `RESOLVER_DRY_RUN=1` first.** Settlement is final.
- **X Layer public RPCs cap `eth_getLogs` at 100 blocks.** The activity feed
  streams live events over a bounded recent window; `/api/receipts`
  reconstructs full settlement history by sweeping in 100-block chunks and
  persisting its cursor, so no external indexer is required for that path.
- **Never run `npm run build` while the dev server is up** - they share
  `.next` and the build clobbers it.

## Persistent memory on 0G Storage

Co-pilot chats are wallet-keyed and survive reloads and account switches -
connect wallet A, chat, switch to wallet B and back: A's conversation
returns, and the AI uses it for context ("hedge that position").

localStorage is the hot store, and a write-behind sync pushes **AES-GCM
encrypted** snapshots to 0G decentralized storage, keeping only the blob's
root-hash pointer client-side. This is encrypted off-device durability, not
yet cross-device sync - the pointer and salt are per-browser; a 0G-KV pointer
registry with wallet-signature-derived keys is the roadmap item that adds
portability. The server and 0G ever see ciphertext only. Race-safe by
construction: per-key epoch counters prevent a RESET from being resurrected
by an in-flight upload and stop stale uploads from overwriting newer
snapshots, and persistence is gated on load completion so a wallet switch can
never leak one account's chat into another's storage.

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
OKX DEX interface           (AI odds) ◄──────┘  (same sources, shared
     │                           ▲                adapters - see liveMetrics)
     ▼                     Pulse Drafter ◄── intent engine (MARKET_DRAFT)
X Layer mainnet (196) ◄──────────────────────────────── all settlement
                                                        chat memory ► 0G Storage
```

Stack: Solidity 0.8.24 + Hardhat · Next.js 14 · wagmi v2 / viem · Anthropic
structured outputs / 0G Compute · 0G Storage TS SDK · OKX DEX aggregator API ·
Upstash Redis.

## Why hedges route to the OKX DEX interface

Outcome bets create conviction; conviction wants a hedge. Every position the
co-pilot builds can carry an OKX DEX leg - and it is a real hedge, not a
correlated double-down: the leg always moves **opposite** to the bet's
payoff. A YES bet on "TSLA closes above $340" profits when TSLA rises, so its
hedge sells wTSLAx; a NO bet buys it. Same-direction pairings are called
correlated positions, never hedges, and the pairing (company and direction)
is enforced server-side rather than trusted to the model.

Per the hackathon FAQ, only swaps executed **through the OKX DEX interface**
count toward Launch Grant volume - API-executed swaps are excluded - so the
ticket routes hedges to a prefilled interface deep link as the primary path,
with in-app aggregator routing as the fallback.

**Anti-wash stance, explicitly:** the market maker trades only on the venue
and generates zero DEX volume by design. All OKX DEX volume is user-signed,
economically motivated flow - the only kind the rules count.

## Engineering quality

- **11/11 contract tests**: payout math, refunds, access control, one-sided
  auto-cancel, double-claim protection, and the permissionless
  `forceCancelStale` escape hatch.
- **Hardened through repeated adversarial multi-agent review** (the fix
  commits are the audit trail). Confirmed findings fixed include money-losers
  caught before they shipped: an execution-retry double-spend, missing
  wallet-chain gating (funds broadcast to the wrong chain), an economically
  inverted hedge, a threshold parser reading "$12bn" as 1, a wallet-switch
  chat-memory leak, a reverted transaction reported to the user as confirmed,
  and a gas reserve larger than the bot's own balance that silently disabled
  it. Every finding was confirmed by an independent adversarial verifier
  before being fixed.
- Every AI output crossing into the execution flow is schema-validated or
  coerced server-side; open-model outputs are never trusted raw.
- Graceful degradation at every layer: no deployment → labeled preview; no AI
  key → labeled offline parser; no OKX keys → interface routing only; no 0G
  storage key → local-only memory; no live metric → an honestly unanchored
  estimate.

## Roadmap

### Shipped

**The venue**
- `OutcomeMarket.sol` - parimutuel YES/NO markets in native OKB, 11/11 tests,
  with a permissionless `forceCancelStale` escape hatch so funds cannot be
  stranded by an absent owner
- Deployed to X Layer Testnet (2026-08-12), then Mainnet (2026-08-20)
- Six market categories supported - PULSE, RWA, EQUITY, SPORTS, CRYPTO,
  MACRO - with markets live across five of them today

**The autonomous fleet**
- **Pulse Drafter** - writes the day's machine-resolvable markets and deploys
  them onchain, daily on cron
- **Market Maker** - seeds both sides at AI-estimated fair odds under a
  per-run budget cap, tops up thin sides, and sweeps its own settled
  positions to reclaim capital
- **Resolver** - settles from public data behind a settlement gauntlet
  (creator allowlist, single-adapter match, threshold parsing, staleness
  bounds, dispute band) and queues anything ambiguous for a human
- One-command VPS install: systemd service, flock-guarded cron, log rotation

**The AI layer**
- Co-pilot turning plain English into signed tickets, with voice input and
  wallet-keyed chat memory
- Live-metric anchoring for fair odds, sharing the resolver's exact data
  adapters so pricing and settlement never disagree
- Provider abstraction: Anthropic structured outputs or **0G Compute**
  decentralized inference
- Chat memory AES-GCM encrypted client-side and synced to **0G Storage**

**Execution and proof**
- OKX DEX hedging: prefilled interface deep link plus in-app aggregator
  routing with automatic ERC-20 allowance handling
- Hedge direction enforced server-side, so a "hedge" can never be a
  correlated double-down
- **Settlement receipts** (`/receipts`) - full onchain audit trail, rebuilt
  from chain logs without an external indexer
- **AGENT OPS console** - every agent decision, live and public
- Ten-page documentation portal, statically rendered
- Telegram bot live at [@AetheriaExBot](https://t.me/AetheriaExBot) - the
  co-pilot in chat, replying with tickets and deep links to execute

### Next

- Verified contract source on the block explorer
- Live-metric anchoring for the **drafter**, so thresholds are chosen against
  current readings rather than priors (the odds engine already does this)
- Decentralized resolution: migrate the resolver's adapters to oracle feeds
  and open settlement beyond the owner key
- Cross-device chat memory: pointer portability for the 0G Storage sync with
  wallet-signature-derived keys

### Exploring

- **Yield-bearing pools ("no-loss markets")** - park idle parimutuel float in
  a fixed-yield position so a market's liquidity earns while it waits,
  funding a mode where losers recover principal and the yield is the prize
- **Scalar markets** - bucketed "predict the number" ranges as a
  multi-outcome evolution of the contract
- Social-login embedded wallets with sponsored gas, and WalletConnect
- Indexer-backed activity history and leaderboards
- Registration in OKX's onchain AI-agent economy
