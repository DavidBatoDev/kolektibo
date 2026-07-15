// demo-video.mts — records the ~3-minute product tour of the LIVE app.
//
// Drives http://localhost:5173 (the real /app product) in a portrait phone frame
// at 2x DPI, signs in as the seeded demo account, and walks the storyboard with
// timed holds. Injects the seeded device wallet so the ONE live contribution
// really signs on Stellar. Produces a .webm (Playwright) → transcode to .mp4.
//
// Prereq: run apps/web/scripts/demo-seed.mts first (writes seed.json), with the
// web app on :5173 and the AI backend on :8787.
//
// Run:  pnpm exec tsx apps/web/scripts/demo-video.mts
import { chromium, type Page } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'

const OUT = 'C:/tmp/kolektibo-demo'
const BASE = 'http://localhost:5173'
const seed = JSON.parse(readFileSync(`${OUT}/seed.json`, 'utf8'))
mkdirSync(`${OUT}/video`, { recursive: true })
mkdirSync(`${OUT}/shots`, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge', headless: false, slowMo: 320 })
const context = await browser.newContext({
  viewport: { width: 468, height: 956 },
  deviceScaleFactor: 2,
  recordVideo: { dir: `${OUT}/video`, size: { width: 936, height: 1912 } },
})

// tsx/esbuild "keepNames" wraps functions with __name(); define it in the page
// so evaluated + init functions don't throw "__name is not defined". Passed as a
// raw string so it isn't itself transpiled.
await context.addInitScript({ content: 'window.__name = window.__name || function (f) { return f };' })

// Inject the demo device wallet (officer A) so myKeypair() signs the live contribute.
await context.addInitScript((wallet) => {
  try { const K = 'kolektibo.mywallet.v1'; if (!localStorage.getItem(K)) localStorage.setItem(K, JSON.stringify(wallet)) } catch { /* ignore */ }
}, seed.deviceWallet)
// A subtle on-screen cursor dot (Playwright doesn't record the OS cursor).
await context.addInitScript(() => {
  const dot = document.createElement('div')
  dot.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(21,128,61,.30);border:2px solid rgba(21,128,61,.7);box-shadow:0 0 0 5px rgba(21,128,61,.10);pointer-events:none;transition:transform .09s ease-out'
  const mount = () => { if (document.body) document.body.appendChild(dot); else requestAnimationFrame(mount) }
  mount()
  addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px' }, { passive: true })
  addEventListener('mousedown', () => { dot.style.transform = 'scale(.65)' })
  addEventListener('mouseup', () => { dot.style.transform = 'scale(1)' })
})

const page = await context.newPage()
page.setDefaultTimeout(45_000)

const tStart = Date.now()
const at = () => ((Date.now() - tStart) / 1000).toFixed(1)
const timeline: { name: string; start: string }[] = []
// Global pacing multiplier — every on-screen hold is stretched so a live
// narrator is never rushed. Bump PACE to slow the whole tour down uniformly.
const PACE = Number(process.env.DEMO_PACE ?? 1.1)
const hold = (ms: number) => page.waitForTimeout(Math.round(ms * PACE))
// Screenshots are DISABLED during recording: page.screenshot() in a headed
// browser with a deviceScaleFactor momentarily resizes the window to its natural
// width, which the video captures as a full-screen "flash". No-op keeps the call
// sites harmless. (Set DEMO_SHOTS=1 to re-enable for debugging a still frame.)
const shot = async (name: string) => {
  if (process.env.DEMO_SHOTS === '1') await page.screenshot({ path: `${OUT}/shots/${name}.png` }).catch(() => {})
}
async function scene(name: string, fn: () => Promise<void>) {
  timeline.push({ name, start: at() })
  console.log(`[${at()}s] ▶ ${name}`)
  try { await fn() } catch (e) { console.log(`   ! ${name}: ${(e as Error).message?.slice(0, 120)}`) }
}
// Eased, smooth vertical scroll (instead of jumpy wheel ticks).
const wheel = async (dy: number, dur = 900) => {
  await page.evaluate(({ dy, dur }) => new Promise<void>((res) => {
    const el = (document.scrollingElement || document.documentElement) as HTMLElement
    const start = el.scrollTop, t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur)
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2 // easeInOutQuad
      el.scrollTop = start + dy * e
      if (p < 1) requestAnimationFrame(tick); else res()
    }
    requestAnimationFrame(tick)
  }), { dy, dur })
  await hold(200)
}
// Smoothly bring an element to the centre of the viewport.
const smoothTo = async (locator: ReturnType<Page['locator']>) => {
  try { await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' })); await hold(700) } catch { /* ignore */ }
}
const poolUrl = (suffix = '') => `${BASE}/app/pools/${seed.poolId}${suffix}`

// ── 1) Intro — landing page (~10s) ────────────────────────────────────────────
await scene('01-intro', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await hold(4000); await shot('01-landing-top')
  await wheel(520); await hold(3200)
  await wheel(520); await hold(2600); await shot('01-landing-scroll')
})

// ── 2) Sign in (~14s) ─────────────────────────────────────────────────────────
await scene('02-signin', async () => {
  await page.goto(`${BASE}/auth/sign-in`, { waitUntil: 'domcontentloaded' })
  await hold(1800)
  const email = page.getByLabel('Email'); await email.click(); await email.pressSequentially(seed.demo.email, { delay: 40 })
  await hold(500)
  const pw = page.getByLabel('Password'); await pw.click(); await pw.pressSequentially(seed.demo.password, { delay: 55 })
  await hold(700); await shot('02-signin-filled')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/app(?:$|\/|\?)/, { timeout: 45_000 })
  await hold(2600); await shot('02-dashboard')
})

// ── 3) Pool overview: balance, 2-of-3, on-chain treasury (~16s) ───────────────
await scene('03-pool-overview', async () => {
  await hold(2800)
  const card = page.getByText(seed.poolName).first()
  if (await card.count()) await card.click(); else await page.goto(poolUrl())
  await page.waitForURL(new RegExp(`/app/pools/${seed.poolId}`))
  await page.getByText(/officers approve any spend/i).waitFor({ timeout: 25_000 }).catch(() => {})
  await hold(4500); await shot('03-pool-hero')
  await wheel(260); await hold(2500)
})

// ── 4) People — the group (~10s) ──────────────────────────────────────────────
await scene('04-people', async () => {
  await page.goto(poolUrl('/members'), { waitUntil: 'domcontentloaded' })
  await hold(4500); await shot('04-people')
  await wheel(320); await hold(3000)
})

// ── 5) Budget + recent activity (~13s) ────────────────────────────────────────
await scene('05-budget-activity', async () => {
  await page.goto(poolUrl(), { waitUntil: 'domcontentloaded' })
  await page.getByText(/officers approve any spend/i).waitFor({ timeout: 25_000 }).catch(() => {})
  await hold(1500)
  await wheel(700); await hold(3800); await shot('05-budget')
  await wheel(520); await hold(3800); await shot('05-activity')
})

// ── 6) A released spend: 2-of-2 approvals (~12s) ──────────────────────────────
await scene('06-spend-detail', async () => {
  await page.goto(poolUrl('/spends'), { waitUntil: 'domcontentloaded' })
  await hold(2500)
  const row = page.getByText(/Equipment/).first()
  if (await row.count()) await row.click()
  await page.waitForLoadState('domcontentloaded')
  await hold(4500); await shot('06-spend-detail')
})

// ── 7) LIVE contribute — signs on Stellar (~20s) ──────────────────────────────
await scene('07-contribute', async () => {
  await page.goto(poolUrl('/contribute'), { waitUntil: 'domcontentloaded' })
  await hold(2200)
  const amount = page.locator('input[inputmode="decimal"]').first()
  await amount.click(); await amount.fill('500')
  await hold(1200); await shot('07-amount')
  await page.getByRole('button', { name: /^Contribute/ }).click()
  await page.getByText(/Contribution sent/i).waitFor({ timeout: 45_000 }).catch(() => {})
  await hold(4500); await shot('07-contribute-success')
})

// ── 8) AI Agent — mandate + grounded Q&A (~34s) ───────────────────────────────
await scene('08-agent', async () => {
  await page.goto(`${BASE}/app/agent`, { waitUntil: 'domcontentloaded' })
  await hold(2400); await shot('09-agent-home')
  // The AI-authored mandate — approved on-chain, bounded by the contract.
  const mandate = page.getByText('Monthly coach stipend').first()
  await smoothTo(mandate)
  await hold(4200); await shot('09-mandate')
  // Ask a grounded question.
  await smoothTo(page.getByText('Ask your Agent').first())
  const ta = page.locator('textarea').first()
  await ta.click()
  await ta.pressSequentially('How does this pool keep spending safe, and what automatic payments has the group approved?', { delay: 22 })
  await hold(600); await shot('09-question')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  // Follow the run immediately so the live tool calls (list pools, get pool
  // summary…) are visible streaming in before the answer lands.
  await hold(900)
  await smoothTo(page.getByText('You asked').first())
  await hold(4500); await shot('09-calls')
  // Then the grounded answer arrives — centre it and hold to read.
  await page.getByText('Kolektibo Agent').nth(1).waitFor({ timeout: 60_000 }).catch(() => {})
  await smoothTo(page.getByText('Kolektibo Agent').nth(1))
  await hold(6500); await shot('09-answer')
})

// ── 10) Safety close — no admin can sign (~10s) ───────────────────────────────
await scene('10-security', async () => {
  await page.goto(poolUrl('/settings/security'), { waitUntil: 'domcontentloaded' })
  await hold(2000)
  await smoothTo(page.getByText(/No platform administrator can sign/i))
  await hold(4500); await shot('10-security')
})

// ── 11) Close on the balance (~6s) ────────────────────────────────────────────
await scene('11-close', async () => {
  await page.goto(poolUrl(), { waitUntil: 'domcontentloaded' })
  await page.getByText(/officers approve any spend/i).waitFor({ timeout: 20_000 }).catch(() => {})
  await hold(4500); await shot('11-close')
})

timeline.push({ name: 'END', start: at() })
console.log('\n=== TIMELINE (seconds from recording start) ===')
for (const t of timeline) console.log(`  ${String(t.start).padStart(6)}s  ${t.name}`)
const videoPath = await page.video()?.path()
await context.close() // flushes the .webm
await browser.close()
console.log(`\n✅ recording complete → ${videoPath}`)
console.log(`   total ~${timeline[timeline.length - 1].start}s`)
