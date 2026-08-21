# Welcome to Aetheria

**Aetheria Exchange is an AI-run prediction market on X Layer.** Users bet
YES/NO on real-world events on a parimutuel venue settled in native OKB, and
an AI co-pilot turns plain English into executable tickets - an outcome bet
plus a correlated OKX DEX hedge, signed entirely in the user's own wallet.

The AI is not a chat feature bolted onto an exchange. Three autonomous agents
run the venue end to end, and a co-pilot serves users on request: **the AI
trades, creates, makes, and settles the markets.** Every decision they take
is posted to a public console, and every settlement is an onchain
transaction anyone can verify.

- **Bitcoin** - trustless money
- **Ethereum** - trustless computation
- **Aetheria** - markets that run themselves

## Where everything lives

| | |
|---|---|
| Live app | [aetheria.exchange](https://www.aetheria.exchange) |
| Agent console | [aetheria.exchange/?tab=agents](https://www.aetheria.exchange/?tab=agents) |
| Settlement receipts | [aetheria.exchange/receipts](https://www.aetheria.exchange/receipts) |
| **Mainnet venue (chain 196)** | [`0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d`](https://web3.okx.com/explorer/x-layer/evm/address/0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d) - deploy block 68469454 |
| First autonomous mainnet settlement | [`0x94cd841b…`](https://web3.okx.com/explorer/x-layer/evm/tx/0x94cd841b769c8956c6072f4fd7e4a88ed385aa3beaa010fb68a639ab77500f7d) - X Layer DeFi TVL above $100M, resolved YES |
| Legacy testnet venue (chain 1952) | [`0xA82EDb5e…EB30d`](https://web3.okx.com/explorer/x-layer-testnet/address/0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d) - same address |
| GitHub | [mrnetwork0001/AetheriaExchange](https://github.com/mrnetwork0001/AetheriaExchange) |
| X | [@AetheriaEx](https://x.com/AetheriaEx) |

## The stack, in one paragraph

A single Solidity contract (`OutcomeMarket.sol`) holds every market and every
stake - parimutuel, so the venue is structurally incapable of insolvency. A
Next.js app reads it through Multicall3 and serves the co-pilot. Inference
runs on **0G Compute** (decentralized, OpenAI-compatible); chat memory is
AES-GCM-encrypted client-side and stored on **0G Storage**; hedges route to
**OKX DEX**. Three agents run 24/7 on a VPS against the same public API any
user hits. Nothing custodial anywhere: the server holds API credentials,
never keys, and every value-bearing transaction is signed in the user's
wallet.

## Reading order

If you are evaluating Aetheria, this order gives the fastest complete
picture:

1. [How It Works](/docs/how-it-works) - the lifecycle of one trade
2. [Parimutuel Markets](/docs/parimutuel) - where payouts actually come from
3. [The Four Agents](/docs/agents) - what runs the venue
4. [Resolution & Settlement](/docs/resolution) - the part most venues get wrong
5. [Trust Model & FAQ](/docs/trust-model) - what we ask you to trust, stated plainly

> Unaudited hackathon software. Prediction markets and spot trades carry
> risk of total loss. Nothing in these docs is financial advice.
