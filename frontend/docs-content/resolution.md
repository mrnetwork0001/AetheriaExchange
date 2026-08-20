# Resolution & Settlement

Settlement moves real money irreversibly - `resolveMarket` is final - so
Aetheria's resolver is built around one principle: **when anything is
ambiguous, refuse and escalate to a human. Never guess.**

Both behaviors have already happened in production. The resolver settled
*"TSLA closes above $340 on 2026-08-14"* autonomously from the official
Nasdaq close ($342.27 → YES,
[tx](https://web3.okx.com/explorer/x-layer-testnet/tx/0x7663a2bfe58af16e1a998c5de369e62b4f244fcdf9d07a10ba00657c0d5333cf))
- and in the same pass it **refused** an RWA market whose reading landed
0.3% from its threshold, listing it for human review instead. Both are the
system working as designed.

## The gauntlet: what a market must pass to auto-settle

Every ended market runs through this checklist. Failing *any* item routes
it to the manual queue with the reason logged:

1. **Category** is machine-resolvable (PULSE, RWA, or EQUITY)
2. **Creator is allowlisted** - `createMarket` is permissionless, so anyone
   could craft a title that pattern-matches an adapter; only venue-authored
   markets auto-settle
3. **Comparator is a plain "above X"** (or the synonym "exceeds X") - any
   negation or unusual comparator ("below", "at least", "won't") refuses
4. **Exactly one metric adapter matches** the title - zero is unresolvable,
   two is ambiguous; both refuse
5. **The threshold parses exactly.** The parser reads standard magnitude
   notation ($45M, 50K, $27.5 billion, $12bn, $50MM) and returns *null* -
   refusal - on anything it cannot read exactly. This matters more than it
   looks: a naive regex reads "$12bn" as 12 and settles a market three
   orders of magnitude off
6. **Freshness or session-dating**, depending on the metric type (below)
7. **The reading clears the dispute band** - a result within 1% of the
   threshold (0.05% for official exchange closes) is too close to
   auto-settle on an approximating source, and goes to a human

## Live metrics vs dated readings

Adapters return one of two shapes, and the guards differ:

**Live metrics** (TVL sums, 24h volume) answer "what is the value *now*".
A late pass would read a drifted value, so live metrics only settle within
a staleness bound (default 2h) of the market's close.

**Dated readings** (an official daily close) answer "what was the value for
*session X*" - a fixed historical figure that cannot drift, so staleness
does not apply. Instead, session-dating rules are strict:

- The reading's exchange-local session date must **equal the date named in
  the market's title** (falling back to the close date). Earlier means the
  deciding session hasn't printed - wait. Later means the window was missed
  - human review. Both directions are safe
- A candle from a session still in progress carries the *live* price in its
  close field; the equity adapter discards it and only ever returns
  **completed** sessions, failing closed if the trading-period metadata is
  missing

## The metric adapters

| Adapter | Matches | Source |
|---|---|---|
| OKB 24h volume (all venues) | `OKB` + `volume`, and **not** "DEX" | CoinGecko |
| OKB price | `OKB` + closes/trades above | CoinGecko |
| RWA sector TVL | `RWA` + `TVL` + `DefiLlama`, not chain-scoped | DefiLlama |
| US equity daily close | exactly one known ticker + a close-based comparator | Yahoo Finance |
| X Layer DeFi TVL | `X Layer` + `total TVL` | DefiLlama |
| X Layer stablecoin supply | `X Layer` + `stablecoin` + supply/circulating | DefiLlama |

Two deliberate exclusions worth understanding: titles saying **"DEX
volume"** never match the volume adapter, because CoinGecko's number is
all-venue (CEX-dominated) and settling a DEX question against it would be
factually wrong. And **"trades above"** never matches the equity adapter,
because that is a touch condition an intraday high can satisfy while the
close does not - the adapter only answers close-based questions.

## The escape hatch: no market is ever stuck

If a market sits unsettled for **7 days** past close - lost owner key,
abandoned operator, a question nothing can resolve - **anyone** may call:

```solidity
function forceCancelStale(uint256 marketId) external
```

It flips the market to Cancelled, making every stake fully refundable via
`claimPayout`. It is safe to leave permissionless because cancelling can
only ever *refund* - it cannot move value between participants. The app
surfaces this on every closed-unsettled market: first the date after which
no key is needed, then the button itself.

This converts the venue's trust assumption from "trust the operator
forever" into "trust the operator for seven days" - see
[Trust Model](/docs/trust-model).

## The manual queue

Everything the resolver refuses is logged with its reasons and appears in
the owner's UI with RESOLVE YES / RESOLVE NO / CANCEL controls (gated until
trading ends; a side with no stake cannot be declared winner - the contract
would cancel-and-refund instead, and the UI says so rather than letting the
button surprise you).
