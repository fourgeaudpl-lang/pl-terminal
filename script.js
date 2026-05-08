/* ============================================
   PL TERMINAL — Frontend logic
   ============================================ */

// ---- Configuration des banques centrales ----
const CENTRAL_BANKS = [
    { code: 'FED',  ccy: 'USD', name: 'Federal Reserve',          finnhubCountry: 'US' },
    { code: 'ECB',  ccy: 'EUR', name: 'European Central Bank',    finnhubCountry: 'EU' },
    { code: 'RBA',  ccy: 'AUD', name: 'Reserve Bank of Australia',finnhubCountry: 'AU' },
    { code: 'RBNZ', ccy: 'NZD', name: 'Reserve Bank of NZ',       finnhubCountry: 'NZ' }
];

// ---- État des filtres calendrier ----
let calendarState = {
    events: [],
    period: 'today',
    impact: 'all',
    ccy: 'all'
};

// ---- Horloge GMT ----
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
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}

function daysUntil(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    if (isNaN(target)) return null;
    const now = new Date();
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function formatChange(changeBp) {
    if (changeBp === null || changeBp === undefined || isNaN(changeBp)) return { text: '--', cls: 'change-flat' };
    if (changeBp === 0) return { text: 'UNCH', cls: 'change-flat' };
    const sign = changeBp > 0 ? '+' : '−';
    const bp = Math.abs(Math.round(changeBp));
    return { text: `${sign}${bp}`, cls: changeBp > 0 ? 'change-up' : 'change-down' };
}

function formatDays(days) {
    if (days === null) return { text: '--', cls: 'change-flat' };
    if (days === 0) return { text: '— TODAY', cls: 'meeting-today' };
    if (days < 0) return { text: '--', cls: 'change-flat' };
    if (days <= 7) return { text: `${days}d`, cls: 'meeting-soon' };
    return { text: `${days}d`, cls: 'change-flat' };
}

function setStatus(state, message) {
    const dot = document.querySelector('.status-dot');
    const text = document.getElementById('status');
    dot.classList.remove('live', 'error');
    if (state === 'live') dot.classList.add('live');
    if (state === 'error') dot.classList.add('error');
    text.textContent = message;
}

// ---- Module 1 : tableau des taux ----
function renderRatesTable(ratesPayload, meetingsData) {
    const tbody = document.getElementById('rates-tbody');
    tbody.innerHTML = '';

    const banksById = {};
    if (ratesPayload && Array.isArray(ratesPayload.banks)) {
        ratesPayload.banks.forEach(b => { banksById[b.id] = b; });
    }

    CENTRAL_BANKS.forEach(bank => {
        const apiData = banksById[bank.code] || {};
        const meeting = meetingsData[bank.code] || null;
        const tr = document.createElement('tr');
        const change = formatChange(apiData.lastChange);
        const days = daysUntil(meeting);
        const daysFmt = formatDays(days);
        const rateText = (apiData.rate !== null && apiData.rate !== undefined) ? Number(apiData.rate).toFixed(2) : '--';

        tr.innerHTML = `
            <td class="bank-code">${bank.code}</td>
            <td class="ccy">${bank.ccy}</td>
            <td class="num rate-value">${rateText}</td>
            <td class="num ${change.cls}">${change.text}</td>
            <td class="num date-cell">${formatDate(apiData.asOf)}</td>
            <td class="num">${formatDate(meeting)}</td>
            <td class="num ${daysFmt.cls}">${daysFmt.text}</td>
        `;
        tbody.appendChild(tr);
    });

    const now = new Date();
    document.getElementById('last-update').textContent = `last update: ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')} GMT`;
}

// ---- Module 4 : calendrier économique ----
function formatCalValue(value, unit) {
    if (value === null || value === undefined || value === '') return '—';
    let str = typeof value === 'number' ? value.toString() : value;
    if (unit && unit !== '') str += unit;
    return str;
}

function getDayKey(timeStr) {
    const d = new Date(timeStr.replace(' ', 'T') + 'Z');
    return d.toISOString().split('T')[0];
}

function formatDayHeader(dateKey) {
    const d = new Date(dateKey + 'T00:00:00Z');
    const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${days[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2,'0')} ${months[d.getUTCMonth()]}`;
}

function formatTime(timeStr) {
    const parts = timeStr.split(' ');
    if (parts.length < 2) return '--:--';
    return parts[1].substring(0, 5);
}

function applyCalendarFilters() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return calendarState.events.filter(e => {
        const eventDate = new Date(e.time.replace(' ', 'T') + 'Z');
        const eventDateStr = eventDate.toISOString().split('T')[0];

        // Filter period
        if (calendarState.period === 'today' && eventDateStr !== todayStr) return false;
        if (calendarState.period === 'tomorrow' && eventDateStr !== tomorrowStr) return false;
        if (calendarState.period === 'week' && (eventDate < now || eventDate > weekEnd)) return false;
        // 'month' = no period filter (all 30 days)

        // Filter impact
        if (calendarState.impact === 'high' && e.impact !== 'high') return false;
        if (calendarState.impact === 'med' && e.impact === 'low') return false;

        // Filter currency
        if (calendarState.ccy !== 'all' && e.currency !== calendarState.ccy) return false;

        return true;
    });
}

function renderCalendar() {
    const tbody = document.getElementById('cal-tbody');
    const filtered = applyCalendarFilters();

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading">No events match these filters</td></tr>`;
        document.getElementById('cal-event-count').textContent = '0 events';
        return;
    }

    // Group by day
    const byDay = {};
    filtered.forEach(e => {
        const key = getDayKey(e.time);
        if (!byDay[key]) byDay[key] = [];
        byDay[key].push(e);
    });

    const days = Object.keys(byDay).sort();
    let html = '';
    days.forEach(dayKey => {
        html += `<tr class="day-divider"><td colspan="7">— ${formatDayHeader(dayKey)} ─────────────────────</td></tr>`;
        byDay[dayKey].forEach(e => {
            const impactCls = e.impact === 'high' ? 'high' : e.impact === 'medium' ? 'med' : 'low';
            const impactLabel = e.impact === 'high' ? 'HIGH' : e.impact === 'medium' ? 'MED' : 'LOW';
            const eventCls = e.impact === 'high' ? 'event-high' : '';
            html += `
                <tr>
                    <td>${formatTime(e.time)}</td>
                    <td><span class="ccy-flag">${e.currency}</span></td>
                    <td class="${eventCls}">${e.event}</td>
                    <td><span class="dot ${impactCls}"></span><span class="impact-${impactCls}">${impactLabel}</span></td>
                    <td class="num">${formatCalValue(e.actual, e.unit)}</td>
                    <td class="num value-fcst">${formatCalValue(e.estimate, e.unit)}</td>
                    <td class="num value-prev">${formatCalValue(e.prev, e.unit)}</td>
                </tr>
            `;
        });
    });

    tbody.innerHTML = html;
    document.getElementById('cal-event-count').textContent = `${filtered.length} events`;
}

function setupCalendarFilters() {
    document.querySelectorAll('.cal-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Determine filter group
            const group = btn.dataset.period ? 'period' :
                          btn.dataset.impact ? 'impact' :
                          btn.dataset.ccy ? 'ccy' : null;
            if (!group) return;

            // Remove active from siblings in same group
            const parent = btn.parentElement;
            parent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update state
            const value = btn.dataset[group];
            calendarState[group] = value;

            // Re-render
            renderCalendar();
        });
    });
}

async function fetchCalendar() {
    try {
        const res = await fetch('/api/calendar');
        if (!res.ok) throw new Error(`Calendar API failed: ${res.status}`);
        const data = await res.json();
        calendarState.events = data.events || [];
        renderCalendar();
        const now = new Date();
        document.getElementById('cal-last-update').textContent = `last update: ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')} GMT`;
    } catch (err) {
        console.error('Calendar fetch error:', err);
        document.getElementById('cal-tbody').innerHTML = `<tr><td colspan="7" class="error-row">⚠️ Calendar load failed</td></tr>`;
    }
}

// ---- Récupération des données rates + meetings ----
async function fetchRatesAndMeetings() {
    setStatus('connecting', 'fetching data...');
    try {
        const [ratesRes, meetingsRes] = await Promise.all([
            fetch('/api/rates'),
            fetch('/api/meetings')
        ]);
        if (!ratesRes.ok) throw new Error(`Rates API failed: ${ratesRes.status}`);
        const ratesPayload = await ratesRes.json();
        const meetingsData = meetingsRes.ok ? await meetingsRes.json() : {};
        renderRatesTable(ratesPayload, meetingsData);
        setStatus('live', 'live');
    } catch (err) {
        console.error('Fetch error:', err);
        setStatus('error', 'connection error');
        document.getElementById('rates-tbody').innerHTML = `<tr><td colspan="7" class="error-row">⚠️ Error loading data</td></tr>`;
    }
}

// ---- Démarrage ----
setupCalendarFilters();
fetchRatesAndMeetings();
fetchCalendar();
setInterval(fetchRatesAndMeetings, 10 * 60 * 1000); // 10 min
setInterval(fetchCalendar, 30 * 60 * 1000); // 30 min
