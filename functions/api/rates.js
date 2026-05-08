/* ============================================
   Backend: FRED API → Interest Rates
   ============================================ */

const CENTRAL_BANKS = [
    { code: 'FED',  fredId: 'DFEDTARU' },
    { code: 'ECB',  fredId: 'ECBDFR' },
    { code: 'BOE',  fredId: 'BOERUKM' },
    { code: 'BOJ',  fredId: 'INTDSRJPM193N' },
    { code: 'BOC',  fredId: 'INTDSRCAM193N' },
    { code: 'RBA',  fredId: 'INTDSRAUM193N' },
    { code: 'RBNZ', fredId: 'INTDSRNZM193N' },
    { code: 'SNB',  fredId: 'INTDSRCHM193N' }
];

async function fetchFredSeries(seriesId, apiKey) {
    const url = `https://api.stlouisfed.org/fred/series/observations` +
                `?series_id=${seriesId}` +
                `&api_key=${apiKey}` +
                `&file_type=json` +
                `&sort_order=desc` +
                `&limit=50`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`FRED ${seriesId} returned ${res.status}`);
    }

    const data = await res.json();
    const observations = (data.observations || []).filter(o => o.value !== '.');

    if (observations.length === 0) {
        return { value: null, change: null, date: null };
    }

    const latest = observations[0];
    const value = parseFloat(latest.value);

    let change = 0;
    for (let i = 1; i < observations.length; i++) {
        const prev = parseFloat(observations[i].value);
        if (prev !== value) {
            change = value - prev;
            break;
        }
    }

    return {
        value: value,
        change: change,
        date: latest.date
    };
}

export async function onRequest(context) {
    const apiKey = context.env.FRED_API_KEY;

    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: 'FRED_API_KEY not configured in environment variables' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const result = {};

    const promises = CENTRAL_BANKS.map(async bank => {
        try {
            const data = await fetchFredSeries(bank.fredId, apiKey);
            result[bank.code] = data;
        } catch (err) {
            console.error(`Error fetching ${bank.code}:`, err.message);
            result[bank.code] = { value: null, change: null, date: null, error: err.message };
        }
    });

    await Promise.all(promises);

    return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600'
        }
    });
}
