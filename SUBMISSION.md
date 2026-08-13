# Aetheria Exchange - X Layer AI Season Hackathon Submission

**Project**: Aetheria Exchange (@AetheriaEx)
**One-liner**: An AI market co-pilot + outcome exchange on X Layer - natural
language in, a signable outcome bet + correlated OKX DEX hedge out, in one
click, fully self-custodied.

| | |
|---|---|
| Live dApp | _(deployment URL - added at launch)_ |
| GitHub | https://github.com/mrnetwork0001/AetheriaExchange |
| X account | https://x.com/AetheriaEx |
| Testnet venue (chain 1952) | [`0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d`](https://www.oklink.com/xlayer-test/address/0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d) |
| Mainnet venue (chain 196) | _(address - added at launch)_ |

---

## What it is

Aetheria pairs two engines:

1. **A parimutuel outcome venue** (`OutcomeMarket.sol`) - permissionless
   YES/NO markets settled in native OKB. Winners split the losing pool
   pro-rata; a 2% fee on the losing pool funds the protocol. 8/8 tests
   passing; refunds on cancellation and one-sided markets.
2. **An AI co-pilot** - a serverless intent engine (schema-constrained LLM,
   Anthropic or 0G Compute) that turns natural language into executable structure:
   `{ outcomeTrade, dexTrade, marketDraft, explanation }`. It quotes implied
   odds and estimated payout before anything is signed.

The AI is structural, not decorative. Four autonomous/AI components cover the
whole market lifecycle - the AI **trades, creates, makes, and settles** the
markets:

- **Co-Pilot (trades)**: "bet 2 OKB YES on the Fed market and hedge it"
  becomes a two-leg execution ticket - the outcome bet on the venue plus a
  correlated OKX DEX hedge - and it drafts new markets on request.
- **Pulse Drafter agent (creates)**: `contracts/scripts/pulse-drafter.js`
  asks the intent engine to draft the day's machine-resolvable PULSE markets
  (X Layer metrics: active wallets, OKB volume) and deploys them onchain via
  the permissionless `createMarket` - on a cron, no human in the loop.
- **Market-Maker agent (makes)**: `contracts/scripts/market-maker.js` seeds
  two-sided liquidity and tops up thin sides under hard budget caps - and its
  bootstrap is AI-informed: it queries `/api/ai/odds` for a fair YES
  probability so fresh markets open near fair implied odds.
- **Resolver agent (settles)**: `contracts/scripts/resolver.js` parses the
  drafter's machine-resolvable questions, fetches the metric from public
  data, and settles ended PULSE/RWA markets onchain - flagging anything it
  can't resolve mechanically for manual review rather than guessing.

And the AI is **visible, not claimed**:

- **AGENT OPS console** (`?tab=agents`): a live terminal where every agent
  posts every decision - liquidity seeded at AI fair odds, markets drafted,
  settlements data-checked - with per-agent online status. Judges watch the
  autonomous fleet operate the venue in real time.
- **AI fair value on every market**: the detail view shows the odds engine's
  calibrated YES probability next to the market's implied odds, with its
  written rationale and the edge it sees ("AI 18% vs market 50% - sees value
  on NO"). The same estimate the market maker seeds with, surfaced to the
  trader.
- **Voice trading**: the co-pilot takes spoken instructions (browser Web
  Speech API) - say "bet two OKB YES on the Fed market and hedge it".
- **RWA category**: alongside PULSE, the drafter/resolver pair runs daily
  machine-resolvable markets on tokenized real-world-asset sector metrics
  (total RWA TVL per DefiLlama).
- **EQUITY markets + xStocks hedges**: X Layer carries the majority of
  xStocks (tokenized equity) volume, so Aetheria runs outcome markets on the
  underlying stock's official close - "TSLA closes above $330 on 2026-08-13"
  - and the co-pilot pairs a YES bet with a **wTSLAx** purchase on the OKX
  DEX interface. The AI trades real-world assets, not only markets about
  them. The resolver settles from the underlying's published daily close
  (Yahoo Finance) and refuses to settle on an in-progress session, on a
  session other than the one the question names, or when the reading sits
  inside a dispute band.
- **Native USDC**: the USD leg is Circle's native USDC
  (`0xB6CEceAB302E2E4948951eE7843FC24E92933061`), which X Layer adopted on
  2026-08-07. Both the bridged and native contracts report the symbol "USDC",
  so every token address in the app was verified by on-chain
  `symbol()`/`name()`/`decimals()` reads rather than symbol matching.

**AI infrastructure**: the intent and odds engines run on a provider
abstraction - Anthropic (schema-guaranteed structured outputs) or
**0G Compute** (decentralized inference via its OpenAI-compatible endpoint),
selected per environment. Decentralized AI serving an X Layer-native venue.

## How it generates real OKX DEX volume (Launch Grant thesis)

A hedge here is economically real, not a correlated double-down: the DEX leg
always moves opposite to the outcome bet's payoff (YES on "TSLA above $330"
sells wTSLAx; NO buys it), and the company/direction pairing is enforced
server-side, not trusted to the model.

Outcome bets create conviction; conviction wants a hedge. Every position the
co-pilot builds can carry a correlated OKX DEX leg (e.g. 5 OKB YES on an
OKB-linked event → 10 USDT→OKB spot hedge).

Per the hackathon FAQ, only swaps executed **through the OKX DEX interface**
count toward Launch Grant volume (API-executed swaps are excluded). The
execution ticket therefore routes hedges to the OKX DEX interface via a
prefilled deep link as the grant-eligible primary path; in-app aggregator-API
routing remains as a labeled convenience fallback and a demonstration of
technical depth.

**Anti-wash stance, explicitly**: the market-maker agent trades only on the
outcome venue and generates zero DEX volume by design. All OKX DEX volume is
user-signed, economically motivated flow - the only kind the grant rules
count.

## Judge test drive (3 minutes)

1. Open the dApp - it reads the LIVE testnet venue instantly, no setup: real
   markets, odds, and the on-chain activity ticker.
2. Ask the co-pilot: *"bet 2 OKB YES on market 0 and hedge it"* → inspect the
   intent card (implied odds, est. payout) → PREPARE EXECUTION → see the
   two-leg ticket with the non-custodial risk disclosure.
3. Ask: *"create a market about &lt;any headline&gt;"* → OPEN DEPLOY TICKET →
   the AI-drafted market is prefilled for permissionless deployment.
   (Or tap MIC and speak the instruction.)
4. Open any market → the **AI FAIR VALUE** box quotes the engine's
   probability, rationale, and the edge vs the market's implied odds. Open
   the **AGENT OPS** tab → the live console of the four-agent fleet.
5. On testnet with OKX Wallet (chain 1952, faucet linked in the footer):
   place a real bet, watch the activity ticker, check MY POSITIONS, and - as
   the venue owner - resolve a market and claim.

## Architecture

```
User Wallet ── AI Intent Engine (Claude, schema-constrained)
                  │                    │
          buyShares() │                │ swap()
                  ▼                    ▼
      OutcomeMarket venue        OKX DEX aggregator
          (parimutuel)             (spot hedges)
                  └──────── X Layer EVM ────────┘
                        (196 mainnet / 1952 testnet)
```

- Non-custodial end to end: the server holds API credentials, never keys;
  every transaction is signed in the user's wallet.
- Stack: Solidity 0.8.24 + Hardhat · Next.js 14 · wagmi v2/viem ·
  Claude structured outputs · OKX DEX aggregator API (server-side HMAC).

## Roadmap (post-hackathon)

- **Mainnet + verification**: X Layer chain 196 launch, OKLink-verified source.
- **Mass-market onboarding**: social-login embedded wallets (Privy-class)
  with sponsored gas - Polymarket-style Google sign-in without breaking
  self-custody - plus WalletConnect for mobile.
- **Scalar PULSE pools**: bucketed "predict the number" range markets as a
  multi-outcome parimutuel evolution of the venue.
- **Decentralized resolution**: oracle-fed adapters replacing owner-key
  settlement.
- **Distribution**: public Telegram bot, OKX Wallet dApp listing, OKX
  agent-economy registration, Farcaster frames.
- **Decentralized AI stack**: cross-device 0G Storage memory with
  wallet-derived keys; agent reasoning receipts published to 0G Storage.

Full detail: [README.md](README.md#roadmap).

## Requirements checklist

- [x] AI incorporated into product design (intent engine, market drafting, MM agent)
- [x] Deployed on X Layer Testnet (chain 1952) - `0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d`, 6 markets live
- [ ] Launched on X Layer Mainnet (chain 196) - _scheduled before deadline_
- [x] Dedicated X account (@AetheriaEx)
- [ ] Submission post mentioning @XLayerOfficial - _draft below, posts at launch_
- [ ] Google Form submitted by Aug 21, 23:59 UTC

---

## X announcement draft (post from @AetheriaEx at launch)

> A market you can ask. A hedge you can click.
>
> Aetheria Exchange is live on @XLayerOfficial for AI Season - an AI
> co-pilot that turns plain English into outcome bets + correlated OKX DEX
> hedges. One click. Self-custodied. The AI even drafts the markets.
>
> Try it: _(dApp URL)_
> Built on X Layer · #XLayerAISeason

_(Attach: 30–60s screen recording of the ask → ticket → execute flow.)_
