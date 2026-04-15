const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

function normalize(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function extractBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) throw new Error(`missing marker: ${startMarker}`);
  const from = start + startMarker.length;
  const end = text.indexOf(endMarker, from);
  if (end === -1) throw new Error(`missing marker: ${endMarker}`);
  return text.slice(from, end);
}

const repoRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'APRebalance.html'), 'utf8');

const blocks = [
  {
    name: 'ap-parser',
    srcPath: path.join(repoRoot, 'src', 'ap-parser.js'),
    indexBlock: extractBetween(indexHtml, '// ── ap-parser.js ──\n', '\n\n// ── portfolio-parser.js ──'),
  },
  {
    name: 'portfolio-parser',
    srcPath: path.join(repoRoot, 'src', 'portfolio-parser.js'),
    indexBlock: extractBetween(indexHtml, '// ── portfolio-parser.js ──\n', '\n\n// ── rebalancer.js ──'),
  },
  {
    name: 'rebalancer',
    srcPath: path.join(repoRoot, 'src', 'rebalancer.js'),
    indexBlock: extractBetween(indexHtml, '// ── rebalancer.js ──\n', '\n\n// ── finnhub-provider.js ──'),
  },
  {
    name: 'finnhub-provider',
    srcPath: path.join(repoRoot, 'src', 'finnhub-provider.js'),
    indexBlock: extractBetween(indexHtml, '// ── finnhub-provider.js ──\n', '\n\n// ── ui.js ──'),
  },
  {
    name: 'ui',
    srcPath: path.join(repoRoot, 'src', 'ui.js'),
    indexBlock: extractBetween(indexHtml, '// ── ui.js ──\n', '\n</script>'),
  },
];

for (const block of blocks) {
  test(`APRebalance.html inlined ${block.name} matches src/${block.name}.js`, () => {
    const srcText = normalize(fs.readFileSync(block.srcPath, 'utf8'));
    const indexText = normalize(block.indexBlock);
    assert.strictEqual(indexText, srcText);
  });
}

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);
