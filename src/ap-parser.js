function parseAPDump(text) {
  const lines = text.split('\n').map(l => l.trim());

  // Find header line starting with "Company"
  let i = 0;
  while (i < lines.length && !lines[i].startsWith('Company')) i++;
  i++; // skip header

  // SA now repeats column headers twice before data. Advance until we find
  // two consecutive identical non-empty lines — that's the company-name pair
  // that opens the first stock block (works with both old and new formats).
  while (i + 1 < lines.length) {
    if (lines[i] && lines[i] === lines[i + 1]) break;
    i++;
  }

  const stockMap = {};

  while (i < lines.length) {
    // Skip blank lines between blocks
    if (!lines[i]) { i++; continue; }

    // Line 1: company name (skip)
    i++;
    if (i >= lines.length) break;

    // Line 2: company name repeated (skip)
    if (!lines[i]) { i++; continue; }
    i++;
    if (i >= lines.length) break;

    // Optional "Winner" badge
    if (lines[i] === 'Winner') {
      i++;
      if (i >= lines.length) break;
    }

    // Ticker + date line (tab-separated; ticker is first token)
    if (!lines[i]) { i++; continue; }
    const ticker = lines[i].split(/[\t\s]/)[0].toUpperCase();
    i++;
    if (i >= lines.length) break;

    // Return % line (skip)
    i++;
    if (i >= lines.length) break;

    // Sector + Rating + Holding% (tab-separated; weight is last token)
    const infoLine = lines[i++];
    const parts = infoLine.split('\t');
    const holdingStr = parts[parts.length - 1].trim();
    const weight = parseFloat(holdingStr.replace('%', ''));

    if (ticker && !isNaN(weight)) {
      stockMap[ticker] = (stockMap[ticker] || 0) + weight;
    }
  }

  return Object.entries(stockMap).map(([ticker, weight]) => ({ ticker, weight }));
}

if (typeof module !== 'undefined') module.exports = { parseAPDump };
