// functions/api/calendar.js
// PL Terminal - Economic Calendar API
// Source: Finnhub /calendar/economic
// Filters: G10 countries, next 30 days

const G10_COUNTRIES = ['US', 'EU', 'DE', 'FR', 'GB', 'JP', 'CA', 'AU', 'NZ', 'CH'];

// Map Finnhub country code → currency
const COUNTRY_TO_CCY = {
  'US': 'USD',
  'EU': 'EUR', 'DE': 'EUR', 'FR': 'EUR', 'IT': 'EUR', 'ES': 'EUR',
  'GB': 'GBP',
  'JP': 'JPY',
  'CA': 'CAD',
  'AU': 'AUD',
  'NZ': 'NZD',
  'CH': 'CHF'
};

export async function onRequest(context) {
  const { env } = context;
  const FINNHUB_KEY = env.FINNHUB_API_KEY;

  // Date range: today → +30 days
  const today = new Date();
  const future = new Date();
  future.setDate(future.getDate() + 30);
  const fromDate = today.toISOString().split('T')[0];
  const toDate = future.toISOString().split('T')[0];

  try {
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${fromDate}&to=${toDate}&token=${FINNHUB_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const events = data.economicCalendar || [];

    // Filter for G10 countries only
    const filtered = events
      .filter(e => G10_COUNTRIES.includes(e.country))
      .map(e => ({
        time: e.time,
        country: e.country,
        currency: COUNTRY_TO_CCY[e.country] || e.country,
        event: e.event,
        impact: e.impact,
        actual: e.actual,
        estimate: e.estimate,
        prev: e.prev,
        unit: e.unit
      }))
      .sort((a, b) => new Date(a.time) - new Date(b.time));

    return new Response(JSON.stringify({
      events: filtered,
      count: filtered.length,
      from: fromDate,
      to: toDate,
      updated: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      events: [],
      error: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
