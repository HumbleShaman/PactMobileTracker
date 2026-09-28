// Pact Tracker loader — paste this whole file into a new Scriptable script once.
// Each run it pulls the latest PactTracker.js from GitHub (cached, so widgets
// keep working offline) and runs it. Updates on GitHub reach the phone on
// their own: immediately when opened in the app, within an hour on widgets.

const SRC = 'https://raw.githubusercontent.com/HumbleShaman/PactMobileTracker/main/scriptable/PactTracker.js';
const fm = FileManager.local();
const file = fm.joinPath(fm.cacheDirectory(), 'PactTracker.code.js');
let code = fm.fileExists(file) ? fm.readString(file) : null;
const age = code ? Date.now() - fm.modificationDate(file).getTime() : Infinity;

if (config.runsInApp || age > 60 * 60 * 1000) {
	try {
		const req = new Request(SRC);
		req.timeoutInterval = 10;
		const fresh = await req.loadString();
		if (req.response.statusCode === 200 && fresh.includes('module.exports')) {
			code = fresh;
			fm.writeString(file, fresh);
		}
	} catch (e) {}
}
if (!code) throw new Error('Could not download PactTracker.js. Check your connection and run again.');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const mod = { exports: {} };
await new AsyncFunction('module', '__pactLoader', code)(mod, true);
await mod.exports.run();
