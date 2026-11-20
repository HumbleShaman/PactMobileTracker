# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: a Pact (pact.fi) team member who runs growth and partnerships. They check it many times a day, on an iPhone (Scriptable widget → live view) and on a desktop browser (GitHub Pages) about equally. They know AMMs, fee tiers, clMM ranges, arbitrage and Algorand's DEX landscape fluently; the dashboard never needs to explain what TVL or turnover is.

Their job: understand what is actually happening in Pact's markets right now and over the month: how much the protocol earns, who is sending the volume (arb bots, aggregators, direct wallets), which pools and pairs carry it, how tokens are flowing, and where Pact is missing trades that go to Tinyman or elsewhere, so they can decide which pools to seed, which fee tiers to set and which routers or partners to chase.

## Product Purpose

A personal Pact market and revenue tracker. Success: in a few seconds the user knows this month's fees and block rewards; in a minute they can answer "who traded on Pact today, in which pools, and what did we miss".

## Positioning

Counts protocol fees from on-chain fee splits per pool, so it is more accurate than pact.fi's own analytics (which records constant-product protocol fees as 0). Labels order flow by the contract or wallet that sent it.

## Operating Context

- iPhone: Scriptable app. Home-screen widgets (PactTracker.js) open the live view (scriptable/live.html) in a WebView, with the feed injected.
- Desktop: the same live.html on GitHub Pages, fetching the feed from the repo's `data` branch.
- Data: a GitHub Actions collector (triggered every 5 min by a Windows scheduled task) writes feed.json and market.json; the page also calls public APIs (pact.fi, Algorand indexer, Binance, Tinyman analytics) directly from the browser.
- Months run in UTC+7 (the user's time zone); the fee counter restarts on the 1st and earlier months become history.

## Capabilities and Constraints

- Single-file page shared by the phone WebView and desktop; no build step, no framework, no API keys.
- Public repo: nothing private in the page or data.
- Never deploys (pushes to main) without the user's explicit OK for that push.

## Brand Commitments

Pact's own palette (deep navy ground, Pact blue accent) is the reference; this is a personal tool, not a marketing surface. No game-like effects: no sounds, particles, odometers, banners or toasts (decided 2026-11-20). Motion only for data updates.

## Evidence on Hand

Real live data only: pact.fi /api/v1 (swaps, pools, analytics), Algorand indexer block headers, Binance ALGO price, Tinyman analytics API. Nothing synthetic is ever shown as real.

## Product Principles

1. Numbers first, and every number says what it counts and over what window.
2. One glance for the month, one scroll for the market, one tap for detail.
3. Name the actor: flow is attributed to the bot, router or wallet that sent it.
4. Show the gap: where volume trades elsewhere and Pact could capture it.
5. Quiet by default; nothing moves unless the data changed.
