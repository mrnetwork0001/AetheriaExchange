# Aetheria Brand Kit

The reference for every Aetheria visual - app UI, fliers, banners, social
assets, deck slides. The flier formula below is canon: **this is how Aetheria
fliers look.** (Validated by the X banner generated 2026-08-13 - simple,
professional, on-system.)

---

## Design tokens

| Token | Value | Use |
|---|---|---|
| Ground | `#060609` | every background - flat matte near-black |
| Panel | `#0a0a10` | cards/surfaces in UI |
| Grid | white @ 3% opacity, 1px, ~44px spacing | the blueprint texture |
| Text | `#f2f2f5` | primary copy |
| Text dim | `#8b8b98` | secondary lines |
| **OKX Green** | `#7EE705` | YES / action / positive / the signature glowing dot |
| Violet | `#a06bff` | NO / AI / the orbit arc |
| Gold | `#a5966b` | monospace micro-labels ONLY, never large |
| Red | `#ff6b6b` | errors, sparingly |

Typography: headlines in bold tight-tracked Helvetica-style sans, sentence
case; labels/data in monospace, UPPERCASE, wide letter-spacing (0.16-0.22em).
Hyphens, never em dashes.

Logo: white "A" in a violet-to-green orbit ring ending in a glowing green
dot. The **green dot** is the signature mark - it can stand alone as a
period, a status light, or an accent.

## The flier formula (canon)

Every flier/banner is exactly three ingredients on the black field:

1. **One statement.** The tagline or a single short line. Line 1 pure white,
   line 2 dim grey. The final period becomes the glowing green dot.
2. **One ghost texture.** Either (a) the orbit arc as a single thin
   violet-to-green line, very large, mostly cropped off one edge, ~15%
   opacity, or (b) one line of faint mono ticker text at ~8% opacity along
   an edge.
3. **The grid.** Barely-visible 1px blueprint grid over the black.

Nothing else. No logos-in-composition, no icons, no 3D, no charts, no
gradients, no lens flares, no borders. If a layout needs a fourth element,
it's the wrong layout.

## Canonical banner prompt (produced the approved X banner)

Paste into ChatGPT (with the master brand context below already loaded):

```
Generate an image: an X (Twitter) profile banner, exactly 1500x500 (3:1
landscape), for AETHERIA EXCHANGE, using the brand system you already know.

Style target: a near-black field, ONE bold statement, one subtle background
texture. Nothing else.

Composition:
- Background: flat matte near-black #060609. A barely-visible 1px blueprint
  grid (white at 3% opacity, ~44px spacing). No gradients, no glow washes.
- Headline, horizontally and vertically centered, occupying the middle safe
  band (keep 200px clear on left and right edges, and keep the bottom-left
  corner completely empty - the profile avatar overlaps there):
  Line 1, pure white:  A market you can ask.
  Line 2, grey #8b8b98: A hedge you can click.
  Bold tight-tracked Helvetica-style sans, sentence case, generous line
  spacing. Replace the final period of line 2 with a small glowing dot in
  OKX green #7EE705 (soft glow, like a live-status indicator).
- One texture element only: the brand's thin orbit-ring arc (violet #a06bff
  fading to green #7ee705), drawn as a single elegant 2px line, very large,
  mostly cropped off the LEFT edge of the frame, at roughly 15% opacity -
  a ghost of the logo, not a rendering of it.

Hard exclusions: no logo lockup, no letter A, no icons, no additional text,
no 3D objects, no podiums, no charts, no candlesticks, no lens flares, no
noise/grain, no purple gradients, no borders. Flat, precise, quiet.
```

Adaptations:
- **Other formats**: change only the first line (size/aspect) - e.g.
  "1200x630 Open Graph image", "1080x1350 portrait flier", "1920x1080 deck
  title slide". Formula stays identical.
- **Other statements**: swap the two headline lines; keep the white/grey
  split and the green-dot period.
- **Ticker-texture variant**: replace the texture element with: one line of
  faint monospace uppercase text running the full width at the bottom edge,
  8% opacity: "▲ 2.50 OKB YES · BTC TRADES ABOVE $150K   ＋ NEW MARKET · OKB
  SETS A NEW ALL-TIME HIGH   ✓ RESOLVED YES".
- **Text-artifact fallback**: if generated type has artifacts after 2-3
  attempts, generate with no text at all (field + grid + arc only) and set
  the typography locally.

## Master ChatGPT brand context

Load this first in a fresh session, then request deliverables:

```
You are a senior brand designer working on AETHERIA EXCHANGE, a crypto trading
product. Study the brand brief below, then produce brand design work as I
request it. Everything must feel like it belongs to the SAME system described
here - do not invent a new visual direction.

WHAT THE PRODUCT IS: Aetheria Exchange (@AetheriaEx) is an AI-powered
prediction-market exchange on X Layer (OKX's Ethereum L2). Users bet YES/NO
on real-world events (crypto, macro, sports, and "PULSE" daily markets about
X Layer's own metrics). An AI co-pilot turns plain English into executable
trades: "bet 5 OKB YES on the Fed market and hedge it" becomes a signed
outcome bet plus a correlated hedge on OKX DEX. Four autonomous AI agents run
the venue: the AI trades, creates, makes, and settles the markets.
Non-custodial; AI runs on decentralized inference (0G). Tagline: "A market
you can ask. A hedge you can click."

AUDIENCE & PERSONALITY: crypto-native traders, hackathon judges, the
OKX/X Layer ecosystem. Precision instrument, not a casino. Terminal,
blueprint, mission-control. Confident, technical, a little cold - warmth
comes only from the gold micro-labels. Never playful, never mascot-y.

VISUAL SYSTEM (non-negotiable):
- Backgrounds near-black #060609; panels #0a0a10; faint 1px blueprint grid
  (white @ 3%, ~44px spacing). Thin #20202b borders, sharp corners.
- OKX Green #7EE705 = YES / primary action / positive (soft glow). This is
  the signature accent.
- Violet #a06bff = NO / AI (soft glow). Muted gold #a5966b = micro-labels
  only. Red #ff6b6b = errors, sparingly.
- Headlines: Helvetica Neue Bold, tight tracking, sentence case, often two
  lines with line 2 in grey #8b8b98. Labels: monospace, UPPERCASE, wide
  letter-spacing.
- Logo: white "A" in a violet-to-green orbit ring ending in a GLOWING GREEN
  DOT (#7EE705). The green dot is the signature mark.
- Motifs: the orbit arc, the glowing green dot, mono ticker strips like
  "▲ 2.50 OKB YES · BTC TRADES ABOVE $150K", blueprint box-and-line
  diagrams.
- Hyphens, never em dashes.

HARD PROHIBITIONS: no glassmorphism, no purple-gradient-on-white AI-startup
look, no rounded SaaS cards, no 3D blobs, no robots/brains/mascots, no stock
crypto-coin imagery, no Inter/Roboto, no light mode.

FLIER FORMULA (canon for all fliers/banners/social images): one statement
(white + grey line, final period = glowing green dot) + one ghost texture
(orbit arc cropped off an edge at ~15% opacity, OR a faint mono ticker line)
+ the blueprint grid, on flat near-black. Nothing else.

Confirm you've absorbed the system, then ask me which deliverable to start
with.
```
