// Runs scriptable/PactTracker.js under a strict mock of the Scriptable APIs it
// uses, for every widget family plus the in-app live view, and writes previews:
//   preview/widgets.html  approximate widget renders (flexbox stand-in for SwiftUI)
//   preview/live.html     the exact page the live view would load
// Unknown Scriptable members throw, so API typos fail here instead of on the phone.
//
// Usage: node test/sim.mjs [feedPath]   (default data/feed.json)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feedPath = path.resolve(process.argv[2] ?? path.join(root, 'data/feed.json'));
const LOCAL = process.env.REMOTE ? {} : {
	'https://raw.githubusercontent.com/HumbleShaman/PactMobileTracker/data/feed.json': feedPath,
	'https://raw.githubusercontent.com/HumbleShaman/PactMobileTracker/main/scriptable/live.html': path.join(root, 'scriptable/live.html')
};

// ─── strict objects ───
function strict(name, props, methods) {
	const target = { ...props, ...methods, __kind: name };
	return new Proxy(target, {
		get(t, k) {
			if (k in t || typeof k === 'symbol' || k === 'then' || k === 'toJSON') return t[k];
			throw new Error(`${name}.${String(k)} is not a Scriptable API`);
		},
		set(t, k, v) {
			// Declared props plus the mock's own internal fields; never unknown keys.
			if (!(k in t) || typeof t[k] === 'function') throw new Error(`${name}.${String(k)} is not a settable Scriptable property`);
			t[k] = v;
			return true;
		}
	});
}

class Color { constructor(hex, alpha = 1) { this.hex = hex; this.alpha = alpha; } }
class Size { constructor(w, h) { this.width = w; this.height = h; } }
class Point { constructor(x, y) { this.x = x; this.y = y; } }
class Rect { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } }
const FONT_FNS = ['systemFont', 'boldSystemFont', 'mediumSystemFont', 'semiboldSystemFont', 'regularRoundedSystemFont', 'mediumRoundedSystemFont', 'semiboldRoundedSystemFont', 'boldRoundedSystemFont', 'heavyRoundedSystemFont'];
const WEIGHT = { regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800, system: 400 };
const Font = strict('Font', {}, Object.fromEntries(FONT_FNS.map((f) => [f, (size) => ({ size, weight: WEIGHT[f.replace(/(Rounded)?SystemFont$/, '').toLowerCase()] ?? 400 })])));

class LinearGradient { constructor() { this.colors = []; this.locations = []; } }

class Path {
	constructor() { this.d = ''; }
	move(p) { this.d += `M${p.x} ${p.y}`; }
	addLine(p) { this.d += `L${p.x} ${p.y}`; }
	closeSubpath() { this.d += 'Z'; }
}

function DrawContext() {
	const ops = [];
	let cur = null, fill = null, stroke = null, lw = 1;
	const rgba = (c) => `rgba(${parseInt(c.hex.slice(1, 3), 16)},${parseInt(c.hex.slice(3, 5), 16)},${parseInt(c.hex.slice(5, 7), 16)},${c.alpha})`;
	const self = strict('DrawContext', { size: null, opaque: true, respectScreenScale: false }, {
		addPath(p) { cur = p; },
		setFillColor(c) { fill = c; },
		setStrokeColor(c) { stroke = c; },
		setLineWidth(w) { lw = w; },
		fillPath() { ops.push(`<path d="${cur.d}" fill="${rgba(fill)}"/>`); },
		strokePath() { ops.push(`<path d="${cur.d}" fill="none" stroke="${rgba(stroke)}" stroke-width="${lw}" stroke-linejoin="round"/>`); },
		fillEllipse(r) { ops.push(`<ellipse cx="${r.x + r.width / 2}" cy="${r.y + r.height / 2}" rx="${r.width / 2}" ry="${r.height / 2}" fill="${rgba(fill)}"/>`); },
		getImage() { return { svg: `<svg width="${self.size.width}" height="${self.size.height}" viewBox="0 0 ${self.size.width} ${self.size.height}">${ops.join('')}</svg>` }; }
	});
	return self;
}

function textEl(kind, str) {
	return strict(kind, { text: str, font: null, textColor: null, lineLimit: 0, minimumScaleFactor: 1, textOpacity: 1, url: null }, {
		leftAlignText() {}, centerAlignText() { this.align = 'center'; }, rightAlignText() { this.align = 'right'; },
		applyRelativeStyle() {}, applyTimerStyle() {}, applyOffsetStyle() {}, applyTimeStyle() {}, applyDateStyle() {},
		align: 'left'
	});
}

function container(kind, extraProps = {}, extraMethods = {}) {
	const children = [];
	const el = strict(kind, { backgroundColor: null, backgroundGradient: null, backgroundImage: null, spacing: 0, url: null, size: null, cornerRadius: 0, ...extraProps }, {
		children, pad: null, vertical: kind === 'ListWidget', alignItems: 'flex-start',
		addText(s) { const t = textEl('WidgetText', s); children.push(t); return t; },
		addDate(d) { const t = textEl('WidgetDate', relative(d)); children.push(t); return t; },
		addImage(img) { const i = strict('WidgetImage', { imageSize: null, resizable: true, cornerRadius: 0, tintColor: null }, { img, centerAlignImage() {}, leftAlignImage() {} }); children.push(i); return i; },
		addSpacer(n) { children.push({ __kind: 'Spacer', n }); },
		addStack() { const s = container('WidgetStack'); children.push(s); return s; },
		setPadding(t, l, b, r) { el.pad = [t, l, b, r]; },
		layoutVertically() { el.vertical = true; }, layoutHorizontally() { el.vertical = false; },
		centerAlignContent() { el.alignItems = 'center'; }, topAlignContent() { el.alignItems = 'flex-start'; }, bottomAlignContent() { el.alignItems = 'flex-end'; },
		...extraMethods
	});
	return el;
}

function relative(d) {
	const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
	return s < 60 ? `${s} sec` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} hr`;
}

// ─── globals ───
const keychain = new Map();
const files = new Map();
let captured = { widget: null, page: null };

Object.assign(globalThis, {
	Color, Size, Point, Rect, Font, LinearGradient, Path, DrawContext,
	ListWidget: function () {
		return container('ListWidget', { refreshAfterDate: null, addAccessoryWidgetBackground: false });
	},
	Request: function (url) {
		const r = strict('Request', { url, timeoutInterval: 60, method: 'GET', headers: {} }, {
			response: null,
			async loadString() {
				if (LOCAL[url]) { r.response = { statusCode: 200 }; return readFileSync(LOCAL[url], 'utf8'); }
				const res = await fetch(url);
				r.response = { statusCode: res.status };
				return res.text();
			},
			async loadJSON() { return JSON.parse(await r.loadString()); }
		});
		return r;
	},
	FileManager: {
		local: () => strict('FileManager', {}, {
			cacheDirectory: () => '/cache', documentsDirectory: () => '/docs', joinPath: (a, b) => `${a}/${b}`,
			fileExists: (p) => files.has(p) || p === '/cache/PactTracker', readString: (p) => files.get(p),
			writeString: (p, s) => files.set(p, s), createDirectory() {}, modificationDate: () => new Date()
		})
	},
	Keychain: strict('Keychain', {}, { contains: (k) => keychain.has(k), get: (k) => keychain.get(k), set: (k, v) => keychain.set(k, v), remove: (k) => keychain.delete(k) }),
	Data: { fromBase64String: (b) => ({ toRawString: () => Buffer.from(b, 'base64').toString('latin1') }) },
	Script: { setWidget: (w) => (captured.widget = w), complete() {}, name: () => 'Pact Tracker' },
	Timer: { schedule: () => ({ invalidate() {} }) },
	WebView: function () {
		return strict('WebView', {}, {
			async loadHTML(html, base) { captured.page = html; captured.base = base; },
			async present() {},
			async evaluateJavaScript() { return 'null'; }
		});
	},
	Alert: function () { return strict('Alert', { title: '', message: '' }, { addAction() {}, async present() {} }); }
});

const code = readFileSync(path.join(root, 'scriptable/PactTracker.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function runAs(family, param) {
	const inWidget = family !== 'app';
	globalThis.config = { runsInWidget: inWidget && !family.startsWith('accessory'), runsInAccessoryWidget: family.startsWith('accessory'), runsInApp: !inWidget, widgetFamily: inWidget ? family : undefined };
	globalThis.args = { widgetParameter: param ?? null, queryParameters: {} };
	captured = { widget: null, page: null };
	const mod = { exports: {} };
	await new AsyncFunction('module', '__pactLoader', code)(mod, true);
	await mod.exports.run();
	return captured;
}

// ─── render ───
const SIZES = { small: [158, 158], medium: [338, 158], large: [338, 354], accessoryRectangular: [160, 72], accessoryInline: [240, 20], accessoryCircular: [72, 72] };
const css = (c) => (c ? `rgba(${parseInt(c.hex.slice(1, 3), 16)},${parseInt(c.hex.slice(3, 5), 16)},${parseInt(c.hex.slice(5, 7), 16)},${c.alpha})` : 'inherit');

// SwiftUI stacks grow along an axis when any descendant wants to: a flexible
// Spacer grows along its stack's axis, and growth propagates to ancestors.
function wants(el) {
	if (el.__kind === 'Spacer') return { h: false, v: false };
	if (el.__kind !== 'WidgetStack' && el.__kind !== 'ListWidget') return { h: false, v: false };
	const w = { h: false, v: false };
	for (const c of el.children) {
		if (c.__kind === 'Spacer' && c.n == null) w[el.vertical ? 'v' : 'h'] = true;
		const cw = wants(c);
		w.h ||= cw.h;
		w.v ||= cw.v;
	}
	if (el.size?.width) w.h = false;
	if (el.size?.height) w.v = false;
	return w;
}

function render(el, parentVertical = true) {
	if (el.__kind === 'Spacer') return el.n == null ? '<div style="flex:1 1 0"></div>' : `<div style="flex:0 0 ${el.n}px"></div>`;
	if (el.__kind === 'WidgetText' || el.__kind === 'WidgetDate') {
		const f = el.font ?? { size: 15, weight: 400 };
		return `<div class="t" data-min="${el.minimumScaleFactor}" style="font-size:${f.size}px;font-weight:${f.weight};color:${css(el.textColor)};text-align:${el.align}">${el.text}</div>`;
	}
	if (el.__kind === 'WidgetImage') {
		const s = el.imageSize;
		return `<div style="flex:none;${s ? `width:${s.width}px;height:${s.height}px` : ''}">${el.img.svg}</div>`;
	}
	const sz = el.size ? `${el.size.width ? `width:${el.size.width}px;flex:none;` : ''}${el.size.height ? `height:${el.size.height}px;` : ''}` : '';
	const pad = el.pad ? `padding:${el.pad[0]}px ${el.pad[3]}px ${el.pad[2]}px ${el.pad[1]}px;` : '';
	const bg = el.backgroundColor ? `background:${css(el.backgroundColor)};` : '';
	const w = wants(el);
	const grow = (parentVertical ? w.v : w.h) ? 'flex-grow:1;' : '';
	const stretch = (parentVertical ? w.h : w.v) ? 'align-self:stretch;' : '';
	return `<div style="display:flex;flex-direction:${el.vertical ? 'column' : 'row'};align-items:${el.alignItems};${grow}${stretch}${sz}${pad}${bg}border-radius:${el.cornerRadius}px">${el.children.map((c) => render(c, el.vertical)).join('')}</div>`;
}

function renderWidget(w, family) {
	const [W, H] = SIZES[family];
	const g = w.backgroundGradient;
	const bg = g ? `linear-gradient(${css(g.colors[0])},${css(g.colors[1])})` : w.backgroundColor ? css(w.backgroundColor) : '#555';
	const pad = w.pad ?? [16, 16, 16, 16];
	const accessory = family.startsWith('accessory');
	const body = w.children.map((c) => render(c, true)).join('');
	return `<figure><div class="w ${accessory ? 'acc' : ''}" style="width:${W}px;height:${H}px;background:${accessory ? 'rgba(255,255,255,.12)' : bg};padding:${accessory ? '4px 6px' : `${pad[0]}px ${pad[3]}px ${pad[2]}px ${pad[1]}px`};${family === 'accessoryCircular' ? 'border-radius:50%;justify-content:center;align-items:center;' : ''}">${body}</div><figcaption>${family}</figcaption></figure>`;
}

const out = path.join(root, 'preview');
if (!existsSync(out)) mkdirSync(out);

const figs = [];
for (const fam of Object.keys(SIZES)) {
	const { widget } = await runAs(fam);
	if (!widget) throw new Error(`${fam}: no widget set`);
	figs.push(renderWidget(widget, fam));
	console.log(`ok  ${fam}`);
}
// Baseline flows: the live view saves {total, at}; widgets then show "since …".
const feed = JSON.parse(readFileSync(feedPath, 'utf8'));
keychain.set('pact-tracker-v1', JSON.stringify({ open: { total: feed.total * 0.97, at: Date.now() - 2 * 3600e3, genesis: feed.genesis } }));
for (const fam of ['small', 'medium']) {
	const { widget } = await runAs(fam);
	figs.push(renderWidget(widget, fam).replace(`>${fam}<`, `>${fam} · after opening app 2h ago<`));
	console.log(`ok  ${fam} (with baseline)`);
}
const { widget: refreshW } = await runAs('small', 'refresh');
if (!refreshW) throw new Error('refresh param: no widget');
if (!JSON.parse(keychain.get('pact-tracker-v1')).w_small) throw new Error('refresh mode did not save a baseline');
console.log('ok  small (refresh parameter saves baseline)');

writeFileSync(
	path.join(out, 'widgets.html'),
	`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#2b2d33;font-family:-apple-system,system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start;width:760px}
figure{margin:0}figcaption{color:#aaa;font-size:11px;margin-top:6px;text-align:center}
.w{border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;font-family:ui-rounded,-apple-system,system-ui,sans-serif;color:#fff}
.w.acc{border-radius:12px;filter:grayscale(1)}.t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none;max-width:100%;line-height:1.2}</style>
${figs.join('\n')}
<script>for(const t of document.querySelectorAll('.t')){const min=+t.dataset.min||1;let s=parseFloat(t.style.fontSize);const floor=s*min;while(t.scrollWidth>t.clientWidth+0.5&&s>floor){s-=0.5;t.style.fontSize=s+'px'}}</script>`
);

const app = await runAs('app');
if (!app.page) throw new Error('app mode did not load the live page');
if (app.page.includes('"__PAYLOAD__"')) throw new Error('payload was not injected');
writeFileSync(path.join(out, 'live.html'), app.page);
console.log(`ok  app → live view (${(app.page.length / 1024).toFixed(0)} KB, base ${app.base})`);

// The paste-once loader: downloads PactTracker.js from GitHub and runs it.
{
	const loader = readFileSync(path.join(root, 'scriptable/Loader.js'), 'utf8');
	for (const fam of ['app', 'medium']) {
		const inWidget = fam !== 'app';
		globalThis.config = { runsInWidget: inWidget, runsInAccessoryWidget: false, runsInApp: !inWidget, widgetFamily: inWidget ? fam : undefined };
		globalThis.args = { widgetParameter: null, queryParameters: {} };
		captured = { widget: null, page: null };
		await new AsyncFunction(loader)();
		if (inWidget ? !captured.widget : !captured.page) throw new Error(`loader (${fam}) produced nothing`);
		console.log(`ok  Loader.js → ${fam}`);
	}
}
