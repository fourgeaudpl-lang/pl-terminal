// functions/api/rates.js
// PL Terminal - Rates API
// Sources: FRED (FED + ECB) + Finnhub (RBA + RBNZ)

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

  // Date range: last 12 months for Finnhub
  const today = new Date();
  const yearAgo = new Date();
  yearAgo.setMonth(yearAgo.getMonth() - 12);
  const fromDate = yearAgo.toISOString().split('T')[0];
  const toDate = today.toISOString().split('T')[0];

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
          return await fetchFromFRED(bank, FRED_KEY);
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

// --- FRED fetcher ---
async function fetchFromFRED(bank, apiKey) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${bank.code}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=100`;
  const res = await fetch(url);
  const data = await res.json();
  const obs = (data.observations || []).filter(o => o.value !== '.' && o.value !== null);

  if (obs.length === 0) {
    return { id: bank.id, name: bank.name, currency: bank.currency, rate: null, lastChange: null, lastChangeDate: null };
  }

  const currentRate = parseFloat(obs[0].value);
  const currentDate = obs[0].date;

  // Find last change by walking backwards
  let lastChange = null;
  let lastChangeDate = null;
  for (let i = 1; i < obs.length; i++) {
    const prevRate = parseFloat(obs[i].value);
    if (prevRate !== currentRate) {
      lastChange = (currentRate - prevRate) * 100; // in basis points
      lastChangeDate = obs[i - 1].date;
      break;
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
  };
}

// --- Finnhub fetcher (uses pre-fetched events) ---
function fetchFromFinnhub(bank, events) {
  // Filter for this bank's interest rate decisions
  const decisions = events
    .filter(e =>
      e.country === bank.country &&
      e.event && e.event.toLowerCase().includes('interest rate decision') &&
      e.actual !== null
    )
    .sort((a, b) => new Date(b.time) - new Date(a.time)); // most recent first

  if (decisions.length === 0) {
    return { id: bank.id, name: bank.name, currency: bank.currency, rate: null, lastChange: null, lastChangeDate: null };
  }

  const latest = decisions[0];
  const currentRate = parseFloat(latest.actual);
  const prevRate = latest.prev !== null ? parseFloat(latest.prev) : null;

  let lastChange = null;
  let lastChangeDate = null;
  if (prevRate !== null && prevRate !== currentRate) {
    lastChange = (currentRate - prevRate) * 100; // basis points
    // Find the previous decision date
    const previousDecision = decisions.find(d => parseFloat(d.actual) === prevRate);
    lastChangeDate = previousDecision ? previousDecision.time.split(' ')[0] : null;
  }

  return {
    id: bank.id,
    name: bank.name,
    currency: bank.currency,
    rate: currentRate,
    lastChange,
    lastChangeDate,
    asOf: latest.time.split(' ')[0],
  };
}
