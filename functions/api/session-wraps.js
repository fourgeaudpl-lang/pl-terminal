// Cloudflare Function : /api/session-wraps
// Scrape la page InvestingLive Session Wraps pour récupérer les derniers wraps
// par session (Asia / Europe / US)
//
// Source : https://investinglive.com/SessionWraps
// Méthode : parse HTML (regex tolérant)

const SOURCE_URL = 'https://investinglive.com/SessionWraps';

// Détection de la session à partir du titre de l'article
function detectSession(title) {
    const t = title.toLowerCase();
    if (t.includes('asia') || t.includes('asian') || t.includes('asia-pacific') ||
        t.includes('pacific') || t.includes('tokyo') || t.includes('sydney')) {
        return 'asia';
    }
    if (t.includes('european') || t.includes('europe') || t.includes('london')) {
        return 'europe';
    }
    if (t.includes('american') || t.includes('americas') ||
        t.includes('north american') || t.includes('new york') ||
        t.match(/\bus\b/) || t.match(/\bu\.s\.\b/)) {
        return 'us';
    }
    return 'other';
}

// Décode les entités HTML communes
function decodeEntities(s) {
    if (!s) return '';
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&rsquo;/g, '\u2019')
        .replace(/&lsquo;/g, '\u2018')
        .replace(/&rdquo;/g, '\u201d')
        .replace(/&ldquo;/g, '\u201c')
        .replace(/&hellip;/g, '\u2026')
        .replace(/&mdash;/g, '\u2014')
        .replace(/&ndash;/g, '\u2013');
}

function cleanText(text) {
    if (!text) return '';
    return decodeEntities(text)
        .replace(/<[^>]+>/g, '')   // strip HTML tags
        .replace(/\s+/g, ' ')
        .trim();
}

// Parse les articles depuis le HTML d'InvestingLive Session Wraps
// On cherche des structures du type <a href="/news/...session-wrap..."> ou similaire
function parseInvestingLiveHTML(html) {
    const items = [];
    const seen = new Set();

    // Stratégie 1 : tous les liens vers des news qui contiennent session/wrap dans l'URL ou le texte
    // Match <a href="..." ...>...</a> sur 1-2 lignes
    const linkRegex = /<a[^>]*href=["']([^"']*\/news\/[^"']*)["'][^>]*>([\s\S]{1,400}?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
        const href = m[1];
        const inner = m[2];
        const title = cleanText(inner);

        if (!title || title.length < 15) continue;

        const lc = title.toLowerCase();
        const hrefLc = href.toLowerCase();

        // On garde uniquement ce qui ressemble à un session wrap
        const isWrap =
            lc.includes('wrap') ||
            lc.includes('session recap') ||
            lc.includes('news wrap') ||
            lc.includes('markets wrap') ||
            hrefLc.includes('wrap') ||
            hrefLc.includes('session-recap');

        if (!isWrap) continue;

        // Déduplique par URL
        if (seen.has(href)) continue;
        seen.add(href);

        // URL absolue
        let fullUrl = href;
        if (href.startsWith('/')) {
            fullUrl = 'https://investinglive.com' + href;
        } else if (!href.startsWith('http')) {
            fullUrl = 'https://investinglive.com/' + href;
        }

        items.push({
            title,
            link: fullUrl
        });
    }

    return items;
}

// Essai d'extraire une date depuis l'URL : pattern "...-YYYYMMDD/" ou "...-DD/MM/YYYY"
function extractDateFromUrl(url) {
    if (!url) return null;
    // Format 1 : -20260520/ ou -20260520
    const m1 = url.match(/-(\d{4})(\d{2})(\d{2})(?:\/|$)/);
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
    return null;
}

function getDateLabel(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(d.getTime())) return null;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayDate = new Date(now);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    if (dateStr === todayStr) return 'today';
    if (dateStr === yesterdayStr) return 'yesterday';

    // diff en jours
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const articleDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const diffDays = Math.round((today - articleDate) / (1000 * 60 * 60 * 24));
    if (diffDays > 0 && diffDays < 7) return `${diffDays}d ago`;
    return null;
}

export async function onRequest(context) {
    const url = new URL(context.request.url);
    const debug = url.searchParams.get('debug') === '1';

    const result = {
        source: 'InvestingLive SessionWraps page',
        sourceUrl: SOURCE_URL,
        fetchedAt: new Date().toISOString(),
        sessions: {
            asia:   { label: 'Asia Session',   wraps: [] },
            europe: { label: 'Europe Session', wraps: [] },
            us:     { label: 'US Session',     wraps: [] }
        },
        totalArticlesProcessed: 0,
        totalWrapsFound: 0
    };

    try {
        const r = await fetch(SOURCE_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            cf: { cacheTtl: 600 }  // 10 min cache Cloudflare
        });

        if (!r.ok) {
            result.error = `Source returned HTTP ${r.status}`;
            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        const html = await r.text();
        const items = parseInvestingLiveHTML(html);
        result.totalArticlesProcessed = items.length;

        if (debug) {
            result.debugSample = items.slice(0, 10).map(i => ({ title: i.title, link: i.link }));
            result.htmlSnippet = html.slice(0, 500);
        }

        for (const item of items) {
            const session = detectSession(item.title);
            if (session === 'other') continue;

            const dateStr = extractDateFromUrl(item.link);
            const dateLabel = dateStr ? getDateLabel(dateStr) : null;

            // On garde TOUS les wraps détectés (pas de filtre date strict)
            // Le label "TODAY" / "YESTERDAY" / "Xd ago" est juste indicatif
            result.sessions[session].wraps.push({
                title: item.title,
                link: item.link,
                dateLabel: dateLabel || 'recent',
                dateStr: dateStr || null
            });
            result.totalWrapsFound++;
        }

        // Trie chaque session par date desc (plus récent en haut), max 5 wraps par session
        for (const key of ['asia', 'europe', 'us']) {
            result.sessions[key].wraps.sort((a, b) => {
                if (!a.dateStr) return 1;
                if (!b.dateStr) return -1;
                return b.dateStr.localeCompare(a.dateStr);
            });
            result.sessions[key].wraps = result.sessions[key].wraps.slice(0, 5);
            result.sessions[key].count = result.sessions[key].wraps.length;
        }
    } catch (e) {
        result.error = e.message || 'Fetch failed';
    }

    return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=600',
            'Access-Control-Allow-Origin': '*'
        }
    });
}
