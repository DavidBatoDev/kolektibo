# Jasmin Ivy — Design System, Theme & Polish

**Mission:** you are the design authority for the team. You **own the theme**, formalize the design
tokens and the shared component library, stand up the **i18n** framework (English + Tagalog), design
every new Phase-1 screen so Shello and Elton build from a spec (not a blank canvas), and drive the
**money-UX polish pass** that makes the app read as a real fintech product on camera and in-hand.

> You front-stop Shello and Elton: your mockups + components are what they implement. Ship the design
> kit early (M0) so they're never designing while coding.

**Effort legend:** `S` ≤2h · `M` ½–1d · `L` 1–2d · `XL` >2d. **Depends on:** nothing to start.
**Consumers:** everyone — tokens/components (David, Earl, Shello, Elton), mockups (Shello, Elton).

## 🔲 Status — open, with a concrete first target (2026-07-13)

None of your workstream (J0–J4) has been done — the build sprint shipped **functional** multi-user
screens on the *existing* tokens and `ui.tsx` primitives (no new design system, no i18n). So your job
is now sharper than "design from scratch": **a working reference already exists to reskin and translate.**

- **Already live to design against** (behind the `multi_pool` flag): `apps/web/src/routes/{Wallet,Pools,PoolNew,PoolDetail,PoolInvite,Join,PoolContribute,PoolSpend}.tsx`. These are the exact flows J3 was to mock — you now have real screens to redline instead of a blank canvas.
- **J0 🔲** theme + tokens, **J1 🔲** extended component kit (`Modal`/`Sheet`/`Toast`/`EmptyState`/`Skeleton`/`Avatar`/`QRCode`/`CopyField` — Elton's invite QR and Shello's feed states are both waiting on these), **J2 🔲** i18n (en/tl), **J3 🔲** specs, **J4 🔲** polish/a11y.
- ⚠️ **Highest-leverage first job:** every string in the new screens is **hardcoded English**. Stand up the `t()` framework (J2) and retrofit those screens **before** more feature UI piles on — the longer it waits, the bigger the en/tl retrofit. Pair it with J0/J1 so Elton (QR, EL5/EL6) and Shello (feed, S1–S4) build their remaining screens on your kit, not more inline markup.

Detail below is retained as the full brief.

---

## Current visual language (what you're inheriting)
A dark, mobile-first fintech look already exists — **"trust teal + warm peso gold on deep ink."**
Tokens live in [`apps/web/src/index.css`](../../apps/web/src/index.css) `@theme` (ink-950→700,
brand-400→700 teal, gold-400/500), the phone-frame shell is in
[`components/AppShell.tsx`](../../apps/web/src/components/AppShell.tsx), and the primitives
(`Card`, `Button` with `primary|ghost|gold`, `Field`, `inputClass`, `Badge`, `ProgressBar`, `peso()`)
are in [`components/ui.tsx`](../../apps/web/src/components/ui.tsx). PWA theme color is `#0f766e`.

## Task list

### J0 — Theme decision + token system `M` · **do this first, M0**
Make the call on the theme and formalize it as tokens. Recommended directions (you decide — this is
your "we can choose a theme"):
- **A. Refine the current dark teal/gold** _(recommended default)_ — it's on-brand (teal = trust,
  gold = peso), reads well on camera, and needs only tightening (contrast, spacing scale, one accent).
  Lowest risk, additive.
- **B. Add a light mode** on the same hues for daytime/in-hand use + accessibility — more work, higher
  polish ceiling; ship dark first, light behind a toggle.
- **C. Warmer "Filipino bayanihan" accent** — keep the trust-teal base, introduce a warmer secondary
  (sunrise/terracotta) for community moments (contributions landing, cycle payouts).

Deliver: a finalized token set (color, spacing, radius, type scale, elevation) in `index.css @theme`,
a one-page rationale, and a swatch/preview. **Don't fork the palette names** other code already uses
(`brand-*`, `ink-*`, `gold-*`) — extend, don't rename, to keep the demo green.
**Acceptance:** tokens merged; a short design-notes doc (`docs/task-distribution/design-notes.md` or a
Figma link) the team can reference; no regression in the existing screens.

### J1 — Component library audit + extension `M`
Audit `ui.tsx` and add the shared primitives Phase 1 needs so nobody hand-rolls: `Modal`/`Sheet`
(bottom sheet for mobile), `Toast`, `EmptyState`, `Skeleton`/loading, `Avatar`, `ListItem`/`Row`,
`SegmentedControl`, `QRCode` display, `CopyField` (for invite links). Keep the existing API style
(variant props, Tailwind classes, `className` passthrough).
**Acceptance:** each primitive documented with a usage snippet; Shello & Elton import from `ui.tsx`
with zero bespoke CSS.

### J2 — i18n framework (en/tl) `M`
Stand up string externalization now — retrofitting later costs a week (roadmap P1.5). Pick a light
setup (`react-i18next` or a tiny custom `t()` + JSON dictionaries), externalize the existing screens'
strings into `en.json` + `tl.json`, and add a language toggle in Profile/Settings. The **full Taglish
copy pass is Phase 5** — for now just wire the framework and seed both locales so every new screen ships
translatable. Coordinate money/number formatting with `peso()`.
**Acceptance:** switching locale re-renders at least the app shell + one full screen in Tagalog; new
strings added by Shello/Elton go through `t()`, not hardcoded.

### J3 — Screen designs for the new Phase-1 flows `L`
Design (mock, then spec) the screens Shello, Elton, and David build. Deliver mobile-first layouts with
states (loading / empty / error / success):
- **Link a wallet** (David's D2) — nonce-sign UX, "verified" state.
- **Pool directory** + **create/join pool** (Elton) — list, create CTA, join-via-code.
- **Invite** (share link + QR + role) and **Join preview** (what an invitee sees before signup).
- **Member roster** (officers vs members, verified-wallet badge).
- **Address book** (named payees).
- **Activity feed** (Shello) — event rows for contribute / request / approve / release, peso amounts,
  relative time, tx-hash link to stellar.expert.
- **Notification settings** (Shello) + the money-UX **tx-lifecycle** states (queued → signing →
  submitted+hash → confirmed; timeout → "check explorer").
**Acceptance:** each flow has a mock + a short spec (components used, copy, states) handed to its owner
before they start coding at M1.

### J4 — Money-UX polish pass `M`
Sweep for the details that make it feel real (roadmap 1.4): consistent `₱1,200` formatting everywhere,
no raw spinners (use `Skeleton`/`EmptyState`), approval-chip + release-button threshold coloring
readable at a glance, `createPool()` progress surfaced as a clean step list (it already emits
`onProgress`), mobile portrait check against the PWA manifest, and an accessibility pass (focus rings,
tap targets ≥44px, contrast AA).
**Acceptance:** no dead-end/raw-spinner states in the primary flows; looks intentional at phone width;
basic a11y audit passes.

---

## Blockers & dependencies

### What I need from others

| My task | Needs | From | Until it lands |
|---|---|---|---|
| J3 screen designs | 10 minutes with each flow owner (what data exists per screen: David D2/D5, Elton EL1–EL5, Shello S3/S4) | David, Elton, Shello | The interface contracts in [README](./README.md#interface-contracts) already list the fields — design from those, confirm with owners async |
| J4 polish pass | The M1 screens actually existing | everyone | Do the polish sweep on the **current** demo screens first (roadmap 1.4 targets); sweep the new screens as they merge |

You are otherwise **dependency-free** — J0/J1/J2 start cold on day 1.

### Who's waiting on me (don't let these slip)

| My task | Unblocks | Their task |
|---|---|---|
| **J0 tokens + J1 primitives** | Shello, Elton, David | Every screen they build — without the kit they hand-roll CSS you'll have to unwind. **This is the day-1 deliverable.** |
| J1 `QRCode` + `CopyField` | Elton | EL2 invite share UI |
| J1 `Skeleton`/`EmptyState` | Shello | S3 feed states |
| J2 `t()` scaffold | Shello, Elton | Every string they add — if `t()` isn't there when they start, hardcoded strings creep in and the en/tl retrofit costs a week |
| J3 feed + notif-settings mocks | Shello | S3 UI, S4 settings screen |
| J3 directory/invite/roster/address-book mocks | Elton | EL1–EL5 UIs |
| J3 link-wallet mock | David | D2 screen |

**If I'm the bottleneck:** ship J0+J1+J2 as one early PR even if imperfect — a good-enough kit on
day 2 beats a perfect one at M1. For J3, deliver Shello's feed mock and Elton's directory mock
**first** (their day-1 tasks); the rest can trail by a few days.

## Start here (Day 1)
Do **J0** (theme + tokens) and start **J1** in parallel — the token set and the component kit are what
unblock Shello and Elton at M1. Then get the **J3** mockups for _their two flows_ (directory/invite and
activity feed) in front of them before they open a PR.

## Definition of done (your workstream)
- Theme decided, tokens formalized, component library extended and documented.
- i18n framework live with en/tl seeded and a working toggle.
- Every new Phase-1 screen has a mock + spec; money-UX polish pass complete; a11y baseline met.
- No regression to the existing demo look through Jul 15.
