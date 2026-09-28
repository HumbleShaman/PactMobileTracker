// PactTracker — Pact fee widgets + live view for Scriptable (iOS).
//
// Loaded by Loader.js, which pulls the latest copy of this file from GitHub.
// Numbers come from feed.json (the collector publishes it every few minutes),
// topped up with any swaps newer than it straight from the pact.fi API.
//
// Widget parameter (long-press widget → Edit Widget → Parameter):
//   (blank)   "+$X since …" counts from the last time you opened the live view
//   refresh   "+$X since …" counts from this widget's previous refresh

const REPO_RAW = 'https://raw.githubusercontent.com/HumbleShaman/PactMobileTracker';
const FEED_URL = REPO_RAW + '/data/feed.json';
const LIVE_URL = REPO_RAW + '/main/scriptable/live.html';
const API = 'https://pact.fi/api/v1';
const ALGOD = 'https://mainnet-api.algonode.cloud';
const CHAIN = 'algorand-mainnet';
const MAX_SWAP_USD = 5e6; // mirrors collector/fees.mjs
const PREFS_KEY = 'pact-tracker-v1';

const INK = {
	bg: '#0a0b12',
	raised: '#13161f',
	bright: '#ffffff',
	body: '#c9cbd4',
	muted: '#7a7f91',
	faint: '#4a4f61',
	total: '#0098d4', // series: total fees
	proto: '#bb8540', // series: protocol share
	gain: '#4ade80'
};

// ─── storage ───

const fm = FileManager.local();
const CACHE_DIR = fm.joinPath(fm.cacheDirectory(), 'PactTracker');

function readCache(name) {
	try {
		const p = fm.joinPath(CACHE_DIR, name);
		return fm.fileExists(p) ? fm.readString(p) : null;
	} catch (e) {
		return null;
	}
}

function writeCache(name, text) {
	try {
		if (!fm.fileExists(CACHE_DIR)) fm.createDirectory(CACHE_DIR, true);
		fm.writeString(fm.joinPath(CACHE_DIR, name), text);
	} catch (e) {}
}

// Keychain is shared by the app and the widget extension, so the "since you
// last checked" baseline written by the live view is visible to widgets.
function loadPrefs() {
	try {
		return Keychain.contains(PREFS_KEY) ? JSON.parse(Keychain.get(PREFS_KEY)) : {};
	} catch (e) {
		return {};
	}
}

function savePrefs(p) {
	try {
		Keychain.set(PREFS_KEY, JSON.stringify(p));
	} catch (e) {}
}

// ─── network ───

async function getText(url, timeout) {
	const r = new Request(url);
	r.timeoutInterval = timeout || 12;
	const text = await r.loadString();
	const code = r.response && r.response.statusCode;
	if (code && code >= 400) throw new Error('HTTP ' + code + ' ' + url);
	return text;
}

async function getJSON(url, timeout) {
	return JSON.parse(await getText(url, timeout));
}

/** Network first, cached copy if offline. */
async function cachedText(url, name) {
	try {
		const text = await getText(url);
		writeCache(name, text);
		return text;
	} catch (e) {
		const cached = readCache(name);
		if (cached) return cached;
		throw e;
	}
}

// ─── fee math (mirrors collector/fees.mjs) ───

/** [feeBps, protocolBps] for a pool, from its uint global state. */
async function readPoolSplit(poolId) {
	try {
		const app = await getJSON(ALGOD + '/v2/applications/' + poolId, 8);
		const gs = {};
		for (const kv of (app.params && app.params['global-state']) || []) {
			if (kv.value.type === 2) gs[Data.fromBase64String(kv.key).toRawString()] = kv.value.uint;
		}
		if (gs.FEE_BPS != null) return [gs.FEE_BPS, gs.PACT_FEE_BPS || 0];
		if (gs.swap_fee_bps != null) return [gs.swap_fee_bps, (gs.swap_fee_bps * (gs.protocol_fee_bps || 0)) / 1e4];
	} catch (e) {}
	return null;
}

function swapFees(s, split) {
	const usd = Number(s.usdValue) || 0;
	if (!(usd > 0) || usd > MAX_SWAP_USD) return [0, 0];
	if (split) return [(usd * split[0]) / 1e4, (usd * split[1]) / 1e4];
	const ratio = (a, b) => {
		const v = Number(a) / Number(b);
		return isFinite(v) ? v : 0;
	};
	const onOut = s.feeAssetId === (s.tokenOut && s.tokenOut.assetId);
	const proto = ratio(s.protocolFee, onOut ? s.amountOut : s.amountIn) * usd;
	return [ratio(s.lpFee, s.amountIn) * usd + proto, proto];
}

/** Swaps newer than the feed, priced. Null if the gap is wider than maxPages. */
async function topUp(feed, maxPages) {
	const raw = [];
	let cursor = null;
	let reached = false;
	for (let i = 0; i < maxPages && !reached; i++) {
		const res = await getJSON(
			API + '/swaps?chain=' + CHAIN + '&limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')
		);
		const rows = res.data || [];
		for (const s of rows) {
			if (s.ts <= feed.cursorTs) {
				reached = true;
				break;
			}
			raw.push(s);
		}
		cursor = res.meta && res.meta.page && res.meta.page.nextCursor;
		if (!cursor || rows.length === 0) reached = true;
	}
	if (!reached) return null;

	let poolCache = {};
	try {
		poolCache = JSON.parse(readCache('pools.json') || '{}');
	} catch (e) {}
	let lookups = 0;
	const out = [];
	for (const s of raw) {
		let split = feed.pools[s.poolId] || poolCache[s.poolId] || null;
		if (!split && lookups < 6) {
			lookups++;
			split = await readPoolSplit(s.poolId);
			if (split) poolCache[s.poolId] = split;
		}
		const f = swapFees(s, split);
		out.push({
			id: s.id,
			ts: s.ts,
			pool: s.poolId,
			a: (s.tokenIn && s.tokenIn.symbol) || '?',
			b: (s.tokenOut && s.tokenOut.symbol) || '?',
			usd: Number(s.usdValue) || 0,
			fee: f[0],
			proto: f[1]
		});
	}
	if (lookups) writeCache('pools.json', JSON.stringify(poolCache));
	return out;
}

// ─── snapshot ───

function summarize(feed, extra) {
	const nowS = Date.now() / 1000;
	const hours = new Map();
	for (const r of feed.series) hours.set(r[0], [r[1], r[2], r[3]]);
	let total = feed.total;
	let protocol = feed.protocol;
	for (const s of extra) {
		const h = Math.floor(s.ts / 1000 / 3600) * 3600;
		const b = hours.get(h) || [0, 0, 0];
		b[0] += s.fee;
		b[1] += s.proto;
		b[2] += 1;
		hours.set(h, b);
		total += s.fee;
		protocol += s.proto;
	}
	const rows = Array.from(hours.entries()).sort((a, b) => a[0] - b[0]);

	const midnight = new Date();
	midnight.setHours(0, 0, 0, 0);
	const m0 = midnight.getTime() / 1000;
	let today = 0;
	let todayProto = 0;
	let day = 0;
	let cum = 0;
	let cumP = 0;
	const points = [[feed.genesis, 0, 0]];
	for (const [t, b] of rows) {
		if (t >= m0) {
			today += b[0];
			todayProto += b[1];
		}
		if (t >= nowS - 86400) day += b[0];
		cum += b[0];
		cumP += b[1];
		const span = t < (feed.hourlyFrom || 0) ? 86400 : 3600;
		points.push([Math.min(t + span, nowS), cum, cumP]);
	}

	const recent = extra.concat(feed.recent).sort((a, b) => b.ts - a.ts).slice(0, 40);
	return {
		total,
		protocol,
		today,
		todayProto,
		day,
		points,
		recent,
		genesis: feed.genesis,
		updatedAt: extra.length ? Date.now() : feed.updatedAt * 1000
	};
}

// ─── formatting ───

function num(v, dp) {
	const neg = v < 0;
	const parts = Math.abs(v).toFixed(dp).split('.');
	const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return (neg ? '-' : '') + int + (parts[1] ? '.' + parts[1] : '');
}

function money(v, dp) {
	if (dp == null) dp = Math.abs(v) >= 100000 ? 0 : 2;
	return (v < 0 ? '-$' : '$') + num(Math.abs(v), dp);
}

function compact(v) {
	const a = Math.abs(v);
	if (a >= 1e6) return '$' + (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
	if (a >= 1e4) return '$' + (v / 1e3).toFixed(1) + 'K';
	if (a >= 1e3) return '$' + (v / 1e3).toFixed(2) + 'K';
	return '$' + v.toFixed(a >= 100 ? 0 : 2);
}

function clock(ms) {
	const d = new Date(ms);
	const h = d.getHours() % 12 || 12;
	const m = String(d.getMinutes()).padStart(2, '0');
	const t = h + ':' + m + (d.getHours() < 12 ? ' AM' : ' PM');
	const today = new Date();
	if (d.toDateString() === today.toDateString()) return t;
	const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	return days[d.getDay()] + ' ' + t;
}

function shortDate(ms) {
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const d = new Date(ms);
	return months[d.getMonth()] + ' ' + d.getDate();
}

// ─── widgets ───

function chartImage(points, w, h, opts) {
	opts = opts || {};
	const dc = new DrawContext();
	dc.size = new Size(w, h);
	dc.opaque = false;
	dc.respectScreenScale = true;
	if (points.length < 2) return dc.getImage();
	const t0 = points[0][0];
	const t1 = points[points.length - 1][0];
	const maxV = Math.max(points[points.length - 1][1], 1e-9);
	const pad = 3;
	const X = (t) => ((t - t0) / Math.max(1, t1 - t0)) * (w - pad * 2) + pad;
	const Y = (v) => h - pad - (v / maxV) * (h - pad * 2);

	const area = new Path();
	area.move(new Point(X(t0), h));
	for (const p of points) area.addLine(new Point(X(p[0]), Y(p[1])));
	area.addLine(new Point(X(t1), h));
	area.closeSubpath();
	dc.addPath(area);
	dc.setFillColor(new Color(INK.total, 0.16));
	dc.fillPath();

	const line = (idx, color, width) => {
		const p = new Path();
		p.move(new Point(X(points[0][0]), Y(points[0][idx])));
		for (const q of points) p.addLine(new Point(X(q[0]), Y(q[idx])));
		dc.addPath(p);
		dc.setStrokeColor(new Color(color));
		dc.setLineWidth(width);
		dc.strokePath();
	};
	if (opts.proto !== false) line(2, INK.proto, 1.5);
	line(1, INK.total, 2);

	const last = points[points.length - 1];
	dc.setFillColor(new Color(INK.total));
	dc.fillEllipse(new Rect(X(last[0]) - 3, Y(last[1]) - 3, 6, 6));
	return dc.getImage();
}

function text(stack, str, size, color, weight) {
	const t = stack.addText(str);
	const fonts = {
		bold: Font.boldRoundedSystemFont,
		semibold: Font.semiboldRoundedSystemFont,
		medium: Font.mediumRoundedSystemFont,
		regular: Font.regularRoundedSystemFont
	};
	t.font = (fonts[weight || 'regular'] || Font.regularRoundedSystemFont)(size);
	t.textColor = new Color(color);
	t.lineLimit = 1;
	t.minimumScaleFactor = 0.5;
	return t;
}

function header(w, s, label) {
	const row = w.addStack();
	row.centerAlignContent();
	text(row, label, 11, INK.muted, 'semibold');
	row.addSpacer();
	const d = row.addDate(new Date(s.updatedAt));
	d.applyRelativeStyle();
	d.font = Font.mediumRoundedSystemFont(10);
	d.textColor = new Color(INK.faint);
	d.lineLimit = 1;
	d.rightAlignText();
}

function gainLine(stack, delta, label, size, inline) {
	const row = stack.addStack();
	if (inline) row.bottomAlignContent();
	else row.layoutVertically();
	text(row, (delta >= 0 ? '+' : '') + money(delta), size, delta > 0 ? INK.gain : INK.body, 'bold');
	if (inline) row.addSpacer(6);
	text(row, label, inline ? size - 4 : 11, INK.muted, 'medium');
}

function swatchRow(stack, color, label, value, size) {
	const row = stack.addStack();
	row.centerAlignContent();
	const dot = row.addStack();
	dot.size = new Size(6, 6);
	dot.cornerRadius = 3;
	dot.backgroundColor = new Color(color);
	row.addSpacer(5);
	text(row, label, size, INK.muted, 'medium');
	if (value) {
		row.addSpacer(4);
		text(row, value, size, INK.body, 'semibold');
	}
}

function buildWidget(s, family, delta, deltaLabel) {
	const w = new ListWidget();
	w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

	if (family === 'accessoryInline') {
		w.addText('Pact ' + (delta >= 0 ? '+' : '') + money(delta) + ' ' + deltaLabel);
		return w;
	}
	if (family === 'accessoryCircular') {
		w.addAccessoryWidgetBackground = true;
		const t1 = w.addText('+' + compact(s.today));
		t1.font = Font.boldRoundedSystemFont(13);
		t1.centerAlignText();
		t1.minimumScaleFactor = 0.5;
		const t2 = w.addText('today');
		t2.font = Font.mediumRoundedSystemFont(9);
		t2.centerAlignText();
		return w;
	}
	if (family === 'accessoryRectangular') {
		const a = w.addText('PACT FEES');
		a.font = Font.semiboldRoundedSystemFont(11);
		const b = w.addText(money(s.total));
		b.font = Font.boldRoundedSystemFont(18);
		b.minimumScaleFactor = 0.6;
		b.lineLimit = 1;
		const c = w.addText((delta >= 0 ? '+' : '') + money(delta) + ' ' + deltaLabel + ' · P ' + compact(s.protocol));
		c.font = Font.mediumRoundedSystemFont(11);
		c.minimumScaleFactor = 0.6;
		c.lineLimit = 1;
		return w;
	}

	w.backgroundColor = new Color(INK.bg);
	const grad = new LinearGradient();
	grad.colors = [new Color(INK.raised), new Color(INK.bg)];
	grad.locations = [0, 1];
	w.backgroundGradient = grad;

	if (family === 'small') {
		w.setPadding(13, 14, 12, 14);
		header(w, s, 'PACT FEES');
		w.addSpacer(4);
		text(w, money(s.total), 25, INK.bright, 'bold');
		gainLine(w, delta, deltaLabel, 15);
		w.addSpacer();
		const img = w.addImage(chartImage(s.points, 130, 22, { proto: false }));
		img.imageSize = new Size(130, 22);
		w.addSpacer(5);
		swatchRow(w, INK.proto, 'Protocol', money(s.protocol), 11);
		return w;
	}

	if (family === 'large') {
		w.setPadding(16, 16, 14, 16);
		header(w, s, 'PACT FEES · SINCE ' + shortDate(s.genesis * 1000).toUpperCase());
		w.addSpacer(6);
		text(w, money(s.total), 36, INK.bright, 'bold');
		gainLine(w, delta, deltaLabel, 17, true);
		w.addSpacer(10);
		const stats = w.addStack();
		const tile = (label, value) => {
			const col = stats.addStack();
			col.layoutVertically();
			text(col, label, 10, INK.muted, 'semibold');
			text(col, value, 15, INK.bright, 'semibold');
			stats.addSpacer();
		};
		tile('PROTOCOL', money(s.protocol));
		tile('TODAY', money(s.today));
		tile('LAST 24H', money(s.day));
		w.addSpacer(10);
		const img = w.addImage(chartImage(s.points, 300, 96));
		img.imageSize = new Size(300, 96);
		w.addSpacer(4);
		const legend = w.addStack();
		swatchRow(legend, INK.total, 'Total', '', 10);
		legend.addSpacer(10);
		swatchRow(legend, INK.proto, 'Protocol', '', 10);
		w.addSpacer(8);
		// Skip dust so the list shows swaps that visibly earned something.
		const worth = s.recent.filter((r) => r.fee >= 0.001);
		for (const r of (worth.length >= 3 ? worth : s.recent).slice(0, 3)) {
			const row = w.addStack();
			row.centerAlignContent();
			text(row, r.fee < 0.0001 ? '<$0.0001' : '+' + money(r.fee, r.fee < 0.01 ? 4 : 2), 12, INK.gain, 'semibold');
			row.addSpacer(8);
			text(row, r.a + ' → ' + r.b, 12, INK.body, 'medium');
			row.addSpacer();
			text(row, money(r.usd), 11, INK.muted, 'medium');
			w.addSpacer(3);
		}
		w.addSpacer();
		return w;
	}

	// medium (and any unknown family)
	w.setPadding(14, 16, 14, 14);
	const body = w.addStack();
	const left = body.addStack();
	left.layoutVertically();
	left.size = new Size(148, 0);
	text(left, 'PACT FEES', 11, INK.muted, 'semibold');
	left.addSpacer(4);
	text(left, money(s.total), 26, INK.bright, 'bold');
	gainLine(left, delta, deltaLabel, 15);
	left.addSpacer();
	swatchRow(left, INK.proto, 'Protocol', money(s.protocol), 11);
	left.addSpacer(3);
	const tr = left.addStack();
	text(tr, 'Today', 11, INK.muted, 'medium');
	tr.addSpacer(4);
	text(tr, money(s.today), 11, INK.body, 'semibold');
	body.addSpacer(6);
	const right = body.addStack();
	right.layoutVertically();
	const upd = right.addStack();
	upd.addSpacer();
	const d = upd.addDate(new Date(s.updatedAt));
	d.applyRelativeStyle();
	d.font = Font.mediumRoundedSystemFont(10);
	d.textColor = new Color(INK.faint);
	d.lineLimit = 1;
	right.addSpacer();
	const img = right.addImage(chartImage(s.points, 140, 84));
	img.imageSize = new Size(140, 84);
	right.addSpacer(4);
	const legend = right.addStack();
	swatchRow(legend, INK.total, 'Total', '', 9);
	legend.addSpacer(8);
	swatchRow(legend, INK.proto, 'Protocol', '', 9);
	return w;
}

function errorWidget(msg) {
	const w = new ListWidget();
	w.backgroundColor = new Color(INK.bg);
	const t = w.addText('Pact fees unavailable');
	t.font = Font.semiboldRoundedSystemFont(12);
	t.textColor = new Color(INK.body);
	const e = w.addText(String(msg).slice(0, 120));
	e.font = Font.regularRoundedSystemFont(10);
	e.textColor = new Color(INK.muted);
	w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);
	return w;
}

// ─── live view ───

async function showLive(feedText, prefs) {
	const html = await cachedText(LIVE_URL, 'live.html');
	const feed = JSON.parse(feedText);
	const base = prefs.open && prefs.open.genesis === feed.genesis ? prefs.open : null;
	const payload = { feed: feed, base: base, milestone: prefs.milestone || 0 };
	// split/join, not replace(): JSON can contain "$&"-style sequences.
	const page = html.split('"__PAYLOAD__"').join(JSON.stringify(payload).replace(/</g, '\\u003c'));

	const wv = new WebView();
	await wv.loadHTML(page, 'https://pact.fi/');
	// Record what the page is showing every few seconds; that becomes the
	// baseline for the next "+$X since you last checked".
	const timer = Timer.schedule(3000, true, async () => {
		try {
			const raw = await wv.evaluateJavaScript('JSON.stringify(window.__pactState ? window.__pactState() : null)', false);
			const st = JSON.parse(raw);
			if (st && st.total > 0) {
				prefs.open = { total: st.total, at: Date.now(), genesis: feed.genesis };
				prefs.milestone = st.milestone;
				savePrefs(prefs);
			}
		} catch (e) {}
	});
	await wv.present(true);
	timer.invalidate();
}

// ─── entry ───

async function run() {
	const inWidget = config.runsInWidget || config.runsInAccessoryWidget;
	const family = config.widgetFamily || 'medium';
	const prefs = loadPrefs();

	let feedText;
	try {
		feedText = await cachedText(FEED_URL, 'feed.json');
	} catch (e) {
		if (inWidget) Script.setWidget(errorWidget(e.message || e));
		else {
			const a = new Alert();
			a.title = 'Pact fees unavailable';
			a.message = 'Could not reach GitHub and nothing is cached yet. ' + (e.message || e);
			a.addAction('OK');
			await a.present();
		}
		Script.complete();
		return;
	}

	if (!inWidget) {
		await showLive(feedText, prefs);
		Script.complete();
		return;
	}

	const feed = JSON.parse(feedText);
	let extra = [];
	try {
		extra = (await topUp(feed, 4)) || [];
	} catch (e) {}
	const s = summarize(feed, extra);

	const perRefresh = String(args.widgetParameter || '').trim().toLowerCase() === 'refresh';
	const key = perRefresh ? 'w_' + family : 'open';
	const base = prefs[key] && prefs[key].genesis === s.genesis ? prefs[key] : null;
	// max(0): the live view may have seen swaps this refresh couldn't top up.
	const delta = base ? Math.max(0, s.total - base.total) : s.today;
	const label = base ? 'since ' + clock(base.at) : 'today';

	Script.setWidget(buildWidget(s, family, delta, label));
	if (perRefresh) {
		prefs[key] = { total: s.total, at: Date.now(), genesis: s.genesis };
		savePrefs(prefs);
	}
	Script.complete();
}

module.exports = { run };

// Pasted and run directly (no loader): just go.
if (typeof __pactLoader === 'undefined') await run();
