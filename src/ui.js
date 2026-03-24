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
