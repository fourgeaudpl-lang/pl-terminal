/* ============================================
   PL TERMINAL — Frontend logic
   ============================================ */

// ---- Configuration ----
const CENTRAL_BANKS = [
    { code: 'FED',  ccy: 'USD', name: 'Federal Reserve',          finnhubCountry: 'US' },
    { code: 'ECB',  ccy: 'EUR', name: 'European Central Bank',    finnhubCountry: 'EU' },
    { code: 'RBA',  ccy: 'AUD', name: 'Reserve Bank of Australia',finnhubCountry: 'AU' },
    { code: 'RBNZ', ccy: 'NZD', name: 'Reserve Bank of NZ',       finnhubCountry: 'NZ' }
];

// ---- État global ----
let calendarState = {
    events: [],
    period: 'today',
    impact: 'all',
    ccy: 'all'
};

let rateHistoryState = {
    banks: [],          // full data from API
    selectedYears: 5,   // default 5Y
    chartInstances: {}  // Chart.js instances by bank code
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

// ---- Helpers ----
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

// ---- Module 1B : Rate History Charts ----
function filterHistoryByYears(history, years) {
    if (!history || history.length === 0) return [];
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    return history.filter(p => new Date(p.date) >= cutoff);
}

function renderRateChart(bankId, history, years) {
    const canvas = document.getElementById(`chart-${bankId}`);
    if (!canvas) return;

    // Destroy existing chart instance if any
    if (rateHistoryState.chartInstances[bankId]) {
        rateHistoryState.chartInstances[bankId].destroy();
    }

    const filtered = filterHistoryByYears(history, years);

    if (filtered.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#555';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Append "today" point with current value to extend the line to now
    const lastPoint = filtered[filtered.length - 1];
    const todayStr = new Date().toISOString().split('T')[0];
    const dataPoints = [...filtered];
    if (lastPoint.date !== todayStr) {
        dataPoints.push({ date: todayStr, value: lastPoint.value });
    }

    const labels = dataPoints.map(p => p.date);
    const values = dataPoints.map(p => p.value);

    const ctx = canvas.getContext('2d');
    rateHistoryState.chartInstances[bankId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: bankId,
                data: values,
                borderColor: '#ff8c00',
                backgroundColor: 'rgba(255, 140, 0, 0.08)',
                borderWidth: 1.5,
                stepped: 'before',
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#ff8c00'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0a0a0a',
                    borderColor: '#ff8c00',
                    borderWidth: 1,
                    titleColor: '#ff8c00',
                    bodyColor: '#ddd',
                    padding: 8,
                    titleFont: { family: 'monospace', size: 10 },
                    bodyFont: { family: 'monospace', size: 11 },
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y.toFixed(2)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: years <= 1 ? 'month' : years <= 3 ? 'quarter' : 'year' },
                    grid: { color: '#1a1a1a', drawBorder: false },
                    ticks: { color: '#555', font: { family: 'monospace', size: 9 }, maxRotation: 0 }
                },
                y: {
                    grid: { color: '#1a1a1a', drawBorder: false },
                    ticks: {
                        color: '#666',
                        font: { family: 'monospace', size: 9 },
                        callback: function(value) { return value.toFixed(1) + '%'; }
                    }
                }
            }
        }
    });
}

function renderAllRateCharts() {
    rateHistoryState.banks.forEach(bank => {
        renderRateChart(bank.id, bank.history || [], rateHistoryState.selectedYears);
        // Update current rate label
        const labelEl = document.getElementById(`chart-current-${bank.id}`);
        if (labelEl) {
            labelEl.textContent = bank.rate !== null && bank.rate !== undefined
                ? `${bank.rate.toFixed(2)}%`
                : '—';
        }
    });
}

function setupPeriodSelector() {
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            rateHistoryState.selectedYears = parseInt(btn.dataset.years);
            renderAllRateCharts();
        });
    });
}

// ---- Module 4 : calendrier ----
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

        if (calendarState.period === 'today' && eventDateStr !== todayStr) return false;
        if (calendarState.period === 'tomorrow' && eventDateStr !== tomorrowStr) return false;
        if (calendarState.period === 'week' && (eventDate < now || eventDate > weekEnd)) return false;

        if (calendarState.impact === 'high' && e.impact !== 'high') return false;
        if (calendarState.impact === 'med' && e.impact === 'low') return false;

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
            const group = btn.dataset.period ? 'period' :
                          btn.dataset.impact ? 'impact' :
                          btn.dataset.ccy ? 'ccy' : null;
            if (!group) return;
            const parent = btn.parentElement;
            parent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            calendarState[group] = btn.dataset[group];
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

// ---- Récup rates + meetings + history ----
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

        // Save banks data for charts
        if (ratesPayload && Array.isArray(ratesPayload.banks)) {
            rateHistoryState.banks = ratesPayload.banks;
            renderAllRateCharts();
        }

        setStatus('live', 'live');
    } catch (err) {
        console.error('Fetch error:', err);
        setStatus('error', 'connection error');
        document.getElementById('rates-tbody').innerHTML = `<tr><td colspan="7" class="error-row">⚠️ Error loading data</td></tr>`;
    }
}

// ---- Démarrage ----
setupCalendarFilters();
setupPeriodSelector();
fetchRatesAndMeetings();
fetchCalendar();
setInterval(fetchRatesAndMeetings, 10 * 60 * 1000);
setInterval(fetchCalendar, 30 * 60 * 1000);
