# Decision Record — Descope Paluwagan from the hackathon demo

_Date: 2026-07-11 · Status: Accepted · Extends the decision log in [`08-decisions-and-rationale`](./08-decisions-and-rationale_2026-07-11_0146.md)_

## Context

Kolektibo's hackathon thesis is one sentence: **a Soroban contract — not a person — holds the
group's pooled USDC, and enforces category caps + 2-of-3 officer approval so no single treasurer
can drain it**, with an AI that answers "where did the money go?" from on-chain history. This is
built, testnet-verified end-to-end, QA-passed, and polished.

During the production build we also implemented a second on-chain mode, **paluwagan** (a rotating
ROSCA): a *separate* contract that rotates the whole pot to each member in turn. It is real, verified
work — 6/6 unit tests, and a full 3-cycle rotation executed on testnet ending **zero-sum** with real
USDC (`CBX7WXQ5STPXPR2K3YFEBMPLMMDFBEIVPUVJTTPBSVJNWBG5WVGIL4SW`). The production roadmap positioned
it as the "core differentiator."

Before the Jul 15 submission we reconsidered whether to **feature paluwagan in the demo**.

## Decision

**Descope paluwagan from the hackathon demo and pitch.** The Jul 15 demo presents a single idea:
the AI-governed treasury. Paluwagan is **not** shown as a shipped feature.

The verified paluwagan contract **stays in the repository** as a proven post-hackathon spike. It
remains **Phase 3** of the production roadmap. Nothing verified is deleted.

## Rationale

The deciding factor: **two ideas land weaker than one.** A hackathon demo is judged in minutes and
rewards one crisp, memorable idea done deeply. Splitting the narrative across "treasury governance"
and "rotating paluwagan" dilutes the punch of both.

Reinforcing points:

- **The treasury is the finished, de-risked core.** It is testnet-verified end-to-end and QA-passed.
  Paluwagan's *contract* is done, but its *UI is unbuilt* — building a second screen days before
  submission touches the working app and risks a regression in the one thing that must not break.
- **App-model cost.** The app currently models one pool; a second pool type needs nav/state design
  that adds demo surface and potential confusion for no narrative gain.
- **Sharper regulatory edge.** Paluwagan pokes the SEC "returns/investment" and RA 9474 lending
  traps harder than a plain treasury; the roadmap already parks much of it for counsel. Not a burden
  worth carrying into a 3-minute pitch.
- **Keeping it costs nothing.** Paluwagan is a *separate* contract — it does not touch the treasury
  demo loop. Retaining the verified code preserves the option (and the "the trust engine
  generalizes" proof) at zero risk to the demo.

The counter-argument — paluwagan is the "why not just use Safe?" differentiator and the PH-native
wedge — is acknowledged, and is exactly why it is **retained for Phase 3**, not abandoned. This
decision is *not now, not in the demo* — not *never*.

## What changed vs. kept

**Kept (unchanged, verified):**

- `contracts/paluwagan/` (contract + 6/6 tests), `apps/web/src/contract/paluwagan/` (TS bindings),
  `scripts/paluwagan-testnet.sh`, and the testnet deployment record.
- Paluwagan as **Phase 3** of the production roadmap, and as a market/use-case example.
- Supabase schema v1 forward-support (`pools.kind`, `paluwagan_cycles`, `cycle_contributions`) —
  forward-looking, unapplied, consistent with Phase 3.

**Changed (descoped from the demo narrative):**

- `DEPLOYMENT.md`: paluwagan moved out of the live treasury-deployment table into a clearly labeled
  *post-hackathon spike (not in demo scope)* appendix.
- `docs/production-roadmap_*`: "core differentiator" reframed as a *post-hackathon (Phase 3)* item,
  pointing here.
- `docs/execution-log_*`: dated descope entry; the paluwagan-UI task marked descoped, not "next."
- `docs/00-INDEX_*`: index row for this record.
- `contracts/paluwagan/src/lib.rs`: a `STATUS:` note in the module doc pointing here.

## Consequences

- The demo and pitch are single-idea, focused on the treasury.
- Paluwagan is re-activatable later with **no contract rework** — it is deployed and verified;
  Phase 3 adds only the read-model + UI on top.
- Not deleted, so a repo reviewer will find a second contract. The `STATUS:` markers and this record
  explain why it exists and why it is not in the demo.

## Reversal

To bring paluwagan back into scope: build the paluwagan UI (roadmap Phase 3), re-feature it in
`DEPLOYMENT.md` and the pitch, and supersede this record. The contract itself needs no changes.
