# Self-Hosting & Deployment

Everything is open source and reproducible from a clone. The production
topology and the exact steps live in the repo
([docs/DEPLOY.md](https://github.com/mrnetwork0001/AetheriaExchange/blob/main/docs/DEPLOY.md));
this page is the map.

## The production topology

```
Vercel (serverless)                    VPS (always on)
  Next.js app + API routes              market-maker   systemd
    /api/ai/*      → 0G Compute         pulse-drafter  cron daily 06:10 UTC
    /api/memory    → 0G Storage         resolver       cron hourly
    /api/agent-log ⇄ Upstash Redis  ←──── agent reports (shared secret)
         │
    aetheria.exchange (custom domain)

  X Layer chains 1952 / 196 ← every onchain read via Multicall3,
                               every write signed in the user's wallet
```

Why the ops feed sits in Upstash: on a serverless host, the agents' POSTs
and a visitor's GETs land on different instances - an in-process feed would
make the console look permanently empty while the fleet worked perfectly.
With Redis it is shared; without it the app still runs (per-process store,
correct on a single server and in local dev).

## Quick start (local)

```bash
git clone https://github.com/mrnetwork0001/AetheriaExchange.git
cd AetheriaExchange/contracts && npm install
npm test                 # 11 passing
npm run export-abi

cd ../frontend && npm install
npm run dev              # http://localhost:3003
```

Zero-config, the app reads the live testnet venue. Add an AI provider key
for real inference; without one the co-pilot answers in a clearly-labeled
offline mode.

## Environment

**Frontend** (`frontend/.env.local`, or Vercel env):

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` + `ZG_COMPUTE_*` | 0G Compute inference (base URL, API key, model) |
| `ANTHROPIC_API_KEY` | alternative provider (schema-guaranteed outputs) |
| `AGENT_LOG_SECRET` | authenticates agent reports; the route fails closed in production without it |
| `UPSTASH_REDIS_REST_URL/_TOKEN` | shared ops feed on serverless hosts |
| `ZG_STORAGE_PRIVATE_KEY` | funded 0G-testnet wallet; enables encrypted memory sync |
| `NEXT_PUBLIC_SITE_URL` | canonical origin for social cards |
| `OKX_API_*` | optional; in-app aggregator quotes only - the interface deep link needs no keys |

**Agents** (`contracts/.env`): `PRIVATE_KEY` (venue owner - signs
settlements), `MM_PRIVATE_KEY` (a **separate** wallet for the market
maker), `AETHERIA_API_URL`, the same `AGENT_LOG_SECRET`, plus sizing knobs
(`MM_BUDGET_OKB`, `MM_SEED_OKB`, …) and resolver guards
(`RESOLVER_DRY_RUN`, `RESOLVER_SETTLE_MARGIN`, …).

## The fleet in one command

```bash
sudo bash ops/bootstrap-vps.sh testnet   # or: mainnet
```

Idempotent. It validates `contracts/.env` (refusing on missing keys or a
localhost API URL), installs the market maker as a systemd service running
as an unprivileged user, the resolver and drafter as flock-guarded
`/etc/cron.d` entries, sets up log rotation, and finishes with a resolver
dry-run so you see its decisions before anything settles for real.
Outbound-only - the VPS needs no open ports.

## Operational notes that matter

- **Deploy scripts write the venue address into git-tracked
  `frontend/src/contracts/config.json`** - after a mainnet deploy, commit
  and push so the hosted frontend picks it up
- Run the resolver with `RESOLVER_DRY_RUN=1` first, always
- The market maker's budget is per-process-run; the wallet balance and gas
  reserve are the true ceiling
- Never run `npm run build` while the dev server is up - they share
  `.next`, and the build clobbers it out from under dev
