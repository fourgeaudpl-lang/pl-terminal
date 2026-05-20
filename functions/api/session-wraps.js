// Cloudflare Function : /api/session-wraps
// Récupère le flux RSS InvestingLive, filtre les session wraps du jour
// et les catégorise par session (Asia / Europe / US)
//
// Source : https://investinglive.com/rss/
// Filtrage : titres contenant "wrap" + détection de la session via mots-clés

const RSS_URL = 'https://investinglive.com/rss/';

// Détection de la session à partir du titre de l'article
function detectSession(title) {
    const t = title.toLowerCase();
    if (t.includes('asia') || t.includes('asian') || t.includes('asia-pacific') || t.includes('pacific') || t.includes('tokyo') || t.includes('sydney')) {
        return 'asia';
    }
    if (t.includes('european') || t.includes('europe') || t.includes('london')) {
        return 'europe';
    }
    if (t.includes('american') || t.includes('americas') || t.includes('us ') || t.includes('north american') || t.includes('new york')) {
        return 'us';
    }
    return 'other';
}

// Vrai/faux : est-ce un "wrap" / résumé de session ?
function isSessionWrap(title) {
    const t = title.toLowerCase();
    return (
        t.includes('wrap') ||
        t.includes('session recap') ||
        t.includes('markets wrap') ||
        t.includes('fx news wrap') ||
        t.includes('news wrap')
    );
}

// Parse simple d'un flux RSS en JavaScript (sans lib externe)
// Format RSS 2.0 typique : <item><title>...</title><link>...</link><pubDate>...</pubDate><description>...</description></item>
function parseRSS(xmlText) {
    const items = [];
    // Match chaque <item>...</item>
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xmlText)) !== null) {
        const itemContent = match[1];
        const title = extractTag(itemContent, 'title');
        const link = extractTag(itemContent, 'link');
        const pubDate = extractTag(itemContent, 'pubDate');
        const description = extractTag(itemContent, 'description');
        const creator = extractTag(itemContent, 'dc:creator');

        if (title) {
            items.push({
                title: cleanText(title),
                link: link || '',
                pubDate: pubDate || '',
                description: cleanText(description || ''),
                author: cleanText(creator || '')
            });
        }
    }
    return items;
}

function extractTag(content, tagName) {
    // Match <tag>...</tag> en gérant les CDATA
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
    const m = content.match(regex);
    if (!m) return null;
    let val = m[1];
    // Strip CDATA wrapper si présent
    const cdataMatch = val.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (cdataMatch) val = cdataMatch[1];
    return val.trim();
}

function cleanText(text) {
    if (!text) return '';
    // Décode quelques entités HTML communes
    return text
        .replace(/<[^>]+>/g, '')  // strip HTML tags
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Détermine si une date est "aujourd'hui" ou "hier" (UTC)
function getDateLabel(pubDateStr) {
    if (!pubDateStr) return 'unknown';
    const d = new Date(pubDateStr);
    if (isNaN(d.getTime())) return 'unknown';

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const articleDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const diffDays = Math.round((today.getTime() - articleDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    return `${diffDays}d ago`;
}

export async function onRequest(context) {
    const result = {
        source: 'InvestingLive RSS',
        sourceUrl: RSS_URL,
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
        const r = await fetch(RSS_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (PL Terminal Macro FX Aggregator)',
                'Accept': 'application/rss+xml, application/xml, text/xml'
            }
        });

        if (!r.ok) {
            result.error = `RSS fetch returned ${r.status}`;
            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        const xml = await r.text();
        const items = parseRSS(xml);
        result.totalArticlesProcessed = items.length;

        // Filtre : on garde les wraps des 2 derniers jours uniquement
        for (const item of items) {
            if (!isSessionWrap(item.title)) continue;

            const dateLabel = getDateLabel(item.pubDate);
            if (dateLabel !== 'today' && dateLabel !== 'yesterday') continue;

            const session = detectSession(item.title);
            if (session === 'other') continue;

            result.sessions[session].wraps.push({
                title: item.title,
                link: item.link,
                pubDate: item.pubDate,
                dateLabel,
                excerpt: item.description ? item.description.slice(0, 300) : '',
                author: item.author
            });
            result.totalWrapsFound++;
        }

        // Trie chaque session par date desc (plus récent en haut)
        for (const key of ['asia', 'europe', 'us']) {
            result.sessions[key].wraps.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
            result.sessions[key].count = result.sessions[key].wraps.length;
        }
    } catch (e) {
        result.error = e.message || 'Fetch failed';
    }

    return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=600',  // 10 min cache
            'Access-Control-Allow-Origin': '*'
        }
    });
}
