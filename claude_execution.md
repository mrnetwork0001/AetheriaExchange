# Claude Code Phased Execution Prompts

Copy and paste these prompts sequentially into **Claude Code** to build the dApp step-by-step.

---

## 🚀 PHASE 1: Smart Contracts Deployment Setup (X Layer EVM)

### Copy Prompt 1:
```text
We are building Aetheria Exchange (@AetheriaEx) for the X Layer AI Season Hackathon.

Please set up the Hardhat smart contract development environment for X Layer EVM.

1. Initialize a Hardhat project in `/contracts`.
2. Configure `hardhat.config.js` to support:
   - X Layer Testnet (RPC: https://testrpc.xlayer.tech, Chain ID: 195)
   - X Layer Mainnet (RPC: https://rpc.xlayer.tech, Chain ID: 196)
3. Create `OutcomeMarket.sol`:
   - Functions to `createMarket(string title, uint256 endTime, string category)`
   - Function to `buyShares(uint256 marketId, bool isYes)` taking native OKB or ERC20 collateral
   - Function to `resolveMarket(uint256 marketId, bool winningOutcome)`
   - Function to `claimPayout(uint256 marketId)`
4. Write a deployment script `scripts/deploy.js` that deploys `OutcomeMarket.sol` to X Layer Testnet and saves the contract address and ABI to `frontend/src/contracts/config.json`.
```

---

## 🤖 PHASE 2: AI Co-Pilot Intent Engine (Serverless API)

### Copy Prompt 2:
```text
Now let's build the AI Intent Engine serverless endpoint.

Create an API route `/api/ai/intent` in Next.js / Node.js:

1. Accept a JSON payload containing `{ prompt: string, userWallet: string, currentMarketContext: object }`.
2. Use OpenAI / Anthropic / Gemini API with a strict system prompt to parse user market intent into structured JSON:
   ```json
   {
     "intentType": "OUTCOME_BET | DEX_HEDGE | DUAL_STRATEGY",
     "summary": "User wants to bet $50 on Team A and 2x Long Asset X on OKX DEX",
     "outcomeTrade": { "marketId": 1, "isYes": true, "amount": "50" },
     "dexTrade": { "tokenIn": "USDT", "tokenOut": "OKB", "amount": "100", "reasoning": "Correlated hedge" },
     "explanation": "Human-readable explanation of why this strategy protects capital"
   }
   ```
3. Return this JSON payload to the frontend for 1-click user signature.
```

---

## 📱 PHASE 3: Premium Frontend Dashboard & Wallet Connect

### Copy Prompt 3:
```text
Now let's build the frontend dashboard in `/frontend`.

1. Set up a Next.js 14 / Vite React app with Wagmi v2, Viem, and ConnectKit/RainbowKit.
2. Ensure network configuration includes X Layer Testnet (195) and X Layer Mainnet (196), with priority support for OKX Web3 Wallet.
3. Design a sleek, dark-mode glassmorphism UI containing:
   - **Header**: Logo, X Layer network badge, Wallet Connect button.
   - **Outcome Markets Tab**: Grid of live prediction markets (sports, macro, Web3 events) with YES/NO odds buttons.
   - **AI Co-Pilot Drawer/Panel**: Conversational chat terminal where users can type market questions or request trade suggestions.
   - **1-Click Execution Modal**: When AI suggests a trade payload, display a modal showing expected return, slippage, and an "Approve & Trade" button that triggers wallet signing.
```

---

## ⚡ PHASE 4: OKX DEX & Swap Router Integration

### Copy Prompt 4:
```text
Now let's integrate OKX DEX / DEX aggregator routing for 1-click execution on X Layer EVM.

1. Build a helper `services/dexRouter.ts` that formats swap transactions on X Layer EVM.
2. Integrate OKX DEX Aggregator API or standard X Layer DEX Router contracts.
3. When the AI Co-Pilot proposes a `dexTrade` payload:
   - Prepare the transaction data for swapping tokens on X Layer EVM.
   - Combine the Outcome bet and DEX swap into a sequential 1-click execution flow in the frontend.
4. Add real-time transaction status toasts (Pending, Confirmed on X Layer Explorer).
```

---

## 🏁 PHASE 5: Verification, Mainnet Deployment & Video Demo Script

### Copy Prompt 5:
```text
Final Phase: Hackathon Verification & Mainnet Launch.

1. Run the deployment script to deploy `OutcomeMarket.sol` to X Layer Mainnet.
2. Verify the smart contract on X Layer Block Explorer.
3. Generate a `SUBMISSION.md` file summarizing:
   - Live X Layer Testnet & Mainnet contract addresses
   - GitHub repo link
   - How the AI Co-Pilot generates real OKX DEX volume
   - Instructions for hackathon judges to test the live dApp
```
