# PactMobileTracker

A personal iPhone widget that shows Pact swap fees as they build up: total fees and the protocol's share. The counter **restarts at 00:00 on the 1st of every month (UTC+7)**, and each finished month is kept as history. Tracking began **Sep 28 2026, 00:00 (UTC+7)**.

- **Home screen widgets** (small / medium / large): the running total, **+$X since you last checked**, today's fees, and a chart of fees building up over time.
- **Lock screen widgets** (rectangular / inline / circular).
- **On a computer:** https://humbleshaman.github.io/PactMobileTracker/ is the same live view (GitHub Pages), laid out wide. The running total shows in the tab title.
- **Rewards when fees land** (live view and desktop). Every fee gets a tier, and the sound and visuals scale with it:

  | Tier | Fee per swap | Effect |
  |---|---|---|
  | Tick | $0.001+ | soft tick |
  | Coin | $0.01+ | coin sound, float |
  | Nice | $0.05+ | chime, sparks, glint |
  | Big | $0.25+ | ka-ching, coin shower, gold edge, toast |
  | Whale | $1+ | fanfare, confetti, whale banner |

  Fees that land close together build a combo, and each hit raises the pitch. The session score tracks earnings, fee count, best fee and pace. Sound options are Off / Big / Coins / All, plus a volume slider and preview buttons. On desktop you can also turn on browser alerts for $0.25+ fees while the tab is in the background. `?demo=1` fakes a stream of fees for testing.
- **Block rewards** (separate from fees): the ALGO Pact earns for proposing Algorand blocks. Its accounts that hold ALGO can go online for consensus: the shared Vault (custody for weighted and clMM pools) and some classic pool accounts. The live view has its own card for them (total ALGO with a USD estimate, today, last 24h, blocks, a 14-day chart, the latest blocks and a per-account table). It picks up new blocks within about 20 seconds and plays its own chime. The widgets show a **Blocks** line.
- **Monthly history:** the live view's **Monthly fees** card lists every month (fees, protocol share, swaps, block rewards) plus the all-time total. The large widget shows last month's fees as a tile. If the live view is open when the month turns, it closes the month into history and starts again from $0. "Since you last checked" and milestones also restart with the month.
- **Tap any widget** to open the live view. The total rolls up from where you last left it, each real swap pops in as it lands, and a milestone ($1K, $2.5K, …) sets off confetti.

## How it works

```
GitHub Actions (every ~5 min)            iPhone (Scriptable)
collector/collect.mjs                    scriptable/Loader.js → PactTracker.js
  pact.fi /api/v1/swaps  ─┐                reads data/feed.json (small)
  algod pool global state ├─► data branch  + swaps newer than it from pact.fi
  indexer block headers  ─┘  feed.json     live view: scriptable/live.html
```

**Why a collector?** The pact.fi indexer records `protocol_fee = 0` on constant-product pools. The protocol's `PACT_FEE_BPS` cut builds up inside those pools and is swept out later. So `/api/v1/analytics` understates both the protocol and the total fees. The collector goes through every swap (about 40K a day) and prices it with its pool's on-chain split:

| Pool type | Total fee | Protocol share |
|---|---|---|
| Constant product, stableswap | `FEE_BPS` | `PACT_FEE_BPS` (part of `FEE_BPS`) |
| Managed weighted | `swap_fee_bps` | `swap_fee_bps × protocol_fee_bps / 10000` |
| Concentrated liquidity (clMM) | `fee_bps` | `fee_bps × protocol_fee_bps / 10000` |

The fee in USD is the swap's USD value (from the API) × bps / 10000. Checked against the indexer on stable and weighted pools, where its split is correct.

**Block rewards** (`collector/rewards.mjs`): once a day the collector lists every Pact pool holding ALGO and finds the accounts behind them. That means classic and stable pool accounts, plus the Vault named in weighted and clMM pool state. It keeps the ones that are online or have ever proposed a block. Every run it reads the indexer's block headers for those proposers (`/v2/block-headers?proposers=…`) and adds up `proposer-payout`. A proposer only gets paid while it holds 30K+ ALGO and is incentive-eligible, so a smaller online pool can propose blocks and earn 0. The USD figure is an estimate at the current ALGO price (the newest ALGO swap in the collector; the live exchange price in the live view).

**Months** (`collector/period.mjs`): the collector keeps counting from the tracking start and splits by month when it writes the feed. `feed.genesis` is the start of the current month, so `total`, `protocol` and the chart count from the 1st. `months` lists every month newest first, `allTime` covers everything, and `monthEnd` tells the live view when to roll over.

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
- **GitHub's own cron is slow.** It actually fires every 3–7 hours, not every 5 minutes. While Andrew's PC is on, a Windows scheduled task (`pc/trigger.pyw`, installed by `pc/install-task.ps1`) asks GitHub to run the collector every 5 minutes. When the PC is off, freshness falls back to GitHub's cron. The trigger log is `%LOCALAPPDATA%\PactMobileTracker\trigger.log`.
- **GitHub turns off scheduled workflows** in public repos after 60 days without repo activity. If the numbers ever freeze, open **Actions → collect → Enable workflow**.

## Development

```sh
node collector/collect.mjs data     # one collection pass (first run backfills from genesis)
node test/sim.mjs                   # run the widget code under a Scriptable mock, write preview/
```
