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

// --- Winner block ---
test('parses a winner block (skips "Winner" badge line)', () => {
  const input = `Company\tSymbol\n` +
    `Argan, Inc.\nArgan, Inc.\nWinner\nAGX\t10/15/2024\n282.53%\nIndustrials\tHold\t4.26%`;
  const result = parseAPDump(input);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].ticker, 'AGX');
  assert.strictEqual(result[0].weight, 4.26);
});

// --- Duplicate tickers are summed ---
test('sums weights for duplicate tickers', () => {
  const block = (company, ticker, weight) =>
    `${company}\n${company}\n${ticker}\t1/1/2024\n10%\nSector\tBuy\t${weight}%`;
  const input = `Company\tSymbol\n${block('Brinker Intl', 'EAT', 1.36)}\n${block('Brinker Intl', 'EAT', 3.13)}`;
  const result = parseAPDump(input);
  const eat = result.find(s => s.ticker === 'EAT');
  assert.ok(eat, 'EAT should be present');
  assert.ok(Math.abs(eat.weight - 4.49) < 0.001, `expected 4.49, got ${eat.weight}`);
  assert.strictEqual(result.length, 1, 'should have only one EAT entry');
});

// --- Full sample file ---
test('parses Sample_AP_dump.txt and returns many stocks', () => {
  const fs = require('fs');
  const text = fs.readFileSync('Sample_AP_dump.txt', 'utf8');
  const result = parseAPDump(text);
  assert.ok(result.length > 20, `expected >20 stocks, got ${result.length}`);
  // Verify all have ticker and weight
  for (const s of result) {
    assert.ok(s.ticker, 'ticker should be non-empty');
    assert.ok(s.weight > 0, `weight should be > 0 for ${s.ticker}`);
  }
  // EAT appears twice in the sample; should be merged
  const eat = result.filter(s => s.ticker === 'EAT');
  assert.strictEqual(eat.length, 1, 'EAT should be deduped to one entry');
});

// --- Tickers normalized to uppercase ---
test('normalizes tickers to uppercase', () => {
  const input = `Company\tSymbol\nFabrinet\nFabrinet\nfn\t3/2/2026\n4.59%\nIT\tBuy\t0.46%`;
  const result = parseAPDump(input);
  assert.strictEqual(result[0].ticker, 'FN');
});

// --- Blank lines before header are ignored ---
test('handles leading blank lines before header', () => {
  const input = `\n\nCompany\tSymbol\nFabrinet\nFabrinet\nFN\t3/2/2026\n4.59%\nIT\tBuy\t0.46%`;
  const result = parseAPDump(input);
  assert.strictEqual(result.length, 1);
});

if (failed > 0) { console.error(`\n${failed} failed`); process.exit(1); }
console.log(`\n${passed} passed`);
