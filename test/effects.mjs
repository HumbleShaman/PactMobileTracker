// Drives the reward effects in a real browser: sound unlock, each preview tier,
// and demo mode. Screenshots land in preview/fx-*.png.
import { chromium } from 'file:///C:/Users/akotu/PactBetaFun/frontend/node_modules/playwright/index.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const url = pathToFileURL(path.resolve('scriptable/live.html')).href;
const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url + '?demo=1');
await p.waitForFunction(() => window.__pactState && window.__pactState(), null, { timeout: 60000 });
const before = await p.evaluate(() => ({ locked: document.getElementById('sndBtn').classList.contains('locked'), ready: Sound.ready() }));
console.log('before click:', JSON.stringify(before));
await p.mouse.click(700, 600); // any gesture unlocks audio
await p.waitForTimeout(300);
console.log('after click: ready =', await p.evaluate(() => Sound.ready()), '| hint shown =', await p.evaluate(() => document.getElementById('sndBtn').classList.contains('locked')));
for (const t of [3, 4, 5]) {
	await p.evaluate((t) => reward(sampleSwap(t), true), t);
	await p.waitForTimeout(t === 5 ? 650 : 450);
	await p.screenshot({ path: `preview/fx-tier${t}.png` });
	await p.waitForTimeout(3200);
}
await p.waitForTimeout(9000); // let demo mode run
await p.screenshot({ path: 'preview/fx-demo.png' });
console.log('session hud:', await p.textContent('#hud'));
console.log('combo shown:', await p.evaluate(() => document.getElementById('combo').className));
// settings popover
await p.click('#sndBtn');
await p.waitForTimeout(200);
await p.screenshot({ path: 'preview/fx-settings.png', clip: { x: 900, y: 0, width: 540, height: 360 } });
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await browser.close();
