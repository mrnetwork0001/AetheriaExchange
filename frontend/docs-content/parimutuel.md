# Parimutuel Markets

Aetheria's venue is **parimutuel** - the pooled-stake structure used by
racetrack totes for over a century, not the order-book structure Polymarket
uses. Understanding this one design choice explains most of the venue's
behavior.

## The mechanics

Every market has exactly two pots. Betting YES sends native OKB into
`yesPool`; betting NO into `noPool`. Your stake is recorded against your
address. That's the entire market state - no order book, no AMM curve, no
shares to price.

**Implied odds are just the pool ratio.** If YES holds 100 OKB and NO holds
50, the market implies 67% YES. Nobody quotes that price; it is arithmetic
on what people have staked.

## Where winning money comes from: the losers

On resolution, winners get their own stake back plus a pro-rata share of the
losing pool, minus a 2% protocol fee taken **from the losing pool only**:

```
payout = stake + stake × (losePool − 2%) / winPool
```

Worked example - 100 OKB on YES, 50 OKB on NO, resolves YES:

| | |
|---|---|
| Losing pool | 50 OKB |
| Protocol fee (2% of losers) | 1 OKB |
| Distributed to winners | 49 OKB |
| A 10 OKB YES staker (10% of the YES pool) | receives 10 + 4.9 = **14.9 OKB** |
| Every NO staker | receives nothing |

The books always balance exactly: 100 returned + 49 redistributed + 1 fee =
150 staked. **No house money is ever at risk and no counterparty can
default** - the venue is structurally incapable of insolvency. That is the
property you buy with the parimutuel design.

## What you pay for that property

Two trade-offs, stated plainly because the app states them too:

**Your payout ratio is not fixed at entry.** The estimate quoted on your
ticket uses pool sizes *right now*; your actual payout is set by the pools
*at close*. If more stake piles onto your side after you bet, your share of
the losing pool shrinks. Early contrarians who are right still profit - but
less than the moment-of-entry quote suggested. The ticket labels every
estimate "at current pools" for exactly this reason.

**Positions cannot be sold before resolution.** There is no secondary
market; capital is locked from bet to settlement. Two design decisions
soften this: most venue-authored markets are short-dated (24h PULSE/EQUITY
markets, so lock-up is hours), and the DEX hedge leg lets you adjust
exposure in spot even while the outcome position is frozen.

## Refunds - every path out

`claimPayout` pays in three situations, and the contract guarantees one of
them is always eventually reachable:

| Situation | What you get |
|---|---|
| Market resolved, you backed the winner | stake + share of losing pool (−2% fee) |
| Market cancelled (by owner, or one-sided at resolution) | **full refund** of everything you staked, both sides |
| Market unsettled 7 days past close | **anyone** may call `forceCancelStale` → full refund |

A one-sided market (nobody backed the winning side) automatically cancels
rather than resolving, so "the winner takes an empty pool" can never happen
- everyone is simply refunded.

## Liquidity: every bet is the liquidity

There are no liquidity providers because there is nothing to provide
liquidity *to* - the pools are the sum of the bets. The cold-start problem
(nobody wants to bet into an empty market) is handled by the market-maker
agent, which seeds both sides of fresh markets at AI-estimated fair odds.

Two things make that honest rather than cosmetic: the agent takes **real
parimutuel positions** - its losing-side stakes pay winners like anyone
else's, so depth provision has real, bounded cost (inventory risk under a
hard budget cap) - and it trades **only on the venue**, never on OKX DEX,
so it can never manufacture wash volume.
