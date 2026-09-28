// Fee math shared by the collector and the verify script. The Scriptable
// widget and live page carry small copies of `poolFeeSplit` / `swapFees` —
// keep them in step if this changes.

export const HOUR_S = 3600;
/** A swap priced above this is treated as a pricing glitch and contributes $0. */
export const MAX_SWAP_USD = 5_000_000;

/**
 * Pool fee split from an app's uint global state, in bps of swap volume.
 *  - constant product + stableswap: FEE_BPS is the total; PACT_FEE_BPS is the
 *    protocol's part of it (LPs keep FEE_BPS - PACT_FEE_BPS).
 *  - managed weighted: swap_fee_bps is the total; protocol_fee_bps is the
 *    protocol's share OF that fee (2500 = 25%).
 * Returns null for anything else (caller falls back to the indexer's fields).
 */
export function poolFeeSplit(gs) {
	if (gs.FEE_BPS != null) return { fee: gs.FEE_BPS, pact: gs.PACT_FEE_BPS ?? 0 };
	if (gs.swap_fee_bps != null) {
		return { fee: gs.swap_fee_bps, pact: (gs.swap_fee_bps * (gs.protocol_fee_bps ?? 0)) / 1e4 };
	}
	return null;
}

/** USD fees for one swap DTO given its pool's split ({fee, pact} or nulls). */
export function swapFees(s, cfg) {
	const usd = Number(s.usdValue) || 0;
	if (!(usd > 0)) return { total: 0, proto: 0, usd: 0, outlier: false };
	if (usd > MAX_SWAP_USD) return { total: 0, proto: 0, usd: 0, outlier: true };
	if (cfg && cfg.fee != null) {
		return { total: (usd * cfg.fee) / 1e4, proto: (usd * cfg.pact) / 1e4, usd, outlier: false };
	}
	// Unknown pool type: trust the indexer's recorded split.
	const ratio = (num, den) => {
		const v = Number(num) / Number(den);
		return Number.isFinite(v) ? v : 0;
	};
	const lp = ratio(s.lpFee, s.amountIn) * usd;
	const onOut = s.feeAssetId === s.tokenOut?.assetId;
	const proto = ratio(s.protocolFee, onOut ? s.amountOut : s.amountIn) * usd;
	return { total: lp + proto, proto, usd, outlier: false };
}
