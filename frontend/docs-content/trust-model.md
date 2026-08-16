# Trust Model & FAQ

The fastest way to lose a sophisticated user is to hide your trust
assumptions and let them find the assumptions themselves. So here they are,
stated plainly.

## What you do NOT have to trust

- **Custody: nobody holds your funds.** Stakes live in the venue contract;
  every transaction is signed in your wallet; the server holds API
  credentials, never keys. There is no deposit, no balance, no withdrawal
  flow to trust.
- **Solvency: structurally guaranteed.** Parimutuel payouts redistribute
  the market's own pools - the venue cannot owe more than it holds, so
  there is no house account to blow up.
- **The AI, for anything that moves money.** Model outputs are
  schema-validated, coerced, and guarded server-side; hedge pairings are
  enforced in code; and the resolver's settlements are re-derivable from
  the public sources the market titles name. You can check its work - see
  [Contracts & API](/docs/contracts-api).
- **Permanent fund lockup.** Any market unsettled 7 days past close can be
  cancelled by *anyone* (`forceCancelStale`), refunding every stake. Even
  if the operator vanishes, funds are recoverable without any key.

## What you DO have to trust - today

- **Settlement honesty, for seven days.** `resolveMarket` is owner-only
  with no on-chain check against reality: a malicious owner could resolve
  falsely and collect the losing pool. The escape hatch bounds abandonment,
  not dishonesty. Mitigations today are transparency ones - machine
  markets settle from named public sources, so a false settlement is
  publicly provable. The roadmap replaces the owner key with oracle-fed
  resolution and a multisig.
- **Data sources.** Machine settlements read CoinGecko, DefiLlama, and
  Yahoo Finance. The dispute band (refuse anything within 1% of the
  threshold) exists precisely because these sources approximate; a source
  going down delays settlement (safe) rather than corrupting it.
- **Infrastructure liveness.** One inference provider (0G Compute), one
  VPS for the fleet, public X Layer RPCs. Degradation is honest - labeled
  offline modes, manual queues - but liveness is not yet redundant.
- **Unaudited code.** 11/11 contract tests and repeated adversarial review
  (the fix commits are the audit trail), but no professional audit. Treat
  the venue accordingly; this is hackathon-stage software.

## FAQ

**Why can't I sell my position?**
Parimutuel pools have no secondary market - that is the price of structural
solvency. Most venue-authored markets are 24-hour, so lock-up is short, and
the DEX hedge leg lets you adjust exposure in spot meanwhile. Transferable
positions (ERC-1155) are on the roadmap.

**Why did my payout change after I bet?**
Payouts are set by the pools *at close*, not at entry. The ticket quotes an
estimate "at current pools" and says exactly this. If more stake joins your
side, your share of the losing pool shrinks.

**Who pays the winners?**
The losers. Winners split the losing pool pro-rata (minus the 2% protocol
fee, taken from the losing pool only), plus their own stake back. See the
worked example in [Parimutuel Markets](/docs/parimutuel).

**What happens if nobody bet against me?**
The market cancels instead of resolving and everyone is refunded in full.
The contract refuses to declare a winner nobody backed - and the UI
disables resolve buttons for an unbacked side so an operator cannot trip
this by accident either.

**What if a market's question turns out to be ambiguous?**
The resolver refuses it to the manual queue; the owner can cancel-and-
refund; and past 7 days anyone can. Refund is always the fallback, never a
forced guess.

**Why does the AGENT OPS console show agents as "LAST 52M AGO"?**
Because they are cron jobs and that is the truth - the resolver runs
hourly, the drafter daily. The timestamps tracking the cron schedule are
the proof the fleet is real. See [The Four Agents](/docs/agents).

**Is my chat history private?**
It is encrypted in your browser before it goes anywhere; the server and 0G
Storage only ever see ciphertext, keyed per wallet. See
[The AI Co-Pilot](/docs/copilot) - including the honest cross-device
limitation.

**Is any of this financial advice?**
No. Prediction markets and spot trades carry risk of total loss. The AI's
odds are model estimates, labeled as such.

## Roadmap, abbreviated

Oracle-fed resolution + multisig ownership · professional audit ·
ERC-1155 transferable positions and scalar markets · indexer-backed full
history and leaderboards · 0G-KV pointer registry for cross-device memory ·
yield-bearing "no-loss" pools (Pendle PT float) · embedded-wallet social
login with sponsored gas.
