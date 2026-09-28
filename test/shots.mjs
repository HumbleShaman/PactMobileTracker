// Screenshots preview/widgets.html and preview/live.html (WebKit, iPhone 15 viewport).
// Run test/sim.mjs first. Uses the Playwright install from the Pact frontend repo.
import { webkit, devices } from 'file:///C:/Users/akotu/PactBetaFun/frontend/node_modules/playwright/index.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const url = (f) => pathToFileURL(path.resolve('preview', f)).href;
const browser = await webkit.launch();

const w = await browser.newPage({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 2 });
await w.goto(url('widgets.html'));
await w.waitForTimeout(300);
await w.screenshot({ path: 'preview/widgets.png', fullPage: true });

const ctx = await browser.newContext({ ...devices['iPhone 15'] });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(url('live.html'));
await p.waitForTimeout(1200);
await p.screenshot({ path: 'preview/live-open.png' });
await p.waitForTimeout(Number(process.env.WAIT_MS ?? 9000));
await p.screenshot({ path: 'preview/live.png' });
await p.screenshot({ path: 'preview/live-full.png', fullPage: true });
const st = await p.evaluate(() => JSON.stringify(window.__pactState && window.__pactState()));
console.log('state', st, '| live label:', await p.textContent('#liveLabel'), '| feed rows:', await p.locator('#feed li').count());
console.log('footer:', (await p.textContent('#foot')).slice(0, 300));
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await browser.close();
