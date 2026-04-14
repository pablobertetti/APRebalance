function findNearestRemovalPlan(buyTrades, prices, cashDeficit) {
  const targetCents = Math.round(cashDeficit * 100);
  if (targetCents <= 0 || buyTrades.length === 0) return new Map();

  const buyLots = [];
  let maxPriceCents = 0;
  for (const trade of buyTrades) {
    const priceCents = Math.round((prices[trade.ticker] || 0) * 100);
    if (priceCents <= 0 || trade.shares <= 0) continue;
    maxPriceCents = Math.max(maxPriceCents, priceCents);

    let remainingShares = trade.shares;
    let chunkSize = 1;
    while (remainingShares > 0) {
      const shares = Math.min(chunkSize, remainingShares);
      buyLots.push({ ticker: trade.ticker, shares, valueCents: shares * priceCents });
      remainingShares -= shares;
      chunkSize *= 2;
    }
  }

  if (buyLots.length === 0) return new Map();

  const searchLimit = targetCents + maxPriceCents;
  const prevSum = new Int32Array(searchLimit + 1);
  const prevLot = new Int32Array(searchLimit + 1);
  prevSum.fill(-1);
  prevLot.fill(-1);
  prevSum[0] = 0;

  for (let i = 0; i < buyLots.length; i++) {
    const lotValue = buyLots[i].valueCents;
    for (let sum = searchLimit - lotValue; sum >= 0; sum--) {
      if (prevSum[sum] === -1) continue;
      const next = sum + lotValue;
      if (prevSum[next] !== -1) continue;
      prevSum[next] = sum;
      prevLot[next] = i;
    }
  }

  let bestSum = -1;
  let bestDistance = Infinity;
  for (let sum = 0; sum <= searchLimit; sum++) {
    if (prevSum[sum] === -1) continue;
    const distance = Math.abs(sum - targetCents);
    if (
      distance < bestDistance ||
      (distance === bestDistance && bestSum < targetCents && sum >= targetCents)
    ) {
      bestSum = sum;
      bestDistance = distance;
    }
  }

  const removalShares = new Map();
  while (bestSum > 0) {
    const lotIndex = prevLot[bestSum];
    const lot = buyLots[lotIndex];
    removalShares.set(lot.ticker, (removalShares.get(lot.ticker) || 0) + lot.shares);
    bestSum = prevSum[bestSum];
  }

  return removalShares;
}

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

  // Cash-neutral adjustment: minimize net cash flow after whole-share rounding.
  // When tolerance skips trades, or whole-share constraints leave a mismatch,
  // adjust buys or trims so net cash is as close to zero as possible.
  const totalBuyValue = rawTrades.filter(t => t.action === 'BUY').reduce((s, t) => s + t.estValue, 0);
  const totalSellValue = rawTrades.filter(t => t.action === 'SELL').reduce((s, t) => s + t.estValue, 0);
  let cashDeficit = Math.round((totalBuyValue - totalSellValue - cashAdjustment) * 100) / 100;

  if (cashDeficit > 0) {
    const buyTrades = rawTrades.filter(t => t.action === 'BUY');
    const removalShares = findNearestRemovalPlan(buyTrades, prices, cashDeficit);
    for (const trade of buyTrades) {
      const sharesToRemove = removalShares.get(trade.ticker) || 0;
      if (sharesToRemove <= 0) continue;
      const price = prices[trade.ticker];
      trade.shares -= sharesToRemove;
      trade.estValue -= sharesToRemove * price;
      targetSharesMap.set(trade.ticker, targetSharesMap.get(trade.ticker) - sharesToRemove);
    }
  } else if (cashDeficit < 0) {
    const trimTrades = rawTrades.filter(t => t.action === 'SELL' && t.subtype === 'trim');
    const removalShares = findNearestRemovalPlan(trimTrades, prices, -cashDeficit);
    for (const trade of trimTrades) {
      const sharesToRemove = removalShares.get(trade.ticker) || 0;
      if (sharesToRemove <= 0) continue;
      const price = prices[trade.ticker];
      trade.shares -= sharesToRemove;
      trade.estValue -= sharesToRemove * price;
      targetSharesMap.set(trade.ticker, targetSharesMap.get(trade.ticker) + sharesToRemove);
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
