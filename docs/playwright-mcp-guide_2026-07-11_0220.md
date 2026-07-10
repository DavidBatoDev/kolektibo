# Playwright MCP — Watch Claude Drive the App (slow-mo)
_Created: 2026-07-11 02:20 MPST · Kolektibo · Stellar Testnet_

This sets up the **Playwright MCP server** so Claude can open a **real, visible browser**,
click through Kolektibo, and — because we run it in **slow motion (1000 ms per action)** — you
can watch every step happen: create a pool, contribute, request a spend, gather approvals,
release USDC. Great for demos, QA, and catching UI bugs live.

> **What is "MCP" here?** The Model Context Protocol lets Claude call external tools. The
> Playwright MCP server exposes browser controls (navigate, click, type, snapshot, …) as tools
> Claude can use. You don't script anything — you just ask Claude in plain language and watch.

---

## 1. What was added

| File | Purpose |
|---|---|
| `.mcp.json` | Registers the `playwright` MCP server for **this project** |
| `playwright-mcp.config.json` | Playwright launch options — **`slowMo: 1000`** and headed (visible) |

`.mcp.json` (already created):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "cmd",
      "args": [
        "/c", "npx", "-y", "@playwright/mcp@latest",
        "--browser", "msedge",
        "--viewport-size", "400x860",
        "--config", "d:/Documents/GitHub/kolektibo/playwright-mcp.config.json"
      ]
    }
  }
}
```

- `cmd /c npx …` — the reliable way to launch an `npx` MCP server on **Windows**.
- `--browser msedge` — uses **Microsoft Edge**, which ships with Windows 11, so **no browser
  download is needed**. (Switch to `chrome`, `chromium`, `firefox`, or `webkit` if you prefer.)
- `--viewport-size 400x860` — a phone-sized window, matching the mobile-first PWA.
- `--config …` — points at the slow-mo config below. **This path is absolute** — if you move or
  clone the repo elsewhere, update it (or make it relative to the project root).

`playwright-mcp.config.json`:

```json
{
  "browser": {
    "launchOptions": {
      "headless": false,
      "slowMo": 1000
    }
  }
}
```

- **`slowMo: 1000`** — Playwright waits 1000 ms before each action, so you can follow along.
  Lower it (e.g. `400`) for a faster run, raise it for a more deliberate demo.
- `headless: false` — the browser window is visible (this is also the default).

---

## 2. Activate it (one-time) — **required**

MCP servers load when Claude Code **starts**, so the tools are **not** available in the session
that added them.

1. **Restart Claude Code** (close and reopen, or reload the window).
2. On first load, Claude Code asks you to **approve** the new project MCP server (`.mcp.json` is
   project-scoped, so approval is required for safety). Approve it.
3. Verify it's connected: run **`/mcp`** — you should see `playwright` listed as connected, with
   its tools (e.g. `browser_navigate`, `browser_click`, `browser_snapshot`, `browser_type`).

If `playwright` doesn't appear, see **Troubleshooting** below.

---

## 3. Prerequisites before a run

- **The app must be running.** In a terminal: `pnpm dev` (starts web on `http://localhost:5173`
  and the AI/chain backend on `http://localhost:8787`). See `docs/09-how-to-run_*` for details.
- **Microsoft Edge installed** (default on Windows 11). Nothing else to install — `npx` fetches
  the MCP server on first use.
- Your **OpenAI key** in `services/ai/.env` if you want the AI treasurer to answer during the walk-through.

---

## 4. How to use it — just ask Claude

In a **new** Claude Code session (after the restart), ask Claude to drive the app. Claude calls
the Playwright tools; an Edge window opens and performs each step at 1 s intervals while you watch.

**Example prompts:**

> "Open http://localhost:5173 and take a snapshot."

> "Walk through the full Kolektibo demo slowly: create the pool and **wait** until it finishes
> (~1 minute), then go to Contribute and contribute ₱200 as Kap. Ramon, then Spend → request
> ₱1,200 for Equipment, approve as Aling Nena, and release the funds. Snapshot after each step
> and tell me the on-chain tx links."

> "On the Spend tab, request ₱6,000 for Equipment and show me that the contract rejects it for
> being over the category limit."

**Tips**
- Tell Claude to **wait** during the ~1-minute create-pool step (it makes many testnet
  transactions). Ask it to watch the progress bar reach 100%.
- Ask for a **snapshot** (accessibility tree) or a **screenshot** after key steps so Claude
  can confirm what's on screen and you have artifacts.
- If a run gets into a weird state, tell Claude to open the **Rules** tab and hit **"Start over
  (create a brand-new pool)"**, or clear the site's `localStorage`.

---

## 5. What Claude can do with it (common tools)

| Tool | Does |
|---|---|
| `browser_navigate` | Go to a URL |
| `browser_snapshot` | Capture the page's accessibility tree (what Claude "reads") |
| `browser_take_screenshot` | Save a screenshot image |
| `browser_click` | Click an element |
| `browser_type` | Type into a field |
| `browser_select_option` | Pick from a dropdown (e.g. the officer/category selectors) |
| `browser_wait_for` | Wait for text/time (useful during the create-pool deploy) |
| `browser_console_messages` | Read console logs (debugging) |

Exact tool names may vary slightly by version — run `/mcp` to see the live list.

---

## 6. Changing the settings

Edit **`playwright-mcp.config.json`**, then **restart Claude Code** for changes to take effect:

- **Speed:** change `slowMo` (ms). `0` = full speed, `1000` = current, `2000` = extra slow.
- **Headless:** set `"headless": true` to run invisibly (e.g. for automated CI-style checks).
- **Browser:** in `.mcp.json`, change `--browser` to `chrome`, `chromium`, `firefox`, or `webkit`.
  Note: `chromium`/`firefox`/`webkit` trigger a one-time Playwright browser download
  (`npx playwright install <name>`); `msedge`/`chrome` reuse the system browser.
- **Window size:** change `--viewport-size` (e.g. `1280x800` for desktop layout).

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `playwright` not in `/mcp` | You must **restart** Claude Code after adding `.mcp.json`, then **approve** the server. |
| Server fails to start on Windows | Keep the `cmd /c npx …` form in `.mcp.json` (plain `npx` can fail to spawn on Windows). |
| "config not found" / slow-mo not applying | The `--config` path is **absolute**; make sure it matches where the repo lives on this machine. |
| Browser won't launch | Ensure **Edge** is installed, or switch `--browser` to `chrome`/`chromium` (chromium downloads once). |
| Page is blank / connection refused | The dev server isn't running — start it with `pnpm dev` (web on `:5173`). |
| First run is slow | `npx` is downloading `@playwright/mcp` once; subsequent runs are cached. |

---

## 8. Notes & limits

- These tools drive the browser **for Claude**, so Claude can test and demo the app; they run on
  **your machine** against your **local** dev server (`localhost:5173`).
- The demo is currently **single-browser** (pool + keys live in `localStorage`), so one Edge
  window = one member's view. Multi-device testing needs the shared directory service (roadmap doc 10).
- `.mcp.json` and `playwright-mcp.config.json` are committed with the repo. The **only**
  machine-specific bit is the absolute `--config` path — update it if you clone elsewhere.
