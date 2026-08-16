# Contracts & HTTP API

## OutcomeMarket.sol

One deliberately small contract (~200 lines, Solidity 0.8.24) holds every
market and every stake. Small is the point: the payout logic is arithmetic
on two pools, auditable in one sitting, with no oracle dependencies and no
external calls beyond paying claims.

### Deployments

| Network | Address |
|---|---|
| X Layer Testnet (1952) | [`0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d`](https://www.oklink.com/xlayer-test/address/0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d) |
| X Layer Mainnet (196) | launching - the app auto-serves it the moment the address lands in `config.json` |

### Write functions

| Function | Access | Behavior |
|---|---|---|
| `createMarket(title, endTime, category)` | anyone | deploys a market; `endTime` must be in the future |
| `buyShares(marketId, isYes)` payable | anyone | stakes `msg.value` OKB on one side; reverts after `endTime` |
| `resolveMarket(marketId, winningOutcome)` | owner | settles after `endTime`; auto-cancels if the winning pool is empty; takes the 2% fee from the losing pool |
| `cancelMarket(marketId)` | owner | cancels an open market; every stake becomes refundable |
| `forceCancelStale(marketId)` | **anyone** | cancels a market unsettled for `RESOLUTION_GRACE` (7 days) past close - the permissionless escape hatch |
| `claimPayout(marketId)` | anyone | pays winnings or refunds; one claim per address per market |

### Constants & views

| | |
|---|---|
| `FEE_BPS` | 200 (2%, losing pool only) |
| `RESOLUTION_GRACE` | 7 days |
| `marketCount()` / `getMarket(id)` | market enumeration |
| `yesStakeOf` / `noStakeOf` / `claimed` | per-address position state |

### Events

`MarketCreated`, `SharesBought`, `MarketResolved(marketId, outcome, fee)`,
`MarketCancelled`, `PayoutClaimed` - the activity ticker and AGENT OPS
cross-checks stream these live. Note that X Layer's public RPCs cap
`eth_getLogs` ranges at 100 blocks, so the app backfills a bounded recent
window; full history needs an indexer (roadmap).

### Invariants worth knowing

- Payouts are always a redistribution of the market's own pools - the
  contract can never owe more than it holds
- A resolution where the winning pool is empty becomes a cancellation, so
  stakes are never stranded against an unbacked winner
- Double claims are blocked per address per market
- Reentrancy-guarded on every value-moving path

## HTTP API

The frontend's serverless routes double as a public API - the Telegram bot
and the agent fleet consume the same endpoints.

| Route | Method | Purpose |
|---|---|---|
| `/api/markets` | GET | live onchain market list; `?chainId=` optional, defaults to mainnet once deployed |
| `/api/ai/intent` | POST | `{prompt, currentMarketContext, history?}` → validated structured intent. Input-capped, rate-budgeted |
| `/api/ai/odds` | POST | `{title, category?}` → calibrated fair YES probability + rationale. Cached per title; equity titles are anchored on the live quote |
| `/api/agent-log` | GET/POST | the AGENT OPS feed. POST requires `AGENT_LOG_SECRET` (fails closed in production); GET takes a `?since=` cursor and returns `{events, seq, now}` |
| `/api/memory` | GET/POST | encrypted memory blobs to/from 0G Storage; `?probe=1` reports availability; rate-budgeted |
| `/api/dex/swap` | POST | OKX aggregator quote + swap transaction + ERC-20 approval data, HMAC-signed server-side |

Honest-degradation contract: every AI route falls back to a clearly-labeled
offline mode when no provider is configured, and returns "no trade was
generated" rather than fabricating one on runtime errors.

## Verifying the AI's work yourself

Three checks anyone can run:

1. **A settlement**: pick a `MarketResolved` event on OKLink and re-derive
   the outcome from the public source the market's title names
2. **The fleet**: watch `/api/agent-log` and match `stake`/`deployed`/
   `settled` events against venue transactions in the activity ticker
3. **The odds engine**: `POST /api/ai/odds` with any market title and
   compare its probability and rationale against your own read
