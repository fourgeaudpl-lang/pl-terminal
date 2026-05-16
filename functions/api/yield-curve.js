// Cloudflare Pages Function — /api/yield-curve
// Récupère le yield 2Y de chaque devise via FRED (proxy de la courbe OIS courte)
// Utilisé par la page PROB pour calculer les forwards implicites

export async function onRequest(context) {
    const { env } = context;
    const FRED_KEY = env.FRED_API_KEY;
    if (!FRED_KEY) {
        return new Response(JSON.stringify({ error: 'FRED_API_KEY not configured' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }

    // Séries FRED 2Y équivalent par devise
    // Pour les devises sans 2Y direct, on utilise un proxy (gov bond ou interbank)
    const SERIES = {
        USD:  'DGS2',                 // 2-Year Treasury Constant Maturity
        EUR:  'IRLTLT01DEM156N',      // Long-term gov bond yield Germany (proxy)
        GBP:  'IRLTLT01GBM156N',      // Long-term gov bond yield UK
        JPY:  'IRLTLT01JPM156N',      // Long-term gov bond yield Japan
        CAD:  'IRLTLT01CAM156N',      // Long-term gov bond yield Canada
        AUD:  'IRLTLT01AUM156N',      // Long-term gov bond yield Australia
        NZD:  'IRLTLT01NZM156N',      // Long-term gov bond yield NZ
        CHF:  'IRLTLT01CHM156N'       // Long-term gov bond yield Switzerland
    };

    // Aussi le 3M Treasury USD pour avoir un point intermédiaire de la courbe
    const SHORT_SERIES = {
        USD_3M: 'DGS3MO'
    };

    const results = {};
    const errors = {};

    async function fetchLatest(seriesId) {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=10`;
        try {
            const res = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } });
            if (!res.ok) return { error: `HTTP ${res.status}` };
            const data = await res.json();
            if (!data.observations || data.observations.length === 0) return { error: 'no data' };
            // Trouve la dernière valeur valide (FRED renvoie parfois "." pour les jours fériés)
            for (const obs of data.observations) {
                if (obs.value !== '.' && obs.value !== '' && !isNaN(parseFloat(obs.value))) {
                    return { value: parseFloat(obs.value), date: obs.date };
                }
            }
            return { error: 'no valid value' };
        } catch (e) {
            return { error: e.message };
        }
    }

    // Fetch en parallèle
    const fetches = Object.entries(SERIES).map(async ([ccy, sid]) => {
        const r = await fetchLatest(sid);
        if (r.error) {
            errors[ccy] = r.error;
            results[ccy] = null;
        } else {
            results[ccy] = { rate: r.value, asOf: r.date, series: sid, tenor: '2Y' };
        }
    });

    // Aussi le 3M USD (point supplémentaire pour USD)
    const usd3m = await fetchLatest(SHORT_SERIES.USD_3M);
    if (!usd3m.error) {
        results.USD_3M = { rate: usd3m.value, asOf: usd3m.date, series: 'DGS3MO', tenor: '3M' };
    }

    await Promise.all(fetches);

    return new Response(JSON.stringify({
        yields: results,
        errors,
        fetched_at: new Date().toISOString()
    }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600'
        }
    });
}
