# Kolektibo — Onboarding brief (for generating Figma Make prompts & prototypes)

**How to use this file:** feed it to Claude and ask it to (1) generate per-screen **Figma Make
prompts** for the onboarding flow, and (2) build a **clickable prototype** of that flow. Everything
Claude needs is in here — the product, the visual system (real token values), the component
vocabulary, the screen-by-screen specs, and the available art. Don't assume any repo access.

FigJam sitemap of this flow:
https://www.figma.com/board/jxLr16hTLwuKVo9XfrEBNG

---

## 1. The product in one paragraph

**Kolektibo** is an **AI-governed group treasury** — a mobile app for the Filipino habit of pooling
money (barangay projects, church collections, team _pondohan_, class/reunion funds). It replaces "one
treasurer with a notebook" with an **AI treasurer whose every move is enforced by a smart contract**:
it can only do what the group's on-chain policy allows, and **no single person can drain the fund**
(spends need M-of-N officer approvals, e.g. 2 of 3). It's a **mobile-first PWA** (single phone-width
column, bottom nav). The group thinks in **pesos (₱)**; settlement is USDC on Stellar. Money is real
but on testnet.

**Emotional job:** make people trust the app with their money. That drives the whole visual system.

---

## 2. Visual system (self-contained — build on-brand from this)

**Vibe:** light, fresh, "green + gold on paper." The thesis: **the money is the loudest thing on
every screen; the primary action is calm and dark; green is a reward, not a demand; gold appears only
when value actually moves.** If two things shout, one is wrong.

### Color tokens (hex)
```
BRAND (green — growth, contribution, accents; NOT the primary button)
  brand-50 #F0FDF4  brand-100 #DCFCE7  brand-200 #BBF7D0  brand-300 #86EFAC
  brand-400 #4ADE80  brand-500 #22C55E (primary green)  brand-600 #16A34A (hover)  brand-700 #15803D (text on mint)

INK (text + dark buttons — authority)
  ink-950 #0B1210 (headings, the money number)   ink-900 #14211C (PRIMARY button fill)
  ink-800 #263832   ink-700 #5B6B65 (secondary text)   ink-500 #94A39D (placeholder/disabled)   ink-300 #D5DDD9 (hairlines)

PAPER (light surfaces)
  paper-0 #FFFFFF (cards)   paper-50 #F7FAF8 (page)   paper-100 #EEF3F0 (inputs / sunken rows)

GOLD (money moving ONLY — payouts, releases, 3D coins; never a normal button)
  gold-300 #FCD34D   gold-400 #FBBF24 (coin face)   gold-500 #F59E0B   gold-700 #B45309 (gold text on light)

SEMANTIC   success #16A34A   warning #F59E0B   danger #DC2626

GRADIENTS (surfaces only — never on text or borders)
  page:  linear 180deg #ECFDF3 → #F7FAF8      (barely-there page wash)
  hero:  linear 145deg #4ADE80 → #22C55E → #15803D   (the balance / hero card — white text on it)
  mint:  linear 160deg #DCFCE7 → #F0FDF4      (quiet green surface under dark text)
```

### Type
- **Plus Jakarta Sans** (weights 400/500/600/700/800) for everything; **JetBrains Mono** for Stellar
  addresses & tx hashes.
- Scale: **money 40px / weight 800 / tracking −0.02em / tabular figures** · h1 26/700 · h2 19/700 ·
  body 15/500 · label 13/500 · caption 11/600 uppercase.
- **Weight 800 is money only.** Headings stop at 700 (so the balance stays the loudest thing).
- Sentence case ("Create pool", not "Create Pool"). Tabular figures on every ₱ amount.

### Shape, elevation, layout
- **Pill CTAs** (`radius-full`). Cards `radius 26px`, hero card `32px`, inputs `14px`.
- **Cards float, they don't outline** — white fill + soft **green-tinted** shadow, no borders.
  Hairlines (`ink-300`) are only dividers *inside* a card.
- Page gutter 16px; card padding 16px (hero 24px); vertical rhythm 8/12/16/24.
- **Textures** (optional, subtle): a faint dot-grid / grain / two-blob "aura" live on the **page
  behind cards** — never inside a card, never behind a money number. If you can clearly see it, it's
  too strong.

### Buttons (one primary per screen)
| Variant | Look | Use for |
|---|---|---|
| primary | ink-900 fill, white text, pill | THE action (Contribute, Create pool, Sign in) |
| secondary | white fill, ink-300 hairline, ink-900 text | the escape hatch (Cancel, Skip) |
| mint | brand-100 fill, brand-700 text | small inline action in a row (Claim, Join, Go) |
| accent | brand-500 fill, white text | affirmative confirm in a sheet / the FAB |
| **gold** | gold-400 fill, **ink-950 text** | **money leaving the pool** (Release, Payout) — nothing else |
| ghost | transparent, ink-700 text | tertiary (See all, View on explorer) |
| danger | white fill, danger text+border | destructive (Leave pool, Remove member) |

Primary is **dark, not green** — a green primary + green balance + green chips = a wall of green with
no hierarchy. **White on gold fails contrast**, so gold buttons use ink text.

### Money & status rules
- Always `₱1,200` (grouped, no decimals unless needed). Money is `ink-950`, weight 800, tabular. On
  the **green hero card** the balance is **white**.
- Amounts **leaving** the pool get a gold coin glyph; amounts arriving don't. Never a gradient on a number.
- **Approval chip** (the key status object): below threshold → grey pill "2 of 3 approvals"; met →
  green pill + check "Ready to release". **Colour is never the only signal** — always an icon or word too.

### The three states nobody skips
- **Loading = skeletons** of the real shape (ghost rows), never a bare spinner.
- **Empty = an invitation**: icon + one-line headline naming the space + one line + one primary
  action. Never "Nothing here yet."
- **Error = what happened + the fix**, one sentence + one action. No "Error:" prefix, no apology.

### Accessibility + i18n
- Tap targets ≥ 44×44px. Visible focus ring (2px brand, 2px offset). Body text ≥ 15px.
- **Bilingual (English + Tagalog).** Tagalog runs ~20–30% longer ("Release funds" → "Ilabas ang
  pondo") — **never fixed-width buttons**; let labels wrap, never truncate an action.

### Component vocabulary (names to reuse in prompts)
Card (+ `hero` variant), Button (variants above), List + Row (dense lists = divided rows in ONE
card), SegmentedControl (same content re-cut), Tabs (different content), Switch (immediate, no Save),
Chip (filter), Badge (neutral/brand/gold/danger), ApprovalChip, ProgressBar, StepList (tx lifecycle),
TxHash (truncated, tap-to-copy, links to stellar.expert testnet), Field + input, CopyField (invite
links), Avatar (with verified check), Skeleton / SkeletonRow, EmptyState, ErrorState, Sheet (bottom
sheet modal), Toast.

---

## 3. The onboarding flow (the sitemap)

Journey, top to bottom. **Legend: 🟩 built today · 🟨 to design.**

```
App launch
   │
   ▼
🟨 Splash ──first time──▶ 🟨 Onboarding (3 slides) ──▶ 🟩 Sign up
   │                                                      │
   └──returning──▶ 🟩 Sign in                             ▼
                     │  ▲                            🟩 Verify email
          forgot ──▶ 🟩 Forgot pw ──▶ 🟩 Reset pw ──┘        │
                                                     (code ok)▼
                                                     🟨 Link a wallet  (optional / skippable)
                                                              │
                          🟩 Sign in ──verified──────────────▶│
                                                              ▼
                                                     ◆ Has a pool?
                                                     ├─ no ─▶ 🟩 Create pool (deploy)
                                                     ├─ no ─▶ 🟨 Join via code
                                                     └─ yes ─────────────┐
                                                                          ▼
                                                                  🟩 Pool home  ( / )
```
**Route guard (enforcement):** opening any guarded screen (home, contribute, spend, setup, profile)
→ **no session → Sign in**; **session but email-unverified → Verify email**; verified → through. (In
a pure-demo build with no backend configured, the guard is off and everything is open.)

**Screen status**
| Screen | Route | Status | Owner note |
|---|---|---|---|
| Splash | — | 🟨 to design | new |
| Onboarding (3 slides) | — | 🟨 to design | new |
| Sign up | /signup | 🟩 built | re-skin to new theme |
| Sign in | /signin | 🟩 built | re-skin |
| Forgot password | /forgot-password | 🟩 built | re-skin |
| Reset password | /reset-password | 🟩 built | re-skin |
| Verify email | /verify-email | 🟩 built | re-skin |
| Link a wallet | — | 🟨 to design | David / D2 |
| Create pool (deploy) | / (empty state) | 🟩 built | re-skin |
| Join via code | — | 🟨 to design | Elton / EL1–EL2 |
| Pool home | / | 🟩 built | re-skin |

---

## 4. Screen-by-screen specs (what each prototype screen should show)

All screens are a **single phone-width column (~390×844)**, light theme, bottom nav hidden on
splash/onboarding/auth. Copy below is a starting point — keep it warm, plain, bilingual-ready.

**Splash** 🟨 — full-bleed `bg-splash` background, centered Kolektibo logomark + wordmark, one-line
tagline ("Pooled money your group can trust"). Auto-advances or a single "Get started" pill.

**Onboarding — 3 slides** 🟨 — swipeable carousel, each slide: `bg-onboard-1/2/3` background, a 3D
illustration, a headline + one line, dot indicators, "Next"/"Skip". Suggested arc: (1) *Pool money
together* — pooling illustration; (2) *An AI treasurer, kept honest by a smart contract* — vault/coins;
(3) *No one can touch the fund alone* — approvals. Ends on "Create account".

**Sign up** 🟩 — card with Fields: Display name, Email, Password (≥8), Confirm. Primary "Create
account" (disabled until valid). Inline validation ("Passwords don't match"). Link "Already have an
account? Sign in." → goes to Verify email on success.

**Sign in** 🟩 — Email + Password, primary "Sign in", links "Forgot password?" and "Create account".

**Forgot password** 🟩 — Email field, primary "Send reset code"; success state: "If an account
exists, we emailed a 6-digit code" + "Enter code".

**Reset password** 🟩 — Email, **6-digit code** (spaced input), new password + confirm, primary
"Update password"; success → redirect to Sign in.

**Verify email** 🟩 — 📩 header, "We sent a 6-digit code to {email}", large centered 6-digit input,
primary "Verify", "Resend code" with 60s cooldown, "Sign out".

**Link a wallet** 🟨 (David D2) — explain why (so a member can hold funds / get paid). Options:
connect an in-app wallet or paste an address; a **nonce-sign** step ("prove you own it"); a clear
**Verified** success state (green check, `verified` illustration). Skippable ("Do this later").

**Create pool (deploy)** 🟩 — highlighted card: logomark + "Create your group treasury", one line
("Real Soroban contract on testnet · 3 officers, 2-of-3 approval · ~1 min"), primary "Deploy on
Stellar testnet". While deploying: a **StepList** (queued → signing → submitted → confirmed) with a
progress bar and %, not a bare spinner.

**Join via code** 🟨 (Elton EL1–EL2) — enter/paste an invite code (or open an invite link), then a
**Join preview**: pool name, member count, the rule ("₱200/mo · 2-of-3 approvals"), your role, primary
"Join pool". Pair with an **Invite** screen (share link + QR via CopyField, role selector).

**Pool home** 🟩 — the destination. **Green hero balance card** (pool name, big **white** ₱ balance,
"N members" pill, the rule line), a live on-chain treasury card, "Ask your AI treasurer" input with
suggestion chips, category budget bars, and a recent-activity List (rows with ₱ amounts + tx links).

---

## 5. Available art (drop-in illustrations & backgrounds)

Transparent 3D-style spot illustrations (use on paper/gradient, not on busy images) and full-bleed
backgrounds. Name → intended screen:

**Illustrations:** `pool` (pooled fund) · `contribute` · `coin` (single 3D coin — money moments) ·
`coins` (cluster — pooling) · `vault` · `members` · `invite` · `wallet` · `verified` · `approvals` ·
`pending` · `payout` · `cycle` · `empty` (EmptyState).
**Backgrounds:** `bg-splash` · `bg-auth` (all auth screens) · `bg-onboard-1/2/3` · `bg-payout`.

Rule: **one hero object per screen** — a 3D illustration OR a big "₱" watermark, never both.

---

## 6. What I want you (Claude) to produce

1. **Per-screen Figma Make prompts.** For each screen in §4, write a self-contained Figma Make prompt
   that produces one **mobile screen (390×844, light theme)** using the tokens in §2 and the component
   names in §2. Put the **color palette + type + button rules as a shared preamble** so every screen
   is consistent. Include the screen's elements, states (default/loading/empty/error/success where
   relevant), copy, interactions, and which illustration/background to use. Prioritize the 🟨
   to-design screens (Splash, Onboarding ×3, Link a wallet, Join via code / Invite / Join preview);
   include re-skin prompts for the 🟩 built screens too.

2. **A clickable prototype of the flow.** Wire the screens per the §3 sitemap (including the guard
   redirects) into a Figma Make prototype: launch → splash → onboarding → sign up → verify → link
   wallet (skippable) → has-pool? → create/join → home; plus sign-in and forgot/reset paths.

Constraints to honor everywhere: mobile-first single column, **one primary button per screen**, money
is the loudest element, **gold only for money leaving**, pills not rectangles, floating cards (no
borders), tap targets ≥44px, and **buttons that can wrap for Tagalog** (never fixed-width).
