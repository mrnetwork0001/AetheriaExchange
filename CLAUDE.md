# CLAUDE.md - Project Guidelines & Context

## Project Overview
**Project Name**: Aetheria Exchange (@AetheriaEx)
**Target Network**: X Layer EVM (Mainnet Chain ID: 196, Testnet Chain ID: 195)
**Hackathon Target**: X Layer AI Season Hackathon (Deadline: August 21, 2026)
**Core Thesis**: An AI-powered Outcome Exchange & Trading Co-Pilot that connects viral event prediction markets to 1-click OKX DEX spot/perps execution on X Layer.

---

## Technical Stack & Architecture

### Smart Contracts (Solidity)
- **Framework**: Hardhat / Foundry
- **Contracts**:
  - `OutcomeMarket.sol`: Handles market creation, YES/NO token minting, pool liquidity, oracle resolution, and reward claiming.
  - `StrategyRouter.sol`: Executes 1-click multi-token swaps & hedges routing to OKX DEX / standard DEX routers on X Layer EVM.
- **RPC Endpoints**:
  - X Layer Mainnet: `https://rpc.xlayer.tech` (Chain ID: 196)
  - X Layer Testnet: `https://testrpc.xlayer.tech` (Chain ID: 195)

### Frontend & AI Engine
- **Framework**: Next.js 14 (App Router) or Vite + React
- **Styling**: Vanilla CSS, terminal/blueprint aesthetic (see Design Language below).
- **Web3 Integration**: Wagmi v2 + Viem + ConnectKit / RainbowKit (Support OKX Web3 Wallet & MetaMask).
- **AI Agent Engine**: Serverless API route running OpenAI / Anthropic / Gemini LLM with structured JSON output for trade intent parsing.

---

## Core Guidelines for Code Generation

1. **X Layer EVM Native**: All contract deployments, RPC calls, and transaction signatures MUST target X Layer EVM (Chain ID 195 for Testnet, 196 for Mainnet).
2. **Non-Custodial First**: The user retains 100% custody. The AI Co-Pilot parses intent and generates un-signed transaction payloads; the user approves via OKX Web3 Wallet.
3. **No Mock Data in Production**: Ensure all contract calls read live state from X Layer RPC endpoints.
4. **Design Language (Voltax/X Layer terminal style)**: Near-black ground (#060609) with a faint blueprint grid; thin 1px borders; monospace uppercase micro-labels in muted gold (#a5966b) with wide letter-spacing; cyan (#3fe0ff) and violet (#a06bff) accent glows (cyan = YES/primary action, violet = NO/AI); big tight-tracked sans headlines. Design tokens live in `frontend/src/app/globals.css` — reuse them, never introduce ad-hoc colors. No glassmorphism, no gradients-on-white, no rounded-card SaaS styling.
