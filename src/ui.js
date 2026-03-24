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
    const excluded = cumulative - weight >= threshold; // stock itself didn't cause threshold to be met
    // A stock is included if it was the one that pushed cumulative >= threshold, or came before it
    const includedUpTo = (cumulative - weight) < threshold; // was below threshold before this stock
    const included = includedUpTo || (cumulative >= threshold && (cumulative - weight) < threshold);
    // Simpler: included if without this stock we're still below threshold
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
