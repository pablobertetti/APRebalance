// src/ui.js

// ── App State ──────────────────────────────────────────────────────────────
const state = {
  apStocks: null,       // [{ticker, weight}] post-dedup, weight-sorted
  holdings: null,       // {ticker: shares}
  isRebalanced: false,
};

function fmt(n) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtPct(n) {
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}

function setStepState(stepId, variant, text) {
  const el = document.getElementById(stepId);
  if (!el) return;
  el.className = `step-badge ${variant}`;
  el.textContent = text;
}

function setTradeNote(html) {
  document.getElementById('trade-note').innerHTML = html;
}

function getAPCoverageStats(stocks, coveragePct) {
  if (!stocks || stocks.length === 0) {
    return { includedCount: 0, excludedCount: 0, coveredWeight: 0, totalWeight: 0 };
  }

  const totalWeight = stocks.reduce((sum, stock) => sum + stock.weight, 0);
  const threshold = (coveragePct / 100) * totalWeight;
  let cumulative = 0;
  let includedCount = 0;

  for (const stock of stocks) {
    if (cumulative < threshold) includedCount++;
    cumulative += stock.weight;
  }

  return {
    includedCount,
    excludedCount: Math.max(0, stocks.length - includedCount),
    coveredWeight: Math.min(cumulative, totalWeight),
    totalWeight,
  };
}

function renderTradeEmptyState(message, detail) {
  return `<div class="empty-state">
    <div class="empty-icon">+</div>
    <div>
      <h3>${message}</h3>
      <p>${detail}</p>
    </div>
  </div>`;
}

function clearTrades() {
  state.isRebalanced = false;
  document.getElementById('trade-content').innerHTML = renderTradeEmptyState(
    'Rebalance plan pending',
    'Parse the model and confirm your holdings to generate a rebalance plan.'
  );
  setTradeNote('<span>Waiting for a fresh rebalance run.</span>');
  setStepState('trade-step-badge', 'waiting', 'Waiting');
  updateRebalanceButton();
}

// ── Rebalance button enable logic ──────────────────────────────────────────
function updateRebalanceButton() {
  const btn = document.getElementById('rebalance-btn');
  const apiKey = document.getElementById('api-key').value.trim();
  btn.disabled = !(state.apStocks && state.holdings && apiKey);
}

// ── AP Panel ───────────────────────────────────────────────────────────────
function renderAPTable(stocks, coveragePct) {
  if (!stocks || stocks.length === 0) return '';

  const totalAPWeight = stocks.reduce((s, x) => s + x.weight, 0);
  const threshold = (coveragePct / 100) * totalAPWeight;

  let cumulative = 0;
  let rows = '';
  for (const { ticker, weight } of stocks) {
    cumulative += weight;
    const cumPct = (cumulative / totalAPWeight * 100).toFixed(1);
    const isExcluded = (cumulative - weight) >= threshold;
    rows += `<tr class="${isExcluded ? 'excluded' : ''}">
      <td><span class="ticker-chip">${ticker}</span></td>
      <td class="numeric">${weight.toFixed(2)}%</td>
      <td class="numeric">${cumPct}%</td>
      <td>${isExcluded ? '<span class="inline-tag muted">Excluded</span>' : '<span class="inline-tag active">Included</span>'}</td>
    </tr>`;
  }

  return `<div class="table-wrap">
    <table>
      <thead><tr><th>Ticker</th><th class="numeric">Weight</th><th class="numeric">Cumulative</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function updateAPSummary() {
  const coveragePct = parseInt(document.getElementById('coverage-slider').value, 10);
  document.getElementById('coverage-display').textContent = coveragePct;
}

function updateSliderGreying() {
  const coveragePct = parseInt(document.getElementById('coverage-slider').value, 10);
  if (!state.apStocks) return;

  const totalAPWeight = state.apStocks.reduce((s, x) => s + x.weight, 0);
  const threshold = (coveragePct / 100) * totalAPWeight;

  let cumulative = 0;
  const rows = document.querySelectorAll('#ap-table-container tbody tr');
  state.apStocks.forEach((stock, idx) => {
    cumulative += stock.weight;
    const isExcluded = (cumulative - stock.weight) >= threshold;
    rows[idx]?.classList.toggle('excluded', isExcluded);
  });

  const stats = getAPCoverageStats(state.apStocks, coveragePct);
  setTradeNote(
    `<span>Coverage includes ${stats.includedCount} name${stats.includedCount !== 1 ? 's' : ''}; ${stats.excludedCount} excluded below threshold.</span>`
  );
}

document.getElementById('parse-btn').addEventListener('click', () => {
  const text = document.getElementById('ap-input').value;
  const status = document.getElementById('parse-status');

  try {
    const stocks = parseAPDump(text);
    if (stocks.length === 0) throw new Error('No stocks found. Check the paste format.');
    stocks.sort((a, b) => b.weight - a.weight);
    state.apStocks = stocks;

    const coveragePct = parseInt(document.getElementById('coverage-slider').value, 10);
    document.getElementById('ap-table-container').innerHTML = renderAPTable(stocks, coveragePct);
    document.getElementById('slider-row').style.display = 'flex';
    updateAPSummary();
    updateSliderGreying();

    status.className = 'status-line ok';
    status.textContent = `✓ ${stocks.length} stocks parsed`;
    setStepState('ap-step-badge', 'ready', 'Ready');
    clearTrades();
  } catch (e) {
    status.className = 'status-line error';
    status.textContent = e.message;
    state.apStocks = null;
    document.getElementById('ap-table-container').innerHTML = '';
    document.getElementById('slider-row').style.display = 'none';
    updateAPSummary();
    setStepState('ap-step-badge', 'error', 'Needs Fix');
    clearTrades();
  }
});

const slider = document.getElementById('coverage-slider');
slider.addEventListener('input', () => {
  updateAPSummary();
  updateSliderGreying();
  clearTrades();
});

document.getElementById('tolerance-input').addEventListener('input', () => {
  clearTrades();
});

document.getElementById('cash-adjustment').addEventListener('input', () => {
  clearTrades();
});

// ── Portfolio Panel ────────────────────────────────────────────────────────
function updatePortfolioStatus() {
  const text = document.getElementById('portfolio-input').value;
  const statusEl = document.getElementById('portfolio-status');

  if (!text.trim()) {
    statusEl.className = 'status-line muted';
    statusEl.textContent = '';
    state.holdings = null;
    setStepState('portfolio-step-badge', 'waiting', 'Waiting');
    updateRebalanceButton();
    return;
  }

  const { holdings, errors } = parsePortfolio(text);

  if (errors.length > 0) {
    statusEl.className = 'status-line error';
    statusEl.textContent = errors[0];
    state.holdings = null;
    setStepState('portfolio-step-badge', 'error', 'Needs Fix');
  } else if (Object.keys(holdings).length === 0) {
    statusEl.className = 'status-line error';
    statusEl.textContent = 'No valid holdings found.';
    state.holdings = null;
    setStepState('portfolio-step-badge', 'error', 'Needs Fix');
  } else {
    const count = Object.keys(holdings).length;
    statusEl.className = 'status-line ok';
    statusEl.textContent = `✓ ${count} position${count !== 1 ? 's' : ''}`;
    state.holdings = holdings;
    setStepState('portfolio-step-badge', 'ready', 'Ready');
  }

  updateRebalanceButton();
}

document.getElementById('portfolio-input').addEventListener('input', () => {
  updatePortfolioStatus();
  clearTrades();
});

document.getElementById('api-key').addEventListener('input', () => {
  document.getElementById('api-key-error').textContent = '';
  updateRebalanceButton();
  if (state.isRebalanced) clearTrades();
});

// Persist API key in localStorage
const apiKeyInput = document.getElementById('api-key');
apiKeyInput.value = localStorage.getItem('finnhub_api_key') || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('finnhub_api_key', apiKeyInput.value.trim());
});

// ── Trade Table Rendering ──────────────────────────────────────────────────
function renderTradeRows(list, cls) {
  const subtypeLabel = { open: 'Open', add: 'Add', trim: 'Trim', close: 'Close' };
  return list.map(t =>
    `<tr class="${cls}">
      <td><span class="ticker-chip">${t.ticker}</span></td>
      <td><span class="action-pill ${cls === 'trade-row-buy' ? 'buy' : 'sell'}">${t.action}</span></td>
      <td><span class="inline-tag">${subtypeLabel[t.subtype] || ''}</span></td>
      <td class="numeric">${t.shares.toLocaleString()}</td>
      <td class="numeric">${fmt(t.estValue)}</td>
    </tr>`
  ).join('');
}

function renderGapRows(gaps) {
  if (!gaps || gaps.length === 0) {
    return '<div class="match-gap-row">No material gaps.</div>';
  }

  const directionLabel = {
    underweight: 'underweight',
    overweight: 'overweight',
    outside_model: 'outside model',
  };

  return gaps.map((gap) => {
    const magnitude = Math.abs(gap.gapWeight).toFixed(1);
    return `<div class="match-gap-row">
      <span>${gap.ticker}</span>
      <strong>${directionLabel[gap.direction] || 'off target'} ${magnitude} pp</strong>
    </div>`;
  }).join('');
}

function renderMatchingCard(matching) {
  if (!matching) return '';

  const current = matching.current?.score || 0;
  const after = matching.after?.score || 0;
  const delta = Math.round((after - current) * 10) / 10;
  const deltaText = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp`;

  return `<div class="metric-card match-card" tabindex="0" aria-label="AP Match ${fmtPct(current)} to ${fmtPct(after)}, ${deltaText}">
    <div class="metric-label">AP Match</div>
    <strong class="metric-value">${fmtPct(current)} <span class="metric-arrow">to</span> ${fmtPct(after)}</strong>
    <div class="match-tooltip" role="tooltip">
      <div class="match-tooltip-title">Top gaps now</div>
      ${renderGapRows(matching.current?.gaps)}
    </div>
  </div>`;
}

function renderTrades({ trades, droppedCount, skippedCount, totalValue, deployedValue, matching }) {
  if (trades.length === 0 && droppedCount === 0) {
    return `<div class="result-shell">
      <div class="result-summary">
        ${renderMatchingCard(matching)}
        <div class="metric-card">
          <div class="metric-label">Buys</div>
          <strong class="metric-value green">${fmt(0)}</strong>
        </div>
        <div class="metric-card">
          <div class="metric-label">Sells</div>
          <strong class="metric-value red">${fmt(0)}</strong>
        </div>
        <div class="metric-card">
          <div class="metric-label">Portfolio value</div>
          <strong class="metric-value">${fmt(totalValue)}</strong>
        </div>
      </div>
      ${renderTradeEmptyState('Already balanced', 'The current holdings are already close enough to the target. No trades are needed.')}
    </div>`;
  }

  const buys = trades.filter(t => t.action === 'BUY').sort((a, b) => b.estValue - a.estValue);
  const sells = trades.filter(t => t.action === 'SELL').sort((a, b) => b.estValue - a.estValue);
  const totalBuy = buys.reduce((s, t) => s + t.estValue, 0);
  const totalSell = sells.reduce((s, t) => s + t.estValue, 0);

  const notices = [
    droppedCount > 0 ? `<div class="notice-chip">Ignored ${droppedCount} trade${droppedCount !== 1 ? 's' : ''} under $1.</div>` : '',
    skippedCount > 0 ? `<div class="notice-chip">Skipped ${skippedCount} trade${skippedCount !== 1 ? 's' : ''} within tolerance.</div>` : '',
  ].join('');

  return `<div class="result-shell">
    <div class="result-summary">
      ${renderMatchingCard(matching)}
      <div class="metric-card">
        <div class="metric-label">Buys</div>
        <strong class="metric-value green">${fmt(totalBuy)}</strong>
      </div>
      <div class="metric-card">
        <div class="metric-label">Sells</div>
        <strong class="metric-value red">${fmt(totalSell)}</strong>
      </div>
      <div class="metric-card">
        <div class="metric-label">Portfolio value</div>
        <strong class="metric-value">${fmt(totalValue)}</strong>
      </div>
    </div>
    ${notices ? `<div class="notice-row">${notices}</div>` : ''}
    <div class="table-wrap trade-table-wrap">
      <table>
        <thead><tr><th>Ticker</th><th>Action</th><th>Type</th><th class="numeric">Shares</th><th class="numeric">Est. value</th></tr></thead>
        <tbody>
          ${renderTradeRows(buys, 'trade-row-buy')}
          ${renderTradeRows(sells, 'trade-row-sell')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function showError(html) {
  document.getElementById('trade-content').innerHTML = `<div class="banner error">${html}</div>`;
  setStepState('trade-step-badge', 'error', 'Error');
}

// ── Rebalance Button ───────────────────────────────────────────────────────
document.getElementById('rebalance-btn').addEventListener('click', async () => {
  const apiKey = document.getElementById('api-key').value.trim();
  const coveragePct = parseInt(document.getElementById('coverage-slider').value, 10);
  const btn = document.getElementById('rebalance-btn');
  const tradeContent = document.getElementById('trade-content');

  if (!state.apStocks || !state.holdings || !apiKey) return;

  btn.disabled = true;
  tradeContent.innerHTML = '<div class="loading-state"><div class="loading-dot"></div><p class="loading">Fetching live prices and building the trade plan...</p></div>';
  setStepState('trade-step-badge', 'working', 'Calculating');
  setTradeNote('<span>Requesting live quotes from Finnhub.</span>');

  const apTickers = state.apStocks.map(s => s.ticker);
  const portfolioTickers = Object.keys(state.holdings);
  const allTickers = [...new Set([...apTickers, ...portfolioTickers])];

  let prices;
  try {
    prices = await FinnhubProvider.getPrices(allTickers, apiKey);
  } catch (err) {
    if (err.type === 'invalid_key') {
      showError('Invalid API key. Check your Finnhub key and try again.');
      document.getElementById('api-key-error').textContent = 'Invalid key';
    } else if (err.type === 'rate_limit') {
      showError('Rate limit exceeded. Wait a moment and try again.');
    } else if (err.type === 'not_found') {
      showError(`Tickers not found: <strong>${err.tickers.join(', ')}</strong>. Check ticker symbols.`);
    } else {
      showError(`Price fetch failed (HTTP ${err.status || 'error'}). Try again.`);
    }
    btn.disabled = false;
    return;
  }

  const tolerancePct = parseFloat(document.getElementById('tolerance-input').value) || 0;
  const cashAdj = parseFloat(document.getElementById('cash-adjustment').value) || 0;
  const result = rebalance(state.apStocks, coveragePct, prices, state.holdings, tolerancePct, cashAdj);
  tradeContent.innerHTML = renderTrades(result);
  state.isRebalanced = true;
  btn.disabled = false;
  setStepState('trade-step-badge', 'ready', 'Calculated');
  setTradeNote('<span>Rebalance plan reflects current coverage, tolerance, and cash settings.</span>');
  updateRebalanceButton();
});

updateAPSummary();
updatePortfolioStatus();
clearTrades();
updateRebalanceButton();
