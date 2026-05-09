// functions/api/rates.js
// PL Terminal - Rates API
// Returns current rate + 10y history per central bank

const CENTRAL_BANKS = [
  { id: 'FED',  name: 'Federal Reserve',         currency: 'USD', source: 'fred',    code: 'DFEDTARU' },
  { id: 'ECB',  name: 'European Central Bank',   currency: 'EUR', source: 'fred',    code: 'ECBDFR'   },
  { id: 'RBA',  name: 'Reserve Bank of Australia', currency: 'AUD', source: 'finnhub', country: 'AU' },
  { id: 'RBNZ', name: 'Reserve Bank of New Zealand', currency: 'NZD', source: 'finnhub', country: 'NZ' },
];

export async function onRequest(context) {
  const { env } = context;
  const FRED_KEY = env.FRED_API_KEY;
  const FINNHUB_KEY = env.FINNHUB_API_KEY;

  // Date range for Finnhub: 12 months back
  const today = new Date();
  const yearAgo = new Date();
  yearAgo.setMonth(yearAgo.getMonth() - 12);
  const fromDate = yearAgo.toISOString().split('T')[0];
  const toDate = today.toISOString().split('T')[0];

  // FRED historical start: 10 years back
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  const fredStart = tenYearsAgo.toISOString().split('T')[0];

  // Fetch Finnhub calendar once (used for RBA + RBNZ)
  let finnhubEvents = [];
  try {
    const finnhubUrl = `https://finnhub.io/api/v1/calendar/economic?from=${fromDate}&to=${toDate}&token=${FINNHUB_KEY}`;
    const finnhubRes = await fetch(finnhubUrl);
    const finnhubData = await finnhubRes.json();
    finnhubEvents = finnhubData.economicCalendar || [];
  } catch (e) {
    console.error('Finnhub fetch failed:', e);
  }

  const results = await Promise.all(
    CENTRAL_BANKS.map(async (bank) => {
      try {
        if (bank.source === 'fred') {
          return await fetchFromFRED(bank, FRED_KEY, fredStart);
        } else if (bank.source === 'finnhub') {
          return fetchFromFinnhub(bank, finnhubEvents);
        }
      } catch (err) {
        return {
          id: bank.id,
          name: bank.name,
          currency: bank.currency,
          rate: null,
          lastChange: null,
          lastChangeDate: null,
          history: [],
          error: err.message,
        };
      }
    })
  );

  return new Response(JSON.stringify({ banks: results, updated: new Date().toISOString() }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

// --- FRED fetcher with 10y history ---
async function fetchFromFRED(bank, apiKey, startDate) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${bank.code}&api_key=${apiKey}&file_type=json&sort_order=desc&observation_start=${startDate}&limit=5000`;
  const res = await fetch(url);
  const data = await res.json();
  const obs = (data.observations || []).filter(o => o.value !== '.' && o.value !== null);

  if (obs.length === 0) {
    return { id: bank.id, name: bank.name, currency: bank.currency, rate: null, lastChange: null, lastChangeDate: null, history: [] };
  }

  const currentRate = parseFloat(obs[0].value);
  const currentDate = obs[0].date;

  // Find last change
  let lastChange = null;
  let lastChangeDate = null;
  for (let i = 1; i < obs.length; i++) {
    const prevRate = parseFloat(obs[i].value);
    if (prevRate !== currentRate) {
      lastChange = (currentRate - prevRate) * 100;
      lastChangeDate = obs[i - 1].date;
      break;
    }
  }

  // Build history: only keep observations where rate CHANGED (compress to step changes)
  // This keeps payload small (a few dozen points instead of 3650)
  const history = [];
  let lastValue = null;
  // Reverse to chronological order
  const chrono = [...obs].reverse();
  chrono.forEach(o => {
    const v = parseFloat(o.value);
    if (v !== lastValue) {
      history.push({ date: o.date, value: v });
      lastValue = v;
    }
  });
  // Add the very last point so the line extends to today
  if (chrono.length > 0) {
    const last = chrono[chrono.length - 1];
    if (history.length > 0 && history[history.length - 1].date !== last.date) {
      history.push({ date: last.date, value: parseFloat(last.value) });
    }
  }

  return {
    id: bank.id,
    name: bank.name,
    currency: bank.currency,
    rate: currentRate,
    lastChange,
    lastChangeDate,
    asOf: currentDate,
    history
  };
}

// --- Finnhub fetcher ---
function fetchFromFinnhub(bank, events) {
  const decisions = events
    .filter(e =>
      e.country === bank.country &&
      e.event && e.event.toLowerCase().includes('interest rate decision') &&
      e.actual !== null
    )
    .sort((a, b) => new Date(a.time) - new Date(b.time)); // chronological

  if (decisions.length === 0) {
    return { id: bank.id, name: bank.name, currency: bank.currency, rate: null, lastChange: null, lastChangeDate: null, history: [] };
  }

  // Build history from decisions (already chronological)
  const history = decisions.map(d => ({
    date: d.time.split(' ')[0],
    value: parseFloat(d.actual)
  }));

  // Latest is at the end (chronological)
  const latest = decisions[decisions.length - 1];
  const currentRate = parseFloat(latest.actual);
  const prevRate = latest.prev !== null ? parseFloat(latest.prev) : null;

  let lastChange = null;
  let lastChangeDate = null;
  if (prevRate !== null && prevRate !== currentRate) {
    lastChange = (currentRate - prevRate) * 100;
    if (decisions.length >= 2) {
      lastChangeDate = decisions[decisions.length - 2].time.split(' ')[0];
    }
  }

  return {
    id: bank.id,
    name: bank.name,
    currency: bank.currency,
    rate: currentRate,
    lastChange,
    lastChangeDate,
    asOf: latest.time.split(' ')[0],
    history
  };
}
