const assert = require('assert');
const { parseAPDump } = require('../src/ap-parser.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); failed++; }
}

// --- Basic non-winner block ---
test('parses a single non-winner block', () => {
  const input = `Company\tSymbol\tPicked\tReturn\tSector\tRating\tHolding %
Fabrinet
Fabrinet
FN\t3/2/2026
4.59%
Information Technology\tStrong Buy\t0.46%`;
  const result = parseAPDump(input);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].ticker, 'FN');
  assert.strictEqual(result[0].weight, 0.46);
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
console.log(`\n${passed} passed`);
