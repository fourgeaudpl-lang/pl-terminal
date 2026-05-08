/* ============================================
   PL TERMINAL — Frontend logic
   ============================================ */

// ---- Configuration des banques centrales ----
const CENTRAL_BANKS = [
    { code: 'FED',  ccy: 'USD', name: 'Federal Reserve',          fredId: 'DFEDTARU',         finnhubCountry: 'US' },
    { code: 'ECB',  ccy: 'EUR', name: 'European Central Bank',    fredId: 'ECBDFR',           finnhubCountry: 'EU' },
    { code: 'BOE',  ccy: 'GBP', name: 'Bank of England',          fredId: 'IUDSOIA',          finnhubCountry: 'GB' },
    { code: 'BOJ',  ccy: 'JPY', name: 'Bank of Japan',            fredId: 'IRSTCB01JPM156N',  finnhubCountry: 'JP' },
    { code: 'BOC',  ccy: 'CAD', name: 'Bank of Canada',           fredId: 'IRSTCB01CAM156N',  finnhubCountry: 'CA' },
    { code: 'RBA',  ccy: 'AUD', name: 'Reserve Bank of Australia',fredId: 'IRSTCB01AUM156N',  finnhubCountry: 'AU' },
    { code: 'RBNZ', ccy: 'NZD', name: 'Reserve Bank of NZ',       fredId: 'IRSTCB01NZM156N',  finnhubCountry: 'NZ' },
    { code: 'SNB',  ccy: 'CHF', name: 'Swiss National Bank',      fredId: 'IRSTCB01CHM156N',  finnhubCountry: 'CH' }
];

// ---- Horloge GMT en haut ----
function updateClock() {
    const now = new Date();
    const h = String(now.getUTCHours()).padStart(2, '0');
    const m = String(now.getUTCMinutes()).padStart(2, '0');
    const s = String(now.getUTCSeconds()).padStart(2, '0');
    document.getElementById('clock').textContent = `${h}:${m}:${s} GMT`;
}
setInterval(updateClock, 1000);
updateClock();

// ---- Helpers de formatage ----
function formatDate(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    if (isNaN(d)) return '--';
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
}

function daysUntil(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    if (isNaN(target)) return null;
    const now = new Date();
    const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return diff;
}

function formatChange(change) {
    if (change === null || change === undefined || isNaN(change)) return { text: '--', cls: 'change-flat' };
    if (change === 0) return { text: 'UNCH', cls: 'change-flat' };
    const sign = change > 0 ? '+' : '−';
    const bp = Math.abs(Math.round(change * 100));
    return {
        text: `${sign}${bp}`,
        cls: change > 0 ? 'change-up' : 'change-down'
    };
}

function formatDays(days) {
    if (days === null) return { text: '--', cls: 'change-flat' };
    if (days === 0) return { text: '— TODAY', cls: 'meeting-today' };
    if (days < 0) return { text: '--', cls: 'change-flat' };
    if (days <= 7) return { text: `${days}d`, cls: 'meeting-soon' };
    return { text: `${days}d`, cls: 'change-flat' };
}

// ---- Status indicator ----
function setStatus(state, message) {
    const dot = document.querySelector('.status-dot');
    const text = document.getElementById('status');
    dot.classList.remove('live', 'error');
    if (state === 'live') dot.classList.add('live');
    if (state === 'error') dot.classList.add('error');
    text.textContent = message;
}

// ---- Affichage du tableau ----
function renderTable(ratesData, meetingsData) {
    const tbody = document.getElementById('rates-tbody');
    tbody.innerHTML = '';

    CENTRAL_BANKS.forEach(bank => {
        const rateInfo = ratesData[bank.code] || {};
        const meeting = meetingsData[bank.code] || null;

        const tr = document.createElement('tr');

        const change = formatChange(rateInfo.change);
        const days = daysUntil(meeting);
        const daysFmt = formatDays(days);

        tr.innerHTML = `
            <td class="bank-code">${bank.code}</td>
            <td class="ccy">${bank.ccy}</td>
            <td class="num rate-value">${rateInfo.value !== undefined ? rateInfo.value.toFixed(2) : '--'}</td>
            <td class="num ${change.cls}">${change.text}</td>
            <td class="num date-cell">${formatDate(rateInfo.date)}</td>
            <td class="num">${formatDate(meeting)}</td>
            <td class="num ${daysFmt.cls}">${daysFmt.text}</td>
        `;
        tbody.appendChild(tr);
    });

    const now = new Date();
    const h = String(now.getUTCHours()).padStart(2, '0');
    const m = String(now.getUTCMinutes()).padStart(2, '0');
    document.getElementById('last-update').textContent = `last update: ${h}:${m} GMT`;
}

// ---- Récupération des données ----
async function fetchData() {
    setStatus('connecting', 'fetching data...');

    try {
        const [ratesRes, meetingsRes] = await Promise.all([
            fetch('/api/rates'),
            fetch('/api/meetings')
        ]);

        if (!ratesRes.ok) throw new Error(`Rates API failed: ${ratesRes.status}`);

        const ratesData = await ratesRes.json();
        const meetingsData = meetingsRes.ok ? await meetingsRes.json() : {};

        renderTable(ratesData, meetingsData);
        setStatus('live', 'live');

    } catch (err) {
        console.error('Fetch error:', err);
        setStatus('error', 'connection error');
        const tbody = document.getElementById('rates-tbody');
        tbody.innerHTML = `<tr><td colspan="7" class="error-row">⚠️ Error loading data — check console (F12) for details</td></tr>`;
    }
}

// ---- Démarrage + refresh auto ----
fetchData();
setInterval(fetchData, 10 * 60 * 1000); // toutes les 10 minutes
