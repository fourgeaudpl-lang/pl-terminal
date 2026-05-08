/* ============================================
   Backend: FRED API → Interest Rates
   ============================================
   Cette fonction tourne sur Cloudflare Pages Functions.
   Elle reçoit les requêtes du front sur /api/rates.
   Elle appelle FRED pour les 8 banques centrales,
   calcule la dernière variation et renvoie le tout en JSON.
   ============================================ */

const CENTRAL_BANKS = [
    { code: 'FED',  fredId: 'DFEDTARU' },
    { code: 'ECB',  fredId: 'ECBDFR' },
    { code: 'BOE',  fredId: 'IUDSOIA' },
    { code: 'BOJ',  fredId: 'IRSTCB01JPM156N' },
    { code: 'BOC',  fredId: 'IRSTCB01CAM156N' },
    { code: 'RBA',  fredId: 'IRSTCB01AUM156N' },
    { code: 'RBNZ', fredId: 'IRSTCB01NZM156N' },
    { code: 'SNB',  fredId: 'IRSTCB01CHM156N' }
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

    // Cherche la dernière valeur différente de la valeur actuelle
    // pour calculer la dernière variation effective
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

    // On lance les 8 appels en parallèle pour aller vite
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
            'Cache-Control': 'public, max-age=3600' // cache 1 heure côté Cloudflare
        }
    });
}
