# Aetheria - Delivery Checklist

**Audited 2026-08-15.** Submission deadline **2026-08-21 23:59 UTC (6 days)**.
Launch Grant volume window closes **2026-08-31**.

Compiled from a six-agent audit of contracts, frontend, AI layer, docs and
ops, plus direct on-chain and live-endpoint checks.

## Where the project actually stands

| | |
|---|---|
| Contract | 11/11 tests passing; `forceCancelStale` escape hatch committed but **deployed nowhere** |
| Testnet venue | `0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d` (chain 1952), 12 markets, 4 live |
| Mainnet (196) | **not deployed** - `config.json` chains["196"].address is `""` |
| Hosting | **none** - localhost only, no `vercel.json`/Dockerfile/CI |
| Agents | **none running anywhere** |
| 0G Compute | live and working (`0g:gpt-5.6-luna`) |
| 0G Storage | built, dormant (`ZG_STORAGE_PRIVATE_KEY` empty) |
| Telegram bot | built, never run |
| Unsettled markets | **#6 and #10 ended and awaiting settlement** |

**The building is essentially done. What is left is shipping, deploying and
recording.** Very little below is new feature work.

---

## 0. Do first - today

These are small, and each one unblocks something bigger.

- [x] **Fix the resolver staleness bound for dated markets** - done
      2026-08-15. Staleness now applies only to LIVE adapters; a dated
      adapter (one named session, fixed historical figure) is exempt because
      the asOf/title-date guard is strictly stronger. Verified: #10 now
      evaluates on default settings, while #6 stays correctly blocked.
- [x] **Settle market #10** - done 2026-08-15 09:48 UTC, autonomously by the
      Resolver agent. Read $342.27 (as of 2026-08-14) vs $340 → **YES**.
      tx `0x7663a2bfe58af16e1a998c5de369e62b4f244fcdf9d07a10ba00657c0d5333cf`
      (block 38328469). Recorded in SUBMISSION.md. **Capture this in the demo
      video before redeploying the venue.**
- [ ] **Decide #6** *(5 min)* - RWA TVL is $27.41B against a $27.5B
      threshold, inside the 1% dispute band, so the resolver **correctly
      refuses** it. Leaving it is the better story (the guard visibly
      working); cancel-and-refund if you would rather the venue look tidy.
- [ ] **Choose the hosting architecture** *(decision, 10 min)* - see the
      note under section 2; it changes what else must be built.

---

## 1. Blocks submission

Nothing below is optional - the submission is incomplete without it.

### Hosting

**Architecture chosen: Vercel + Upstash Redis + agents on a VPS.**
Full runbook: [DEPLOY.md](DEPLOY.md).

- [x] **Shared ops feed for serverless** - done 2026-08-15. `opsStore` is
      backed by Upstash Redis when configured (INCR for monotonic ids,
      RPUSH/LTRIM for a bounded shared list), falling back to per-process
      memory otherwise. Verified end-to-end against a mock Upstash endpoint,
      including the since-cursor and graceful degradation when the store is
      unreachable.
- [x] **`maxDuration = 60` on the AI and memory routes** - done 2026-08-15,
      so a slow inference call is not killed by the platform before the
      app's own timeout can produce an honest fallback.
- [x] **Upstash + Vercel deploy** - LIVE 2026-08-15 at
      https://www.aetheria.exchange (custom domain, apex 308s to www).
      Verified in production: page + console clean, live venue reads (12
      markets), ops-feed auth (401/200), real 0G inference. Remaining:
      set `NEXT_PUBLIC_SITE_URL=https://www.aetheria.exchange` (OG tags
      currently carry a preview URL) and confirm the `aetheria:ops:*` keys
      appear in the Upstash data browser.

### X Layer mainnet

- [ ] **Fund the deployer wallet on chain 196** *(blocking)* - it currently
      holds **0 OKB on mainnet**; the deploy transaction will fail outright.
- [ ] **Deploy `OutcomeMarket` to chain 196** *(30 min)* - use the current
      source, which includes `forceCancelStale`.
- [x] **Teach the UI about mainnet** - done 2026-08-15. New `useVenueChain`
      hook: reads follow whichever chain has a venue, the wrong-network
      prompt targets it, and a full-width banner offers the switch. Works
      unchanged the day mainnet deploys.
- [x] **Write `seed:mainnet`** - done 2026-08-15. Also: `/api/markets`
      now defaults to mainnet once a venue exists there, so the Telegram
      bot follows the launch without a config change.
- [ ] **Commit and redeploy after the address lands** - `deploy.js` writes the
      address into git-tracked `frontend/src/contracts/config.json`, so the
      hosted site needs a commit + push + rebuild or it will keep reading
      testnet.
- [ ] **Redeploy testnet on the same source** *(20 min)* - the deployed
      testnet bytecode no longer matches the repo, which also blocks OKLink
      verification. Do this **after** #10 is settled and captured.

### Submission artifacts

- [ ] **Fill the placeholders in `SUBMISSION.md`** *(5 min after the above)* -
      live dApp URL, mainnet venue address, and the requirements checklist.
- [ ] **Reconcile the mainnet claim** *(30 min, content)* - README and
      SUBMISSION currently contradict each other on mainnet status.
- [ ] **Record the demo video** *(half a day, content)* - none exists, and
      SUBMISSION only contains a one-line note, not a shot list. Strongest
      sequence: speak a trade into the mic → two-leg ticket → AGENT OPS
      console with live agent reports → AI fair value on an equity market →
      the resolver settling #10 from the real Nasdaq close.
- [ ] **Publish the launch post** *(1 hour)* - draft exists but needs the
      URL and an image (use the announcement flier prompt in
      `docs/brand-kit.md`). Must mention **@XLayerOfficial**.
- [ ] **Submit the Google Form by Aug 21 23:59 UTC** *(1-2 hours)* - not
      submitted, and no answers drafted anywhere in the repo.

---

## 1b. Found by the frontend audit (2026-08-15)

- [x] **Co-pilot crashed the whole page on any API error** - fixed
      2026-08-15. `res.json()` ran without an `res.ok` check, so an error
      body (no `explanation`) reached `Typewriter`, which called `.slice()`
      on `undefined`; with no error boundary the entire venue was replaced by
      Next's bare "Application error". Pasting a >2000-char question
      triggered it. Now: `res.ok` checked, explanation type-guarded,
      Typewriter null-safe, input capped at 2000, and `app/error.tsx` added
      as a boundary.
- [x] **First suggested prompt produced no hedge leg** - fixed. The chip
      pointed at market 0 (BTC), which has no X Layer token, so the flagship
      two-leg ticket came back single-leg on the first thing a judge clicks.
      It now points at the OKB market, which is genuinely hedgeable.
- [x] **A wallet on X Layer MAINNET is served fabricated data** - fixed
      2026-08-15 by `useVenueChain`: a wallet on a venue-less chain now
      browses the REAL venue read-only behind a full-width switch banner.
      Demo data survives only when no venue exists on any chain (fresh
      clone).
- [x] **`forceCancelStale` UI** - built 2026-08-15, capability-probed: it
      reads `RESOLUTION_GRACE` and renders only on contracts that have the
      escape hatch, so it stays hidden on the old venue and lights up
      automatically after the redeploy. Shows the anyone-can-cancel date,
      then the button.
- [ ] **The venue looks dead** *(1 hour)* - only 4 tradable markets, each
      with ~0.01-0.02 OKB of depth, and the CLOSED tab shows test debris
      ("Countdown UI test - ignore", two near-duplicate cancelled TSLA
      markets). Seed deeper two-sided pools and 3-5 fresh short-dated
      markets before submission day.

---

## 2. Hurts judging

Not strictly required, but each one is something a judge will notice.

### The agent fleet - and one architectural decision

> **Decide this before hosting.** The AGENT OPS console keeps its feed in
> process memory. On a serverless host (Vercel), agents POST into one lambda
> instance while judges poll another, so **the console will look permanently
> empty** - killing the "watch the fleet operate in real time" feature that
> the docs lead with.
>
> **Recommended:** run the Next.js app on the same VPS as the agents (single
> Node process behind a reverse proxy). One box, everything works, no extra
> service. Alternatives: back the feed with Redis/Upstash (~half a day), or
> accept a degraded console and rewrite the claim.

- [x] **Set `AGENT_LOG_SECRET` in both env files** - done; verified 401
      without / 200 with against production.
- [x] **Point `AETHERIA_API_URL` at the real host** - done
      (https://www.aetheria.exchange), verified by live agent reports.
- [ ] **Fix the port mismatch** *(10 min)* - agents default to 3003,
      `next start` serves 3000, the README says something else again.
- [x] **Run the three agents continuously** - LIVE 2026-08-16 on the VPS
      (38.49.213.208, dedicated `aetheria` user). Market maker under
      systemd (active/enabled), resolver hourly + drafter daily 06:10 UTC
      under cron. Verified end to end: VPS reports authenticate against
      production and appear in the AGENT OPS console; the Upstash feed is
      conclusively shared (events persist across days and instances).
- [x] **Fund and separate the market-maker wallet** - done: dedicated
      wallet 0xC82d…5701 with 0.2 OKB, MM sizing tuned to match.
- [ ] **Add a health check on the agents** *(30 min)* - nothing alerts if the
      fleet dies mid-judging.

### Honesty fixes in the docs

Each of these is currently a checkable false statement. A judge who catches
one discounts the rest.

- [ ] **Test count says 8, the suite has 11** *(10 min)* - wrong in four places.
- [ ] **"6 markets live" - the venue has 12, of which 4 are live** *(5 min)*.
- [ ] **"Judges watch the autonomous fleet operate in real time"** *(20 min)* -
      false until the fleet is actually running.
- [ ] **0G Storage is documented as a shipped layer** *(20 min to reword, or
      1 hour to activate it and make the claim true)*.
- [ ] **Telegram bot documented as a shipped surface** *(15 min)* - never run.
- [ ] **"Five adversarial review rounds; 30 verified findings fixed"**
      *(30 min)* - has no artifact backing it in the repo; soften it or
      commit the log.
- [ ] **Offline-mode copy names `ANTHROPIC_API_KEY` three times** *(10 min)* -
      the AI story is 0G Compute; this reads as a leftover.
- [ ] **`engineUnavailable()` hardcodes `engine: "claude-opus-5"`** *(5 min)* -
      the UI reports a false engine on every AI error.
- [ ] **Judge test-drive step 5 asks for an action the contract forbids**
      *(15 min)*.
- [ ] **The hedge leg silently jumps testnet → mainnet and no doc says so**
      *(15 min)*.
- [ ] **`ZG_COMPUTE_MODEL` missing from `.env.example`** *(5 min)* - and the
      code default is a model you are not using.

### Polish a judge will see

- [x] **Open Graph image + social metadata** - done 2026-08-15. og.png
      rendered from the brand formula (tagline + real settlement ticker),
      full openGraph/twitter card metadata, metadataBase from
      NEXT_PUBLIC_SITE_URL/VERCEL_URL. Set `NEXT_PUBLIC_SITE_URL` on Vercel
      for canonical URLs.
- [ ] **OKLink contract verification** *(45 min)* - unconfigured and untested;
      empty API key, no verify script.
- [ ] **Hide or clean the test debris** *(15 min)* - cancelled test markets are
      publicly visible on the venue judges are invited to browse.
- [x] **Activate 0G Storage** - LIVE 2026-08-16. Dedicated burner wallet
      (0xDaF5…E967, faucet-funded 0.5 OG), key in Vercel only. Verified
      end-to-end through production: upload returned root
      `0xecb32ad0…140c` and the same bytes downloaded back. Claim
      "encrypted memory on 0G Storage" - NOT cross-device (pointer + salt
      are per-browser; 0G-KV registry + signature-derived keys are the
      roadmap items that add portability).
- [ ] **Fix the Telegram bot's env loading** *(45 min)* - `bot.mjs` never
      loads dotenv, so the documented `bots/.env` is ignored.
- [ ] **Make sure @AetheriaEx is not a zero-post shell** *(1-2 hours across
      the week)* - banner, avatar, bio, and a few real posts before judges
      look.
- [ ] **Add a LICENSE** *(5 min)* - public hackathon repo with none.
- [ ] **Add a single AI-provider failover** *(1 hour)* - if the 0G router is
      down during judging, the entire AI product is down with it.

---

## 3. Nice to have - only with spare time

- [ ] Agent-share-of-open-interest metric in AGENT OPS (~30 min) - discloses
      how much liquidity is the agent's rather than users'.
- [ ] "Reduce my exposure" co-pilot intent - partial answer to the no-exit
      limitation.
- [ ] `/api/dex/swap` is an unauthenticated proxy over your OKX credentials -
      harden or leave disabled and note it (45 min).
- [ ] `/api/markets` does N+1 sequential RPC reads - fine now, slow as the
      venue grows (30 min).
- [ ] Prompt-injection hardening: permissionless market titles flow unescaped
      into AI prompts (30 min).
- [ ] `takeRate` charges the global daily bucket before the per-IP check, so
      one IP can burn the global budget (15 min).
- [ ] Public co-pilot use can push real agent events out of the ops ring
      buffer (20 min).
- [ ] `equityLiveData` depends on an unofficial Yahoo endpoint that blocks
      some datacenter IPs - verify it works **from the host** (15 min).
- [ ] `CLAUDE.md` describes an older product shape than what exists (15 min).

---

## Suggested order

**Today** - resolver staleness fix → settle #10 → capture tx → hosting
decision.

**Day 2** - deploy testnet + mainnet on current source → seed mainnet → fix
UI mainnet support → commit config → verify on OKLink.

**Day 3** - host the frontend → set env vars → bring the agent fleet up with
supervision → confirm AGENT OPS fills with real reports.

**Day 4** - the honesty pass over the docs (all of section 2's doc items in
one sitting) → OG image → 0G Storage.

**Day 5** - record the demo video against the live hosted site.

**Day 6** - launch post + Google Form. **Do not leave the form to the last
day** - it is the one item with a hard external deadline.

**After submission, before Aug 31** - drive real OKX DEX interface volume for
the Launch Grant.
