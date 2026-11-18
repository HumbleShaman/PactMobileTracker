// Block rewards: ALGO paid to Pact accounts for proposing Algorand blocks.
//
// Pact accounts that hold ALGO can register online for consensus and earn
// proposer payouts. Today that is the shared Vault (custody for the weighted
// and clMM pools) and several classic pool accounts. Once a day the collector
// refreshes which accounts to watch; every run it reads the block headers they
// proposed since the last run. Rewards are tallied in ALGO, separately from
// swap fees.

import { createHash } from 'node:crypto';
import { periodStart } from './period.mjs';

const IDX = 'https://mainnet-idx.algonode.cloud';
const ALGOD = 'https://mainnet-api.algonode.cloud';
/** Re-discover the online Pact accounts this often. */
const WATCH_TTL_S = 86400;
/** Pool accounts holding less ALGO than this are skipped (earning needs 30K). */
const MIN_ALGO = 1000;
const RECENT_N = 12;
const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buf) {
	let out = '', bits = 0, val = 0;
	for (const b of buf) {
		val = ((val << 8) | b) & 0x1fff;
		bits += 8;
		while (bits >= 5) {
			out += B32[(val >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits) out += B32[(val << (5 - bits)) & 31];
	return out;
}

/** Algorand address of an application account. */
export function appAddress(id) {
	const pre = Buffer.alloc(13);
	pre.write('appID', 0, 'latin1');
	pre.writeBigUInt64BE(BigInt(id), 5);
	const pk = createHash('sha512-256').update(pre).digest();
	return base32(Buffer.concat([pk, createHash('sha512-256').update(pk).digest().subarray(28)]));
}

function rewardsState(state) {
	// v2 keeps per-account totals per month (`am`); older state rebuilds from genesis.
	if (state.rw?.v !== 2) state.rw = { v: 2, round: 0, watch: {}, watchAt: 0, hours: {}, am: {}, recent: [] };
	return state.rw;
}

/**
 * Refresh the watch list: classic/stable pool accounts holding ALGO, plus the
 * vault behind weighted and clMM pools, kept if they are online or have ever
 * proposed a block. Accounts stay watched once added. Returns newly added addresses.
 */
async function refreshWatch(state, nowS, { getJSON, api, chain, poolConfig }) {
	const rw = rewardsState(state);
	if (nowS - rw.watchAt < WATCH_TTL_S) return [];
	const cand = new Map();
	let cursor = null;
	for (;;) {
		const res = await getJSON(`${api}/pools?chain=${chain}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
		for (const p of res.data ?? []) {
			const side = p.tokenA?.assetId === '0' ? 'A' : p.tokenB?.assetId === '0' ? 'B' : null;
			if (!side || Number(p[`reserve${side}`]) / 1e6 < MIN_ALGO) continue;
			if (p.protocol === 'constant_product' || p.protocol === 'stableswap') {
				cand.set(appAddress(p.poolId), { label: `${p.tokenA.symbol}/${p.tokenB.symbol} pool`, id: p.poolId });
			} else {
				const cfg = await poolConfig(state, p.poolId, nowS);
				if (cfg.vault) cand.set(appAddress(cfg.vault), { label: 'Vault', id: String(cfg.vault) });
			}
		}
		cursor = res.meta?.page?.nextCursor;
		if (!cursor || !res.data?.length) break;
	}
	// Same pair twice (e.g. two ALGO/goBTC pools): tell them apart by app id.
	const seen = {};
	for (const c of cand.values()) seen[c.label] = (seen[c.label] ?? 0) + 1;
	for (const c of cand.values()) if (seen[c.label] > 1) c.label += ` #${c.id.slice(-4)}`;

	const added = [];
	for (const [addr, c] of cand) {
		if (rw.watch[addr]) {
			rw.watch[addr] = c.label;
			continue;
		}
		try {
			const a = await getJSON(`${ALGOD}/v2/accounts/${addr}?exclude=all`);
			if (a.status === 'Online' || a['last-proposed']) {
				rw.watch[addr] = c.label;
				added.push(addr);
			}
		} catch (e) {
			console.warn(`rewards: account ${addr} unreadable (${e.message})`);
		}
	}
	rw.watchAt = nowS;
	if (added.length) console.log(`rewards: watching ${added.length} more account(s): ${added.map((a) => rw.watch[a]).join(', ')}`);
	return added;
}

/** Add every block proposed by `addrs` in `range` (an indexer query fragment). */
async function scan(state, addrs, range, getJSON, advance) {
	const rw = state.rw;
	let next = null, n = 0;
	do {
		const res = await getJSON(`${IDX}/v2/block-headers?proposers=${addrs.join(',')}&${range}&limit=1000${next ? `&next=${next}` : ''}`);
		for (const b of res.blocks ?? []) {
			const pay = (b['proposer-payout'] ?? 0) / 1e6; // omitted when 0
			const hour = Math.floor(b.timestamp / 3600) * 3600;
			const hb = (rw.hours[hour] ??= [0, 0]);
			hb[0] += pay;
			hb[1] += 1;
			const ab = ((rw.am[periodStart(b.timestamp, state.genesis)] ??= {})[b.proposer] ??= [0, 0]);
			ab[0] += pay;
			ab[1] += 1;
			rw.recent.push([b.round, b.timestamp, round(pay, 6), b.proposer]);
			if (advance) rw.round = Math.max(rw.round, b.round);
			n++;
		}
		next = res['next-token'];
		if (!res.blocks?.length) break;
	} while (next);
	rw.recent = rw.recent.sort((x, y) => y[0] - x[0]).slice(0, RECENT_N);
	return n;
}

export async function collectRewards(state, nowS, deps) {
	const rw = rewardsState(state);
	const added = await refreshWatch(state, nowS, deps);
	const since = `after-time=${new Date(state.genesis * 1000).toISOString()}`;
	// A newly watched account's earlier blocks, up to where the main scan already is.
	if (rw.round && added.length) await scan(state, added, `${since}&max-round=${rw.round}`, deps.getJSON, false);
	const all = Object.keys(rw.watch);
	if (!all.length) return 0;
	return scan(state, all, rw.round ? `min-round=${rw.round + 1}` : since, deps.getJSON, true);
}

/**
 * Block rewards for the feed. `feed` is the current month (counts, accounts) plus
 * the shared series window: hourly from `hourlyFrom` (even before this month, for
 * the 24h and 14-day views), daily for the rest of this month. `months` maps each
 * period start to [algo, blocks]; `all` is since tracking began.
 */
export function rewardsFeed(state, hourlyFrom, m0) {
	const rw = state.rw;
	if (!rw) return null;
	const label = (addr) => rw.watch[addr] ?? addr.slice(0, 6) + '…';
	const months = new Map();
	const all = [0, 0];
	const series = [];
	let day = null;
	for (const [t, [a, n]] of Object.entries(rw.hours).map(([t, b]) => [Number(t), b]).sort((x, y) => x[0] - y[0])) {
		if (t < state.genesis) continue;
		const ms = periodStart(t, state.genesis);
		if (!months.has(ms)) months.set(ms, [0, 0]);
		months.get(ms)[0] += a;
		months.get(ms)[1] += n;
		all[0] += a;
		all[1] += n;
		if (t >= hourlyFrom) series.push([t, round(a, 4), n]);
		else if (t >= m0) {
			const d = m0 + Math.floor((t - m0) / 86400) * 86400;
			if (!day || day[0] !== d) series.push((day = [d, 0, 0]));
			day[1] = round(day[1] + a, 4);
			day[2] += n;
		}
	}
	const cur = months.get(m0) ?? [0, 0];
	return {
		months,
		all,
		feed: {
			algo: round(cur[0], 4),
			blocks: cur[1],
			round: rw.round,
			series,
			accounts: Object.entries(rw.am[m0] ?? {})
				.map(([addr, [a, n]]) => [label(addr), addr, round(a, 4), n])
				.sort((x, y) => y[2] - x[2]),
			recent: rw.recent.map(([r, ts, a, addr]) => [r, ts, a, label(addr)]),
			/** address → label of every watched account, so live views can poll for new blocks. */
			watch: rw.watch
		}
	};
}
