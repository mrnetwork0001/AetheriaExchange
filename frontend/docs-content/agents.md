# The Four Agents

Four autonomous AI components cover the whole market lifecycle. The claim is
specific: **the AI trades, creates, makes, and settles the markets** - one
agent per verb.

| Agent | Verb | Where it runs | Cadence |
|---|---|---|---|
| Co-Pilot | **trades** | in the page + `/api/ai/intent` | per request |
| Pulse Drafter | **creates** | VPS cron | daily, 06:10 UTC |
| Market Maker | **makes** | VPS systemd service | continuous loop |
| Resolver | **settles** | VPS cron | hourly, on the hour |

## Co-Pilot - trades

Parses natural language into structured trade intents, quotes odds and
payouts, drafts new markets on request, and remembers context across
sessions per wallet. Full detail in [The AI Co-Pilot](/docs/copilot).

## Pulse Drafter - creates

Every morning the drafter asks the intent engine to write the day's
machine-resolvable markets and deploys them onchain through the same
permissionless `createMarket` anyone else uses. Its default repertoire:

- **PULSE** - X Layer's own public metrics: daily active wallets, OKB 24h
  trading volume (all venues, per CoinGecko), X Layer total DeFi TVL and
  stablecoin supply (per DefiLlama)
- **RWA** - total tokenized real-world-asset TVL across DeFi (per DefiLlama)
- **EQUITY** - whether TSLA / NVDA close above a specific price at that
  day's official Nasdaq close - **skipped automatically on weekends and US
  market holidays**, because a market naming a non-trading session could
  never settle

Drafts must name the metric, an "above <threshold>" comparator, the window,
and the public data source - the wording discipline that makes autonomous
settlement possible. Drafts whose close time falls outside a 2-48h window
are skipped, never force-clamped: rewriting "by Sep 12" into a 48-hour
market would settle the wrong question.

## Market Maker - makes

A continuous loop that keeps markets tradeable:

- **Bootstraps empty markets two-sided**, split by the AI's fair-odds
  estimate (from `/api/ai/odds`) so fresh markets open near fair implied
  probability instead of a meaningless 50/50
- **Tops up thin sides** so takers always have a counterparty
- Operates under **hard caps**: lifetime budget per run, per-stake maximum,
  a gas reserve floor, and affordability checks *before* the paid AI call -
  it never spends inference on a bootstrap it cannot fund
- Its stakes are **real parimutuel positions** - when a market resolves
  against it, its stake pays the winners. Depth provision is inventory
  risk, not wash activity - and it never touches OKX DEX by design

## Resolver - settles

The agent most venues get wrong, so it gets its own page:
[Resolution & Settlement](/docs/resolution). The one-line version: it
settles exactly what is mechanically checkable from public data, and
refuses everything else to a human review queue - because `resolveMarket`
is final.

## Watching them work: the AGENT OPS console

Every agent posts each decision to `/api/agent-log` - liquidity seeded (and
at what AI ratio), markets drafted, settlements taken or refused, heartbeat
scans. The [AGENT OPS console](https://www.aetheria.exchange/?tab=agents)
renders this as a live terminal with per-agent status.

The roster is honest about cadence. Cron agents show **ONLINE** for the
minutes around a pass, then `LAST 52M AGO` - elapsed time since they last
worked. A resolver showing "LAST 52M AGO" at 07:53 is not a fault: its last
pass was the 07:00 cron, exactly on schedule, and it will flip back online
at 08:00. Watching the timestamps track the cron schedule is the *proof*
the fleet is real - four permanently green dots would be the suspicious
display.

Reports are authenticated (`AGENT_LOG_SECRET`) and observability-only: an
unreachable console never blocks trading, drafting, or settlement. Every
stake, deploy, and settlement in the feed is a real onchain action you can
cross-check in the activity ticker or on OKLink.

## AI infrastructure

Inference runs on a provider abstraction: **0G Compute** (decentralized,
OpenAI-compatible - the live default) or Anthropic (schema-guaranteed
structured outputs). Open-model outputs are treated as untrusted input:
schema-validated, coerced, and guarded server-side before anything reaches
an execution path.
