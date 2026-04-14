// src/ui.js

// ── App State ──────────────────────────────────────────────────────────────
const state = {
  apStocks: null,       // [{ticker, weight}] post-dedup, weight-sorted
  holdings: null,       // {ticker: shares}
  isRebalanced: false,
};

function clearTrades() {
  state.isRebalanced = false;
  document.getElementById('trade-content').innerHTML =
    '<p style="color:#aaa;font-size:13px;">Parse your AP model and portfolio, then click Rebalance.</p>';
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
      <td>${ticker}</td>
      <td>${weight.toFixed(2)}%</td>
      <td>${cumPct}%</td>
    </tr>`;
  }

  return `<div class="ap-table-wrap">
    <table>
      <thead><tr><th>Ticker</th><th>Weight</th><th>Cumulative %</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
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
}

document.getElementById('parse-btn').addEventListener('click', () => {
  const text = document.getElementById('ap-input').value;
  const status = document.getElementById('parse-status');
  try {
    const stocks = parseAPDump(text);
    if (stocks.length === 0) throw new Error('No stocks found — check the paste format.');
    // Sort by weight descending (source of truth for table and filter)
    stocks.sort((a, b) => b.weight - a.weight);
    state.apStocks = stocks;
    const coveragePct = parseInt(document.getElementById('coverage-slider').value, 10);
    document.getElementById('ap-table-container').innerHTML = renderAPTable(stocks, coveragePct);
    document.getElementById('slider-row').style.display = 'flex';
    status.textContent = `${stocks.length} stocks parsed.`;
    status.style.color = '#2d7a2d';
    clearTrades();
  } catch (e) {
    status.textContent = e.message;
    status.style.color = '#c0392b';
    state.apStocks = null;
    updateRebalanceButton();
  }
});

const slider = document.getElementById('coverage-slider');
slider.addEventListener('input', () => {
  document.getElementById('coverage-display').textContent = slider.value;
  updateSliderGreying();
  clearTrades();
});

document.getElementById('tolerance-input').addEventListener('input', () => {
  clearTrades();
});

// ── Portfolio Panel ────────────────────────────────────────────────────────
function updatePortfolioStatus() {
  const text = document.getElementById('portfolio-input').value;
  const statusEl = document.getElementById('portfolio-status');

  if (!text.trim()) {
    statusEl.textContent = '';
    statusEl.className = 'portfolio-status';
    state.holdings = null;
    updateRebalanceButton();
    return;
  }

  const { holdings, errors } = parsePortfolio(text);

  if (errors.length > 0) {
    statusEl.textContent = errors[0]; // show first error
    statusEl.className = 'portfolio-status';
    state.holdings = null;
  } else if (Object.keys(holdings).length === 0) {
    statusEl.textContent = 'No valid holdings found.';
    statusEl.className = 'portfolio-status';
    state.holdings = null;
  } else {
    const count = Object.keys(holdings).length;
    statusEl.textContent = `${count} position${count !== 1 ? 's' : ''} ready.`;
    statusEl.className = 'portfolio-status ok';
    state.holdings = holdings;
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
updateRebalanceButton(); // run once on load

// ── Trade Table Rendering ──────────────────────────────────────────────────
function fmt(n) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function renderTrades({ trades, droppedCount, skippedCount, totalValue, deployedValue }) {
  if (trades.length === 0 && droppedCount === 0) {
    return '<p style="color:#888;font-size:13px;">Your portfolio is already balanced. No trades needed.</p>';
  }

  const buys = trades.filter(t => t.action === 'BUY').sort((a, b) => b.estValue - a.estValue);
  const sells = trades.filter(t => t.action === 'SELL').sort((a, b) => b.estValue - a.estValue);

  const subtypeLabel = { open: 'Open', add: 'Add', trim: 'Trim', close: 'Close' };
  const toRows = (list, cls) => list.map(t =>
    `<tr class="${cls}">
      <td>${t.ticker}</td>
      <td>${t.action}<br><span style="font-size:11px;font-weight:normal;opacity:0.65;">${subtypeLabel[t.subtype] || ''}</span></td>
      <td>${t.shares.toLocaleString()}</td>
      <td>${fmt(t.estValue)}</td>
    </tr>`
  ).join('');

  const totalBuy = buys.reduce((s, t) => s + t.estValue, 0);
  const totalSell = sells.reduce((s, t) => s + t.estValue, 0);

  const deployedPct = totalValue > 0
    ? ((deployedValue / totalValue) * 100).toFixed(1)
    : '0.0';

  const droppedNotice = droppedCount > 0
    ? `<span>${droppedCount} trade${droppedCount !== 1 ? 's' : ''} under $1 omitted</span>`
    : '';
  const skippedNotice = skippedCount > 0
    ? `<span>${skippedCount} trade${skippedCount !== 1 ? 's' : ''} within tolerance skipped</span>`
    : '';

  return `
    <div class="ap-table-wrap" style="max-height:400px;">
      <table>
        <thead><tr><th>Ticker</th><th>Action</th><th>Shares</th><th>Est. Value</th></tr></thead>
        <tbody>
          ${toRows(buys, 'trade-row-buy')}
          ${toRows(sells, 'trade-row-sell')}
        </tbody>
        <tfoot>
          <tr><td colspan="3" style="text-align:right;color:#1a6b1a;">Total Buys</td><td style="color:#1a6b1a;">${fmt(totalBuy)}</td></tr>
          <tr><td colspan="3" style="text-align:right;color:#c0392b;">Total Sells</td><td style="color:#c0392b;">${fmt(totalSell)}</td></tr>
        </tfoot>
      </table>
    </div>
    <div class="status-line">
      <span>Portfolio value: ${fmt(totalValue)}</span>
      <span>${deployedPct}% of portfolio deployed</span>
      ${droppedNotice}
      ${skippedNotice}
    </div>`;
}

function showError(html) {
  document.getElementById('trade-content').innerHTML =
    `<div class="banner error">${html}</div>`;
}

// ── Rebalance Button ───────────────────────────────────────────────────────
document.getElementById('rebalance-btn').addEventListener('click', async () => {
  const apiKey = document.getElementById('api-key').value.trim();
  const coveragePct = parseInt(document.getElementById('coverage-slider').value, 10);
  const btn = document.getElementById('rebalance-btn');
  const tradeContent = document.getElementById('trade-content');

  if (!state.apStocks || !state.holdings || !apiKey) return;

  btn.disabled = true;
  tradeContent.innerHTML = '<p class="loading">Fetching prices…</p>';

  // Collect all tickers that need prices
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
      showError('Rate limit exceeded — wait a moment and try again.');
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
  updateRebalanceButton();
});
