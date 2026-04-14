function rebalance(apStocks, coveragePercent, prices, holdings, tolerancePercent = 0, cashAdjustment = 0) {
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

  // Step 3: Total portfolio value (fixed; includes stocks to be sold)
  let totalValue = Object.entries(holdings).reduce((sum, [ticker, shares]) => {
    return sum + shares * (prices[ticker] || 0);
  }, 0);
  totalValue = Math.max(0, totalValue + cashAdjustment);

  // If totalValue is 0, no trades can be made
  if (totalValue === 0) {
    return { trades: [], droppedCount: 0, skippedCount: 0, totalValue, deployedValue: 0 };
  }

  // Step 4: Largest remainder method — compute floor shares and remainders
  const positions = normalized
    .map(({ ticker, normalizedWeight }) => {
      const price = prices[ticker];
      if (!price) return null;
      const exact = totalValue * (normalizedWeight / 100) / price;
      return { ticker, price, floor: Math.floor(exact), remainder: exact % 1 };
    })
    .filter(Boolean);

  let remainingCash = totalValue - positions.reduce((s, p) => s + p.floor * p.price, 0);

  const targetSharesMap = new Map(positions.map(p => [p.ticker, p.floor]));
  const byRemainder = [...positions].sort((a, b) => b.remainder - a.remainder);
  for (const pos of byRemainder) {
    if (pos.price <= remainingCash) {
      targetSharesMap.set(pos.ticker, pos.floor + 1);
      remainingCash -= pos.price;
    }
  }

  const modelTickers = new Set(normalized.map(s => s.ticker));
  const rawTrades = [];
  let skippedCount = 0;

  // Step 5: Compute trades for active model stocks
  for (const { ticker } of positions) {
    const price = prices[ticker];
    const targetShares = targetSharesMap.get(ticker);
    const currentShares = holdings[ticker] || 0;

    if (tolerancePercent > 0 && targetShares > 0) {
      const deviation = Math.abs(currentShares - targetShares) / targetShares;
      if (deviation <= tolerancePercent / 100) {
        skippedCount++;
        continue;
      }
    }

    const delta = targetShares - currentShares;
    if (delta !== 0) {
      rawTrades.push({
        ticker,
        action: delta > 0 ? 'BUY' : 'SELL',
        subtype: delta > 0 ? (currentShares === 0 ? 'open' : 'add') : 'trim',
        shares: Math.abs(delta),
        estValue: Math.abs(delta) * price,
      });
    }
  }

  // Step 7: Out-of-model holdings → SELL ALL
  for (const [ticker, shares] of Object.entries(holdings)) {
    if (!modelTickers.has(ticker) && shares > 0) {
      const price = prices[ticker] || 0;
      rawTrades.push({
        ticker,
        action: 'SELL',
        subtype: 'close',
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
  const deployedValue = positions.reduce((sum, { ticker, price }) => {
    return sum + targetSharesMap.get(ticker) * price;
  }, 0);

  return { trades, droppedCount, skippedCount, totalValue, deployedValue };
}

if (typeof module !== 'undefined') module.exports = { rebalance };
