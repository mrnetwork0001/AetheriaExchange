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

- [ ] **Host the frontend publicly** *(1-2 hours, deploy-ops)* - nothing is
      deployed and no deploy config exists. This blocks the video, the
      launch post, the form, and every judge who tries to click through.
- [ ] **Set production env vars on the host** - `AI_PROVIDER=0g`,
      `ZG_COMPUTE_BASE_URL`, `ZG_COMPUTE_API_KEY`, `ZG_COMPUTE_MODEL`,
      `AGENT_LOG_SECRET`.
- [ ] **Add `maxDuration` to the AI routes** *(10 min, build)* - the provider
      timeout is 60s; most serverless defaults kill the function before that,
      so a slow inference call returns a platform error instead of the app's
      own honest fallback.

### X Layer mainnet

- [ ] **Fund the deployer wallet on chain 196** *(blocking)* - it currently
      holds **0 OKB on mainnet**; the deploy transaction will fail outright.
- [ ] **Deploy `OutcomeMarket` to chain 196** *(30 min)* - use the current
      source, which includes `forceCancelStale`.
- [ ] **Teach the UI about mainnet** *(30-45 min, build)* - the wrong-network
      prompt hardcodes testnet, so a user on 196 cannot be switched onto it.
- [ ] **Write `seed:mainnet`** *(30 min + OKB, build)* - no such script
      exists; mainnet would launch with zero markets.
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
- [ ] **A wallet on X Layer MAINNET is served fabricated data** *(1 hour to
      gate, or resolved by the mainnet deploy)* - chain 196 is registered in
      wagmi but has no venue, so `useMarkets`/`usePositions`/`useActivity`
      fall back to DEMO data: invented markets, invented open positions, and
      a fake "RESOLVED YES" in the ticker, behind only a small "OFFLINE
      PREVIEW" chip. A judge whose OKX wallet defaults to mainnet sees a
      livelier fake venue than the real one. This also contradicts CLAUDE.md
      guideline 3 ("No Mock Data in Production"). Gate demo data behind an
      explicit flag and show a full-width banner + "switch to testnet" CTA.
- [ ] **`forceCancelStale` has no UI and is not on the deployed venue**
      *(30 min after redeploy)* - the shipped ABI now describes a function
      the live contract does not have (calling `RESOLUTION_GRACE` on the
      venue reverts). Users with funds in an unsettled market see no path to
      recovery. Add the button once the fixed contract is deployed.
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

- [ ] **Set `AGENT_LOG_SECRET` in both env files** *(10 min)* - absent from
      both today, and `/api/agent-log` **fails closed in production**, so
      agent reports would be rejected even with everything else correct.
- [ ] **Point `AETHERIA_API_URL` at the real host** *(5 min)* -
      `contracts/.env` still says `http://localhost:3003`.
- [ ] **Fix the port mismatch** *(10 min)* - agents default to 3003,
      `next start` serves 3000, the README says something else again.
- [ ] **Run the three agents continuously** *(1-2 hours)* - market maker as a
      long-running loop, drafter daily, resolver hourly. No systemd unit,
      cron entry, PM2 config or Dockerfile exists yet.
- [ ] **Fund and separate the market-maker wallet** *(30 min)* -
      `MM_PRIVATE_KEY` currently equals `PRIVATE_KEY`, so one key is
      deployer, venue owner, resolver and market maker at once. It also holds
      only ~0.1 OKB, which is not enough to keep a venue seeded.
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

- [ ] **Open Graph image + social metadata** *(45 min)* - the launch post will
      preview blank without it. Use the brand-kit announcement layout.
- [ ] **OKLink contract verification** *(45 min)* - unconfigured and untested;
      empty API key, no verify script.
- [ ] **Hide or clean the test debris** *(15 min)* - cancelled test markets are
      publicly visible on the venue judges are invited to browse.
- [ ] **Activate 0G Storage** *(30-45 min)* - fund a 0G testnet wallet, set
      `ZG_STORAGE_PRIVATE_KEY`. Makes the "decentralized AI stack" claim
      literally true. Do **not** claim cross-device: the pointer still lives
      in localStorage.
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
