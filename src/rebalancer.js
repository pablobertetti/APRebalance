function rebalance(apStocks, coveragePercent, prices, holdings) {
  // Step 1: Sort by weight descending, filter to coverage threshold
  const sorted = [...apStocks].sort((a, b) => b.weight - a.weight);
  const totalAPWeight = sorted.reduce((sum, s) => sum + s.weight, 0);
  const threshold = (coveragePercent / 100) * totalAPWeight;

  let cumulative = 0;
  const activeModel = [];
  for (const stock of sorted) {
    cumulative += stock.weight;
    activeModel.push(stock);
    if (cumulative >= threshold) break;
  }

  // Step 2: Re-normalize selected weights to sum to 100
  const selectedWeightSum = activeModel.reduce((sum, s) => sum + s.weight, 0);
  const normalized = activeModel.map(s => ({
    ticker: s.ticker,
    normalizedWeight: (s.weight / selectedWeightSum) * 100,
  }));

  // Step 4: Total portfolio value (fixed; includes stocks to be sold)
  let totalValue = Object.entries(holdings).reduce((sum, [ticker, shares]) => {
    return sum + shares * (prices[ticker] || 0);
  }, 0);

  // If portfolio is empty, assume a base value to allow model generation
  if (totalValue === 0 && Object.keys(holdings).length === 0) {
    totalValue = 10000;
  }

  const modelTickers = new Set(normalized.map(s => s.ticker));
  const rawTrades = [];

  // Step 5+6: Compute trades for active model stocks
  for (const { ticker, normalizedWeight } of normalized) {
    const price = prices[ticker];
    if (!price) continue;
    const targetValue = totalValue * (normalizedWeight / 100);
    const targetShares = Math.floor(targetValue / price);
    const currentShares = holdings[ticker] || 0;
    const delta = targetShares - currentShares;
    if (delta !== 0) {
      rawTrades.push({
        ticker,
        action: delta > 0 ? 'BUY' : 'SELL',
        shares: Math.abs(delta),
        estValue: Math.abs(delta) * price,
      });
    }
  }

  // Step 6: Out-of-model holdings → SELL ALL
  for (const [ticker, shares] of Object.entries(holdings)) {
    if (!modelTickers.has(ticker) && shares > 0) {
      const price = prices[ticker] || 0;
      rawTrades.push({
        ticker,
        action: 'SELL',
        shares,
        estValue: shares * price,
      });
    }
  }

  // Filter sub-$1 trades
  const trades = [];
  let droppedCount = 0;
  for (const trade of rawTrades) {
    if (trade.estValue < 1) { droppedCount++; }
    else { trades.push(trade); }
  }

  // Deployed value: sum of (targetShares × price) for all model stocks
  const deployedValue = normalized.reduce((sum, { ticker, normalizedWeight }) => {
    const price = prices[ticker];
    if (!price) return sum;
    const targetShares = Math.floor(totalValue * (normalizedWeight / 100) / price);
    return sum + targetShares * price;
  }, 0);

  return { trades, droppedCount, totalValue, deployedValue };
}

if (typeof module !== 'undefined') module.exports = { rebalance };
