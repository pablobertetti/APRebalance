function findNearestLotPlan(lots, targetCents, preferOvershoot) {
  if (targetCents <= 0 || lots.length === 0) return [];

  let maxValueCents = 0;
  for (const lot of lots) {
    maxValueCents = Math.max(maxValueCents, lot.valueCents);
  }

  const searchLimit = targetCents + maxValueCents;
  const prevSum = new Int32Array(searchLimit + 1);
  const prevLot = new Int32Array(searchLimit + 1);
  prevSum.fill(-1);
  prevLot.fill(-1);
  prevSum[0] = 0;

  for (let i = 0; i < lots.length; i++) {
    const lotValue = lots[i].valueCents;
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
      (
        distance === bestDistance &&
        (
          (preferOvershoot && bestSum < targetCents && sum >= targetCents) ||
          (!preferOvershoot && bestSum > targetCents && sum <= targetCents)
        )
      )
    ) {
      bestSum = sum;
      bestDistance = distance;
    }
  }

  const selectedLots = [];
  while (bestSum > 0) {
    const lotIndex = prevLot[bestSum];
    selectedLots.push(lots[lotIndex]);
    bestSum = prevSum[bestSum];
  }

  return selectedLots;
}

function buildRemovalLots(trades, prices) {
  const lots = [];
  for (const trade of trades) {
    const priceCents = Math.round((prices[trade.ticker] || 0) * 100);
    if (priceCents <= 0 || trade.shares <= 0) continue;

    let remainingShares = trade.shares;
    let chunkSize = 1;
    while (remainingShares > 0) {
      const shares = Math.min(chunkSize, remainingShares);
      lots.push({ type: 'remove', ticker: trade.ticker, shares, valueCents: shares * priceCents });
      remainingShares -= shares;
      chunkSize *= 2;
    }
  }
  return lots;
}

function buildExtraBuyLots(trades, prices) {
  return trades
    .map((trade) => {
      const priceCents = Math.round((prices[trade.ticker] || 0) * 100);
      if (priceCents <= 0) return null;
      return { type: 'add', ticker: trade.ticker, shares: 1, valueCents: priceCents };
    })
    .filter(Boolean);
}

function sumSelectedShares(selectedLots) {
  const sharesByTicker = new Map();
  for (const lot of selectedLots) {
    sharesByTicker.set(lot.ticker, (sharesByTicker.get(lot.ticker) || 0) + lot.shares);
  }
  return sharesByTicker;
}

function buildMatchingSnapshot(holdings, prices, modelWeights, totalValue) {
  if (totalValue <= 0) return { score: 0, gaps: [] };

  const actualWeights = new Map();
  for (const [ticker, shares] of Object.entries(holdings)) {
    const value = shares * (prices[ticker] || 0);
    if (value <= 0) continue;
    actualWeights.set(ticker, (actualWeights.get(ticker) || 0) + (value / totalValue) * 100);
  }

  let score = 0;
  const gaps = [];
  const tickers = new Set([...modelWeights.keys(), ...actualWeights.keys()]);
  for (const ticker of tickers) {
    const modelWeight = modelWeights.get(ticker) || 0;
    const actualWeight = actualWeights.get(ticker) || 0;
    if (modelWeight > 0) {
      score += Math.min(actualWeight, modelWeight);
    }

    const gapWeight = actualWeight - modelWeight;
    if (Math.abs(gapWeight) < 0.005) continue;
    gaps.push({
      ticker,
      modelWeight,
      actualWeight,
      gapWeight,
      direction: modelWeight === 0 ? 'outside_model' : (gapWeight < 0 ? 'underweight' : 'overweight'),
    });
  }

  gaps.sort((a, b) => Math.abs(b.gapWeight) - Math.abs(a.gapWeight));

  return {
    score: Math.max(0, Math.min(100, Math.round(score * 10) / 10)),
    gaps: gaps.slice(0, 5),
  };
}

function applyTradesToHoldings(holdings, trades) {
  const nextHoldings = { ...holdings };
  for (const trade of trades) {
    const multiplier = trade.action === 'BUY' ? 1 : -1;
    nextHoldings[trade.ticker] = (nextHoldings[trade.ticker] || 0) + multiplier * trade.shares;
    if (nextHoldings[trade.ticker] <= 0) delete nextHoldings[trade.ticker];
  }
  return nextHoldings;
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
  const modelWeights = new Map(normalized.map(s => [s.ticker, s.normalizedWeight]));

  // Step 3: Total portfolio value (fixed; includes stocks to be sold)
  let totalValue = Object.entries(holdings).reduce((sum, [ticker, shares]) => {
    return sum + shares * (prices[ticker] || 0);
  }, 0);
  totalValue = Math.max(0, totalValue + cashAdjustment);

  // If totalValue is 0, no trades can be made
  if (totalValue === 0) {
    const emptyMatching = {
      current: buildMatchingSnapshot(holdings, prices, modelWeights, totalValue),
      after: buildMatchingSnapshot(holdings, prices, modelWeights, totalValue),
    };
    return { trades: [], droppedCount: 0, skippedCount: 0, totalValue, deployedValue: 0, matching: emptyMatching };
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
    const selectedLots = findNearestLotPlan(
      buildRemovalLots(buyTrades, prices),
      Math.round(cashDeficit * 100),
      true
    );
    const removalShares = sumSelectedShares(selectedLots);
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
    const buyTrades = rawTrades.filter(t => t.action === 'BUY');
    const trimRemovalLots = buildRemovalLots(trimTrades, prices);
    const extraBuyLots = buildExtraBuyLots(buyTrades, prices);
    const selectedLots = findNearestLotPlan(
      [...trimRemovalLots, ...extraBuyLots],
      Math.round(-cashDeficit * 100),
      false
    );
    const trimRemovalShares = sumSelectedShares(selectedLots.filter(lot => lot.type === 'remove'));
    const extraBuyShares = sumSelectedShares(selectedLots.filter(lot => lot.type === 'add'));

    for (const trade of trimTrades) {
      const sharesToRemove = trimRemovalShares.get(trade.ticker) || 0;
      if (sharesToRemove <= 0) continue;
      const price = prices[trade.ticker];
      trade.shares -= sharesToRemove;
      trade.estValue -= sharesToRemove * price;
      targetSharesMap.set(trade.ticker, targetSharesMap.get(trade.ticker) + sharesToRemove);
    }

    for (const trade of buyTrades) {
      const sharesToAdd = extraBuyShares.get(trade.ticker) || 0;
      if (sharesToAdd <= 0) continue;
      const price = prices[trade.ticker];
      trade.shares += sharesToAdd;
      trade.estValue += sharesToAdd * price;
      targetSharesMap.set(trade.ticker, targetSharesMap.get(trade.ticker) + sharesToAdd);
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
  const afterHoldings = applyTradesToHoldings(holdings, trades);
  const matching = {
    current: buildMatchingSnapshot(holdings, prices, modelWeights, totalValue),
    after: buildMatchingSnapshot(afterHoldings, prices, modelWeights, totalValue),
  };

  return { trades, droppedCount, skippedCount, totalValue, deployedValue, matching };
}

if (typeof module !== 'undefined') module.exports = { rebalance };
