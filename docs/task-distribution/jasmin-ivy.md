# Jasmin Ivy — Design System, Theme & Polish

**Mission:** you are the design authority for the team. You **own the theme**, formalize the design
tokens and the shared component library, stand up the **i18n** framework (English + Tagalog), design
every new Phase-1 screen so Shello and Elton build from a spec (not a blank canvas), and drive the
**money-UX polish pass** that makes the app read as a real fintech product on camera and in-hand.

> You front-stop Shello and Elton: your mockups + components are what they implement. Ship the design
> kit early (M0) so they're never designing while coding.

**Effort legend:** `S` ≤2h · `M` ½–1d · `L` 1–2d · `XL` >2d. **Depends on:** nothing to start.
**Consumers:** everyone — tokens/components (David, Earl, Shello, Elton), mockups (Shello, Elton).

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

## Start here (Day 1)
Do **J0** (theme + tokens) and start **J1** in parallel — the token set and the component kit are what
unblock Shello and Elton at M1. Then get the **J3** mockups for _their two flows_ (directory/invite and
activity feed) in front of them before they open a PR.

## Definition of done (your workstream)
- Theme decided, tokens formalized, component library extended and documented.
- i18n framework live with en/tl seeded and a working toggle.
- Every new Phase-1 screen has a mock + spec; money-UX polish pass complete; a11y baseline met.
- No regression to the existing demo look through Jul 15.
