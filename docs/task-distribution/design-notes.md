# Design system — light green + gold

Owner: Jasmin (J0/J1). Everything Shello, Elton and David build comes from this file.
Tokens: `apps/web/src/index.css` · Components: `apps/web/src/components/ui.tsx`

---

## 1. The one-paragraph thesis

A pooled-money app lives or dies on whether people trust it with pesos. So: **the money is the
loudest thing on every screen, the primary action is calm and dark, and green is a reward, not a
demand.** Gold appears only when value actually moves. If a screen has two things shouting, one of
them is wrong.

---

## 2. Colour roles

| Role | Token | Means |
|---|---|---|
| Brand | `brand-500` | Growth, contribution, "this worked". Accents, not commands. |
| Ink | `ink-950` / `ink-900` | Text, and the primary button. Authority. |
| Paper | `paper-50` / `paper-0` | Page, cards. |
| Gold | `gold-400` | **Money moving.** Payouts, releases, earned amounts, the 3D coins. Nothing else. |
| Danger | `danger` | Destructive only. Never "warning-ish". |

**Gold is a budget.** Each screen gets one gold moment, max. If gold is on three things, it means
nothing.

---

## 3. Buttons — the hierarchy

The rule that makes this whole thing work:

> **One primary button per screen.** If you think you need two, one of them is a `secondary`.

| Variant | Look | Use for | Example |
|---|---|---|---|
| `primary` | ink-900 fill, white text, pill | **The** action of the screen | Contribute · Create pool · Sign |
| `secondary` | white fill, ink-300 hairline, ink-900 text | The escape hatch next to primary | Cancel · Skip · Not now |
| `mint` | brand-100 fill, brand-700 text | Small inline action inside a row | Claim · Join · Go |
| `accent` | brand-500 fill, white text | Affirmative confirm in a sheet, and the FAB | Confirm contribution |
| `gold` | gold-400 fill, ink-950 text | **Money leaving the pool** | Release funds · Payout |
| `ghost` | transparent, ink-700 text | Tertiary, low-stakes | See all · View on explorer |
| `danger` | white fill, danger text+border | Destructive | Leave pool · Remove member |

**Why primary is dark, not green.** The main CTA is always a near-black pill and green is the
accent. That contrast is what makes them read as expensive. A green primary + a green balance card +
green chips = a wall of green and no hierarchy.

**Why gold text is ink, not white.** White on `#FBBF24` is ~1.9:1 contrast. It fails AA badly. Gold
buttons take `ink-950` text. Non-negotiable (J4).

**Sizes.** `sm` 36px (inside rows only) · `md` 44px (default, meets tap target) · `lg` 52px (the one
hero CTA). Never go below 44px for anything a thumb hits on its own.

**States.** rest · hover · active (`scale(0.97)`) · focus-visible (2px brand ring, 2px offset) ·
disabled (40% opacity, `cursor-not-allowed`) · loading (spinner replaces label, width held).

**Don't disable the primary — explain it.** A greyed-out "Release" button tells the user nothing.
Keep it enabled and let the tap surface the reason ("Needs 1 more approval"). Only truly disable
while a tx is in flight.

---

## 4. Selection controls — which one, when

This is the part everyone gets wrong. The choice is about **how many options** and **whether they're
exclusive**.

| Control | Options | Exclusive? | Use when |
|---|---|---|---|
| `Switch` | 1 | – | An independent on/off setting. Applies **immediately**, no Save. |
| `Checkbox` | many | no | Multi-select in a form. Needs a Save. |
| `Radio` | 2–5 | yes | A choice inside a form. Needs a Save. |
| `SegmentedControl` | 2–4 | yes | **Switching the view.** Applies immediately. |
| `Chip` (filter) | many | no | Filtering a list. Applies immediately. |
| `Tabs` | 3–6 | yes | Sections of one screen with lots of content each. |
| Bottom nav | 4–5 | yes | App-level destinations. |

The dividing line between **SegmentedControl** and **Tabs**:

- SegmentedControl = *the same content, re-cut.* Income / Expense. All / Mine. Pesos / XLM.
  It's a filter wearing a nicer coat. Lives inside the content.
- Tabs = *different content.* Members / Activity / Settings. Lives directly under the header.

If you can't decide, it's a SegmentedControl. Tabs are heavier and you rarely need them on mobile.

**Never nest them.** Tabs inside tabs, or a segmented control inside a tab, and users lose their
place instantly. One level of switching per screen.

### Switch specifics
- On: `brand-500` track, white thumb. Off: `ink-300` track.
- The label is the subject, not the state: "Contribution reminders", not "Enable reminders".
- **No Save button on a settings screen made of switches.** Toggle = saved. Show a Toast if it
  round-trips to the server, and roll back visually if it fails.

### SegmentedControl specifics
- `paper-100` track, `radius-full`. Active segment = `paper-0` white thumb + `shadow-card`.
- Active label `ink-950`, inactive `ink-700`. Both stay weight 500 — **don't bold the active one**,
  the thumb already says it.
- 2–4 segments. At 5+, it's Tabs or a Select.

---

## 5. Status: badges, chips, thresholds

The approval chip is the most important status object in this app (roadmap 1.4). It must be
readable at arm's length, on a phone, on camera.

| State | Look | Copy |
|---|---|---|
| Below threshold | `paper-100` fill, `ink-700` text | `2 of 3 approvals` |
| Threshold met | `brand-100` fill, `brand-700` text, check icon | `Ready to release` |
| In flight | `paper-100`, spinner | `Submitting…` |
| Confirmed | `brand-100`, check | `Confirmed` |
| Failed | `bg-danger`, danger text | `Failed — check explorer` |

**Colour is never the only signal.** Every state carries an icon or a word too — 8% of your users
can't rely on the green/grey difference (J4 a11y).

---

## 6. Money

- `peso()` output always renders at `--text-money`, weight 800, `ink-950`, tracking `-0.02em`.
- **Always `₱1,200`.** Never `1200`, never `PHP 1,200`, never `₱1200`.
- Amounts leaving the pool get the gold coin glyph. Amounts arriving don't.
- Never put a gradient on a money number.
- On the **green hero card** the balance is white (the card is a saturated green gradient); the
  ink-950 rule is for money on paper/light surfaces. Pick one per surface and stay consistent.

---

## 7. Transaction lifecycle (the money-UX spine)

Every write path shows the same four steps. `createPool()` already emits `onProgress` — wire it in.

```
queued  →  signing  →  submitted  →  confirmed
  ·          ·           + hash        + hash + explorer link
```

- Each step is a row in a `StepList`, not a spinner. The user must always know *which* step.
- The moment a hash exists, show it and link to stellar.expert (**testnet**). Truncate `GAB4…7XQ2`,
  tap to copy.
- Timeout (>30s at `submitted`) → don't fail silently. Swap to: *"Taking longer than usual. Check
  the explorer."* + the link. Never a dead spinner.
- Failure copy says what happened and what to do next. No "Error:" prefix. No apology.

---

## 8. Empty, loading, error — the three states everyone skips

**Loading = Skeleton, never a spinner.** Skeletons of the actual shape (three ghost rows for a feed).
A spinner tells the user nothing about what's coming.

**Empty = an invitation.** Icon, one-line headline naming the space, one-line body, one primary
action. *"No activity yet / Contributions and payouts will show up here. / Contribute"*
Never "Nothing here yet."

**Error = what happened + the fix.** *"Couldn't load the pool. Retry."* One sentence, one action.

---

## 9. Layout

- Page gutter `16px`. Card padding `16px`, hero card `24px`.
- Vertical rhythm: `8 / 12 / 16 / 24`. Between sections `24px`. Nothing arbitrary.
- Cards **float, they don't outline** — `paper-0` + `shadow-card` + `radius-xl`. No borders.
  Hairlines (`ink-300`) are for dividers *inside* a card.
- Dense lists (activity feed, roster) = divided rows inside **one** card (`List` + `Row`). Not a
  card per row — that's the pattern that turns a feed into a soup of floating rectangles.

---

## 10. Motion

Restrained. Two things only:

- **Press:** `scale(0.97)`, 120ms. Every tappable thing.
- **Success:** the balance number counts up over 600ms when a contribution lands, and the coin
  glow pulses once. That's the one moment of delight. Spend it there and nowhere else.

Respect `prefers-reduced-motion` — both of the above become instant.

---

## 11. Accessibility floor (J4 acceptance)

- Tap targets ≥ 44×44. Focus-visible ring on everything focusable, 2px brand, 2px offset.
- Body text ≥ 15px. Contrast AA: `ink-700` on `paper-0` = 5.3:1 ✓ · `brand-700` on `brand-100` =
  5.9:1 ✓ · **white on `gold-400` = 1.9:1 ✗** (use `ink-950`).
- Never colour-only. Icon or word alongside.
- Every icon-only button gets `aria-label`.

---

## 12. i18n (J2) — design constraints

Tagalog runs ~20–30% longer than English. So:

- **No fixed-width buttons.** Ever. `Contribute` → `Mag-ambag`, `Release funds` → `Ilabas ang pondo`.
- Buttons wrap to two lines rather than truncate. Design the row to survive it.
- Every string goes through `t()`. No exceptions, from day one — retrofitting costs a week.
- `peso()` stays locale-independent: `₱` prefix, `en-PH` grouping, both locales.

---

## Implementation notes (how this maps to code)

- **Tokens** live in `apps/web/src/index.css` `@theme` — `brand-*` (green), `ink-*` (text + dark
  buttons), `paper-*` (light surfaces, NEW), `gold-*`, plus `--radius-*`, `--spacing-*`, `--text-*`,
  `--shadow-*`, and `--gradient-*`. Extend these; don't rename.
- **Textures** are `@utility texture-*` in the same file (dots, halftone, grain, aura, peso, shine,
  fade). Rule: texture on the PAGE behind cards, never inside a card or behind a money number.
- **Kit** is `apps/web/src/components/ui.tsx` — import everything from here. `SectionLabel` is kept
  for back-compat. `Card hero` is the green balance card. `List`/`Row` are the dense-list primitives.
- **Type**: Plus Jakarta Sans (UI, to 800) + JetBrains Mono (addresses/hashes), loaded in
  `index.css`. If the `₱` glyph looks thin at weight 800, Plus Jakarta lacks U+20B1 — fall back to
  Inter for `--font-sans`.
