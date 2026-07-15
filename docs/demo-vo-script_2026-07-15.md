# Kolektibo — 3‑minute demo voiceover script

_Aligned to the recorded cut: **`C:\tmp\kolektibo-demo\kolektibo-demo.mp4`** — total **2:24**._
_Driven by `apps/web/scripts/demo-video.mts` against the LIVE `/app` product (real testnet + Supabase)._
_Narration pace ~130 wpm (unrushed). Timestamps mark when each on‑screen beat begins._

> Delivery tip: this is a clean screen recording (no captions) — read over it in your own voice.
> Every number and transaction on screen is real on Stellar testnet.

---

| Time | On screen | Narration |
|---|---|---|
| **0:00** | Landing page | *(intro, ~10s)* "Filipinos pool money for everything — the barangay league, the fiesta, the team fund. But it usually lives in one person's hands and a paper notebook. **Kolektibo** changes that." |
| **0:15** | Signing in → dashboard | "I just sign in — no crypto wallet to install, no seed phrase to memorize. My account's ready." |
| **0:27** | Pool overview: ₱8,500, "2 of 3 officers", "Live on testnet" | "This is our basketball league's shared fund — **₱8,500**, and everyone sees the same number. It isn't in a treasurer's pocket; it's held by a **smart contract, live on Stellar**. Any spend needs **two of three officers** to approve." |
| **0:42** | People / roster | "Here's the group — officers who can approve, and members who chip in. Real people, one shared fund." |
| **0:52** | Budget bars + recent activity | "Every peso has a category — equipment, court time, coaching — each with its own limit. And every contribution and payout is right here in the open, for the whole group to see." |
| **1:06** | A released spend (2 approvals) | "Like this payout for team jerseys — you can see it needed **two officers to sign off** before a single peso moved." |
| **1:15** | Live contribute → "Contribution sent ✓" + stellar.expert | "Adding money is just as easy. I'll drop in **₱500** — it's signed right here on my phone and settles on Stellar in seconds. And there's the receipt: a **real transaction** anyone can verify on the blockchain explorer." |
| **1:30** | Agent: mandate card, then live tool calls, then the answer | *(the climax, ~37s)* "Now the part that makes it effortless — the **AI treasurer**. I can ask it anything, and it checks the pool live, right in front of me — you can watch it work. It answers in plain language: spends need two of three officers, here are our limits, and here's the one automatic payment the group approved — a **monthly stipend for the coach**. But notice — the **AI has no power of its own**. It can suggest, and it can report, but it can **never move money**. Only the officers' approvals on Stellar can." |
| **2:07** | Contract & security: "No platform administrator can sign" | "Not even us. **No administrator can touch this fund** — the money answers only to the contract." |
| **2:16** | Back to the pool balance | "Kolektibo — group money your barangay can finally **trust**." |
| **2:24** | End | — |

---

## Emphasis map (what each beat is selling)
- **What it's for** — 0:00 intro, 0:27 shared fund, 0:44 the group.
- **Stellar** — 0:27 "live on Stellar", 1:19 the live on‑chain contribution + explorer receipt.
- **The AI** — 1:39 asks live, shows its checks, answers in plain language, drafts/monitors the mandate.
- **Safety** — 0:27 & 1:10 two‑of‑three approvals, 1:39 "the AI can never move money", 2:19 "no administrator can sign".

## Word budget (≈130 wpm, comfortable)
Intro ~28 · sign‑in ~16 · overview ~44 · people ~18 · budget ~34 · spend ~22 · contribute ~44 · agent ~95 · security ~17 · close ~9 → **~330 words / 2:24**. Trim a clause if you run long on a beat; there's built‑in dwell on every screen.

## Regenerating the video
- Re‑seed a clean pool (resets balance to ₱8,500): `pnpm exec tsx apps/web/scripts/demo-seed.mts`
- Record: `pnpm exec tsx apps/web/scripts/demo-video.mts` → webm in `C:\tmp\kolektibo-demo\video\`
- Transcode: `ffmpeg -y -i <newest>.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart -crf 20 C:\tmp\kolektibo-demo\kolektibo-demo.mp4`
- Pacing: set `DEMO_PACE` (default `1.1`) higher for a slower cut — e.g. `DEMO_PACE=1.3 pnpm exec tsx apps/web/scripts/demo-video.mts` (watch the 3:00 ceiling; each record also adds one real ₱500 contribution, so re‑seed for a clean ₱8,500 start).
- Prereqs: web on :5173, AI backend on :8787 (`pnpm dev:web`, `pnpm dev:ai`).
