# PactMobileTracker

A personal iPhone widget that shows Pact swap fees as they build up: total fees and the protocol's share, counted from **Sep 28 2026, 00:00 (UTC+7)**.

- **Home screen widgets** (small / medium / large): the running total, **+$X since you last checked**, today's fees, and a chart of fees building up over time.
- **Lock screen widgets** (rectangular / inline / circular).
- **On a computer:** https://humbleshaman.github.io/PactMobileTracker/ is the same live view (GitHub Pages), laid out wide. The running total shows in the tab title.
- **Tap any widget** to open the live view. The total rolls up from where you last left it, each real swap pops in as it lands, and a milestone ($1K, $2.5K, …) sets off confetti.

## How it works

```
GitHub Actions (every ~5 min)            iPhone (Scriptable)
collector/collect.mjs                    scriptable/Loader.js → PactTracker.js
  pact.fi /api/v1/swaps  ─┐                reads data/feed.json (small)
  algod pool global state ├─► data branch  + swaps newer than it from pact.fi
                          ┘  feed.json     live view: scriptable/live.html
```

**Why a collector?** The pact.fi indexer records `protocol_fee = 0` on constant-product pools. The protocol's `PACT_FEE_BPS` cut builds up inside those pools and is swept out later. So `/api/v1/analytics` understates both the protocol and the total fees. The collector goes through every swap (about 40K a day) and prices it with its pool's on-chain split:

| Pool type | Total fee | Protocol share |
|---|---|---|
| Constant product, stableswap | `FEE_BPS` | `PACT_FEE_BPS` (part of `FEE_BPS`) |
| Managed weighted | `swap_fee_bps` | `swap_fee_bps × protocol_fee_bps / 10000` |

The fee in USD is the swap's USD value (from the API) × bps / 10000. Checked against the indexer on stable and weighted pools, where its split is correct.

The result is force-pushed as one commit on the `data` branch, so the git history doesn't grow.

## Phone setup (one time)

1. Install **Scriptable** from the App Store (free).
2. Open Scriptable, tap **+**, paste all of [`scriptable/Loader.js`](scriptable/Loader.js), and name the script **Pact Tracker**. Tap ▶ once to check that the live view opens.
3. Long-press the home screen → **Edit** → **Add Widget** → **Scriptable**. Pick a size, add it, then long-press it → **Edit Widget** → Script: **Pact Tracker**.
4. Lock screen: long-press the lock screen → **Customize** → **Lock Screen** → tap the widget row → **Scriptable** → then pick **Pact Tracker** the same way.

Optional widget **Parameter** `refresh`: "+$X since …" then counts from that widget's own last refresh, not from the last time you opened the live view.

## Limits

- **iOS decides when a widget refreshes**, usually every 5–15 minutes. Widgets can't animate. A glance at the home screen does not force a refresh. The live view is the part that ticks in real time.
- **USD prices** come from the pact.fi API at the moment of collection. Swaps priced above $5M are treated as pricing glitches and counted as $0 (see `outliers` in feed.json).
- **GitHub's own cron is slow.** It actually fires every 3–7 hours, not every 5 minutes. While Andrew's PC is on, a Windows scheduled task (`pc/trigger.pyw`, installed by `pc/install-task.ps1`) asks GitHub to run the collector every 5 minutes. When the PC is off, freshness falls back to GitHub's cron. The trigger log is `%LOCALAPPDATA%\PactMobileTracker	rigger.log`.
- **GitHub turns off scheduled workflows** in public repos after 60 days without repo activity. If the numbers ever freeze, open **Actions → collect → Enable workflow**.

## Development

```sh
node collector/collect.mjs data     # one collection pass (first run backfills from genesis)
node test/sim.mjs                   # run the widget code under a Scriptable mock, write preview/
```
