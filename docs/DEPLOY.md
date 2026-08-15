# Deploying Aetheria

The shipped topology: **frontend on Vercel, agents on a VPS, AGENT OPS feed
in Upstash Redis so the two can see each other.**

```
Vercel (many instances)                 VPS (always on)
  Next.js app                             market-maker   loop
    /api/ai/*        ──► 0G Compute       pulse-drafter  cron daily
    /api/agent-log   ◄─────────────────── resolver       cron hourly
         │                                     │
         └────────► Upstash Redis ◄────────────┘
                    (shared ops feed)
```

Agents and visitors almost never land on the same serverless instance, so the
ops feed **must** be shared - otherwise the AGENT OPS console shows nothing
while the fleet is working perfectly. Everything else is stateless.

---

## 1. Upstash (5 minutes, do this first)

1. Create a free database at <https://console.upstash.com>.
2. Copy the **REST** credentials - `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN`. Not the `redis://` connection string; this app
   talks to the REST API so it needs no client library.

If these are absent the app still runs, storing the feed per-process. That is
correct on a single always-on server and is the local dev default, but on
Vercel it makes the console look empty.

## 2. Vercel

- **Root directory**: `frontend`
- **Framework preset**: Next.js (build and output settings are defaults)

Environment variables:

| Variable | Value |
|---|---|
| `AI_PROVIDER` | `0g` |
| `ZG_COMPUTE_BASE_URL` | `https://router-api.0g.ai/v1` |
| `ZG_COMPUTE_API_KEY` | from the 0G Compute dashboard |
| `ZG_COMPUTE_MODEL` | `gpt-5.6-luna` |
| `UPSTASH_REDIS_REST_URL` | from step 1 |
| `UPSTASH_REDIS_REST_TOKEN` | from step 1 |
| `AGENT_LOG_SECRET` | any long random string - the agents must send the same one |
| `ZG_STORAGE_PRIVATE_KEY` | optional: enables 0G Storage chat memory |
| `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_API_PASSPHRASE` / `OKX_PROJECT_ID` | optional: in-app aggregator quotes. The grant-eligible interface deep link needs none of these |

`AGENT_LOG_SECRET` is not optional in production: `/api/agent-log` **fails
closed** without it, so agent reports would be rejected.

The AI routes declare `maxDuration = 60` to match the provider timeout -
without it the platform kills a slow inference call and the user sees a
platform error instead of the app's own fallback.

## 3. The agent fleet on the VPS

```bash
git clone git@github.com:mrnetwork0001/AetheriaExchange.git
cd AetheriaExchange/contracts && npm install
```

`contracts/.env`:

```bash
PRIVATE_KEY=0x...              # venue owner - signs resolveMarket
MM_PRIVATE_KEY=0x...           # SEPARATE wallet for the market maker
AETHERIA_API_URL=https://<your-vercel-domain>
AGENT_LOG_SECRET=<same value as Vercel>
```

Use a **different** wallet for `MM_PRIVATE_KEY`. Sharing one key across
deployer, owner, resolver and market maker means a single compromise takes
the venue, and it makes the market maker's inventory indistinguishable from
protocol funds.

Run them:

```bash
# market maker - long-running
npm run mm:testnet

# drafter - once a day
0 6 * * *  cd /path/AetheriaExchange/contracts && npm run draft:testnet

# resolver - hourly
0 * * * *  cd /path/AetheriaExchange/contracts && npm run resolve:testnet
```

Swap `:testnet` for `:mainnet` once chain 196 is deployed. Put the market
maker under systemd or pm2 so it survives a reboot, and run the resolver with
`RESOLVER_DRY_RUN=1` first to see its decisions before it settles anything
for real.

## 4. Verifying the deploy

- `curl https://<domain>/api/agent-log` - should return `{"events":[...]}`.
- Post a test event with the secret and confirm it appears in **AGENT OPS**:
  ```bash
  curl -X POST https://<domain>/api/agent-log \
    -H 'Content-Type: application/json' \
    -d '{"agent":"resolver","action":"online","detail":"deploy check","secret":"<AGENT_LOG_SECRET>"}'
  ```
- Open the app, ask the co-pilot something, and confirm the header shows
  agents online once the fleet is up.
- `curl https://<domain>/api/memory?probe=1` - `{"available":true}` once
  `ZG_STORAGE_PRIVATE_KEY` is set.

## Known deployment gotchas

- **The venue address is committed, not configured.** `deploy.js` writes it
  into `frontend/src/contracts/config.json`, which is git-tracked - after a
  mainnet deploy you must commit, push, and let Vercel rebuild, or the hosted
  site keeps reading the old chain.
- **Agents default to `http://localhost:3003`.** Set `AETHERIA_API_URL` or
  every agent report is silently posted into the void.
- **A wallet on a chain with no venue is served demo data.** Until chain 196
  is deployed, anyone whose wallet defaults to X Layer mainnet sees sample
  markets rather than the real venue.
