# How It Works

The complete lifecycle of a position on Aetheria, from a sentence to a
settled market.

## 1. Ask

You tell the co-pilot your view in plain language - typed or spoken (the MIC
button uses the browser's speech engine):

```
bet 2 OKB YES on the TSLA market and hedge it
```

A schema-constrained LLM parses this into a structured intent: which market,
which side, what size, and - when it genuinely correlates - a hedge leg. The
model's output is **never trusted raw**: every field is validated or coerced
server-side before it can reach the execution flow, market ids are checked
against the live market list, and hedge pairings are enforced in code (see
[The AI Co-Pilot](/docs/copilot)).

The reply quotes the market's implied odds and your estimated payout at
current pools before anything is signed.

## 2. Ticket

**PREPARE EXECUTION** turns the intent into an execution ticket - each leg
listed with its status, the stake editable, the payout estimate labeled with
exactly what it is (an estimate at current pool sizes; parimutuel payouts
are set by the pools at close).

A ticket can carry:

- **An outcome leg** - `buyShares(marketId, isYes)` on the venue, staked in
  native OKB.
- **A DEX leg** - a correlated swap routed to OKX DEX, in one of two ways
  (see [OKX DEX Execution](/docs/okx-execution)).

## 3. Execute

One click, and each leg becomes a transaction **signed in your own wallet**.
The app checks the wallet is on the right chain first and prompts a switch
if not - a value-bearing transaction is never broadcast to the wrong
network. Confirmed legs link to their OKLink receipts. Retrying a partially
failed ticket never double-spends: confirmed legs are skipped.

## 4. Track

**MY POSITIONS** shows every stake with a live payout estimate while the
market is open, and its final state after settlement: `WON - CLAIMABLE`,
`LOST`, `REFUND - CLAIMABLE`, or `CLAIMED`. Claiming is one transaction,
`claimPayout(marketId)`.

The **activity ticker** streams venue events (bets, new markets,
resolutions, cancellations) live from the chain, and the **AGENT OPS**
console shows what the autonomous fleet is doing in real time.

## 5. Settle

Markets close at their `endTime`. What happens next depends on the market:

- **Machine-resolvable markets** (PULSE, RWA, EQUITY - categories whose
  questions name a metric, threshold, window, and public source) are
  settled by the resolver agent from public data, with strict guards. The
  resolver *refuses* anything ambiguous rather than guessing.
- **Everything else** goes to a manual queue for the venue owner - and if
  nobody settles a market within 7 days of close, **anyone** can cancel it
  and free every stake (`forceCancelStale`).

Winners split the losing pool pro-rata minus a 2% protocol fee; see
[Parimutuel Markets](/docs/parimutuel) for the exact math.

## Market creation is permissionless - and AI-assisted

Anyone can deploy a market with `createMarket(title, endTime, category)` -
the DEPLOY MARKET button in the app, no allowlist. Ask the co-pilot to
*"create a market about"* any headline and it drafts a precisely-worded,
objectively-resolvable question with a sensible close time, prefilled into
the deploy ticket. The Pulse Drafter agent does the same thing autonomously
every day for the venue's own market categories.
