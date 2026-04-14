function parsePortfolio(text) {
  const lines = text.split('\n');
  const holdingMap = {};
  const errors = [];
  const validSharePattern = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/[,;\t]|\s+/).map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length < 2) {
      errors.push(`Line ${i + 1}: expected TICKER SHARES (comma, semicolon, tab, or space)`);
      continue;
    }

    const ticker = parts[0].toUpperCase();
    const sharesStr = parts[1];
    const shares = parseFloat(sharesStr);

    if (!ticker || !validSharePattern.test(sharesStr) || isNaN(shares) || shares < 0) {
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
