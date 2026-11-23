// Liquidity flows: who added or removed liquidity, in which pool, how much.
//
//   clMM      every PositionMinted / PositionBurned (all sizes)
//   weighted  every LiquidityAdded / LiquidityRemoved of $1K+
//   classic   LP-token mints / burns of $1K+ in pools holding $1K+ (checked every 30 min)
//
// Weighted and clMM pools keep their funds in the shared Vault app, so one indexer query
// for transactions touching the Vault (paged forward from a saved round) catches every
// add and remove in both; the pool's ARC-28 event carries the provider and both amounts.
// Classic pools predate the Vault and log no events, so their LP token is watched
// instead: the pool minting LP to a wallet is an add, a wallet sending LP back is a
// remove. Amounts are valued with prices from Pact's own pool reserves (hourly snapshot).
import { createHash } from 'node:crypto';
import { appAddress } from './rewards.mjs';
import { dayStart, pairName } from './market.mjs';

const IDX = 'https://mainnet-idx.algonode.cloud';
const ALGOD = 'https://mainnet-api.algonode.cloud';
const VAULT = 3656084807;
const BIG = 1000; // USD floor for weighted and classic events
const KEEP_S = 35 * 86400;
const BACKFILL_S = 14 * 86400;
const VAULT_PAGES = Number(process.env.LQ_PAGES ?? 120);
const CLASSIC_EVERY_S = 1800;

const sel = (s) => createHash('sha512-256').update(s).digest().subarray(0, 4).toString('hex');
const SEL = {
	[sel('PositionMinted(address,uint64,uint64,uint80,uint64,uint64)')]: 'cl+',
	[sel('PositionBurned(address,uint64,uint64,uint64,uint64)')]: 'cl-',
	[sel('LiquidityAdded(address,uint64,uint64,uint64)')]: 'w+',
	[sel('LiquidityRemoved(address,uint64,uint64,uint64)')]: 'w-'
};

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function addr(pk) {
	const sum = createHash('sha512-256').update(pk).digest().subarray(28);
	let bits = 0, value = 0, out = '';
	for (const byte of Buffer.concat([pk, sum])) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += B32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += B32[(value << (5 - bits)) & 31];
	return out;
}
const u64 = (b, at) => Number(b.readBigUInt64BE(at));
const round2 = (v) => Math.round(v * 100) / 100;

/** Asset order of a weighted / clMM pool, read once from its global state. */
async function poolAssets(lq, getJSON, appId) {
	if (lq.pools[appId]) return lq.pools[appId];
	const app = await getJSON(`${ALGOD}/v2/applications/${appId}`);
	const g = {};
	for (const kv of app.params?.['global-state'] ?? []) if (kv.value.type === 2) g[Buffer.from(kv.key, 'base64').toString('latin1')] = kv.value.uint;
	const info = 'tick_spacing' in g ? { a: g.a ?? 0, b: g.b ?? 0, t: 'cl' } : { a: g.asset_a ?? 0, b: g.asset_b ?? 0, t: 'w' };
	lq.pools[appId] = info;
	return info;
}

/** Decimals for an asset: from the price table, else algod (cached). */
async function decimals(lq, px, getJSON, id) {
	if (px[id]?.[1] != null) return px[id][1];
	if (lq.dec[id] != null) return lq.dec[id];
	lq.dec[id] = id === 0 ? 6 : (await getJSON(`${ALGOD}/v2/assets/${id}`)).params.decimals;
	return lq.dec[id];
}

async function valueOf(lq, px, getJSON, a, amtA, b, amtB) {
	const [da, db] = [await decimals(lq, px, getJSON, a), await decimals(lq, px, getJSON, b)];
	const ha = amtA / 10 ** da, hb = amtB / 10 ** db;
	const pa = px[a]?.[0], pb = px[b]?.[0];
	const usd = pa == null && pb == null ? null : (pa ?? 0) * ha + (pb ?? 0) * hb;
	return { ha, hb, usd: usd == null ? null : round2(usd) };
}

export async function collectLiquidity(state, { getJSON, nowS }) {
	const lq = (state.lq ??= { v: 1, round: 0, from: 0, classicRound: 0, classicAt: 0, pools: {}, dec: {}, events: [], keys: {} });
	const px = state.mk?.px ?? {};
	const tip = (await getJSON(`${ALGOD}/v2/status`))['last-round'];
	if (!lq.round) {
		// First run: backfill two weeks (~2.8 s rounds).
		lq.round = tip - Math.round(BACKFILL_S / 2.8);
		lq.classicRound = lq.round;
		lq.from = nowS - BACKFILL_S;
	}
	const add = (key, ev) => {
		if (lq.keys[key]) return false;
		lq.keys[key] = ev[0];
		lq.events.push(ev);
		return true;
	};

	// ─── weighted + clMM, via the Vault ───
	let next = null, pages = 0, last = lq.round, found = 0;
	do {
		const j = await getJSON(`${IDX}/v2/transactions?application-id=${VAULT}&min-round=${lq.round + 1}&limit=1000${next ? '&next=' + encodeURIComponent(next) : ''}`);
		pages++;
		for (const root of j.transactions ?? []) {
			last = Math.max(last, root['confirmed-round']);
			let n = 0;
			const walk = async (t) => {
				const call = t['application-transaction'];
				if (call) {
					for (const log of t.logs ?? []) {
						const b = Buffer.from(log, 'base64');
						const kind = SEL[b.subarray(0, 4).toString('hex')];
						if (!kind) continue;
						const pool = call['application-id'];
						const key = root.id + ':' + n++;
						const who = addr(b.subarray(4, 36));
						const pa = await poolAssets(lq, getJSON, pool);
						let amtA, amtB, ticks = null;
						if (kind === 'cl+') { amtA = u64(b, 62); amtB = u64(b, 70); ticks = [u64(b, 36), u64(b, 44)]; }
						else if (kind === 'cl-') { amtA = u64(b, 52); amtB = u64(b, 60); ticks = [u64(b, 36), u64(b, 44)]; }
						else if (kind === 'w+') { amtA = u64(b, 36); amtB = u64(b, 44); }
						else { amtA = u64(b, 44); amtB = u64(b, 52); }
						const v = await valueOf(lq, px, getJSON, pa.a, amtA, pa.b, amtB);
						const type = kind.startsWith('cl') ? 'cl' : 'w';
						if (type === 'w' && !(v.usd >= BIG)) continue;
						if (add(key, [root['round-time'], kind.endsWith('+') ? 1 : -1, String(pool), who, v.ha, v.hb, v.usd, type, root.id, ticks])) found++;
					}
				}
				for (const inner of t['inner-txns'] ?? []) await walk(inner);
			};
			await walk(root);
		}
		next = j.transactions?.length ? j['next-token'] : null;
	} while (next && pages < VAULT_PAGES);
	// A capped scan re-reads its last round next time (events are de-duplicated by key).
	lq.round = next ? last - 1 : last;
	const log = [`vault ${pages} page(s), +${found} event(s)${next ? ' (catching up)' : ''}`];

	// ─── classic pools, via their LP token (every 30 min) ───
	if (nowS - lq.classicAt >= CLASSIC_EVERY_S && state.mk?.snap?.pact) {
		const pools = state.mk.snap.pact.filter((p) => p[1] === 'cp' && p[7] >= BIG && p[12] && p[13] > 0);
		let cfound = 0;
		for (const p of pools) {
			const [poolId, , , , , , , tvl, , , , , lp, supply] = p;
			const poolAddr = appAddress(Number(poolId));
			let nx = null, pg = 0;
			do {
				const j = await getJSON(`${IDX}/v2/assets/${lp}/transactions?min-round=${lq.classicRound + 1}&limit=1000${nx ? '&next=' + encodeURIComponent(nx) : ''}`);
				pg++;
				for (const root of j.transactions ?? []) {
					let n = 0;
					const walk = (t) => {
						const x = t['asset-transfer-transaction'];
						if (x && x['asset-id'] === Number(lp) && x.amount > 0) {
							const k = root.id + ':lp' + n++;
							const isAdd = t.sender === poolAddr && x.receiver !== poolAddr;
							const isRem = x.receiver === poolAddr && t.sender !== poolAddr;
							const usd = round2((x.amount / supply) * tvl);
							if ((isAdd || isRem) && usd >= BIG && add(k, [root['round-time'], isAdd ? 1 : -1, String(poolId), isAdd ? x.receiver : t.sender, null, null, usd, 'cp', root.id, null])) cfound++;
						}
						for (const inner of t['inner-txns'] ?? []) walk(inner);
					};
					walk(root);
				}
				nx = j.transactions?.length ? j['next-token'] : null;
			} while (nx && pg < 5);
		}
		lq.classicRound = tip;
		lq.classicAt = nowS;
		log.push(`classic ${pools.length} pool(s), +${cfound} event(s)`);
	}

	// Keep 35 days.
	const cut = nowS - KEEP_S;
	lq.events = lq.events.filter((e) => e[0] >= cut).sort((x, y) => x[0] - y[0]);
	for (const [k, ts] of Object.entries(lq.keys)) if (ts < cut) delete lq.keys[k];
	return log.join(', ');
}

/** The liquidity section of market.json. */
export function buildLiquidity(state, nowS) {
	const lq = state.lq;
	if (!lq) return null;
	const px = state.mk?.px ?? {};
	const snap = new Map((state.mk?.snap?.pact ?? []).map((p) => [String(p[0]), p]));
	const today = dayStart(nowS);
	const pools = {};
	// Symbols by asset id: the snapshot's own pairs first, then the price table.
	const symOf = {};
	for (const p of snap.values()) {
		symOf[p[4]] = p[3];
		symOf[p[6]] = p[5];
	}
	const sym = (a) => symOf[String(a)] ?? px[String(a)]?.[2] ?? (Number(a) === 0 ? 'ALGO' : String(a));
	// [pair label (quote last), symbol of the pool's asset a, of asset b, type, fee bps, TVL]
	const label = (id) => {
		if (pools[id]) return;
		const s = snap.get(id), pa = lq.pools[id];
		const [x, y] = pa ? [sym(pa.a), sym(pa.b)] : s ? [s[3], s[5]] : ['?', '?'];
		const [q1, q2] = pairName(x, y);
		pools[id] = [x === '?' ? 'Pool ' + id : q1 + '/' + q2, x, y, s?.[1] ?? pa?.t ?? null, s?.[2] ?? null, s?.[7] ?? null];
	};
	const win = (from) => {
		const by = new Map();
		for (const e of lq.events) {
			if (e[0] < from) continue;
			const r = by.get(e[2]) ?? { add: 0, rem: 0, na: 0, nr: 0, lps: new Set(), type: e[7] };
			if (e[1] > 0) { r.add += e[6] ?? 0; r.na++; } else { r.rem += e[6] ?? 0; r.nr++; }
			r.lps.add(e[3]);
			by.set(e[2], r);
		}
		return [...by.entries()].map(([id, r]) => (label(id), [id, round2(r.add), round2(r.rem), r.na, r.nr, r.lps.size, r.type])).sort((x, y) => y[1] + y[2] - (x[1] + x[2]));
	};
	const daily = [];
	for (let d = today - 29 * 86400; d <= today; d += 86400) daily.push([d, 0, 0, 0, 0, 0, 0]);
	const col = { cl: 1, w: 3, cp: 5 };
	for (const e of lq.events) {
		const i = Math.floor((dayStart(e[0]) - daily[0][0]) / 86400);
		if (i < 0 || i >= daily.length) continue;
		daily[i][col[e[7]] + (e[1] > 0 ? 0 : 1)] = round2(daily[i][col[e[7]] + (e[1] > 0 ? 0 : 1)] + (e[6] ?? 0));
	}
	const events = lq.events.slice(-400).reverse();
	for (const e of events) label(e[2]);
	const windows = { '24h': win(nowS - 86400), '7d': win(today - 6 * 86400), '30d': win(today - 29 * 86400) };
	// Per wallet: [address, added $, removed $, adds, removes, pools, last action ts, [busiest pool ids], {type: [added, removed, adds, removes]}]
	const wal = (from) => {
		const by = new Map();
		for (const e of lq.events) {
			if (e[0] < from) continue;
			const r = by.get(e[3]) ?? { add: 0, rem: 0, na: 0, nr: 0, pools: new Map(), last: 0, t: {} };
			if (e[1] > 0) { r.add += e[6] ?? 0; r.na++; } else { r.rem += e[6] ?? 0; r.nr++; }
			const tt = (r.t[e[7]] ??= [0, 0, 0, 0]);
			if (e[1] > 0) { tt[0] += e[6] ?? 0; tt[2]++; } else { tt[1] += e[6] ?? 0; tt[3]++; }
			r.pools.set(e[2], (r.pools.get(e[2]) ?? 0) + (e[6] ?? 0));
			r.last = Math.max(r.last, e[0]);
			by.set(e[3], r);
		}
		return [...by.entries()]
			.map(([a, r]) => {
				const top = [...r.pools.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([id]) => id);
				top.forEach(label);
				const t = Object.fromEntries(Object.entries(r.t).map(([k, v]) => [k, [round2(v[0]), round2(v[1]), v[2], v[3]]]));
				return [a, round2(r.add), round2(r.rem), r.na, r.nr, r.pools.size, r.last, top, t];
			})
			.sort((x, y) => y[1] + y[2] - (x[1] + x[2]))
			.slice(0, 80);
	};
	const wallets = { '24h': wal(nowS - 86400), '7d': wal(today - 6 * 86400), '30d': wal(today - 29 * 86400) };
	// For the live page: the Vault round scanned up to, each pool's asset order, and token
	// prices/decimals, so it can decode and value new events itself between collector runs.
	const pa = Object.fromEntries(Object.entries(lq.pools).map(([id, v]) => [id, [v.a, v.b, v.t]]));
	const assets = {};
	for (const v of Object.values(lq.pools)) {
		for (const a of [v.a, v.b]) {
			const k = String(a), p = px[k];
			if (!assets[k]) assets[k] = [p?.[0] ?? null, p?.[1] ?? lq.dec[k] ?? (a === 0 ? 6 : null), p?.[2] ?? (a === 0 ? 'ALGO' : null)];
		}
	}
	return { from: lq.from, big: BIG, round: lq.round, pa, assets, wallets, events: events.map((e) => [e[0], e[1], e[2], e[3], e[4] == null ? null : Number(e[4].toPrecision(6)), e[5] == null ? null : Number(e[5].toPrecision(6)), e[6], e[7], e[8], e[9]]), windows, daily, pools };
}
