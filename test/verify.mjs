// Cross-checks collector output against pact.fi's own hourly analytics for the
// same full hours. The LP share should agree closely (the indexer records LP
// fees correctly on every pool type); the protocol share should come out higher
// here, by the constant-product PACT_FEE_BPS cut the indexer leaves at 0.
//
// Usage: node test/verify.mjs [dataDir]

import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? 'data');
const state = JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8'));
const res = await fetch('https://pact.fi/api/v1/analytics?chain=algorand-mainnet&window=7d');
const a = (await res.json()).data;

const apiTotal = new Map(a.feesSeries.map((p) => [p.t, p.v]));
const apiProto = new Map(a.protocolFeesSeries.map((p) => [p.t, p.v]));
const nowH = Math.floor(Date.now() / 1000 / 3600) * 3600;

let mine = [0, 0], api = [0, 0], hours = 0;
for (const [t, b] of Object.entries(state.hours)) {
	const h = Number(t);
	if (h >= nowH || !apiTotal.has(h)) continue; // full hours both sides have
	mine[0] += b[0];
	mine[1] += b[1];
	api[0] += apiTotal.get(h);
	api[1] += apiProto.get(h) ?? 0;
	hours++;
}
const f = (v) => '$' + v.toFixed(2).padStart(10);
console.log(`${hours} full hours compared\n`);
console.log('                 collector        pact.fi API');
console.log(`LP fees      ${f(mine[0] - mine[1])}   ${f(api[0] - api[1])}   (should match)`);
console.log(`Protocol     ${f(mine[1])}   ${f(api[1])}`);
console.log(`Total        ${f(mine[0])}   ${f(api[0])}`);
console.log(`\nAPI understates protocol by ${f(mine[1] - api[1]).trim()} and total by ${(100 * (1 - api[0] / mine[0])).toFixed(1)}%.`);
