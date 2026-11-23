# PactMobileTracker

A personal Pact markets dashboard: an iPhone widget plus a live view (phone and desktop) for Pact's swap fees, block rewards and order flow. The fee counter **restarts at 00:00 on the 1st of every month (UTC+7)**, and each finished month is kept as history. Tracking began **Sep 28 2026, 00:00 (UTC+7)**.

- **Home screen widgets** (small / medium / large): the month's fees, **+$X since you last checked**, today's fees, block rewards, and a chart of fees building up.
- **Lock screen widgets** (rectangular / inline / circular).
- **Tap any widget** to open the live view. **On a computer** the same page is at https://humbleshaman.github.io/PactMobileTracker/ (GitHub Pages), laid out wide. It follows the system light/dark setting; the moon button switches it.

The live view has five tabs. There are no sounds or animations; numbers update as swaps land.

| Tab | What it answers |
|---|---|
| **Overview** | This month's fees (protocol vs LP split, today, last 24h, volume, pace vs last month at the same day), who traded in the last 24h, monthly history, block rewards, and live swaps tagged with who sent them. |
| **Flow** | Who sends Pact's volume. The **order flow map** is a transit line diagram: each source is a vertical coloured line, each pool a stop, and a line's dot at a stop is sized by the volume it sent there. Then volume by line per hour/day, a roster of every sender (volume, swaps, average size, fees paid, pools touched), trade sizes, and an hour-of-week heatmap. |
| **Pools** | Every pool: TVL, volume, turnover, fee and farm APR, the fees and protocol earnings it actually made in the window, and its 24h price. Filter by type (clMM, weighted, classic, stable) or search. |
| **Liquidity** | Who added or removed liquidity, in which pool, and how much: every clMM add and remove, plus weighted and classic moves of $1K+. Daily in/out bars, net flow per pool (against its TVL), a by-wallet table (tap a wallet to follow just its moves; NFD names shown), and the event feed with wallets, token amounts and links to each transaction. **Live:** the page checks the Vault every 15 s and decodes new adds/removes itself, so they appear within seconds; a pool that moves gets its TVL refetched on the spot. Classic pools update with the collector (every 30 min). Overview shows the last 24h. |
| **Tokens** | Pact TVL and daily volume (30 days), live ALGO/USD, net buying vs selling per token, and the biggest trades of the week. |
| **vs Tinyman** | Pact's share of Pact + Tinyman volume and TVL, and every pair Tinyman trades with Pact's volume, depth and share beside it. Each pair is flagged **No Pact pool**, **Thin** (Pact depth under a quarter of Tinyman's), **Under-routed** (Pact has the depth but aggregators don't send it flow), **Behind** or **Competitive**. |

Flow, Pools and Tokens share one window control each: **24h / 7 days / 30 days**.

**Order-flow lines** (`collector/actors.mjs`). Each swap's `sender` is the contract that made it (for routed swaps) or the wallet that signed it. Known senders are named and drawn in a fixed colour:

| Line | Who |
|---|---|
| **H** Hay router | TxnLab's Haystack aggregator (apps 3757715482, 3279848327) |
| **N** NKBD arb | atomic Tinyman↔Pact arbitrage (NKBDACOR…, app 3251784052) |
| **Q** Q6WW arb | Algorand's largest arbitrage wallet |
| **R** RCFX bot | two bot contracts from one creator (apps 3770175877, 3769757823) |
| **D** Deflex, **V** Vestige | the other aggregators |
| **B** Other bots | any other contract, and wallets with 200+ swaps a week |
| **W** Wallets | everyone else trading directly |

Unknown contracts are looked up once on the indexer and shown by app id (and creator). To give a new big bot its own line, add it to `KNOWN` and `LINES` in `actors.mjs`.

- **Block rewards** (separate from fees): the ALGO Pact earns for proposing Algorand blocks, from the shared Vault (custody for weighted and clMM pools) and classic pool accounts that are online. The Overview card shows the month's ALGO with a USD estimate, today, last 24h, blocks, a 14-day chart and a per-account table, and picks up new blocks within about 20 seconds.
- **Monthly history:** every month's fees, protocol share, volume and block rewards plus the all-time total. If the live view is open when the month turns, it closes the month into history and starts again from $0.

## How it works

```
GitHub Actions (every ~5 min)              iPhone (Scriptable) / desktop (Pages)
collector/collect.mjs                      scriptable/Loader.js → PactTracker.js
  pact.fi /api/v1/swaps    ─┐                widgets read data/feed.json
  algod pool global state  ─┤                live view (scriptable/live.html) reads
  indexer block headers    ─┼─► data branch    feed.json + market.json, then polls
  pact.fi pools, analytics ─┤   feed.json      pact.fi swaps (5 s), indexer blocks
  Tinyman analytics        ─┘   market.json    (20 s), Binance ALGO price, pact.fi
                                               analytics (Tokens tab)
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

**Market rollups** (`collector/market.mjs` → `market.json`): every swap the collector reads is also tallied by pool, sender, sender→pool, token (bought vs sold), size bucket and local hour, in one bucket per local day (35 days kept) and one per hour (last 26 hours, so "24h" is exact). Closed buckets fold sub-$5 pools and edges into one "other" entry to keep `state.json` under ~1 MB. A backfill walks the swaps feed back 30 days, 150 pages per run, so a fresh start fills its history over about two hours; the dashboard says how far back it reaches until then. Once an hour the collector also snapshots Pact's pools (TVL, 24h volume, APR, price spark) and Tinyman's 100 busiest v2 pools plus its v1.1 leftovers (`/api/v1/pools/?version__in=2.0`; without `version__in` Tinyman only lists v1.1), and keeps a daily reading of Pact's share for the share-over-time chart.

**Liquidity flows** (`collector/liquidity.mjs`):
- **Weighted and clMM pools** keep their funds in the shared Vault app (3656084807). So one indexer query for transactions touching the Vault, paged forward from a saved round, catches every add and remove in both.
  - The pool's ARC-28 event carries the provider and both token amounts: `PositionMinted` / `PositionBurned` for clMM, `LiquidityAdded` / `LiquidityRemoved` for weighted.
- **Classic pools** predate the Vault and log no events. Every 30 minutes the collector reads their LP-token transfers instead: the pool sending LP to a wallet is an add, a wallet sending LP back is a remove.
- **Kept:** clMM events of any size; weighted and classic only from $1K.
- **Values:** prices come from Pact's own pool reserves (hourly snapshot).
- **History:** the first run backfills 14 days, and events are kept for 35.

The result is force-pushed as one commit on the `data` branch, so the git history doesn't grow.

## Phone setup (one time)

1. Install **Scriptable** from the App Store (free).
2. Open Scriptable, tap **+**, paste all of [`scriptable/Loader.js`](scriptable/Loader.js), and name the script **Pact Tracker**. Tap ▶ once to check that the live view opens.
3. Long-press the home screen → **Edit** → **Add Widget** → **Scriptable**. Pick a size, add it, then long-press it → **Edit Widget** → Script: **Pact Tracker**.
4. Lock screen: long-press the lock screen → **Customize** → **Lock Screen** → tap the widget row → **Scriptable** → then pick **Pact Tracker** the same way.

Optional widget **Parameter** `refresh`: "+$X since …" then counts from that widget's own last refresh, not from the last time you opened the live view.

## Limits

- **iOS decides when a widget refreshes**, usually every 5–15 minutes. Widgets can't animate. A glance at the home screen does not force a refresh. The live view is the part that ticks in real time.
- **Order flow is labelled by sender address**, not by the person behind it: a router's swaps all show as the router, and wallet-level users behind Hay or Deflex are not split out.
- **Tinyman figures** are Tinyman's own analytics (24h volume, TVL, fees). Pairs are matched by asset id, so Folks-wrapped pairs (fUSDC/fALGO) are separate from their underlying.
- **USD prices** come from the pact.fi API at the moment of collection. Swaps priced above $5M are treated as pricing glitches and counted as $0 (see `outliers` in feed.json).
- **GitHub's own cron is slow.** It actually fires every 3–7 hours, not every 5 minutes. While Andrew's PC is on, a Windows scheduled task (`pc/trigger.pyw`, installed by `pc/install-task.ps1`) asks GitHub to run the collector every 5 minutes. When the PC is off, freshness falls back to GitHub's cron. The trigger log is `%LOCALAPPDATA%\PactMobileTracker\trigger.log`.
- **GitHub turns off scheduled workflows** in public repos after 60 days without repo activity. If the numbers ever freeze, open **Actions → collect → Enable workflow**.

## Development

```sh
node collector/collect.mjs data     # one collection pass (first run backfills from genesis)
BF_PAGES=0 node collector/collect.mjs data   # same, skipping the market backfill
node test/sim.mjs                   # run the widget code under a Scriptable mock, write preview/
node test/desktop.mjs [data]        # every live-view tab at 1440/390, light/dark → preview/
```
