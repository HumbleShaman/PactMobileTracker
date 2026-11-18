// Monthly periods. The fee counter restarts at midnight on the 1st of each
// month in Andrew's time zone (UTC+7, the same zone as the tracking start).
// live.html and PactTracker.js carry the same month math; keep them in step.

export const TZ_S = 7 * 3600;

/** Unix seconds of the start of the month containing `t`. */
export function monthStart(t) {
	const d = new Date((t + TZ_S) * 1000);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000 - TZ_S;
}

/** Unix seconds of the start of the month after the one containing `t`. */
export function nextMonthStart(t) {
	const d = new Date((t + TZ_S) * 1000);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000 - TZ_S;
}

/** The period `t` belongs to; the first one starts at the tracking start, mid-month. */
export const periodStart = (t, genesis) => Math.max(monthStart(t), genesis);
