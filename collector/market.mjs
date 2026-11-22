// Market rollups for the dashboard: who trades, in which pools, which tokens
// flow which way, trade sizes, when, and the biggest trades. Plus an hourly
// snapshot of Pact's and Tinyman's pools for the "vs Tinyman" gap view.
//
// Every swap the fee collector reads also lands here (marketSwap). A backfill
// walks the swaps feed further back, a slice per run, until 30 days are
// covered (backfillMarket). Buckets: one per local day (UTC+7) for 35 days,
// and one per hour for the last 26 hours, so "24h" windows are exact.
//
// Output: market.json (buildMarket), read only by the live page.

import { TZ_S } from './period.mjs';
import { LINES, classify, isInner, resolveActors } from './actors.mjs';

const DAY_KEEP = 35;
const HOUR_KEEP_S = 26 * 3600;
const BACKFILL_DAYS = 30;
/** Backfill pages per run (~1.7 s each). Keeps a run well inside the job timeout. */
const BF_PAGES = Number(process.env.BF_PAGES ?? 150);
const SNAP_EVERY_S = 3600;
/** Trade-size buckets: < $1, < $10, < $100, < $1K, < $10K, $10K+. */
const SIZE_EDGES = [1, 10, 100, 1000, 10000];
const TINYMAN = 'https://mainnet.analytics.tinyman.org/api/v1';
const IDX = 'https://mainnet-idx.algonode.cloud';

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;
export const dayStart = (t) => Math.floor((t + TZ_S) / 86400) * 86400 - TZ_S;

const newBucket = (withHours) => {
	const b = { v: [0, 0, 0, 0], p: {}, a: {}, ap: {}, t: {}, z: SIZE_EDGES.map(() => [0, 0]).concat([[0, 0]]) };
	if (withHours) b.h = Array.from({ length: 24 }, () => [0, 0]);
	return b;
};

export function initMarket(state) {
	if (state.mk?.v === 1) return false;
	// Live aggregation starts at this run's re-scan floor; the backfill covers
	// everything before it (see collect.mjs: the first run counts seen swaps too).
	const since = Math.max(state.genesis * 1000, state.cursorTs - 20 * 60_000);
	const to = (dayStart(Math.floor(Date.now() / 1000)) - (BACKFILL_DAYS - 1) * 86400) * 1000;
	state.mk = { v: 1, since, bf: { cursor: null, done: false, to, at: since }, days: {}, hours: {}, actors: {}, ids: {}, addr: [], pn: {}, big: [], snap: null, share: {} };
	return true;
}

function add(B, s, f, aid, hod) {
	const usd = f.usd;
	B.v[0] += usd;
	B.v[1] += f.total;
	B.v[2] += f.proto;
	B.v[3] += 1;
	const p = (B.p[s.poolId] ??= [0, 0, 0, 0]);
	p[0] += usd;
	p[1] += f.total;
	p[2] += f.proto;
	p[3] += 1;
	const a = (B.a[aid] ??= [0, 0, 0, 0]);
	a[0] += usd;
	a[1] += 1;
	a[2] += f.total;
	const e = (B.ap[aid + '>' + s.poolId] ??= [0, 0]);
	e[0] += usd;
	e[1] += 1;
	// The trader sells tokenIn into the pool and buys tokenOut from it.
	const ti = s.tokenIn, to = s.tokenOut;
	if (ti) {
		const r = (B.t[ti.assetId] ??= [ti.symbol ?? '?', 0, 0, 0]);
		r[2] += usd;
		r[3] += 1;
	}
	if (to) {
		const r = (B.t[to.assetId] ??= [to.symbol ?? '?', 0, 0, 0]);
		r[1] += usd;
		r[3] += 1;
	}
	let i = SIZE_EDGES.findIndex((x) => usd < x);
	if (i < 0) i = SIZE_EDGES.length;
	B.z[i][0] += 1;
	B.z[i][1] += usd;
	if (B.h && hod != null) {
		B.h[hod][0] += 1;
		B.h[hod][1] += usd;
	}
}

/** Pair label for a pool, quote token last (ALGO/USDC, not USDC/ALGO). */
const QUOTE = ['USDC', 'USDt', 'ALGO', 'xALGO', 'TALGO', 'goBTC', 'goETH'];
export function pairName(x, y) {
	const qx = QUOTE.indexOf(x), qy = QUOTE.indexOf(y);
	const xq = qx < 0 ? 99 : qx, yq = qy < 0 ? 99 : qy;
	return xq < yq ? [y, x] : [x, y];
}

/** Fold one swap into the rollups. f = swapFees() result. */
export function marketSwap(state, s, f, nowS) {
	const mk = state.mk;
	if (f.outlier) return;
	const t = Math.floor(s.ts / 1000);
	const d = dayStart(t);
	const snd = s.sender ?? '?';
	// Buckets key senders by a short id (addresses are 58 characters).
	let aid = mk.ids[snd];
	if (aid == null) {
		aid = mk.ids[snd] = mk.addr.length;
		mk.addr.push(snd);
	}
	add((mk.days[d] ??= newBucket(true)), s, f, aid, Math.floor((t - d) / 3600));
	if (t >= nowS - HOUR_KEEP_S) add((mk.hours[Math.floor(t / 3600) * 3600] ??= newBucket(false)), s, f, aid);

	const m = (mk.actors[snd] ??= { inner: false });
	if (isInner(s.id)) m.inner = true;
	if (m.inner && m.app == null && !m.tx) m.tx = s.txId;
	m.last = Math.max(m.last ?? 0, t);
	m.first = Math.min(m.first ?? t, t);

	if (!mk.pn[s.poolId] && s.tokenIn && s.tokenOut) mk.pn[s.poolId] = pairName(s.tokenIn.symbol ?? '?', s.tokenOut.symbol ?? '?');

	if (f.usd >= 25 && t >= nowS - 7 * 86400) mk.big.push([t, round(f.usd, 2), s.poolId, s.tokenIn?.symbol ?? '?', s.tokenOut?.symbol ?? '?', snd, round(f.total, 4)]);
}

/** Walk the swaps feed further back, a slice per run, until 30 days are covered. */
export async function backfillMarket(state, ctx) {
	const { getJSON, api, chain, poolConfig, swapFees, nowS } = ctx;
	const mk = state.mk, bf = mk.bf;
	if (bf.done) return { pages: 0, n: 0 };
	let pages = 0, n = 0;
	while (pages < BF_PAGES) {
		const res = await getJSON(`${api}/swaps?chain=${chain}&limit=100${bf.cursor ? `&cursor=${encodeURIComponent(bf.cursor)}` : ''}`);
		pages++;
		const rows = res.data ?? [];
		for (const s of rows) {
			if (s.ts < bf.to) {
				bf.done = true;
				break;
			}
			if (s.ts >= mk.since) continue; // counted live
			const cfg = await poolConfig(state, s.poolId, nowS);
			marketSwap(state, s, swapFees(s, cfg), nowS);
			bf.at = s.ts;
			n++;
		}
		if (bf.done) break;
		const next = res.meta?.page?.nextCursor;
		if (!next || !rows.length) {
			bf.done = true;
			break;
		}
		bf.cursor = next;
	}
	if (bf.done) bf.cursor = null;
	return { pages, n };
}

const PROTO = { constant_product: 'cp', managed_weighted: 'w', concentrated_liquidity: 'cl', stableswap: 'ss' };
const sig = (v) => (v ? Number(v.toPrecision(5)) : 0);

/** Hourly: Pact's pools (live TVL, 24h volume, APR) and Tinyman's busiest pools. */
export async function snapshotMarkets(state, getJSON, api, chain, nowS) {
	const mk = state.mk;
	if (mk.snap && nowS - mk.snap.at < SNAP_EVERY_S) return false;

	const pools = new Map();
	for (const sort of ['volume', 'tvl']) {
		const j = await getJSON(`${api}/pools?chain=${chain}&limit=${sort === 'volume' ? 300 : 200}&sort=${sort}`);
		for (const p of j.data ?? []) pools.set(p.poolId, p);
	}
	const pact = [...pools.values()]
		.filter((p) => (p.tvlUsd ?? 0) >= 50 || (p.volume24hUsd ?? 0) >= 1)
		.sort((x, y) => (y.volume24hUsd ?? 0) - (x.volume24hUsd ?? 0))
		.map((p, i) => [
			p.poolId,
			PROTO[p.protocol] ?? p.protocol,
			p.feeBps,
			p.tokenA?.symbol ?? '?',
			p.tokenA?.assetId ?? '?',
			p.tokenB?.symbol ?? '?',
			p.tokenB?.assetId ?? '?',
			round(p.tvlUsd ?? 0, 2),
			round(p.volume24hUsd ?? 0, 2),
			round(p.tradingAprFraction ?? 0, 5),
			round(p.farmAprFraction ?? 0, 5),
			i < 80 && p.priceSpark?.length ? p.priceSpark.map(sig) : null,
			p.lpToken?.assetId ?? null, // [12] LP asset (classic/weighted/stable)
			Number(p.totalLpSupply) || null // [13] LP supply, base units
		]);
	// USD per token from Pact's own reserves: a token's value share of its deepest
	// classic/weighted pool (clMM pools aren't value-balanced, so they're skipped).
	const px = {};
	for (const p of pools.values()) {
		if (p.protocol === 'concentrated_liquidity' || !(p.tvlUsd >= 100)) continue;
		const wA = p.weighted?.weightABps != null ? p.weighted.weightABps / 1e4 : 0.5;
		for (const [tok, res, w] of [[p.tokenA, p.reserveA, wA], [p.tokenB, p.reserveB, 1 - wA]]) {
			if (!tok) continue;
			const h = Number(res) / 10 ** (tok.decimals ?? 6);
			if (!(h > 0)) continue;
			const id = tok.assetId, cand = [sig((p.tvlUsd * w) / h), tok.decimals ?? 6, tok.symbol ?? '?', p.tvlUsd];
			if (!px[id] || px[id][3] < p.tvlUsd) px[id] = cand;
		}
	}
	px['31566704'] = [1, 6, 'USDC', Infinity];
	mk.px = Object.fromEntries(Object.entries(px).map(([id, v]) => [id, v.slice(0, 3)]));

	const an = await getJSON(`${api}/analytics?chain=${chain}&window=24h`);
	const pl = an.data?.platform ?? {};

	// Tinyman v2 (the main venue) plus the old v1.1 pools that still trade.
	const tm = [];
	for (const [ver, limit] of [['2.0', 100], ['1.1', 15]]) {
		const j = await getJSON(`${TINYMAN}/pools/?version__in=${ver}&ordering=-last_day_volume_in_usd&limit=${limit}`);
		for (const p of j.results ?? []) {
			const a = p.asset_1, b = p.asset_2;
			const under = (x) => (x.is_folks_lending_asset && x.folks_lending_pair_asset ? x.folks_lending_pair_asset.id : x.id);
			tm.push([
				p.address,
				p.version,
				a.unit_name ?? '?',
				a.id,
				b.unit_name ?? '?',
				b.id,
				round(+p.liquidity_in_usd || 0, 2),
				round(+p.last_day_volume_in_usd || 0, 2),
				round(+p.last_week_volume_in_usd || 0, 2),
				round(+p.last_day_fees_in_usd || 0, 2),
				round(+p.annual_percentage_rate || 0, 5),
				under(a),
				under(b)
			]);
		}
	}
	const tg = await getJSON(`${TINYMAN}/general-statistics/`);
	const tmTotal = { tvl: round(+tg.total_liquidity_in_usd || 0, 2), vol24: round(+tg.last_day_total_volume_in_usd || 0, 2) };
	const pactTotal = { tvl: round(pl.tvlUsd ?? 0, 2), vol24: round(pl.volume24hUsd ?? 0, 2), vol7d: round(pl.volume7dUsd ?? 0, 2) };

	mk.snap = { at: nowS, pact, tm, tmTotal, pactTotal };
	// Latest reading of each local day: a daily history of Pact's share.
	mk.share[dayStart(nowS)] = [pactTotal.vol24, tmTotal.vol24, pactTotal.tvl, tmTotal.tvl];
	return true;
}

/** Drop old buckets and trades, round what stays. */
export function pruneMarket(state, nowS) {
	const mk = state.mk;
	const d0 = dayStart(nowS) - (DAY_KEEP - 1) * 86400;
	for (const k of Object.keys(mk.days)) if (+k < d0) delete mk.days[k];
	for (const k of Object.keys(mk.hours)) if (+k < nowS - HOUR_KEEP_S) delete mk.hours[k];
	for (const k of Object.keys(mk.share)) if (+k < dayStart(nowS) - 120 * 86400) delete mk.share[k];
	mk.big = mk.big.filter((r) => r[0] >= nowS - 7 * 86400).sort((x, y) => y[1] - x[1]).slice(0, 30);
	for (const [a, m] of Object.entries(mk.actors)) if ((m.last ?? 0) < nowS - DAY_KEEP * 86400) delete mk.actors[a];
	// Closed buckets: fold small pools, tokens and sender→pool edges into '~'
	// (a day has hundreds of dust pools); record pools touched per sender first.
	const fold = (B, min) => {
		for (const key of Object.keys(B.ap)) if (!key.endsWith('>~')) B.a[key.split('>')[0]][3] += 1;
		const f = (o, vi, edge) => {
			for (const [id, v] of Object.entries(o)) {
				if (id === '~' || id.endsWith('>~') || v[vi] + (vi === 1 ? v[2] : 0) >= min) continue;
				const into = edge ? id.split('>')[0] + '>~' : '~';
				const w = (o[into] ??= v.map((x) => (typeof x === 'number' ? 0 : '~')));
				for (let i = 0; i < v.length; i++) if (typeof v[i] === 'number') w[i] += v[i];
				delete o[id];
			}
		};
		f(B.p, 0);
		f(B.ap, 0, true);
		f(B.t, 1);
		B.pr = 1;
	};
	for (const [k, B] of Object.entries(mk.days)) if (+k < dayStart(nowS) && !B.pr) fold(B, 5);
	for (const [k, B] of Object.entries(mk.hours)) if (+k < Math.floor(nowS / 3600) * 3600 && !B.pr) fold(B, 2);
	const r4 = (o) => {
		for (const v of Object.values(o)) for (let i = 0; i < v.length; i++) if (typeof v[i] === 'number') v[i] = round(v[i], 4);
	};
	for (const B of [...Object.values(mk.days), ...Object.values(mk.hours)]) {
		B.v = B.v.map((x) => round(x, 4));
		r4(B.p);
		r4(B.a);
		r4(B.ap);
		r4(B.t);
		B.z = B.z.map(([n, v]) => [n, round(v, 2)]);
		if (B.h) B.h = B.h.map(([n, v]) => [n, round(v, 2)]);
	}
}

export async function collectMarket(state, ctx) {
	const { getJSON, api, chain, nowS } = ctx;
	const log = [];
	try {
		const r = await backfillMarket(state, ctx);
		if (r.pages) log.push(`backfill ${r.n} swaps over ${r.pages} pages${state.mk.bf.done ? ' (done)' : ` (at ${new Date(state.mk.bf.at).toISOString()})`}`);
	} catch (e) {
		log.push(`backfill paused (${e.message})`);
	}
	try {
		const n = await resolveActors(state, getJSON, IDX);
		if (n) log.push(`resolved ${n} contract(s)`);
	} catch (e) {
		log.push(`actor lookup skipped (${e.message})`);
	}
	try {
		if (await snapshotMarkets(state, getJSON, api, chain, nowS)) log.push('pool snapshot');
	} catch (e) {
		log.push(`snapshot skipped (${e.message})`);
	}
	pruneMarket(state, nowS);
	return log.join(', ');
}

// ─── market.json ───

function merge(buckets) {
	const W = newBucket(false);
	for (const B of buckets) {
		for (let i = 0; i < 4; i++) W.v[i] += B.v[i];
		for (const key of ['p', 'a', 'ap', 't']) {
			for (const [k, v] of Object.entries(B[key])) {
				const w = W[key][k];
				if (!w) W[key][k] = v.slice();
				else for (let i = 0; i < v.length; i++) if (typeof v[i] === 'number') w[i] = key === 'a' && i === 3 ? Math.max(w[i], v[i]) : w[i] + v[i];
			}
		}
		B.z.forEach(([n, v], i) => {
			W.z[i][0] += n;
			W.z[i][1] += v;
		});
	}
	return W;
}

function windowOut(W, who, addrOf, poolsKeep) {
	const actors = Object.entries(W.a)
		.map(([id, [vol, n, fees, pools]]) => ({ addr: addrOf(id), vol, n, fees, pools, c: who(addrOf(id)) }))
		.sort((x, y) => y.vol - x.vol);
	const lines = {};
	for (const a of actors) {
		const l = (lines[a.c.line] ??= [0, 0, 0, 0]);
		l[0] += a.vol;
		l[1] += a.n;
		l[2] += a.fees;
		l[3] += 1;
	}
	const poolsBy = Object.entries(W.p).filter(([id]) => id !== '~').sort((x, y) => y[1][0] - x[1][0]);
	// Flow: line → pool volume, for the busiest pools; the rest fold into "other".
	const top = new Set(poolsBy.slice(0, poolsKeep).map(([id]) => id));
	const flow = {};
	const poolsPerActor = {};
	for (const [k, [vol, n]] of Object.entries(W.ap)) {
		if (k === '~') continue; // pre-fold buckets
		const [id, pool] = k.split('>');
		const addr = addrOf(id);
		if (pool !== '~') poolsPerActor[addr] = (poolsPerActor[addr] ?? 0) + 1;
		const key = who(addr).line + '>' + (top.has(pool) ? pool : 'other');
		const f = (flow[key] ??= [0, 0]);
		f[0] += vol;
		f[1] += n;
	}
	return {
		vol: round(W.v[0], 2),
		fees: round(W.v[1], 4),
		proto: round(W.v[2], 4),
		n: W.v[3],
		lines: Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, [round(v[0], 2), v[1], round(v[2], 4), v[3]]])),
		actors: actors.slice(0, 40).map((a) => [a.addr, round(a.vol, 2), a.n, round(a.fees, 4), Math.max(a.pools ?? 0, poolsPerActor[a.addr] ?? 0)]),
		flow: Object.entries(flow)
			.map(([k, [vol, n]]) => [...k.split('>'), round(vol, 2), n])
			.sort((x, y) => y[2] - x[2]),
		pools: poolsBy.slice(0, 160).map(([id, [vol, fee, proto, n]]) => [id, round(vol, 2), round(fee, 4), round(proto, 4), n]),
		tokens: Object.entries(W.t)
			.filter(([id]) => id !== '~')
			.map(([id, [sym, buy, sell, n]]) => [id, sym, round(buy, 2), round(sell, 2), n])
			.sort((x, y) => y[2] + y[3] - (x[2] + x[3]))
			.slice(0, 40),
		sizes: W.z.map(([n, v]) => [n, round(v, 2)])
	};
}

export function buildMarket(state, nowS) {
	const mk = state.mk;
	const today = dayStart(nowS);
	const days = Object.entries(mk.days).map(([k, B]) => [+k, B]).sort((x, y) => x[0] - y[0]);
	const hours = Object.entries(mk.hours).map(([k, B]) => [+k, B]).filter(([h]) => h >= Math.floor(nowS / 3600) * 3600 - 23 * 3600);

	// Swap counts over 7 days decide whether a wallet trades like a bot.
	const n7 = new Map();
	const addrOf = (id) => mk.addr[id] ?? '?';
	for (const [d, B] of days) if (d >= today - 6 * 86400) for (const [id, v] of Object.entries(B.a)) n7.set(addrOf(id), (n7.get(addrOf(id)) ?? 0) + v[1]);
	// "200+ swaps a week" pro-rates while the history is shorter than a week (fresh backfill).
	const coveredFrom = Math.floor((mk.bf.done ? mk.bf.to : Math.min(mk.bf.at, mk.since)) / 1000);
	const weekScale = 7 / Math.min(7, Math.max(1, (nowS - Math.max(coveredFrom, today - 6 * 86400)) / 86400));
	const cache = new Map();
	const who = (addr) => {
		if (!cache.has(addr)) cache.set(addr, classify(addr, mk.actors[addr], (n7.get(addr) ?? 0) * weekScale));
		return cache.get(addr);
	};

	/** Earliest moment the rollups cover: tracking start, or the backfill's reach. */
	const covered = Math.floor((mk.bf.done ? mk.bf.to : Math.min(mk.bf.at, mk.since)) / 1000);
	const win = (from, buckets) => ({ from: Math.max(from, covered), ...windowOut(merge(buckets), who, addrOf, 14) });
	const windows = {
		'24h': win(nowS - 86400, hours.map(([, B]) => B)),
		'7d': win(today - 6 * 86400, days.filter(([d]) => d >= today - 6 * 86400).map(([, B]) => B)),
		'30d': win(today - 29 * 86400, days.filter(([d]) => d >= today - 29 * 86400).map(([, B]) => B))
	};

	// Volume by line: daily for 30 days, hourly for the last 24 hours.
	const byLine = ([t, B]) => {
		const by = {};
		for (const [id, v] of Object.entries(B.a)) {
			const l = who(addrOf(id)).line;
			by[l] = round((by[l] ?? 0) + v[0], 2);
		}
		return [t, round(B.v[0], 2), round(B.v[1], 4), round(B.v[2], 4), B.v[3], by];
	};
	const series = days.filter(([d]) => d >= today - 29 * 86400).map(byLine);
	const hourly = hours.sort((x, y) => x[0] - y[0]).map(byLine);

	// Hour-of-week activity from the last 28 complete days (local time).
	const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => [0, 0]));
	const perDay = [0, 0, 0, 0, 0, 0, 0];
	let heatDays = 0;
	for (const [d, B] of days) {
		if (d < today - 28 * 86400 || d >= today || !B.h || d * 1000 < (mk.bf.done ? mk.bf.to : mk.bf.at)) continue;
		heatDays++;
		const wd = new Date((d + TZ_S) * 1000).getUTCDay(); // 0 = Sunday
		perDay[wd]++;
		B.h.forEach(([n, v], h) => {
			heat[wd][h][0] += n;
			heat[wd][h][1] += v;
		});
	}

	// Who's who for every sender in the output (and the live feed's labels).
	const seen = new Set();
	for (const w of Object.values(windows)) for (const a of w.actors) seen.add(a[0]);
	for (const [addr] of Object.entries(mk.actors).sort((x, y) => (y[1].last ?? 0) - (x[1].last ?? 0)).slice(0, 200)) seen.add(addr);
	for (const b of mk.big) seen.add(b[5]);
	const actors = {};
	for (const a of seen) {
		const c = who(a);
		const m = mk.actors[a] ?? {};
		actors[a] = [c.name, c.line, c.app ?? m.app ?? null, m.inner ? 1 : 0, m.via ?? null, m.creator ?? null, m.first ?? null];
	}

	// Pool labels and fee tiers for every pool the page will mention.
	const snapType = new Map((mk.snap?.pact ?? []).map((p) => [p[0], p]));
	const poolIds = new Set();
	for (const w of Object.values(windows)) {
		for (const p of w.pools) poolIds.add(p[0]);
		for (const f of w.flow) if (f[1] !== 'other') poolIds.add(f[1]);
	}
	for (const b of mk.big) poolIds.add(b[2]);
	const pools = {};
	for (const id of poolIds) {
		const s = snapType.get(id);
		const name = s ? pairName(s[3], s[5]) : mk.pn[id] ?? ['?', '?'];
		pools[id] = [name[0] + '/' + name[1], state.pools[id]?.fee ?? s?.[2] ?? null, s?.[1] ?? null];
	}

	return {
		v: 1,
		updatedAt: nowS,
		tz: TZ_S,
		coverage: { from: covered, done: mk.bf.done, target: Math.floor(mk.bf.to / 1000) },
		lines: LINES,
		windows,
		series,
		hourly,
		heat: { days: heatDays, perDay, cells: heat },
		big: mk.big.slice(0, 20),
		actors,
		pools,
		snap: mk.snap,
		share: Object.entries(mk.share)
			.map(([d, v]) => [+d, ...v])
			.sort((x, y) => x[0] - y[0])
	};
}
