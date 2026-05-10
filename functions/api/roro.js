/**
 * RORO METER - Risk-On / Risk-Off Sentiment Score
 * All sources via FRED (more reliable than Finnhub free tier for non-US assets)
 * Returns score 0-100 + components breakdown
 */

export async function onRequest(context) {
    const FRED_KEY = context.env.FRED_API_KEY;
    const FINNHUB_KEY = context.env.FINNHUB_API_KEY;

    // FRED series for all instruments
    const FRED_SERIES = [
        { id: 'sp500',   series: 'SP500',                 name: 'S&P 500',  type: 'on',  weight: 1.5 },
        { id: 'vix',     series: 'VIXCLS',                name: 'VIX',      type: 'off', weight: 1.5 },
        { id: 'oil',     series: 'DCOILWTICO',            name: 'WTI OIL',  type: 'on',  weight: 0.8 },
        { id: 'ust10y',  series: 'DGS10',                 name: 'US 10Y',   type: 'on',  weight: 0.7 },
        { id: 'usdjpy',  series: 'DEXJPUS',               name: 'USD/JPY',  type: 'on',  weight: 1.0 },
        { id: 'usdchf',  series: 'DEXSZUS',               name: 'USD/CHF',  type: 'on',  weight: 0.8 },
        { id: 'audusd',  series: 'DEXUSAL',               name: 'AUD/USD',  type: 'on',  weight: 1.2 }
    ];

    // Bitcoin via Finnhub (FRED doesn't have crypto)
    const FINNHUB_SYMBOLS = [
        { id: 'gold',    symbol: 'GLD',                    name: 'GOLD (GLD)', type: 'off', weight: 1.0 },
        { id: 'btc',     symbol: 'BINANCE:BTCUSDT',        name: 'BITCOIN',    type: 'on',  weight: 0.8 }
    ];

    const components = [];

    // --- Fetch FRED series ---
    for (const s of FRED_SERIES) {
        try {
            const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.series}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=2`;
            const r = await fetch(url);
            if (!r.ok) throw new Error('FRED failed');
            const j = await r.json();
            const obs = (j.observations || []).filter(o => o.value !== '.');
            if (obs.length < 2) {
                components.push({ id: s.id, name: s.name, type: s.type, weight: s.weight,
                    current: null, prev: null, change: null,
                    source: 'FRED', status: 'no-data' });
                continue;
            }
            const current = parseFloat(obs[0].value);
            const prev = parseFloat(obs[1].value);
            const changePct = ((current - prev) / prev) * 100;
            components.push({
                id: s.id, name: s.name, type: s.type, weight: s.weight,
                current: current, prev: prev, change: changePct,
                source: 'FRED', status: 'ok'
            });
        } catch (e) {
            components.push({ id: s.id, name: s.name, type: s.type, weight: s.weight,
                current: null, change: null, source: 'FRED', status: 'error' });
        }
    }

    // --- Fetch Finnhub (for crypto) ---
    for (const s of FINNHUB_SYMBOLS) {
        try {
            const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s.symbol)}&token=${FINNHUB_KEY}`;
            const r = await fetch(url);
            if (!r.ok) throw new Error('Finnhub failed');
            const j = await r.json();
            if (j.dp === undefined || j.dp === null) {
                components.push({ id: s.id, name: s.name, type: s.type, weight: s.weight,
                    current: null, change: null, source: 'Finnhub', status: 'no-data' });
                continue;
            }
            components.push({
                id: s.id, name: s.name, type: s.type, weight: s.weight,
                current: j.c, change: j.dp,
                source: 'Finnhub', status: 'ok'
            });
        } catch (e) {
            components.push({ id: s.id, name: s.name, type: s.type, weight: s.weight,
                current: null, change: null, source: 'Finnhub', status: 'error' });
        }
    }

    // --- Compute RORO score 0-100 ---
    // Each component: change% normalized (-3% → 0, 0% → 50, +3% → 100)
    // Risk-off instruments inverted (rise in VIX = risk-off = lower score)
    const NORM_RANGE = 3.0;

    let totalWeight = 0;
    let weightedSum = 0;

    components.forEach(c => {
        if (c.change === null || c.status !== 'ok') {
            c.normScore = null;
            c.contribution = 0;
            return;
        }
        let pct = c.change;
        if (c.type === 'off') pct = -pct;
        pct = Math.max(-NORM_RANGE, Math.min(NORM_RANGE, pct));
        const norm = 50 + (pct / NORM_RANGE) * 50;
        c.normScore = Math.round(norm * 10) / 10;
        c.contribution = Math.round(norm * c.weight * 10) / 10;
        weightedSum += norm * c.weight;
        totalWeight += c.weight;
    });

    const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 50;

    let label, level;
    if (score >= 75)      { label = 'STRONG RISK ON';  level = 'strong-on'; }
    else if (score >= 55) { label = 'RISK ON';         level = 'on'; }
    else if (score >= 45) { label = 'NEUTRAL';         level = 'neutral'; }
    else if (score >= 25) { label = 'RISK OFF';        level = 'off'; }
    else                  { label = 'STRONG RISK OFF'; level = 'strong-off'; }

    const validCount = components.filter(c => c.status === 'ok').length;

    return new Response(JSON.stringify({
        score: score,
        label: label,
        level: level,
        components: components,
        validCount: validCount,
        totalCount: components.length,
        asOf: new Date().toISOString()
    }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
    });
}
