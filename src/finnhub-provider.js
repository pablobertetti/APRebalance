const FinnhubProvider = {
  /**
   * Fetch current prices for a list of tickers.
   * @param {string[]} tickers
   * @param {string} apiKey
   * @returns {Promise<Object>} map of ticker → price
   * @throws {Object} { type: 'invalid_key' | 'rate_limit' | 'http_error' | 'not_found', ... }
   */
  async getPrices(tickers, apiKey) {
    const fetchOne = async (ticker) => {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(url);

      if (resp.status === 401 || resp.status === 403) {
        throw { type: 'invalid_key' };
      }
      if (resp.status === 429) {
        throw { type: 'rate_limit' };
      }
      if (!resp.ok) {
        throw { type: 'http_error', status: resp.status };
      }

      const data = await resp.json();
      return { ticker, price: data.c };
    };

    // Fetch all concurrently; Promise.all rejects on first HTTP error
    const results = await Promise.all(tickers.map(t => fetchOne(t)));

    // Validate all prices are non-zero/non-null (Finnhub returns c=0 for unknown tickers)
    const notFound = results
      .filter(r => r.price === 0 || r.price === null || r.price === undefined)
      .map(r => r.ticker);

    if (notFound.length > 0) {
      throw { type: 'not_found', tickers: notFound };
    }

    const priceMap = {};
    for (const { ticker, price } of results) {
      priceMap[ticker] = price;
    }
    return priceMap;
  },
};

if (typeof module !== 'undefined') module.exports = { FinnhubProvider };
