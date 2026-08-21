# Aetheria Exchange - X Layer AI Season Hackathon Submission

**Project**: Aetheria Exchange (@AetheriaEx)
**One-liner**: An AI-run prediction market on X Layer - three autonomous
agents create, price, seed and settle the markets onchain, and a co-pilot
turns plain English into a signable outcome bet plus a correlated OKX DEX
hedge, fully self-custodied.

| | |
|---|---|
| Live dApp | **[aetheria.exchange](https://www.aetheria.exchange)** |
| **Mainnet venue (chain 196)** | [`0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d`](https://web3.okx.com/explorer/x-layer/evm/address/0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d) - deployed block 68469454, 2026-08-20 |
| **Settlement receipts** | [aetheria.exchange/receipts](https://www.aetheria.exchange/receipts) - every settlement with its onchain transaction |
| Agent console | [aetheria.exchange/?tab=agents](https://www.aetheria.exchange/?tab=agents) |
| Documentation | [aetheria.exchange/docs](https://www.aetheria.exchange/docs) |
| GitHub | https://github.com/mrnetwork0001/AetheriaExchange |
| X account | https://x.com/AetheriaEx |
| Legacy testnet venue (chain 1952) | [`0xA82EDb5e…EB30d`](https://web3.okx.com/explorer/x-layer-testnet/address/0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d) - same address, kept for reference |

---

## The single strongest claim, first

**On the night of 2026-08-20, with no human involved, the venue settled three
of its own mainnet markets correctly - and refused to settle a fourth.**

| Market | Outcome | Winners paid | Transaction |
|---|---|---|---|
| #11 "OKB 24h trading volume is above $100 million at 23:59 UTC on 2026-08-20 (CoinGecko)" | **NO** (reading $44.3M) | 1.33x | [`0x77665e2e…`](https://web3.okx.com/explorer/x-layer/evm/tx/0x77665e2e24158e53141baeb5825e80e8f0c39a5b82aa9247938931d2c64425b4) |
| #13 "X Layer total DeFi TVL is above $100 million at 23:59 UTC on 2026-08-20 (DefiLlama)" | **YES** (reading $112.6M) | 1.25x | [`0x94cd841b…`](https://web3.okx.com/explorer/x-layer/evm/tx/0x94cd841b769c8956c6072f4fd7e4a88ed385aa3beaa010fb68a639ab77500f7d) |
| #14 "X Layer total stablecoin circulating supply is above $150 million (DefiLlama)" | **YES** (reading $2.07B) | 1.25x | [`0xa4f46d6c…`](https://web3.okx.com/explorer/x-layer/evm/tx/0xa4f46d6cf476ce02de9ceb3a0d808802c5513e5661f883696618da6dca6ff22d) |
| #12 "Total tokenized RWA TVL across DeFi is above $27.5 billion (DefiLlama)" | **refused** | - | still open, queued for human review |

The refusal is the part worth dwelling on. The RWA sector sat at **exactly
$27.50B against a $27.5B threshold**. Inside a 1% dispute band, the resolver
declines to settle rather than call a coin flip, and says so in its public
log. Every venue claims it settles fairly; this one can point at the market
it would not guess on.

All four transactions and the resolver's reasoning are on
[aetheria.exchange/receipts](https://www.aetheria.exchange/receipts).

## What it is

Aetheria pairs two engines:

1. **A parimutuel outcome venue** (`OutcomeMarket.sol`) - permissionless
   YES/NO markets settled in native OKB. Winners split the losing pool
   pro-rata; a 2% fee on the losing pool funds the protocol. **11/11 tests
   passing.** Cancelled and one-sided markets refund in full, and a
   permissionless `forceCancelStale` lets anyone free stakes from a market
   left unsettled past a 7-day grace period - so funds can never be stranded
   by an absent owner. Parimutuel means the venue is **structurally incapable
   of insolvency**: winners are paid by losers, never by the house.
2. **An AI co-pilot** - a serverless intent engine (schema-constrained LLM,
   Anthropic or 0G Compute) that turns natural language into executable
   structure: `{ outcomeTrade, dexTrade, marketDraft, explanation }`, with
   implied odds and estimated payout quoted before anything is signed.

The AI is structural, not decorative. **Three autonomous agents** run the
market lifecycle end to end, and the co-pilot serves users on request:

- **Pulse Drafter (creates)** - `contracts/scripts/pulse-drafter.js` asks the
  intent engine for the day's machine-resolvable markets and deploys them
  onchain via permissionless `createMarket`. Daily at 06:10 UTC, no human in
  the loop.
- **Market Maker (makes)** - `contracts/scripts/market-maker.js` seeds
  two-sided liquidity at AI-estimated fair odds, tops up thin sides under a
  per-run budget cap, and sweeps its own settled positions to reclaim
  capital.
- **Resolver (settles)** - `contracts/scripts/resolver.js` matches a market
  to a metric adapter, reads the public source, and settles onchain - or
  refuses and queues it for a human.
- **Co-Pilot (trades)** - "bet 2 OKB YES on the Fed market and hedge it"
  becomes a two-leg execution ticket; it also drafts new markets on request.

### The AI is visible, not claimed

- **AGENT OPS console** (`?tab=agents`) - a live terminal where every agent
  posts every decision, with per-agent status and honest elapsed-time
  reporting (a cron agent showing "LAST 52M AGO" is on schedule, not broken).
- **Settlement receipts** (`/receipts`) - the venue's audit trail: pools, the
  winners' payout multiple, and a link to the settling transaction.
- **AI fair value on every market** - a calibrated probability with written
  rationale and the edge versus implied odds. Crucially, it is **anchored on
  a live reading of the same metric the resolver will settle against**
  (`frontend/src/lib/liveMetrics.ts` mirrors the resolver's adapters exactly),
  so the rationale cites a real number rather than a prior.
- **Voice input** - the co-pilot takes spoken instructions via the browser's
  Web Speech API.

### Market categories

- **PULSE** - short-dated markets on X Layer's own public metrics (daily
  active wallets, total DeFi TVL, stablecoin supply, OKB 24h volume across
  all venues). The chain speculating on itself, on a loop.
- **RWA** - daily machine-resolvable markets on tokenized real-world-asset
  sector metrics (total RWA TVL per DefiLlama).
- **EQUITY** - markets on a tokenized equity's official close, hedgeable with
  the tokenized stock on the same chain: a YES bet on "TSLA closes above $340
  on 2026-08-14" pairs with a **wTSLAx** leg on OKX DEX. The resolver settles
  from the published daily close and refuses an in-progress session, a
  session other than the one named, or a reading inside the dispute band.
- **SPORTS** and others - deliberately have no metric adapter. The resolver
  will not touch them; a human resolves from public results.

**Native USDC**: the USD leg is Circle's native USDC
(`0xB6CEceAB302E2E4948951eE7843FC24E92933061`), adopted by X Layer on
2026-08-07. Both the bridged and native contracts report the symbol "USDC",
so every token address was verified by onchain `symbol()`/`name()`/
`decimals()` reads rather than symbol matching.

**AI infrastructure**: the intent and odds engines run on a provider
abstraction - Anthropic (schema-guaranteed structured outputs) or **0G
Compute** (decentralized inference via its OpenAI-compatible router).
Decentralized AI serving an X Layer-native venue. Chat memory is AES-GCM
encrypted client-side and synced to **0G Storage**; the server and 0G see
ciphertext only.

## How hedging works, and why it routes to the OKX DEX interface

A hedge here is economically real, not a correlated double-down: the DEX leg
always moves **opposite** to the outcome bet's payoff. A YES bet on "TSLA
closes above $340" profits when TSLA rises, so its hedge sells wTSLAx; a NO
bet buys it. The pairing - company and direction - is enforced server-side,
not trusted to the model.

Per the hackathon FAQ, only swaps executed **through the OKX DEX interface**
count toward Launch Grant volume (API-executed swaps are excluded), so the
execution ticket routes hedges to a prefilled interface deep link as the
primary path, with in-app aggregator routing as a labeled fallback.

**Anti-wash stance, explicitly**: the market-maker agent trades only on the
outcome venue and generates zero DEX volume by design. All OKX DEX volume is
user-signed, economically motivated flow - the only kind the rules count.

## Judge test drive (3 minutes)

1. **Open [aetheria.exchange](https://www.aetheria.exchange)** - it reads the
   live **mainnet** venue instantly, no wallet needed: real markets, live
   odds, and the onchain activity ticker.
2. **Open [/receipts](https://www.aetheria.exchange/receipts)** - the venue's
   settlement history. Click VERIFY ONCHAIN on any row to land on the
   transaction that settled it.
3. **Open the AGENT OPS tab** - watch the fleet work. The market maker scans
   every few minutes; the resolver runs hourly; the drafter ran at 06:10 UTC.
4. **Ask the co-pilot**: *"bet 2 OKB YES on the Man City market and hedge
   it"* → inspect the intent card (implied odds, estimated payout) → PREPARE
   EXECUTION → see the two-leg ticket with its non-custodial disclosure.
   (Or tap MIC and speak it.)
5. **Open any market** → the **AI FAIR VALUE** box quotes the engine's
   probability and rationale, citing the live metric reading behind it.
6. **To trade for real**: connect OKX Wallet or MetaMask on **X Layer mainnet
   (chain 196)**. Stakes are real OKB - the amounts on the venue are
   deliberately small.

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
OKX DEX interface           (AI odds) ◄──────┘   (shared adapters, so the
     │                           ▲                 model prices what the
     ▼                     Pulse Drafter           venue will settle)
X Layer mainnet (196) ◄──────────────────────── all settlement
                                                chat memory ► 0G Storage
```

- Non-custodial end to end: the server holds API credentials, never keys;
  every value-bearing transaction is signed in the user's own wallet.
- Stack: Solidity 0.8.24 + Hardhat · Next.js 14 · wagmi v2 / viem · Anthropic
  structured outputs / 0G Compute · 0G Storage · OKX DEX aggregator API
  (server-side HMAC) · Upstash Redis.

## Engineering quality

- **11/11 contract tests**: payout math, refunds, access control, one-sided
  auto-cancel, double-claim protection, and the permissionless
  `forceCancelStale` escape hatch.
- **Hardened through repeated adversarial multi-agent review**, with each
  finding confirmed by an independent verifier before being fixed. Real
  money-losers caught pre-ship: an execution-retry double-spend, missing
  wallet-chain gating, an economically inverted hedge, a threshold parser
  reading "$12bn" as 1, a wallet-switch chat-memory leak, a reverted
  transaction reported to the user as confirmed, and a gas reserve larger
  than the bot's own balance that silently disabled it.
- Every AI output crossing into the execution flow is schema-validated
  server-side; open-model outputs are never trusted raw.
- Graceful degradation everywhere: no AI key → labeled offline parser; no OKX
  keys → interface routing only; no 0G key → local-only memory; no live
  metric → an honestly unanchored estimate.

## Roadmap (post-hackathon)

- **Verified contract source** on the block explorer.
- **Mass-market onboarding**: social-login embedded wallets with sponsored
  gas - Polymarket-style sign-in without breaking self-custody - plus
  WalletConnect for mobile.
- **Yield-bearing pools ("no-loss markets")**: park idle parimutuel float in
  a fixed-yield position so a market's liquidity earns while it waits.
- **Scalar PULSE pools**: bucketed "predict the number" range markets.
- **Decentralized resolution**: oracle-fed adapters replacing owner-key
  settlement.
- **Live-metric anchoring for the drafter**, so thresholds are chosen against
  current readings rather than priors.
- **Distribution**: public Telegram bot, OKX Wallet dApp listing, OKX
  agent-economy registration.
- **Decentralized AI stack**: cross-device 0G Storage memory with
  wallet-derived keys; agent reasoning receipts published to 0G Storage.

Full detail: [README.md](README.md#roadmap).

## Requirements checklist

- [x] AI incorporated into product design (intent engine, market drafting, AI-priced market making, autonomous settlement)
- [x] **Launched on X Layer Mainnet (chain 196)** - `0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d`, deploy block 68469454, live with autonomous settlements
- [x] Previously deployed and proven on X Layer Testnet (chain 1952)
- [x] Dedicated X account (@AetheriaEx), active
- [ ] Submission post mentioning @XLayerOfficial
- [ ] Google Form submitted by Aug 21, 23:59 UTC

---

## X announcement draft (post from @AetheriaEx)

> Aetheria is live on @XLayerOfficial mainnet.
>
> Last night, with nobody watching, our AI settled three markets on-chain and
> refused to settle a fourth - the reading sat exactly on the threshold, so
> it declined to guess.
>
> Every settlement has a receipt: aetheria.exchange/receipts
>
> #XLayerAISeason

_(Attach: 30-60s screen recording of ask → ticket → execute, plus the
receipts page.)_
