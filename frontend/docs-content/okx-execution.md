# OKX DEX Execution

Every position the co-pilot builds can carry a correlated OKX DEX leg. The
thesis: outcome bets create conviction, and conviction wants a hedge - so a
prediction-market venue is a natural volume engine for the DEX next door.

## What a hedge means here

A hedge **reduces net exposure** - the DEX leg always pays off opposite to
the outcome bet:

- YES on *"TSLA closes above $340"* profits when TSLA rises → the hedge
  **sells** wTSLAx into USDC
- NO profits when TSLA falls → the hedge **buys** wTSLAx

This is enforced server-side, per company and per direction (see
[The AI Co-Pilot](/docs/copilot)). When a user explicitly wants more
exposure ("double down"), the co-pilot obliges - but labels it a correlated
position, never a hedge.

## The two routes

**Route 1 - the OKX DEX interface deep link (primary).** One click opens
the OKX DEX interface with the chain and both tokens prefilled; the user
sets the amount and confirms there. The chain parameter is always the
numeric EVM id - the interface silently discards non-numeric values along
with the token addresses. The app is honest about handoff state: the leg
reads "OPENED ON OKX - CONFIRM THERE", never "done", because opening an
interface is not executing a trade.

**Route 2 - in-app aggregator execution.** One click runs the full
pipeline: a server-signed quote from the OKX DEX aggregator API (HMAC
credentials never reach the client), automatic ERC-20 allowance handling,
then the swap transaction pushed to the user's wallet to sign. Mainnet
only - the aggregator does not serve testnet, and the app says so instead
of failing mid-ticket.

## Grant accounting, stated plainly

Per the AI Season rules, only volume executed **through the OKX DEX
interface** counts toward the Launch Grant - API-executed swaps are
excluded. That is why the interface deep link is the primary path and the
aggregator is a labeled convenience.

## The anti-wash stance

The market-maker agent trades **only on the outcome venue** and generates
zero DEX volume by design. Every OKX DEX swap that originates from Aetheria
is user-signed, economically motivated flow - a real person hedging a real
position. No wash loops, no synthetic volume, no agent-generated swaps.
This is both what the rules require and the only volume worth having.

## The xStocks loop

X Layer carries the majority of xStocks (tokenized equity) trading volume,
which enables something no generic prediction market has: an equity outcome
bet and its hedge **on the same chain, in the same ticket**. Bet YES on
TSLA's close, sell wTSLAx against it; the resolver settles the bet from the
official close. The AI is trading real-world assets, not just markets about
them.

Verified token registry (every address confirmed by on-chain reads - the
bridged and native USDC both report the symbol "USDC" and differ only by
address and `name()`, so symbol-matching is unsafe):

| Token | Address | Role |
|---|---|---|
| OKB | native | stakes + gas |
| USDC (Circle native) | `0xB6CE…3061` | default USD leg |
| USDC.e (bridged, deprecated) | `0x74b7…6d22` | migration source only |
| USDT (bridged) | `0x1E4a…D41d` | supported |
| USD₮0 (omnichain) | `0x779D…3736` | preferred USDT leg - the deeper market |
| wTSLAx / wNVDAx / wSPCXx | `0xc3Fd…1171` / `0xa8dd…50D5` / `0x8e2e…9072` | tokenized-equity hedges |
