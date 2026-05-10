// functions/api/yields.js
// PL Terminal - Bond Yields API (2Y + 10Y)
// Source: FRED

const YIELD_SERIES = {
  USD: { y2: 'DGS2',     y10: 'DGS10' },
  EUR: { y2: 'IRLTLT01EZM156N', y10: 'IRLTLT01EZM156N' }, // EU long-term, fallback (ECB only has 10Y)
  GBP: { y2: 'IRLTLT01GBM156N', y10: 'IRLTLT01GBM156N' },
  JPY: { y2: 'IRLTLT01JPM156N', y10: 'IRLTLT01JPM156N' },
  CAD: { y2: 'IRLTLT01CAM156N', y10: 'IRLTLT01CAM156N' },
  AUD: { y2: 'IRLTLT01AUM156N', y10: 'IRLTLT01AUM156N' },
  NZD: { y2: 'IRLTLT01NZM156N', y10: 'IRLTLT01NZM156N' },
  CHF: { y2: 'IRLTLT01CHM156N', y10: 'IRLTLT01CHM156N' }
};

// For USD we have proper 2Y series. For others FRED only reliably exposes 10Y long-term.
// We'll use a simplified approach: 10Y from FRED, 2Y proxy = 10Y - estimated spread

async function fetchLatestObservation(seriesId, apiKey) {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    const obs = (data.observations || []).filter(o => o.value !== '.' && o.value !== null);
    if (obs.length === 0) return null;
    return parseFloat(obs[0].value);
  } catch (e) {
    return null;
  }
}

export async function onRequest(context) {
  const { env } = context;
  const FRED_KEY = env.FRED_API_KEY;

  const yields = {};

  // USD: real 2Y + 10Y from FRED
  yields.USD = {
    y2: await fetchLatestObservation('DGS2', FRED_KEY),
    y10: await fetchLatestObservation('DGS10', FRED_KEY)
  };
  yields.USD.spread = (yields.USD.y10 !== null && yields.USD.y2 !== null)
    ? yields.USD.y10 - yields.USD.y2 : null;

  // Other currencies: FRED long-term yield (≈ 10Y)
  // Pour 2Y, on utilise des séries officielles FRED quand dispo, sinon null
  const otherCcys = ['EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF'];
  for (const ccy of otherCcys) {
    const series = YIELD_SERIES[ccy];
    const y10 = await fetchLatestObservation(series.y10, FRED_KEY);
    yields[ccy] = {
      y2: null,    // pas de série 2Y fiable cross-country sur FRED
      y10: y10,
      spread: null
    };
  }

  return new Response(JSON.stringify({
    yields,
    updated: new Date().toISOString()
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
