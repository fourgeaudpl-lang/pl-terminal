// Cloudflare Function : proxy CNN Fear & Greed Index
// Endpoint public : https://production.dataviz.cnn.io/index/fearandgreed/graphdata
// Retourne JSON avec score 0-100 et label (Extreme Fear, Fear, Neutral, Greed, Extreme Greed)

export async function onRequest(context) {
    const cnnUrl = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

    try {
        const response = await fetch(cnnUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.cnn.com/markets/fear-and-greed'
            }
        });

        if (!response.ok) {
            return new Response(JSON.stringify({
                error: 'CNN endpoint returned ' + response.status,
                score: null,
                label: null
            }), {
                status: 200, // 200 pour que le front gère l'erreur proprement
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
            });
        }

        const data = await response.json();

        // Le payload CNN a cette structure :
        // {
        //   fear_and_greed: { score: 50, rating: "neutral", timestamp: "..." },
        //   fear_and_greed_historical: { data: [...] }
        // }
        const fg = data.fear_and_greed || {};
        const score = typeof fg.score === 'number' ? Math.round(fg.score) : null;
        const label = fg.rating || null;
        const timestamp = fg.timestamp || null;

        // Récupère aussi le score d'hier pour calculer le delta
        const hist = (data.fear_and_greed_historical && data.fear_and_greed_historical.data) || [];
        let previousScore = null;
        if (hist.length >= 2) {
            // L'avant-dernier point est généralement le score d'hier (le dernier = aujourd'hui)
            const sorted = [...hist].sort((a, b) => (b.x || 0) - (a.x || 0));
            if (sorted.length >= 2 && typeof sorted[1].y === 'number') {
                previousScore = Math.round(sorted[1].y);
            }
        }

        return new Response(JSON.stringify({
            score,
            label,
            previousScore,
            delta: (score !== null && previousScore !== null) ? score - previousScore : null,
            timestamp,
            source: 'CNN Fear & Greed',
            fetchedAt: new Date().toISOString()
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300', // cache 5 min
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({
            error: err.message || 'Fetch failed',
            score: null,
            label: null
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
