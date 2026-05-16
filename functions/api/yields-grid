// Cloudflare Function : /api/yield-curve
// Retourne la courbe des taux gouvernementaux pour 8 devises
// 5 maturités : 3M, 2Y, 5Y, 10Y, 30Y
//
// Pour USD : séries officielles US Treasury (DGS*)
// Pour autres : séries IRLTLT* (Long-term gov bond yield) + IR3TIB* (3-month rate)
// Couverture variable selon disponibilité FRED

// FRED series par devise et maturité
const YIELD_SERIES = {
    USD: {
        '3M':  'DGS3MO',
        '2Y':  'DGS2',
        '5Y':  'DGS5',
        '10Y': 'DGS10',
        '30Y': 'DGS30'
    },
    EUR: {
        '3M':  'IR3TIB01EZM156N',
        '2Y':  'IRLTLT01EZM156N',  // Eurozone long-term (proxy)
        '5Y':  null,                // Pas dispo en série unique EUR sur FRED
        '10Y': 'IRLTLT01DEM156N',  // Allemagne 10Y comme proxy zone euro
        '30Y': null
    },
    GBP: {
        '3M':  'IR3TIB01GBM156N',
        '2Y':  null,
        '5Y':  null,
        '10Y': 'IRLTLT01GBM156N',
        '30Y': null
    },
    JPY: {
        '3M':  'IR3TIB01JPM156N',
        '2Y':  null,
        '5Y':  null,
        '10Y': 'IRLTLT01JPM156N',
        '30Y': null
    },
    CAD: {
        '3M':  'IR3TIB01CAM156N',
        '2Y':  null,
        '5Y':  null,
        '10Y': 'IRLTLT01CAM156N',
        '30Y': null
    },
    AUD: {
        '3M':  'IR3TIB01AUM156N',
        '2Y':  null,
        '5Y':  null,
        '10Y': 'IRLTLT01AUM156N',
        '30Y': null
    },
    NZD: {
        '3M':  'IR3TIB01NZM156N',
        '2Y':  null,
        '5Y':  null,
        '10Y': 'IRLTLT01NZM156N',
        '30Y': null
    },
    CHF: {
        '3M':  'IR3TIB01CHM156N',
        '2Y':  null,
        '5Y':  null,
        '10Y': 'IRLTLT01CHM156N',
        '30Y': null
    }
};

// Fetch série FRED, retourne les N dernières observations valides
async function fredObservations(seriesId, apiKey, n = 1) {
    if (!seriesId) return null;
    try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${n * 5}`;
        const r = await fetch(url);
        if (!r.ok) return null;
        const data = await r.json();
        if (!data.observations) return null;
        const valid = data.observations
            .filter(o => o.value && o.value !== '.')
            .map(o => ({ date: o.date, value: parseFloat(o.value) }))
            .filter(o => !isNaN(o.value));
        return valid.slice(0, n);
    } catch (e) {
        return null;
    }
}

// Trouve la valeur à environ N jours en arrière
function findValueDaysAgo(observations, daysAgo) {
    if (!observations || observations.length === 0) return null;
    const target = new Date();
    target.setDate(target.getDate() - daysAgo);
    const targetTime = target.getTime();
    // Cherche l'obs la plus proche (en absolu)
    let best = null;
    let bestDiff = Infinity;
    for (const obs of observations) {
        const diff = Math.abs(new Date(obs.date).getTime() - targetTime);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = obs;
        }
    }
    return best;
}

export async function onRequest(context) {
    const { env, request } = context;
    const apiKey = env.FRED_API_KEY;

    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'FRED_API_KEY not configured' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }

    // Optionnel : ?ccy=USD pour limiter à une devise
    const url = new URL(request.url);
    const ccyFilter = url.searchParams.get('ccy');

    const ccys = ccyFilter ? [ccyFilter.toUpperCase()] : Object.keys(YIELD_SERIES);

    const result = {
        source: 'FRED (Federal Reserve St-Louis)',
        fetchedAt: new Date().toISOString(),
        tenors: ['3M', '2Y', '5Y', '10Y', '30Y'],
        currencies: {}
    };

    for (const ccy of ccys) {
        const series = YIELD_SERIES[ccy];
        if (!series) continue;

        const yields = {};
        for (const [tenor, seriesId] of Object.entries(series)) {
            if (!seriesId) {
                yields[tenor] = { current: null, d30: null, d90: null, available: false };
                continue;
            }
            // Récupère ~100 jours d'historique
            const obs = await fredObservations(seriesId, apiKey, 100);
            if (!obs || obs.length === 0) {
                yields[tenor] = { current: null, d30: null, d90: null, available: false };
                continue;
            }
            const current = obs[0];
            const d30 = findValueDaysAgo(obs, 30);
            const d90 = findValueDaysAgo(obs, 90);
            yields[tenor] = {
                current: current ? current.value : null,
                currentDate: current ? current.date : null,
                d30: d30 ? d30.value : null,
                d90: d90 ? d90.value : null,
                available: true
            };
        }

        // Calcule les spreads
        const spreads = {};
        if (yields['2Y'] && yields['10Y'] && yields['2Y'].current !== null && yields['10Y'].current !== null) {
            spreads.s2_10 = Math.round((yields['10Y'].current - yields['2Y'].current) * 100) / 100;
        }
        if (yields['3M'] && yields['10Y'] && yields['3M'].current !== null && yields['10Y'].current !== null) {
            spreads.s3m_10 = Math.round((yields['10Y'].current - yields['3M'].current) * 100) / 100;
        }
        if (yields['5Y'] && yields['30Y'] && yields['5Y'].current !== null && yields['30Y'].current !== null) {
            spreads.s5_30 = Math.round((yields['30Y'].current - yields['5Y'].current) * 100) / 100;
        }

        // Détermine la forme de la courbe
        let shape = 'unknown';
        if (spreads.s2_10 !== undefined) {
            if (spreads.s2_10 < -0.1) shape = 'inverted';
            else if (spreads.s2_10 < 0.2) shape = 'flat';
            else if (spreads.s2_10 < 1.0) shape = 'normal';
            else shape = 'steep';
        }

        result.currencies[ccy] = { yields, spreads, shape };
    }

    return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=900', // 15 min cache
            'Access-Control-Allow-Origin': '*'
        }
    });
}
