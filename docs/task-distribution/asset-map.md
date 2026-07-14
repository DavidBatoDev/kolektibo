# Asset map — illustrations & backgrounds

Where the design art lives, what each file is for, and how to use it. Owner: Jasmin (J0/J3).

All art is **WebP** (converted from PNG via `pnpm assets:optimize` — see
[`scripts/optimize-assets.mjs`](../../scripts/optimize-assets.mjs)). Illustrations are capped at
1024px wide, backgrounds at 1440px. The whole set is **~570 KB** (down from ~40 MB of PNG, 98.7%
smaller). Nothing here is wired into a screen yet — this is the catalogue to design/build against.

- **Illustrations** (transparent spot art / 3D objects): reference as `/assets/<name>.webp`.
- **Backgrounds** (full-bleed): reference as `/backgrounds/<name>.webp`.

## Illustrations — `apps/web/public/assets/`

| File | What it is | Intended screen / state |
|---|---|---|
| `pool.webp` | Pooled fund | Pool / Home hero, pool directory (Elton EL1) |
| `contribute.webp` | Adding money | Contribute screen header |
| `coin.webp` | Single 3D coin | Money moments — contribution-landing, hero coin (money leaving/arriving) |
| `coins.webp` | Cluster of coins | Pooling motif — contributions landing, splash accent |
| `vault.webp` | Treasury / vault | On-chain treasury card, "funds secured" |
| `members.webp` | People | Member roster (J3), officers vs members |
| `invite.webp` | Invite / share | Invite screen + share link/QR (Elton EL2) |
| `wallet.webp` | Wallet | Link-a-wallet screen (David D2) |
| `verified.webp` | Verified check | Wallet-verified success state (David D2) |
| `approvals.webp` | Approvals / signers | Spend approval flow (2-of-3), approval chip context |
| `pending.webp` | In-flight | Pending / submitted tx state |
| `payout.webp` | Money out | Release / payout success moment |
| `cycle.webp` | Rotation | Paluwagan cycle (post-hackathon, roadmap P3) / activity |
| `empty.webp` | Empty inbox | Generic `EmptyState` illustration (feed/roster/address book) |

## Backgrounds — `apps/web/public/backgrounds/`

| File | Intended screen |
|---|---|
| `bg-splash.webp` | Splash / launch screen |
| `bg-auth.webp` | Auth screens (Sign in / Sign up / Forgot / Reset / Verify) |
| `bg-onboard-1.webp` | Onboarding carousel — step 1 |
| `bg-onboard-2.webp` | Onboarding carousel — step 2 |
| `bg-onboard-3.webp` | Onboarding carousel — step 3 |
| `bg-payout.webp` | Payout / success full-bleed moment |

## Usage rules (from design-notes)

- **One hero object per screen.** A 3D illustration (e.g. `coin.webp`) on the hero card **OR** the
  `texture-peso` watermark — never both.
- **Texture lives on the page, behind cards** — never inside a card or behind a money number.
- Illustrations have transparent backgrounds; place them on `paper`/`gradient` surfaces, not on
  another busy image.
- Always set explicit `width`/`height` (or an aspect box) so the illustration doesn't shift layout
  while loading; add `alt=""` for decorative art, a real `alt` for meaningful art.

## Notes / follow-ups

- The original heavy PNGs were **never committed** (they were untracked working-tree files), so only
  the small WebPs enter git — no history bloat, nothing to purge.
- These files sit in `public/`, so the PWA may precache them once small. If offline weight becomes a
  concern when they're wired in, move actively-used art into `src/assets/` (imported/hashed) or add
  `globIgnores` in the VitePWA config.
