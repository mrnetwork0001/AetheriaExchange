# The AI Co-Pilot

The co-pilot is the trading surface: natural language in, a signable ticket
out. It is also the layer where "trust the model" is deliberately replaced
with "verify the model" at every step.

## Intents

Every message is parsed into one structured intent:

| Intent | Meaning |
|---|---|
| `OUTCOME_BET` | a YES/NO stake on one market |
| `DEX_HEDGE` | a standalone OKX DEX swap |
| `DUAL_STRATEGY` | outcome bet + correlated hedge, one ticket |
| `MARKET_ANALYSIS` | a question answered, no trade produced |
| `MARKET_DRAFT` | a new market drafted, prefilled into the deploy ticket |

The model receives the live market list (tradable markets only), the
current time (models have no clock - without it they date markets from
their training prior), and recent conversation history for references like
*"hedge that position"* or *"same again but NO"*.

## The guardrails - enforced in code, not trusted to the prompt

The model's JSON is treated as untrusted input. Server-side, after parsing:

- **Schema validation and coercion** of every field; broken shapes are
  rejected, never repaired into a trade
- **Market ids** must exist in the live market list, or the outcome leg is
  stripped
- **Token allowlist** - hedge legs may only use verified X Layer tokens
  (each address confirmed by on-chain `symbol()/name()/decimals()` reads)
- **Hedge direction is enforced**: a hedge must pay off *opposite* to the
  bet. YES on "TSLA above $340" profits when TSLA rises, so its hedge
  *sells* wTSLAx; a NO bet *buys* it. A model that pairs the wrong company
  or the wrong direction has that leg dropped with an explanation - a
  same-direction leg is a doubled position wearing a hedge's name
- **Amount sanity** - zero amounts rejected; a tokenized-share leg
  denominated in shares is capped so a dollar-sized number can never become
  a 500-share order
- **Rate budgets and input caps** on the paid-inference routes

## Hedging knowledge

The co-pilot knows the X Layer token set and its politics: Circle-issued
**native USDC** is the default USD leg (the deprecated bridged token is
available only as a migration source), **USD₮0** is preferred over bridged
USDT (the deeper market), and the **xStocks** tokenized equities (wTSLAx,
wNVDAx, wSPCXx) enable the flagship play - an equity outcome bet hedged
with the actual tokenized share on the same chain.

It chooses conservative hedge sizes itself (about 1-2x the outcome stake)
rather than interrogating the user - the ticket is always reviewed and
editable before anything is signed.

## AI fair value

Every open market's detail view shows the odds engine's calibrated YES
probability next to the market's implied odds, with a written rationale -
the same estimate the market maker seeds with, surfaced to the trader. For
equity markets the engine is handed the live quote first, so rationales are
quantitative: *"TSLA is at $333.05, a close above $340 requires +2.1% with
six hours left - below even odds."* Estimates are cached server-side so a
popular market costs one inference call, and labeled "model estimate - not
financial advice."

## Voice

The MIC button uses the browser's native speech engine (feature-detected).
Words stream into the input live as you speak; recognition stops on
silence. No audio ever reaches Aetheria's servers.

## Memory - encrypted, wallet-scoped, on 0G Storage

Chat history is keyed to the connected wallet: switch from wallet A to B
and back, and A's conversation returns - and the co-pilot uses it for
context. A guard prevents one wallet's messages from ever being persisted
under another's key during the switch.

Storage is layered: localStorage is the hot store, and every save is
**AES-GCM-encrypted in the browser** and pushed to **0G decentralized
storage**, keeping only the blob's root-hash pointer client-side. Aetheria's
server and 0G only ever see ciphertext. Wipe the site's data and reload:
history comes back down from 0G.

Stated honestly: this is encrypted off-device durability, **not yet
cross-device sync** - the pointer and encryption salt are per-browser. A
0G-KV pointer registry with wallet-signature-derived keys is the roadmap
item that adds portability.
