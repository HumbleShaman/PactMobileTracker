// Who sends Pact's swaps.
//
// The pact.fi swaps feed names a `sender` per swap. For a swap made inside a
// contract call (swap id has an inner path, e.g. "67127933:36:7") that is the
// calling app's account, so routers and bot contracts show up under one
// address each. For a top-level swap it is the wallet that signed it.
//
// Known actors are named here and grouped into "lines": the fixed set of
// order-flow sources the dashboard draws, each with its own colour. Everything
// else lands on "Other bots" (contracts, and wallets trading like bots) or
// "Wallets". Unknown contracts are resolved to their app id once, via the
// indexer, so the roster can still say what they are.

import { appAddress } from './rewards.mjs';

/** Order-flow lines, in the fixed order the dashboard colours them. */
export const LINES = [
	{ key: 'hay', name: 'Hay router', kind: 'router', code: 'H', note: 'TxnLab Haystack aggregator; quotes Pact against every DEX' },
	{ key: 'nkbd', name: 'NKBD arb', kind: 'arb', code: 'N', note: 'Atomic Tinyman↔Pact arbitrage contract' },
	{ key: 'q6ww', name: 'Q6WW arb', kind: 'arb', code: 'Q', note: "Algorand's largest arbitrage wallet; trades every DEX" },
	{ key: 'rcfx', name: 'RCFX bot', kind: 'arb', code: 'R', note: 'Two bot contracts from one creator (RCFXKJ7J…)' },
	{ key: 'deflex', name: 'Deflex', kind: 'router', code: 'D', note: 'Deflex aggregator (Pera swap, Hay web)' },
	{ key: 'vestige', name: 'Vestige', kind: 'router', code: 'V', note: 'Vestige aggregator' },
	{ key: 'bots', name: 'Other bots', kind: 'bot', code: 'B', note: 'Other contracts, and wallets that trade like bots' },
	{ key: 'wallets', name: 'Wallets', kind: 'wallet', code: 'W', note: 'People and small scripts trading directly' }
];

/** A wallet with at least this many swaps in 7 days is treated as a bot. */
export const BOT_SWAPS_7D = 200;

const app = (id) => appAddress(id);

/** address → { name, line, app? } */
export const KNOWN = {
	[app(3757715482)]: { name: 'Hay router', line: 'hay', app: 3757715482 },
	[app(3279848327)]: { name: 'Hay router (old)', line: 'hay', app: 3279848327 },
	NKBDACORTZ7LGES4UUHLGQ6UE3WFG7YSMMP76YDWOFCAR5SPOEW447TBYU: { name: 'NKBD arb', line: 'nkbd', app: 3251784052 },
	[app(3251784052)]: { name: 'NKBD arb (app)', line: 'nkbd', app: 3251784052 },
	Q6WW3COZ5CIBLXF3F6ULOW3DTV3APR32FTSGGIXCSFIJRSDNFSU2P6PBP4: { name: 'Q6WW', line: 'q6ww' },
	[app(3770175877)]: { name: 'RCFX bot A', line: 'rcfx', app: 3770175877 },
	[app(3769757823)]: { name: 'RCFX bot B', line: 'rcfx', app: 3769757823 },
	[app(3172554435)]: { name: 'Deflex', line: 'deflex', app: 3172554435 },
	[app(1222048105)]: { name: 'Vestige', line: 'vestige', app: 1222048105 },
	PACTFIXB37PE7MGBKBCTXPDBSIQRAUMODTFS4RDZQS473PGETKYR6ETBCQ: { name: 'PACTFIXB…', line: 'wallets' }
};

/** Top-level apps that identify a router when a swap's caller is an unknown contract. */
const ROUTER_APPS = { 3757715482: 'hay', 3279848327: 'hay', 3172554435: 'deflex', 1222048105: 'vestige', 3251784052: 'nkbd' };

/** Is this swap made inside a contract call? */
export const isInner = (swapId) => (swapId.split(':')[2] ?? '') !== '';

/**
 * Line and display name for a sender.
 * meta: state.mk.actors[addr] ({ inner, app, creator }), swaps7d: swap count over 7 days.
 */
export function classify(addr, meta, swaps7d = 0) {
	const k = KNOWN[addr];
	if (k) return { name: k.name, line: k.line, app: k.app ?? null };
	const short = addr.slice(0, 8) + '…';
	if (meta?.app && ROUTER_APPS[meta.app]) return { name: short, line: ROUTER_APPS[meta.app], app: meta.app };
	// A contract a known actor calls (e.g. Q6WW through a Pact-deployed app) rides that actor's line.
	const via = meta?.via && KNOWN[meta.via];
	if (via) return { name: (meta.app ? 'App ' + meta.app : short) + ' via ' + via.name, line: via.line, app: meta.app ?? null };
	if (meta?.inner) return { name: meta.app ? 'App ' + meta.app : short, line: 'bots', app: meta.app ?? null, creator: meta.creator ?? null };
	return { name: short, line: swaps7d >= BOT_SWAPS_7D ? 'bots' : 'wallets', app: null };
}

/**
 * Resolve unknown contract callers to their app id (and creator), a few per run.
 * A swap's txId is the top-level transaction; its application id is the contract
 * that made the call. Some txIds in the pact.fi feed don't resolve; those are
 * retried with another swap from the same sender later.
 */
export async function resolveActors(state, getJSON, idx, max = 12) {
	const todo = Object.entries(state.mk.actors).filter(([a, m]) => m.inner && m.app == null && !KNOWN[a] && (m.tries ?? 0) < 4 && m.tx);
	let done = 0;
	for (const [addr, m] of todo.slice(0, max)) {
		m.tries = (m.tries ?? 0) + 1;
		try {
			const j = await getJSON(`${idx}/v2/transactions/${m.tx}`);
			const tx = j.transaction ?? {};
			const id = tx['application-transaction']?.['application-id'];
			if (!id) continue;
			m.app = id;
			m.outer = tx.sender ?? null;
			if (app(id) !== addr && m.outer) m.via = m.outer; // swap made by an app it called, not the app itself
			try {
				const a = await getJSON(`${idx.replace('-idx', '-api')}/v2/applications/${id}`);
				m.creator = a.params?.creator ?? null;
			} catch {
				/* creator is a nice-to-have */
			}
			done++;
		} catch {
			/* txId not indexed under that id; try another swap's txId next time */
			m.tx = null;
		}
	}
	return done;
}
