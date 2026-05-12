// Cloudflare Pages Function
// Route: /api/fred-history?series_id=DFEDTARU&start=2010-01-01
// Proxy vers FRED API avec la clé stockée en variable d'environnement (FRED_API_KEY)
// Renvoie un JSON propre : [{date: "2024-01-15", value: 5.5}, ...]

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const seriesId = url.searchParams.get('series_id');
    const start = url.searchParams.get('start') || '2010-01-01';

    // Validation
    if (!seriesId) {
        return new Response(JSON.stringify({ error: 'series_id parameter required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Vérifie qu'on a bien la clé FRED en env
    const apiKey = env.FRED_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'FRED_API_KEY not configured in Cloudflare env' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Appelle FRED côté serveur (pas de CORS car serveur-à-serveur)
    const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}&observation_start=${encodeURIComponent(start)}&api_key=${encodeURIComponent(apiKey)}&file_type=json`;

    try {
        const fredRes = await fetch(fredUrl, {
            // Cache 1h côté Cloudflare edge pour limiter les appels FRED
            cf: { cacheTtl: 3600, cacheEverything: true }
        });

        if (!fredRes.ok) {
            return new Response(JSON.stringify({
                error: `FRED returned ${fredRes.status}`,
                series_id: seriesId
            }), {
                status: fredRes.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const fredData = await fredRes.json();
        if (!fredData.observations || !Array.isArray(fredData.observations)) {
            return new Response(JSON.stringify({
                error: 'Unexpected FRED response format',
                series_id: seriesId
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Format simple : [{date, value}]
        const clean = fredData.observations
            .filter(o => o.value !== '.')
            .map(o => ({
                date: o.date,
                value: parseFloat(o.value)
            }))
            .filter(o => !isNaN(o.value));

        return new Response(JSON.stringify(clean), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                // Cache 1h côté navigateur
                'Cache-Control': 'public, max-age=3600'
            }
        });
    } catch (e) {
        return new Response(JSON.stringify({
            error: 'Fetch failed',
            message: e.message,
            series_id: seriesId
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
