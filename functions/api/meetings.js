/* ============================================
   Backend: Finnhub Economic Calendar → Next CB Meetings
   ============================================
   Cette fonction tourne sur Cloudflare Pages Functions.
   Elle reçoit les requêtes du front sur /api/meetings.
   Elle appelle Finnhub pour le calendrier économique des
   prochains 90 jours, filtre les événements de banques
   centrales et renvoie la prochaine date pour chaque banque.
   ============================================ */

// Mapping : code banque → identifiants Finnhub
// Finnhub renvoie le pays + un nom d'événement, on filtre dessus
const BANK_FILTERS = [
    { code: 'FED',  countries: ['US'],     keywords: ['fomc', 'federal funds', 'fed interest rate', 'fed rate'] },
    { code: 'ECB',  countries: ['EU'],     keywords: ['ecb', 'main refinancing', 'deposit facility', 'ecb interest rate', 'ecb rate'] },
    { code: 'BOE',  countries: ['GB'],     keywords: ['boe', 'bank rate', 'bank of england', 'mpc'] },
    { code: 'BOJ',  countries: ['JP'],     keywords: ['boj', 'bank of japan'] },
    { code: 'BOC',  countries: ['CA'],     keywords: ['boc', 'bank of canada', 'overnight rate'] },
    { code: 'RBA',  countries: ['AU'],     keywords: ['rba', 'cash rate', 'reserve bank of australia'] },
    { code: 'RBNZ', countries: ['NZ'],     keywords: ['rbnz', 'reserve bank of new zealand', 'official cash rate'] },
    { code: 'SNB',  countries: ['CH'],     keywords: ['snb', 'swiss national bank'] }
];

function formatDateForFinnhub(date) {
    return date.toISOString().split('T')[0];
}

export async function onRequest(context) {
    const apiKey = context.env.FINNHUB_API_KEY;

    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: 'FINNHUB_API_KEY not configured in environment variables' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Plage : aujourd'hui → +120 jours
    const today = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 120);

    const fromStr = formatDateForFinnhub(today);
    const toStr = formatDateForFinnhub(future);

    const url = `https://finnhub.io/api/v1/calendar/economic?from=${fromStr}&to=${toStr}&token=${apiKey}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Finnhub returned ${res.status}`);
        }

        const data = await res.json();
        const events = data.economicCalendar || [];

        const result = {};

        // Pour chaque banque, on cherche le prochain événement matchant
        BANK_FILTERS.forEach(bank => {
            const matching = events
                .filter(ev => {
                    if (!ev.country || !ev.event) return false;
                    if (!bank.countries.includes(ev.country)) return false;
                    const eventLower = ev.event.toLowerCase();
                    return bank.keywords.some(kw => eventLower.includes(kw));
                })
                .filter(ev => {
                    // Garde uniquement les événements futurs ou aujourd'hui
                    const evDate = new Date(ev.time);
                    const todayMidnight = new Date();
                    todayMidnight.setUTCHours(0, 0, 0, 0);
                    return evDate >= todayMidnight;
                })
                .sort((a, b) => new Date(a.time) - new Date(b.time));

            if (matching.length > 0) {
                result[bank.code] = matching[0].time;
            } else {
                result[bank.code] = null;
            }
        });

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=21600' // cache 6 heures
            }
        });

    } catch (err) {
        console.error('Finnhub error:', err.message);
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
