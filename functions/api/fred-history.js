// Cloudflare Pages Function — proxy FRED API
// Route: /api/fred-history?series_id=IRSTCB01USM156N&start=2010-01-01

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const seriesId = url.searchParams.get('series_id');
    const start = url.searchParams.get('start') || '2010-01-01';

    if (!seriesId) {
        return new Response(JSON.stringify({ error: 'series_id parameter required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const apiKey = env.FRED_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'FRED_API_KEY not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}&observation_start=${encodeURIComponent(start)}&api_key=${encodeURIComponent(apiKey)}&file_type=json`;

    try {
        const fredRes = await fetch(fredUrl, {
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
                error: 'Unexpected FRED response',
                series_id: seriesId
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const clean = fredData.observations
            .filter(o => o.value !== '.')
            .map(o => ({ date: o.date, value: parseFloat(o.value) }))
            .filter(o => !isNaN(o.value));

        return new Response(JSON.stringify(clean), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
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
