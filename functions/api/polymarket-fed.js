// Cloudflare Pages Function — proxy Polymarket Gamma API
// Route: /api/polymarket-fed

export async function onRequest(context) {
    const polymarketUrl = 'https://gamma-api.polymarket.com/events?closed=false&limit=200&order=endDate&ascending=true';

    try {
        const res = await fetch(polymarketUrl, {
            cf: { cacheTtl: 60, cacheEverything: true },
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'pl-terminal/1.0'
            }
        });

        if (!res.ok) {
            return new Response(JSON.stringify({
                error: `Polymarket returned ${res.status}`
            }), {
                status: res.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const events = await res.json();
        if (!Array.isArray(events)) {
            return new Response(JSON.stringify({
                error: 'Unexpected Polymarket response format'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const fedEvents = events.filter(ev => {
            const slug = (ev.slug || '').toLowerCase();
            const title = (ev.title || '').toLowerCase();
            return (
                slug.includes('fed-decision') ||
                slug.includes('fomc-decision') ||
                slug.includes('fomc-meeting') ||
                slug.includes('fed-meeting') ||
                title.includes('fed decision') ||
                title.includes('fomc') ||
                (title.includes('fed') && (title.includes('rate') || title.includes('cut') || title.includes('hike')))
            ) && ev.markets && ev.markets.length > 0;
        });

        if (fedEvents.length === 0) {
            return new Response(JSON.stringify({
                error: 'No active Fed event found on Polymarket',
                events_scanned: events.length
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        fedEvents.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
        const nextFed = fedEvents[0];

        const outcomes = (nextFed.markets || []).map(m => {
            let prices = [];
            try {
                prices = typeof m.outcomePrices === 'string'
                    ? JSON.parse(m.outcomePrices)
                    : (m.outcomePrices || []);
            } catch (e) { prices = []; }

            const yesPrice = prices.length > 0 ? parseFloat(prices[0]) : 0;
            return {
                question: m.question || '',
                groupItemTitle: m.groupItemTitle || '',
                pct: isNaN(yesPrice) ? 0 : Math.round(yesPrice * 100),
                rawPrice: isNaN(yesPrice) ? 0 : yesPrice
            };
        }).filter(o => !isNaN(o.pct));

        outcomes.sort((a, b) => b.pct - a.pct);

        const result = {
            title: nextFed.title || 'Fed Decision',
            slug: nextFed.slug || '',
            endDate: nextFed.endDate || null,
            outcomes,
            fetched_at: new Date().toISOString()
        };

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60'
            }
        });
    } catch (e) {
        return new Response(JSON.stringify({
            error: 'Fetch failed',
            message: e.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
