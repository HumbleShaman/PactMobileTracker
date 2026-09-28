#!/usr/bin/env node
// Pact fee collector.
//
// Tallies total and protocol swap fees across every Pact pool from the
// pact.fi swaps feed, pricing each swap's fee with that pool's ON-CHAIN fee
// split, and writes a compact feed.json for the phone widget.
//
// Why not just read /api/v1/analytics: the indexer records protocol_fee = 0
// on constant-product pools (their PACT_FEE_BPS cut accrues inside the pool
// and is swept later), so its totals understate both protocol and total fees.
// Stableswap and weighted pools are recorded correctly, and the fee split read
// here reproduces those recorded values.
//
// Usage: node collector/collect.mjs [dataDir]   (default ./data)
// State lives in <dataDir>/state.json; output is <dataDir>/feed.json.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { poolFeeSplit, swapFees, HOUR_S } from './fees.mjs';

const API = 'https://pact.fi/api/v1';
const ALGOD = 'https://mainnet-api.algonode.cloud';
const CHAIN = 'algorand-mainnet';

/** Tracking starts at local midnight, Sep 28 2026 (UTC+7), per Andrew. */
const GENESIS_S = Date.parse('2026-09-28T00:00:00+07:00') / 1000;
/** Re-scan this far behind the newest processed swap to catch late-indexed rows. */
const OVERLAP_MS = 20 * 60_000;
/** Re-read a trading pool's fee config from chain this often (admins can change it). */
const POOL_TTL_S = 24 * 3600;
/** Hourly rows kept this long in feed.json; older history is folded into daily rows. */
const HOURLY_KEEP_S = 14 * 86400;
/** Pools that traded this recently ship their fee split so the phone can price fresh swaps. */
const POOL_EXPORT_S = 7 * 86400;
const RECENT_N = 40;
const PAGE = 100;
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 2000);
/** Spacing between requests — the pact.fi API allows 20 rps per IP; stay far below. */
const GAP_MS = 200;

const dir = path.resolve(process.argv[2] ?? 'data');
const statePath = path.join(dir, 'state.json');
const feedPath = path.join(dir, 'feed.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastReq = 0;

async function getJSON(url) {
	for (let attempt = 0; ; attempt++) {
		const wait = lastReq + GAP_MS - Date.now();
		if (wait > 0) await sleep(wait);
		lastReq = Date.now();
		let res;
		try {
			res = await fetch(url, { headers: { 'user-agent': 'PactMobileTracker/1 (+github.com/HumbleShaman/PactMobileTracker)' } });
		} catch (e) {
			if (attempt >= 5) throw e; // network error — retry with backoff
		}
		if (res?.ok) return await res.json();
		// 4xx other than 429 won't fix itself; don't burn retries on it.
		if (res && res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status} ${url}`);
		if (attempt >= 5) throw new Error(`HTTP ${res?.status ?? 'network'} ${url}`);
		await sleep(1000 * 2 ** attempt);
	}
}

async function loadState() {
	try {
		const s = JSON.parse(await readFile(statePath, 'utf8'));
		if (s.v === 1 && s.genesis === GENESIS_S) return s;
		console.warn('state.json is from a different genesis/version — starting fresh');
	} catch {
		/* first run */
	}
	return { v: 1, genesis: GENESIS_S, cursorTs: 0, seen: {}, hours: {}, pools: {}, recent: [], outliers: [] };
}

/** Fee split for a pool, cached in state and refreshed daily from global state. */
async function poolConfig(state, poolId, nowS) {
	const cached = state.pools[poolId];
	if (cached && nowS - cached.at < POOL_TTL_S) return cached;
	try {
		const app = await getJSON(`${ALGOD}/v2/applications/${poolId}`);
		const gs = {};
		for (const kv of app.params?.['global-state'] ?? []) {
			if (kv.value.type === 2) gs[Buffer.from(kv.key, 'base64').toString('latin1')] = kv.value.uint;
		}
		const split = poolFeeSplit(gs);
		const next = { fee: split?.fee ?? null, pact: split?.pact ?? null, at: nowS, last: cached?.last ?? 0 };
		state.pools[poolId] = next;
		return next;
	} catch (e) {
		console.warn(`pool ${poolId}: config read failed (${e.message}) — using ${cached?.fee != null ? 'cached split' : 'recorded fees'}`);
		// Negative-cache for an hour so one bad pool doesn't cost a read per swap.
		const next = cached ?? { fee: null, pact: null, last: 0 };
		next.at = nowS - POOL_TTL_S + 3600;
		state.pools[poolId] = next;
		return next;
	}
}

function recentRow(s, fee, proto) {
	return {
		id: s.id,
		ts: s.ts,
		pool: s.poolId,
		a: s.tokenIn?.symbol ?? '?',
		b: s.tokenOut?.symbol ?? '?',
		usd: round(s.usdValue, 4),
		fee: round(fee, 6),
		proto: round(proto, 6)
	};
}

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

async function collect() {
	const state = await loadState();
	const nowS = Math.floor(Date.now() / 1000);
	const genesisMs = GENESIS_S * 1000;
	const stopMs = Math.max(genesisMs, state.cursorTs - OVERLAP_MS);

	let cursor = null;
	let pages = 0;
	let added = 0;
	let newest = state.cursorTs;
	const fresh = [];

	outer: while (pages < MAX_PAGES) {
		const q = `${API}/swaps?chain=${CHAIN}&limit=${PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
		const res = await getJSON(q);
		pages++;
		const rows = res.data ?? [];
		for (const s of rows) {
			if (s.ts < stopMs) break outer;
			if (state.seen[s.id]) continue;
			const cfg = await poolConfig(state, s.poolId, nowS);
			const f = swapFees(s, cfg);
			if (f.outlier) state.outliers.push({ id: s.id, pool: s.poolId, usd: s.usdValue, ts: s.ts });
			const hour = Math.floor(s.ts / 1000 / HOUR_S) * HOUR_S;
			const b = (state.hours[hour] ??= [0, 0, 0, 0]);
			b[0] += f.total;
			b[1] += f.proto;
			b[2] += 1;
			b[3] += f.usd;
			state.seen[s.id] = s.ts;
			cfg.last = Math.max(cfg.last ?? 0, Math.floor(s.ts / 1000));
			if (s.ts > newest) newest = s.ts;
			fresh.push(recentRow(s, f.total, f.proto));
			added++;
		}
		cursor = res.meta?.page?.nextCursor;
		if (!cursor || rows.length === 0) break;
		if (pages % 50 === 0) console.log(`…${pages} pages, ${added} swaps, at ${new Date(rows.at(-1).ts).toISOString()}`);
	}
	if (pages >= MAX_PAGES) console.warn(`hit MAX_PAGES=${MAX_PAGES}; older swaps left for the next run`);

	state.cursorTs = newest;
	// Keep dedupe ids only for the overlap window the next run will re-scan.
	const keepFrom = newest - OVERLAP_MS - 60_000;
	for (const [id, ts] of Object.entries(state.seen)) if (ts < keepFrom) delete state.seen[id];
	state.recent = [...fresh, ...state.recent].sort((x, y) => y.ts - x.ts).slice(0, RECENT_N);
	state.outliers = state.outliers.slice(-50);
	state.updatedAt = nowS;

	await mkdir(dir, { recursive: true });
	await writeFile(statePath, JSON.stringify(state));
	const feed = buildFeed(state, nowS);
	await writeFile(feedPath, JSON.stringify(feed));
	console.log(
		`+${added} swaps over ${pages} page(s). Since genesis: total $${feed.total.toFixed(2)}, protocol $${feed.protocol.toFixed(2)}, ${feed.swaps} swaps. Feed ${(JSON.stringify(feed).length / 1024).toFixed(1)} KB.`
	);
}

function buildFeed(state, nowS) {
	const hours = Object.entries(state.hours)
		.map(([t, b]) => [Number(t), ...b])
		.filter(([t]) => t >= state.genesis)
		.sort((x, y) => x[0] - y[0]);

	let total = 0, protocol = 0, swaps = 0, volume = 0;
	const series = [];
	const cutoff = nowS - HOURLY_KEEP_S;
	let day = null;
	for (const [t, fee, proto, n, usd] of hours) {
		total += fee;
		protocol += proto;
		swaps += n;
		volume += usd;
		if (t >= cutoff) {
			series.push([t, round(fee, 4), round(proto, 4), n]);
		} else {
			// Fold into daily rows keyed at the day's first hour (relative to genesis,
			// so days line up with the tracking start rather than UTC midnight).
			const d = state.genesis + Math.floor((t - state.genesis) / 86400) * 86400;
			if (!day || day[0] !== d) series.push((day = [d, 0, 0, 0]));
			day[1] = round(day[1] + fee, 4);
			day[2] = round(day[2] + proto, 4);
			day[3] += n;
		}
	}

	const pools = {};
	for (const [id, c] of Object.entries(state.pools)) {
		if (c.fee != null && c.last >= nowS - POOL_EXPORT_S) pools[id] = [c.fee, round(c.pact, 4)];
	}

	return {
		v: 1,
		updatedAt: nowS,
		genesis: state.genesis,
		cursorTs: state.cursorTs,
		/** series rows at or after this are hourly; earlier rows are daily. */
		hourlyFrom: cutoff,
		total: round(total, 4),
		protocol: round(protocol, 4),
		swaps,
		volume: round(volume, 2),
		series,
		pools,
		recent: state.recent,
		outliers: state.outliers.length
	};
}

collect().catch((e) => {
	console.error(e);
	process.exit(1);
});
