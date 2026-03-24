function parsePortfolio(text) {
  const lines = text.split('\n');
  const holdingMap = {};
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) {
      errors.push(`Line ${i + 1}: expected "TICKER, shares" format`);
      continue;
    }

    const ticker = line.slice(0, commaIdx).trim().toUpperCase();
    const sharesStr = line.slice(commaIdx + 1).trim();
    const shares = parseFloat(sharesStr);

    if (!ticker || isNaN(shares) || shares < 0) {
      errors.push(`Line ${i + 1}: invalid ticker or share count`);
      continue;
    }

    holdingMap[ticker] = (holdingMap[ticker] || 0) + shares;
  }

  // Remove zero-share holdings
  for (const ticker of Object.keys(holdingMap)) {
    if (holdingMap[ticker] === 0) delete holdingMap[ticker];
  }

  return { holdings: holdingMap, errors };
}

function isValidPortfolio(text) {
  if (!text.trim()) return false;
  const { errors, holdings } = parsePortfolio(text);
  return errors.length === 0 && Object.keys(holdings).length > 0;
}

if (typeof module !== 'undefined') module.exports = { parsePortfolio, isValidPortfolio };
