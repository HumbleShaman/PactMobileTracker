// Opens scriptable/live.html standalone (as GitHub Pages serves it) at desktop
// size, checks the localStorage baseline round-trip, and screenshots it.
import { chromium } from 'file:///C:/Users/akotu/PactBetaFun/frontend/node_modules/playwright/index.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const url = pathToFileURL(path.resolve('scriptable/live.html')).href;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url);
await p.waitForFunction(() => window.__pactState && window.__pactState(), null, { timeout: 60000 });
await p.waitForTimeout(3500);
await p.screenshot({ path: 'preview/desktop.png' });
console.log('title:', await p.title());
console.log('gain label (first visit):', await p.textContent('#gainLabel'));
// Pretend we left 2h ago with a lower total, then reopen.
// Leave (closing saves the baseline), then come back with that baseline
// rewound by $12.34 / 2h, edited before the page's own scripts run.
await p.close();
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
const p2 = await ctx.newPage();
p2.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p2.goto(url);
await p2.waitForFunction(() => window.__pactState && window.__pactState(), null, { timeout: 60000 });
await p2.waitForTimeout(2500);
console.log('gain after reopen:', await p2.textContent('#gainVal'), '|', await p2.textContent('#gainLabel'));
await p2.screenshot({ path: 'preview/desktop-reopen.png' });
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await browser.close();
