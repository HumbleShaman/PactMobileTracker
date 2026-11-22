// Opens scriptable/live.html standalone (as GitHub Pages serves it), walks every
// tab at desktop and phone width in light and dark, checks the "since you last
// checked" baseline round-trip, and screenshots into preview/.
//
//   node test/desktop.mjs [dataDir]
//
// With a dataDir (a collector output folder holding feed.json + market.json),
// the page reads those instead of the live `data` branch, e.g. after
// `node collector/collect.mjs /tmp/pmt` to try collector changes before pushing.
import { chromium } from 'file:///C:/Users/akotu/PactBetaFun/frontend/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(path.resolve('scriptable/live.html')).href;
const dataDir = process.argv[2];
const TABS = ['overview', 'flow', 'pools', 'liq', 'tokens', 'gap'];
mkdirSync('preview', { recursive: true });

const browser = await chromium.launch();
const errs = [];
async function open(ctx, hash) {
	if (dataDir) {
		await ctx.route('https://raw.githubusercontent.com/HumbleShaman/PactMobileTracker/data/**', (r) =>
			r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(path.join(dataDir, r.request().url().split('/').pop())) })
		);
	}
	// Serve the self-hosted font from the working tree (GitHub Pages only has it after a push).
	await ctx.route('https://humbleshaman.github.io/PactMobileTracker/scriptable/fonts/**', (r) =>
		r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(path.join('scriptable/fonts', r.request().url().split('/').pop())) })
	);
	const p = await ctx.newPage();
	p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
	p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
	await p.goto(url + '#' + hash);
	await p.waitForFunction(() => window.__pactState && window.__pactState(), null, { timeout: 180000 });
	await p.waitForTimeout(2500);
	return p;
}

for (const [w, scheme] of [[1440, 'light'], [1440, 'dark'], [390, 'light']]) {
	const ctx = await browser.newContext({ viewport: { width: w, height: w > 600 ? 900 : 844 }, deviceScaleFactor: w > 600 ? 1 : 2, colorScheme: scheme });
	const p = await open(ctx, 'overview');
	for (const t of TABS) {
		await p.evaluate((t) => (location.hash = t), t);
		await p.waitForTimeout(t === 'tokens' ? 2500 : 900);
		const empty = await p.$$eval('#v-' + t + ' .empty', (els) => els.filter((e) => e.offsetParent).map((e) => e.textContent));
		if (empty.length) console.log(`${t} @${w}: empty states → ${empty.join(' | ')}`);
		await p.screenshot({ path: `preview/${t}-${w}-${scheme}.png`, fullPage: true });
	}
	await ctx.close();
}

// Baseline round-trip: leave (saves), rewind the saved total by $12.34, reopen.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p1 = await open(ctx, 'overview');
await p1.close();
await ctx.addInitScript(() => {
	const k = 'pactTracker.base.v1';
	const s = JSON.parse(localStorage.getItem(k) || 'null');
	if (!s) throw new Error('no saved baseline after leaving');
	if (sessionStorage.getItem('rewound')) return;
	sessionStorage.setItem('rewound', '1');
	s.total -= 12.34;
	s.at -= 2 * 3600e3;
	localStorage.setItem(k, JSON.stringify(s));
});
const p2 = await open(ctx, 'overview');
console.log('since last checked:', (await p2.textContent('#gain')) || '(none)');
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await browser.close();
