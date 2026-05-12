/* ============================================
   PL TERMINAL — Frontend logic (full + macro data)
   Pure macro scoring — 6 factors
   HOME = statique (HTML pur, aucun JS)
   ============================================ */

const CCYS = ['USD','EUR','GBP','JPY','CAD','AUD','NZD','CHF'];

const CENTRAL_BANKS = [
    { code: 'FED',  ccy: 'USD', fred: 'IRSTCB01USM156N' },
    { code: 'ECB',  ccy: 'EUR', fred: 'IRSTCB01EZM156N' },
    { code: 'BOE',  ccy: 'GBP', fred: 'IRSTCB01GBM156N' },
    { code: 'BOJ',  ccy: 'JPY', fred: 'IRSTCB01JPM156N' },
    { code: 'BOC',  ccy: 'CAD', fred: 'IRSTCB01CAM156N' },
    { code: 'RBA',  ccy: 'AUD', fred: 'IRSTCB01AUM156N' },
    { code: 'RBNZ', ccy: 'NZD', fred: 'IRSTCB01NZM156N' },
    { code: 'SNB',  ccy: 'CHF', fred: 'IRSTCB01CHM156N' }
];

const CCY_TO_BANK = {
    USD: 'FED', EUR: 'ECB', GBP: 'BOE', JPY: 'BOJ',
    CAD: 'BOC', AUD: 'RBA', NZD: 'RBNZ', CHF: 'SNB'
};

const MACRO_INDICATORS = [
    { id: 'rate',          label: 'Taux directeur (%)',         decimals: 2 },
    { id: 'bias',          label: 'Biais BC (Hawkish/Dovish)',  decimals: 0, text: true },
    { id: 'cpi',           label: 'Inflation CPI YoY (%)',       decimals: 2 },
    { id: 'cpi_core',      label: 'Inflation Core YoY (%)',      decimals: 2 },
    { id: 'gdp',           label: 'PIB YoY (%)',                 decimals: 2 },
    { id: 'unemployment',  label: 'Chômage (%)',                 decimals: 2 },
    { id: 'pmi_manuf',     label: 'PMI Manufacturier',           decimals: 2 },
    { id: 'pmi_services',  label: 'PMI Services',                decimals: 2 },
    { id: 'retail',        label: 'Retail Sales YoY (%)',        decimals: 2 },
    { id: 'trade_balance', label: 'Balance commerciale (Md)',    decimals: 2 },
    { id: 'yield_10y',     label: 'Rendement 10Y (%)',           decimals: 3 },
    { id: 'yield_2y',      label: 'Rendement 2Y (%)',            decimals: 3 },
    { id: 'spread',        label: 'Spread 10Y-2Y (%)',           decimals: 2, computed: true }
];

const MACRO_CHARTS = [
    { id: 'rate',         label: 'TAUX DIRECTEUR (%)',     color: '#ff8c00' },
    { id: 'cpi',          label: 'INFLATION CPI YoY (%)',  color: '#ff8c00' },
    { id: 'unemployment', label: 'CHÔMAGE (%)',            color: '#ff8c00' },
    { id: 'retail',       label: 'RETAIL SALES YoY (%)',   color: '#ff8c00', signed: true },
    { id: 'cpi_core',     label: 'INFLATION CORE YoY (%)', color: '#ff8c00' },
    { id: 'gdp',          label: 'PIB YoY (%)',            color: '#ff8c00' },
    { id: 'pmi_services', label: 'PMI SERVICES',           color: '#ff8c00', threshold: 50 },
    { id: 'yield_10y',    label: 'RENDEMENT 10Y (%)',      color: '#ff8c00' },
    { id: 'trade_balance',label: 'BALANCE COMMERCIALE (Md)', color: '#ff8c00', signed: true },
    { id: 'yield_2y',     label: 'RENDEMENT 2Y (%)',       color: '#ff8c00' },
    { id: 'spread',       label: 'SPREAD 10Y-2Y (%)',      color: '#4ade80', signed: true },
    { id: 'pmi_manuf',    label: 'PMI MANUFACTURIER',      color: '#ff8c00', threshold: 50 }
];

let rateHistoryState = { banks: [], selectedYears: 5, chartInstances: {} };
let yieldsData = {};
let ratesData = {};
let macroState = {};
let macroChartInstances = {};

const SCORING_FACTORS = [
    { id: 'monetary',   label: 'Politique monétaire (hawkish+)', weight: 2,   src: 'auto-monetary' },
    { id: 'rate_diff',  label: 'Différentiel de taux',           weight: 2,   src: 'auto-spread'   },
    { id: 'inflation',  label: 'Inflation (tendance)',            weight: 1,   src: 'auto-cpi'      },
    { id: 'gdp',        label: 'Croissance PIB',                  weight: 1.5, src: 'auto-gdp'      },
    { id: 'employment', label: 'Emploi / Chômage',                weight: 1,   src: 'auto-unemp'    },
    { id: 'pmi',        label: 'PMI / Activité',                  weight: 1,   src: 'auto-pmi'      }
];

// ---- Horloge ----
function updateClock() {
    const now = new Date();
    const h = String(now.getUTCHours()).padStart(2,'0');
    const m = String(now.getUTCMinutes()).padStart(2,'0');
    const s = String(now.getUTCSeconds()).padStart(2,'0');
    const el = document.getElementById('clock');
    if (el) el.textContent = `${h}:${m}:${s} GMT`;
}

// ---- World Clocks (5 places financières) ----
// Heures d'ouverture des bourses majeures (locales, format heure décimale)
// NYSE: 09:30-16:00 | LSE: 08:00-16:30 | Euronext Paris: 09:00-17:30
// TSE: 09:00-15:00 (avec pause midi simplifiée ici) | ASX: 10:00-16:00
const WORLD_CLOCKS = [
    { id: 'ny',  tz: 'America/New_York',     open: 9.5,  close: 16,   weekendOff: true },
    { id: 'ldn', tz: 'Europe/London',        open: 8,    close: 16.5, weekendOff: true },
    { id: 'par', tz: 'Europe/Paris',         open: 9,    close: 17.5, weekendOff: true },
    { id: 'tyo', tz: 'Asia/Tokyo',           open: 9,    close: 15,   weekendOff: true },
    { id: 'syd', tz: 'Australia/Sydney',     open: 10,   close: 16,   weekendOff: true }
];

function getLocalTimeParts(tz) {
    const now = new Date();
    // Utilise Intl pour récupérer l'heure dans le fuseau cible
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'short', hour12: false
    });
    const parts = fmt.formatToParts(now);
    let hh = '00', mm = '00', ss = '00', wd = 'Mon';
    parts.forEach(p => {
        if (p.type === 'hour')    hh = p.value;
        if (p.type === 'minute')  mm = p.value;
        if (p.type === 'second')  ss = p.value;
        if (p.type === 'weekday') wd = p.value;
    });
    // Intl peut renvoyer "24" au lieu de "00" à minuit selon le navigateur
    if (hh === '24') hh = '00';
    return { hh, mm, ss, wd };
}

function updateWorldClocks() {
    WORLD_CLOCKS.forEach(c => {
        const { hh, mm, ss, wd } = getLocalTimeParts(c.tz);
        const timeEl = document.getElementById('wclock-' + c.id);
        const statusEl = document.getElementById('wstatus-' + c.id);
        const cardEl = timeEl ? timeEl.closest('.wclock') : null;
        if (!timeEl || !statusEl) return;

        timeEl.textContent = `${hh}:${mm}:${ss}`;

        // Calcul ouverture : weekend → fermé, sinon plage horaire locale
        const isWeekend = (wd === 'Sat' || wd === 'Sun');
        const hourDecimal = parseInt(hh, 10) + parseInt(mm, 10) / 60;
        const isOpen = !isWeekend && hourDecimal >= c.open && hourDecimal < c.close;

        if (isOpen) {
            statusEl.textContent = '● OPEN';
            statusEl.classList.add('is-open');
            statusEl.classList.remove('is-closed');
            if (cardEl) cardEl.classList.add('is-open');
        } else {
            statusEl.textContent = '○ CLOSED';
            statusEl.classList.add('is-closed');
            statusEl.classList.remove('is-open');
            if (cardEl) cardEl.classList.remove('is-open');
        }
    });
}

setInterval(updateClock, 1000);
setInterval(updateWorldClocks, 1000);
updateClock();
updateWorldClocks();

// ---- localStorage ----
function lsGet(key, def) {
    const v = localStorage.getItem(`pl_${key}`);
    if (v === null) return def;
    const n = parseFloat(v);
    return isNaN(n) ? v : n;
}
function lsSet(key, val) { localStorage.setItem(`pl_${key}`, String(val)); }
function lsClear(key) { localStorage.removeItem(`pl_${key}`); }

// ---- Helpers ----
function formatDate(s) {
    if (!s) return '--';
    const d = new Date(s);
    if (isNaN(d)) return '--';
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}
function daysUntil(s) {
    if (!s) return null;
    const d = new Date(s);
    if (isNaN(d)) return null;
    return Math.ceil((d - new Date()) / 86400000);
}
function fmtChangeBp(bp) {
    if (bp === null || bp === undefined || isNaN(bp)) return { text: '--', cls: 'change-flat' };
    if (bp === 0) return { text: 'UNCH', cls: 'change-flat' };
    const sign = bp > 0 ? '+' : '−';
    return { text: `${sign}${Math.abs(Math.round(bp))}`, cls: bp > 0 ? 'change-up' : 'change-down' };
}
function fmtDays(d) {
    if (d === null) return { text: '--', cls: 'change-flat' };
    if (d === 0) return { text: '— TODAY', cls: 'meeting-today' };
    if (d < 0) return { text: '--', cls: 'change-flat' };
    if (d <= 7) return { text: `${d}d`, cls: 'meeting-soon' };
    return { text: `${d}d`, cls: 'change-flat' };
}
function setStatus(state, msg) {
    const dot = document.querySelector('.status-dot');
    const text = document.getElementById('status');
    if (!dot || !text) return;
    dot.classList.remove('live','error');
    if (state === 'live') dot.classList.add('live');
    if (state === 'error') dot.classList.add('error');
    text.textContent = msg;
}

// ============================================
// MODULE 1 - Rates table
// ============================================
function renderRatesTable(payload, meetings) {
    const tbody = document.getElementById('rates-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const banksById = {};
    if (payload && Array.isArray(payload.banks)) payload.banks.forEach(b => banksById[b.id] = b);
    CENTRAL_BANKS.forEach(bank => {
        const d = banksById[bank.code] || {};
        const meet = meetings[bank.code] || null;
        const tr = document.createElement('tr');
        const ch = fmtChangeBp(d.lastChange);
        const days = daysUntil(meet);
        const df = fmtDays(days);
        const r = (d.rate !== null && d.rate !== undefined) ? Number(d.rate).toFixed(2) : '--';
        tr.innerHTML = `
            <td class="bank-code">${bank.code}</td><td class="ccy">${bank.ccy}</td>
            <td class="num rate-value">${r}</td>
            <td class="num ${ch.cls}">${ch.text}</td>
            <td class="num date-cell">${formatDate(d.asOf)}</td>
            <td class="num">${formatDate(meet)}</td>
            <td class="num ${df.cls}">${df.text}</td>
        `;
        tbody.appendChild(tr);
    });
    const now = new Date();
    const e = document.getElementById('last-update');
    if (e) e.textContent = `last update: ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')} GMT`;
}

// ============================================
// MODULE 1B - Rate History Charts
// ============================================
function filterHist(h, y) {
    if (!h || h.length === 0) return [];
    const c = new Date();
    c.setFullYear(c.getFullYear() - y);
    return h.filter(p => new Date(p.date) >= c);
}
function renderRateChart(id, hist, years) {
    const cv = document.getElementById(`chart-${id}`);
    if (!cv) return;
    if (rateHistoryState.chartInstances[id]) rateHistoryState.chartInstances[id].destroy();
    const f = filterHist(hist, years);
    if (f.length === 0) return;
    const last = f[f.length-1];
    const today = new Date().toISOString().split('T')[0];
    const pts = [...f];
    if (last.date !== today) pts.push({ date: today, value: last.value });
    rateHistoryState.chartInstances[id] = new Chart(cv.getContext('2d'), {
        type: 'line',
        data: {
            labels: pts.map(p=>p.date),
            datasets: [{
                data: pts.map(p=>p.value),
                borderColor: '#ff8c00', backgroundColor: 'rgba(255,140,0,0.08)',
                borderWidth: 1.5, stepped: 'before', fill: true, pointRadius: 0, pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#0a0a0a', borderColor: '#ff8c00', borderWidth: 1,
                           titleColor: '#ff8c00', bodyColor: '#ddd', padding: 8,
                           callbacks: { label: c => `${c.parsed.y.toFixed(2)}%` } }
            },
            scales: {
                x: { type: 'time', time: { unit: years <= 1 ? 'month' : years <= 3 ? 'quarter' : 'year' },
                     grid: { color: '#1a1a1a' }, ticks: { color: '#555', font: { family: 'monospace', size: 9 }, maxRotation: 0 } },
                y: { grid: { color: '#1a1a1a' }, ticks: { color: '#666', font: { family: 'monospace', size: 9 }, callback: v => v.toFixed(1)+'%' } }
            }
        }
    });
}
function renderAllRateCharts() {
    rateHistoryState.banks.forEach(b => {
        renderRateChart(b.id, b.history || [], rateHistoryState.selectedYears);
        const e = document.getElementById(`chart-current-${b.id}`);
        if (e) e.textContent = (b.rate !== null && b.rate !== undefined) ? `${b.rate.toFixed(2)}%` : '—';
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

// ============================================
// MODULE 4B - Macro Data
// ============================================
function getMacroValue(indId, ccy) {
    if (indId === 'spread') {
        const y10 = getMacroValue('yield_10y', ccy);
        const y2 = getMacroValue('yield_2y', ccy);
        if (y10 === null || y2 === null) return null;
        return y10 - y2;
    }
    const k = `macro_${indId}_${ccy}`;
    const v = macroState[k];
    if (v === undefined || v === null || v === '') return null;
    return v;
}

function setMacroValue(indId, ccy, val) {
    const k = `macro_${indId}_${ccy}`;
    if (val === null || val === '' || val === undefined) {
        delete macroState[k];
        lsClear(k);
    } else {
        macroState[k] = val;
        lsSet(k, val);
    }
}

function loadMacroState() {
    macroState = {};
    MACRO_INDICATORS.forEach(ind => {
        if (ind.computed) return;
        CCYS.forEach(ccy => {
            const k = `macro_${ind.id}_${ccy}`;
            const v = lsGet(k, null);
            if (v !== null && v !== '') macroState[k] = v;
        });
    });
}

function fmtMacroValue(val, decimals, signed) {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'string') return val;
    const sign = (signed && val > 0) ? '+' : '';
    return sign + val.toFixed(decimals);
}

function renderMacroTable() {
    const tbody = document.getElementById('macro-tbody');
    if (!tbody) return;

    let html = '';
    MACRO_INDICATORS.forEach(ind => {
        const isComputed = ind.computed === true;
        const isSpread = ind.id === 'spread';
        const cls = isComputed ? 'computed-row' : '';
        let row = `<tr class="${cls}"><td>${ind.label}</td>`;
        CCYS.forEach(ccy => {
            const v = getMacroValue(ind.id, ccy);
            const cellCls = isComputed ? 'computed-cell' : 'editable-macro';
            const display = fmtMacroValue(v, ind.decimals, isSpread);
            const emptyCls = (v === null) ? 'empty' : '';
            row += `<td class="num ${cellCls} ${emptyCls}" data-ind="${ind.id}" data-ccy="${ccy}">${display}</td>`;
        });
        row += '</tr>';
        html += row;
    });
    tbody.innerHTML = html;

    tbody.querySelectorAll('.editable-macro').forEach(cell => {
        cell.addEventListener('click', () => editMacroCell(cell));
    });

    const count = Object.keys(macroState).length;
    const e = document.getElementById('macro-saved');
    if (e) e.textContent = count > 0 ? `${count} values saved` : 'no data yet';
}

function editMacroCell(cell) {
    const ind = cell.dataset.ind;
    const ccy = cell.dataset.ccy;
    const indDef = MACRO_INDICATORS.find(i => i.id === ind);
    const cur = getMacroValue(ind, ccy);
    const prompt_msg = indDef.text
        ? `${indDef.label} for ${ccy}\n(text: e.g. "Hawkish", "Neutral", "Dovish"):`
        : `${indDef.label} for ${ccy}\n(number, e.g. 3.75):`;
    const input = prompt(prompt_msg, cur === null ? '' : cur);
    if (input === null) return;
    if (input.trim() === '') {
        setMacroValue(ind, ccy, null);
    } else {
        if (indDef.text) {
            setMacroValue(ind, ccy, input.trim());
        } else {
            const v = parseFloat(input);
            if (isNaN(v)) { alert('Invalid number'); return; }
            setMacroValue(ind, ccy, v);
        }
    }
    renderMacroTable();
    renderMacroCharts();
    renderScoring();
    renderCarryMatrix();
    renderRanking();
    if (typeof renderScanAll === 'function') renderScanAll();
}

function setupEditableText() {
    document.querySelectorAll('.editable-text').forEach(el => {
        const key = el.dataset.key;
        const stored = localStorage.getItem(`pl_${key}`);
        if (stored) el.textContent = stored;
        el.addEventListener('click', () => {
            const cur = localStorage.getItem(`pl_${key}`) || '';
            const v = prompt('Edit comment:', cur);
            if (v !== null) {
                localStorage.setItem(`pl_${key}`, v);
                el.textContent = v || 'Click here to add notes...';
            }
        });
    });
}

// ---- CSV Import / Export ----
function exportMacroCSV() {
    let csv = 'INDICATEUR,' + CCYS.join(',') + '\n';
    MACRO_INDICATORS.forEach(ind => {
        if (ind.computed) return;
        const row = [ind.label];
        CCYS.forEach(ccy => {
            const v = getMacroValue(ind.id, ccy);
            row.push(v === null ? '' : v);
        });
        csv += row.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pl-terminal-macro-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function importMacroCSV(file) {
    const reader = new FileReader();
    reader.onload = e => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length < 2) { alert('CSV vide ou invalide'); return; }
        const header = lines[0].split(',').map(s => s.trim());
        const ccyIdx = {};
        CCYS.forEach(c => {
            const i = header.indexOf(c);
            if (i >= 0) ccyIdx[c] = i;
        });
        let imported = 0;
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(s => s.trim());
            const label = cols[0];
            const ind = MACRO_INDICATORS.find(x => x.label === label);
            if (!ind || ind.computed) continue;
            CCYS.forEach(ccy => {
                if (ccyIdx[ccy] === undefined) return;
                const raw = cols[ccyIdx[ccy]];
                if (raw === '' || raw === undefined) return;
                if (ind.text) {
                    setMacroValue(ind.id, ccy, raw);
                } else {
                    const v = parseFloat(raw);
                    if (!isNaN(v)) { setMacroValue(ind.id, ccy, v); imported++; }
                }
            });
        }
        renderMacroTable();
        renderMacroCharts();
        renderScoring();
        renderCarryMatrix();
        renderRanking();
        if (typeof renderScanAll === 'function') renderScanAll();
        alert(`Imported ${imported} values from CSV`);
    };
    reader.readAsText(file);
}

function setupCSVButtons() {
    const expBtn = document.getElementById('btn-export-csv');
    const impBtn = document.getElementById('btn-import-csv');
    const fileInput = document.getElementById('csv-input');
    if (expBtn) expBtn.addEventListener('click', exportMacroCSV);
    if (impBtn && fileInput) {
        impBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', e => {
            if (e.target.files && e.target.files[0]) importMacroCSV(e.target.files[0]);
            e.target.value = '';
        });
    }
}

// ============================================
// MODULE 4C - Macro Charts (12 mini bar charts)
// ============================================
function renderMacroCharts() {
    const grid = document.getElementById('macro-charts-grid');
    if (!grid) return;

    if (grid.children.length === 0) {
        MACRO_CHARTS.forEach(ch => {
            const cell = document.createElement('div');
            cell.className = 'mini-chart';
            cell.innerHTML = `
                <div class="mini-chart-title">${ch.label}</div>
                <canvas id="macro-chart-${ch.id}"></canvas>
            `;
            grid.appendChild(cell);
        });
    }

    MACRO_CHARTS.forEach(ch => {
        const cv = document.getElementById(`macro-chart-${ch.id}`);
        if (!cv) return;
        if (macroChartInstances[ch.id]) macroChartInstances[ch.id].destroy();

        const data = CCYS.map(c => getMacroValue(ch.id, c));
        const colors = data.map(v => {
            if (v === null) return '#222';
            if (ch.signed) return v < 0 ? '#f87171' : '#4ade80';
            if (ch.threshold && v < ch.threshold) return '#fbbf24';
            return ch.color;
        });

        macroChartInstances[ch.id] = new Chart(cv.getContext('2d'), {
            type: 'bar',
            data: {
                labels: CCYS,
                datasets: [{
                    data: data.map(v => v === null ? 0 : v),
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: '#0a0a0a', borderColor: '#ff8c00', borderWidth: 1,
                               titleColor: '#ff8c00', bodyColor: '#ddd', padding: 6,
                               callbacks: { label: c => c.parsed.y.toFixed(2) } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#777', font: { family: 'monospace', size: 8 } } },
                    y: { grid: { color: '#1a1a1a' }, ticks: { color: '#555', font: { family: 'monospace', size: 8 } } }
                }
            }
        });
    });
}

// ============================================
// SCORING — 6 facteurs macro purs
// ============================================
function getCurrentRate(ccy) {
    const macroRate = getMacroValue('rate', ccy);
    if (macroRate !== null) return macroRate;
    const bankCode = CCY_TO_BANK[ccy];
    if (!bankCode || !ratesData.banks) return null;
    const bank = ratesData.banks.find(b => b.id === bankCode);
    return bank ? bank.rate : null;
}

function scoreMonetary(ccy) {
    const v = getMacroValue('rate', ccy);
    if (v === null) return 0;
    if (v >= 4)    return 2;
    if (v >= 3)    return 1;
    if (v >= 1.5)  return 0;
    if (v >= 0.5)  return -1;
    return -2;
}

function scoreSpread(ccy) {
    const v = getMacroValue('spread', ccy);
    if (v === null) return 0;
    if (v >= 1)     return 2;
    if (v >= 0.5)   return 1;
    if (v >= 0)     return 0;
    if (v >= -0.5)  return -1;
    return -2;
}

function scoreCPI(ccy) {
    const v = getMacroValue('cpi', ccy);
    if (v === null) return 0;
    if (v >= 4)    return 2;
    if (v >= 3)    return 1;
    if (v >= 1.5)  return 0;
    if (v >= 1)    return -1;
    return -2;
}

function scoreGDP(ccy) {
    const v = getMacroValue('gdp', ccy);
    if (v === null) return 0;
    if (v >= 3)  return 2;
    if (v >= 2)  return 1;
    if (v >= 1)  return 0;
    if (v >= 0)  return -1;
    return -2;
}

function scoreUnemp(ccy) {
    const v = getMacroValue('unemployment', ccy);
    if (v === null) return 0;
    if (v <= 3.5)  return 2;
    if (v <= 4.5)  return 1;
    if (v <= 5.5)  return 0;
    if (v <= 6.5)  return -1;
    return -2;
}

function scorePMI(ccy) {
    const m = getMacroValue('pmi_manuf', ccy);
    const s = getMacroValue('pmi_services', ccy);
    if (m === null && s === null) return 0;
    const avg = (m === null) ? s : (s === null ? m : (m + s) / 2);
    if (avg >= 55)  return 2;
    if (avg >= 52)  return 1;
    if (avg >= 48)  return 0;
    if (avg >= 45)  return -1;
    return -2;
}

function getFactorValue(factorId, ccy) {
    const f = SCORING_FACTORS.find(x => x.id === factorId);
    if (!f) return 0;
    if (f.src === 'auto-monetary') return scoreMonetary(ccy);
    if (f.src === 'auto-spread')   return scoreSpread(ccy);
    if (f.src === 'auto-cpi')      return scoreCPI(ccy);
    if (f.src === 'auto-gdp')      return scoreGDP(ccy);
    if (f.src === 'auto-unemp')    return scoreUnemp(ccy);
    if (f.src === 'auto-pmi')      return scorePMI(ccy);
    return 0;
}

function clsScore(s) {
    if (s >= 1.5) return 'pos-strong';
    if (s > 0)    return 'pos';
    if (s <= -1.5)return 'neg-strong';
    if (s < 0)    return 'neg';
    return 'neutral';
}

function biasFromScore(s) {
    if (s >= 12)  return { label: 'STRONG BULL', cls: 'bias-strong-bullish' };
    if (s >= 7)   return { label: 'BULLISH',     cls: 'bias-bullish' };
    if (s >= 3)   return { label: 'MILD BULL',   cls: 'bias-mild-bullish' };
    if (s <= -12) return { label: 'STRONG BEAR', cls: 'bias-strong-bearish' };
    if (s <= -7)  return { label: 'BEARISH',     cls: 'bias-bearish' };
    if (s <= -3)  return { label: 'MILD BEAR',   cls: 'bias-mild-bearish' };
    return { label: 'NEUTRAL', cls: 'bias-neutral' };
}

function renderScoring() {
    const tbody = document.getElementById('scoring-tbody');
    if (!tbody) return;

    let html = '';
    SCORING_FACTORS.forEach(f => {
        let row = `<tr><td class="factor-name">${f.label}</td><td class="num weight-cell">${f.weight}</td>`;
        CCYS.forEach(ccy => {
            const v = getFactorValue(f.id, ccy);
            const cls = clsScore(v);
            const disp = v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
            row += `<td class="num ${cls}" data-factor="${f.id}" data-ccy="${ccy}">${disp}</td>`;
        });
        row += `<td><span class="src-auto">auto</span></td></tr>`;
        html += row;
    });

    let bruts = {}, ponds = {};
    CCYS.forEach(ccy => {
        let b = 0, p = 0;
        SCORING_FACTORS.forEach(f => {
            const v = getFactorValue(f.id, ccy);
            b += v; p += v * f.weight;
        });
        bruts[ccy] = b; ponds[ccy] = p;
    });

    let r1 = '<tr class="score-row"><td colspan="2" class="score-label">SCORE BRUT (somme)</td>';
    CCYS.forEach(c => {
        const v = bruts[c]; const cls = clsScore(v);
        r1 += `<td class="num ${cls}">${v > 0 ? '+' : ''}${v.toFixed(2)}</td>`;
    });
    r1 += '<td></td></tr>'; html += r1;

    let r2 = '<tr class="score-row score-pondere"><td colspan="2" class="score-label">SCORE PONDÉRÉ</td>';
    CCYS.forEach(c => {
        const v = ponds[c]; const cls = clsScore(v);
        r2 += `<td class="num ${cls}">${v > 0 ? '+' : ''}${v.toFixed(2)}</td>`;
    });
    r2 += '<td></td></tr>'; html += r2;

    let r3 = '<tr class="bias-row"><td colspan="2" class="score-label">BIAIS</td>';
    CCYS.forEach(c => {
        const b = biasFromScore(ponds[c]);
        r3 += `<td class="num ${b.cls}">${b.label}</td>`;
    });
    r3 += '<td></td></tr>'; html += r3;

    tbody.innerHTML = html;

    const e = document.getElementById('scoring-update');
    if (e) {
        const now = new Date();
        e.textContent = `last update: ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')} GMT`;
    }
}

function renderCarryMatrix() {
    const tbody = document.querySelector('#carry-table tbody');
    if (!tbody) return;
    let html = '<tr><td class="ccy-h"></td>';
    CCYS.forEach(c => html += `<th class="ccy-h">${c}</th>`);
    html += '</tr>';
    CCYS.forEach(L => {
        html += `<tr><td class="factor-name">${L}</td>`;
        CCYS.forEach(S => {
            if (L === S) { html += '<td class="carry-diag">—</td>'; return; }
            const lr = getCurrentRate(L), sr = getCurrentRate(S);
            if (lr === null || sr === null) { html += '<td class="carry-na">—</td>'; return; }
            const d = lr - sr;
            let cls;
            if (d >= 2) cls = 'carry-cell-strong-pos';
            else if (d > 0) cls = 'carry-cell-pos';
            else if (d <= -2) cls = 'carry-cell-strong-neg';
            else if (d < 0) cls = 'carry-cell-neg';
            else cls = 'carry-zero';
            html += `<td class="num ${cls}">${d > 0 ? '+' : ''}${d.toFixed(2)}</td>`;
        });
        html += '</tr>';
    });
    tbody.innerHTML = html;
}

function renderRanking() {
    const tbody = document.getElementById('ranking-tbody');
    if (!tbody) return;
    let html = '';
    const ru = getCurrentRate('USD');
    CCYS.forEach(c => {
        const r = getCurrentRate(c);
        const carry = (r !== null && ru !== null) ? r - ru : null;
        let y2 = getMacroValue('yield_2y', c);
        if (y2 === null && c === 'USD' && yieldsData.yields && yieldsData.yields.USD) y2 = yieldsData.yields.USD.y2;
        let y10 = getMacroValue('yield_10y', c);
        if (y10 === null && yieldsData.yields && yieldsData.yields[c]) y10 = yieldsData.yields[c].y10;
        const sp = (y10 !== null && y2 !== null) ? y10 - y2 : null;
        let sig, scls;
        if (sp === null) { sig = '—'; scls = 'signal-na'; }
        else if (sp < 0) { sig = 'INVERTED'; scls = 'signal-inverted'; }
        else if (sp < 0.3) { sig = 'FLAT'; scls = 'signal-flat'; }
        else if (sp > 1.0) { sig = 'PENTUE'; scls = 'signal-pentue'; }
        else { sig = 'NORMALE'; scls = 'signal-normale'; }
        const cc = carry === null ? 'neutral' : carry > 0 ? 'pos' : carry < 0 ? 'neg' : 'neutral';
        const ct = carry === null ? '—' : (carry > 0 ? '+' : '') + carry.toFixed(2);
        const sc = sp === null ? 'neutral' : sp < 0 ? 'neg' : 'pos';
        const st = sp === null ? '—' : (sp > 0 ? '+' : '') + sp.toFixed(2);
        html += `
            <tr>
                <td class="factor-name">${c}</td>
                <td class="num">${r !== null ? r.toFixed(2) : '—'}</td>
                <td class="num ${cc}">${ct}</td>
                <td class="num">${y2 !== null ? y2.toFixed(2) : '—'}</td>
                <td class="num">${y10 !== null ? y10.toFixed(2) : '—'}</td>
                <td class="num ${sc}">${st}</td>
                <td class="${scls}">${sig}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// ============================================
// FRED API VIA NOTRE CLOUDFLARE FUNCTION (/api/fred-history)
// Cette route serveur (functions/api/fred-history.js) utilise notre clé FRED
// stockée en variable d'env FRED_API_KEY côté Cloudflare. Pas de CORS, pas de clé exposée.
// ============================================

const FRED_PROXY_BASE = '/api/fred-history';
const FRED_HISTORY_START = '2010-01-01'; // historique pertinent depuis 2010

async function fetchFredSeries(seriesId) {
    const url = `${FRED_PROXY_BASE}?series_id=${encodeURIComponent(seriesId)}&start=${FRED_HISTORY_START}`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.warn(`FRED proxy returned ${res.status} for ${seriesId}`);
            return null;
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
            console.warn(`FRED proxy returned non-array for ${seriesId}:`, data);
            return null;
        }
        // Dédoublonner : ne garder que les changements de taux
        const compact = [];
        let prev = null;
        data.forEach(d => {
            if (prev === null || d.value !== prev) {
                compact.push(d);
                prev = d.value;
            }
        });
        // Toujours garder le dernier point pour avoir la date courante
        if (data.length > 0 && compact.length > 0 &&
            compact[compact.length - 1].date !== data[data.length - 1].date) {
            compact.push(data[data.length - 1]);
        }
        return compact;
    } catch (e) {
        console.warn(`FRED fetch failed for ${seriesId}:`, e);
        return null;
    }
}

// Calcule le dernier changement de taux en bps depuis l'historique
function computeLastChangeBp(history) {
    if (!history || history.length < 2) return null;
    const last = history[history.length - 1];
    // Cherche le précédent point avec une valeur différente
    for (let i = history.length - 2; i >= 0; i--) {
        if (history[i].value !== last.value) {
            return Math.round((last.value - history[i].value) * 100);
        }
    }
    return 0;
}

// Récupère l'historique des 8 banques en parallèle via le proxy FRED
async function fetchAllBanksHistoryFromFred() {
    setStatus('connecting', 'fetching FRED history...');
    const statusEl = document.getElementById('cb-fred-status');

    const results = await Promise.all(
        CENTRAL_BANKS.map(async bank => {
            const history = await fetchFredSeries(bank.fred);
            return { code: bank.code, ccy: bank.ccy, history };
        })
    );

    let successCount = 0;
    const banks = results.map(r => {
        if (!r.history || r.history.length === 0) {
            return { id: r.code, rate: null, asOf: null, lastChange: null, history: [] };
        }
        successCount++;
        const last = r.history[r.history.length - 1];
        return {
            id: r.code,
            rate: last.value,
            asOf: last.date,
            lastChange: computeLastChangeBp(r.history),
            history: r.history
        };
    });

    if (statusEl) {
        if (successCount === CENTRAL_BANKS.length) {
            statusEl.textContent = `✓ ${successCount}/${CENTRAL_BANKS.length} banks loaded`;
            statusEl.className = 'source-tag ok';
        } else if (successCount > 0) {
            statusEl.textContent = `⚠ ${successCount}/${CENTRAL_BANKS.length} banks loaded`;
            statusEl.className = 'source-tag partial';
        } else {
            statusEl.textContent = `✗ FRED proxy unreachable`;
            statusEl.className = 'source-tag err';
        }
    }

    return banks;
}

// Fusionne les données FRED (historique) avec /api/rates (si dispo) et /api/meetings
function mergeBanksData(fredBanks, apiRates, meetings) {
    // apiRates.banks peut contenir des données plus à jour ou des taux différents (BoE intraday, etc.)
    // On utilise FRED en priorité pour l'historique, mais on prend le RATE actuel de /api/rates s'il est plus récent
    const apiBanksById = {};
    if (apiRates && Array.isArray(apiRates.banks)) {
        apiRates.banks.forEach(b => apiBanksById[b.id] = b);
    }

    return fredBanks.map(fb => {
        const apiB = apiBanksById[fb.id];
        if (!apiB) return fb;
        // Si /api/rates a un taux plus récent ou différent, on l'utilise pour la valeur courante
        const apiDate = apiB.asOf ? new Date(apiB.asOf) : null;
        const fredDate = fb.asOf ? new Date(fb.asOf) : null;
        const useApi = apiDate && fredDate && apiDate > fredDate;
        return {
            id: fb.id,
            rate: useApi ? apiB.rate : fb.rate,
            asOf: useApi ? apiB.asOf : fb.asOf,
            lastChange: apiB.lastChange != null ? apiB.lastChange : fb.lastChange,
            // On garde l'historique FRED + on ajoute le point /api/rates s'il est plus récent
            history: useApi && fb.history.length > 0
                ? [...fb.history, { date: apiB.asOf, value: apiB.rate }]
                : fb.history
        };
    });
}

// ============================================
async function fetchAllData() {
    setStatus('connecting', 'fetching data...');
    try {
        // 1) Fetch en parallèle : ton backend + meetings + yields + FRED history (proxy public)
        const [apiRatesRes, meetingsRes, yieldsRes, fredBanks] = await Promise.all([
            fetch('/api/rates').catch(() => null),
            fetch('/api/meetings').catch(() => null),
            fetch('/api/yields').catch(() => null),
            fetchAllBanksHistoryFromFred()
        ]);

        const apiRates = (apiRatesRes && apiRatesRes.ok) ? await apiRatesRes.json() : null;
        const meetings = (meetingsRes && meetingsRes.ok) ? await meetingsRes.json() : {};
        yieldsData = (yieldsRes && yieldsRes.ok) ? await yieldsRes.json() : {};

        // 2) Fusionne : FRED prioritaire pour l'historique, /api/rates pour les valeurs intraday plus récentes
        const mergedBanks = mergeBanksData(fredBanks, apiRates, meetings);
        ratesData = { banks: mergedBanks };

        // 3) Render
        renderRatesTable(ratesData, meetings);
        rateHistoryState.banks = mergedBanks;
        renderAllRateCharts();

        renderMacroTable();
        renderMacroCharts();
        renderScoring();
        renderCarryMatrix();
        renderRanking();
        if (typeof renderScanAll === 'function') renderScanAll();
        setStatus('live', 'live');
    } catch (e) {
        console.error('Fetch error:', e);
        setStatus('error', 'connection error');
    }
}

// ============================================
// MODULE SCORE — Scoring qualitatif par annonces économiques
// Note 3 niveaux (↑ haussier / = neutre / ↓ baissier) sur fenêtre 14j
// Persistance: localStorage clé pl_score_events
// ============================================

const SCORE_CCYS = ['EUR','USD','GBP','JPY','CAD','AUD','NZD','CHF'];
const SCORE_WINDOW_DAYS = 14;
const SCORE_STORAGE_KEY = 'pl_score_events';

let scoreEvents = [];           // { id, date, ccy, cat, name, impact, note }
let scoreFormImpact = null;     // état du choix impact dans le modal
let scoreEditingId = null;      // null = création, sinon édition

// ---- Persistance ----
function loadScoreEvents() {
    try {
        const raw = localStorage.getItem(SCORE_STORAGE_KEY);
        scoreEvents = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(scoreEvents)) scoreEvents = [];
    } catch(e) {
        console.warn('Bad score events, reset', e);
        scoreEvents = [];
    }
}

function saveScoreEvents() {
    try {
        localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(scoreEvents));
        setScoreSaveStatus('ok');
    } catch(e) {
        console.error('Save error', e);
        setScoreSaveStatus('error');
    }
}

function setScoreSaveStatus(state) {
    const el = document.getElementById('score-save-status');
    if (!el) return;
    if (state === 'error') {
        el.textContent = '● erreur de sauvegarde';
        el.classList.add('error');
    } else {
        el.textContent = '● auto-saved';
        el.classList.remove('error');
    }
}

// ---- Calcul des scores ----
function isWithinWindow(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return false;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - SCORE_WINDOW_DAYS);
    return d >= cutoff;
}

function computeScoreFor(ccy) {
    let up = 0, flat = 0, down = 0;
    scoreEvents.forEach(ev => {
        if (ev.ccy !== ccy) return;
        if (!isWithinWindow(ev.date)) return;
        if (ev.impact === 'up')   up++;
        if (ev.impact === 'flat') flat++;
        if (ev.impact === 'down') down++;
    });
    const total = up + flat + down;
    const pct = total === 0 ? 0 : Math.round(((up - down) / total) * 100);
    return { ccy, up, flat, down, total, pct };
}

function getAllScores() {
    return SCORE_CCYS.map(c => computeScoreFor(c));
}

function biasFromPct(pct) {
    if (pct >= 50)  return { label: 'Haussier', cls: 'pos' };
    if (pct >= 15)  return { label: 'Légèrement haussier', cls: 'pos' };
    if (pct <= -50) return { label: 'Baissier', cls: 'neg' };
    if (pct <= -15) return { label: 'Légèrement baissier', cls: 'neg' };
    return { label: 'Neutre', cls: 'flat' };
}

// ---- Render Classement comparatif ----
function renderScoreRanking() {
    const wrap = document.getElementById('score-ranking-list');
    if (!wrap) return;

    const scores = getAllScores().sort((a, b) => b.pct - a.pct);
    wrap.innerHTML = scores.map(s => {
        const cls = s.pct > 5 ? 'pos' : s.pct < -5 ? 'neg' : 'flat';
        const width = Math.abs(s.pct) / 2; // 100% → 50% de la moitié de barre
        return `
            <div class="score-ranking-row">
                <span class="srk-ccy">${s.ccy}</span>
                <div class="srk-bar-wrap">
                    <div class="srk-bar-zero"></div>
                    <div class="srk-bar-fill ${cls}" style="width:${width}%;"></div>
                </div>
                <span class="srk-pct ${cls}">${s.pct > 0 ? '+' : ''}${s.pct}%</span>
            </div>
        `;
    }).join('');
}

// ---- Render Vue par devise (8 cartes) ----
function renderScoreCards() {
    const grid = document.getElementById('score-cards-grid');
    if (!grid) return;

    grid.innerHTML = SCORE_CCYS.map(ccy => {
        const s = computeScoreFor(ccy);
        const bias = biasFromPct(s.pct);
        const cls = s.pct > 5 ? 'pos' : s.pct < -5 ? 'neg' : 'flat';
        const width = Math.abs(s.pct) / 2;
        return `
            <div class="score-card">
                <div class="scc-head">
                    <span class="scc-ccy">${ccy}</span>
                </div>
                <div class="scc-pct ${cls}">${s.pct > 0 ? '+' : ''}${s.pct}%</div>
                <div class="scc-bias ${bias.cls}">${bias.label}</div>
                <div class="scc-mini-bar">
                    <div class="scc-mini-bar-zero"></div>
                    <div class="scc-mini-bar-fill ${cls}" style="width:${width}%;"></div>
                </div>
                <div class="scc-counters">
                    <span class="c-up"><b>${s.up}</b> ↑</span>
                    <span class="c-flat"><b>${s.flat}</b> =</span>
                    <span class="c-down"><b>${s.down}</b> ↓</span>
                    <span class="c-total"><b>${s.total}</b> total</span>
                </div>
            </div>
        `;
    }).join('');
}

// ---- Render Historique ----
function renderScoreHistory() {
    const tbody = document.getElementById('score-history-tbody');
    const countEl = document.getElementById('score-history-count');
    if (!tbody) return;

    const fCcy  = (document.getElementById('score-filter-ccy')  || {}).value || '';
    const fCat  = (document.getElementById('score-filter-cat')  || {}).value || '';
    const fName = ((document.getElementById('score-filter-name') || {}).value || '').toLowerCase().trim();
    const fDate = (document.getElementById('score-filter-date') || {}).value || '';

    let list = scoreEvents.slice();
    list.sort((a, b) => b.date.localeCompare(a.date));

    if (fCcy)  list = list.filter(e => e.ccy === fCcy);
    if (fCat)  list = list.filter(e => e.cat === fCat);
    if (fName) list = list.filter(e => (e.name || '').toLowerCase().includes(fName));
    if (fDate) list = list.filter(e => e.date === fDate);

    if (countEl) countEl.textContent = `${scoreEvents.length} ANNONCE${scoreEvents.length > 1 ? 'S' : ''}`;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="score-empty">${
            scoreEvents.length === 0
              ? 'Aucune annonce. Cliquez sur "Ajouter une annonce" pour commencer.'
              : 'Aucun résultat ne correspond aux filtres.'
        }</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(ev => {
        const impactLabel = ev.impact === 'up' ? '↑ HAUSSIER' : ev.impact === 'down' ? '↓ BAISSIER' : '= NEUTRE';
        const dateFmt = ev.date.split('-').reverse().join('/');
        const noteAttr = ev.note ? ` title="${(ev.note || '').replace(/"/g, '&quot;')}"` : '';
        return `
            <tr${noteAttr}>
                <td class="sh-date">${dateFmt}</td>
                <td class="sh-ccy">${ev.ccy}</td>
                <td class="sh-cat">${ev.cat}</td>
                <td class="sh-name">${ev.name}${ev.note ? ' <span style="color:var(--text-secondary);font-size:9px;">📝</span>' : ''}</td>
                <td class="num sh-impact ${ev.impact}">${impactLabel}</td>
                <td class="num"><button class="sh-delete" data-del="${ev.id}" title="Supprimer">×</button></td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.del;
            if (confirm('Supprimer cette annonce ?')) {
                scoreEvents = scoreEvents.filter(e => e.id !== id);
                saveScoreEvents();
                renderScoreAll();
            }
        });
    });
}

function renderScoreAll() {
    renderScoreRanking();
    renderScoreCards();
    renderScoreHistory();
}

// ---- Modal d'ajout / édition ----
function openScoreModal() {
    scoreEditingId = null;
    scoreFormImpact = null;
    document.getElementById('score-modal-title').textContent = 'AJOUTER UNE ANNONCE';
    document.getElementById('score-form-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('score-form-ccy').value = 'EUR';
    document.getElementById('score-form-cat').value = 'Inflation';
    document.getElementById('score-form-name').value = '';
    document.getElementById('score-form-note').value = '';
    document.querySelectorAll('.score-impact-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('score-modal').classList.add('open');
    setTimeout(() => document.getElementById('score-form-name').focus(), 50);
}

function closeScoreModal() {
    document.getElementById('score-modal').classList.remove('open');
    scoreEditingId = null;
}

function selectImpact(impact) {
    scoreFormImpact = impact;
    document.querySelectorAll('.score-impact-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.impact === impact);
    });
}

function saveScoreForm() {
    const date = document.getElementById('score-form-date').value;
    const ccy  = document.getElementById('score-form-ccy').value;
    const cat  = document.getElementById('score-form-cat').value;
    const name = document.getElementById('score-form-name').value.trim();
    const note = document.getElementById('score-form-note').value.trim();

    if (!date) { alert('Date requise'); return; }
    if (!name) { alert('Nom requis (ex: CPI YoY, NFP...)'); return; }
    if (!scoreFormImpact) { alert('Choisis un impact : ↑ haussier, = neutre ou ↓ baissier'); return; }

    const ev = {
        id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        date, ccy, cat, name, note,
        impact: scoreFormImpact
    };
    scoreEvents.push(ev);
    saveScoreEvents();
    closeScoreModal();
    renderScoreAll();
}

function resetScoreEvents() {
    if (scoreEvents.length === 0) { alert('Aucune annonce à effacer.'); return; }
    if (!confirm(`Supprimer définitivement les ${scoreEvents.length} annonces ?\nCette action est irréversible.`)) return;
    scoreEvents = [];
    saveScoreEvents();
    renderScoreAll();
}

// ---- Export PDF (via window.print sur un layout dédié) ----
function exportScorePDF() {
    const today = new Date().toLocaleDateString('fr-FR');
    const scores = getAllScores().sort((a, b) => b.pct - a.pct);

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { alert('Pop-up bloquée. Autorise les pop-ups pour exporter.'); return; }

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PL Terminal — Score Report ${today}</title>
    <style>
        body { font-family: 'SF Mono', Monaco, Consolas, monospace; background: #fff; color: #000; padding: 24px; font-size: 11px; }
        h1 { color: #ff8c00; font-size: 16px; letter-spacing: 2px; margin-bottom: 4px; }
        .meta { color: #666; font-size: 10px; margin-bottom: 24px; }
        h2 { color: #ff8c00; font-size: 12px; letter-spacing: 1.5px; margin: 22px 0 10px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th, td { padding: 5px 8px; border-bottom: 1px solid #eee; text-align: left; font-size: 10px; }
        th { background: #f5f5f5; color: #666; letter-spacing: 0.5px; font-weight: 500; }
        td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
        .pos { color: #16a34a; font-weight: 500; }
        .neg { color: #dc2626; font-weight: 500; }
        .flat { color: #6b6b6b; }
        .ccy { color: #ff8c00; font-weight: 500; }
        .bar { display: inline-block; height: 8px; background: #eee; width: 200px; position: relative; vertical-align: middle; margin-right: 8px; }
        .bar-zero { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #999; }
        .bar-fill { position: absolute; top: 0; bottom: 0; }
        .bar-fill.pos { background: #16a34a; left: 50%; }
        .bar-fill.neg { background: #dc2626; right: 50%; }
        .footer { margin-top: 24px; color: #999; font-size: 9px; text-align: center; }
        @media print { body { padding: 12px; } }
    </style></head><body>
    <h1>PL TERMINAL — SCORE REPORT</h1>
    <div class="meta">Fenêtre glissante 14 jours · Généré le ${today} · ${scoreEvents.length} annonces totales</div>

    <h2>CLASSEMENT COMPARATIF DES DEVISES</h2>
    <table>
        <thead><tr><th>CCY</th><th>SCORE</th><th class="num">↑</th><th class="num">=</th><th class="num">↓</th><th class="num">TOTAL</th><th class="num">PCT</th></tr></thead>
        <tbody>`;
    scores.forEach(s => {
        const cls = s.pct > 5 ? 'pos' : s.pct < -5 ? 'neg' : 'flat';
        const width = Math.abs(s.pct) / 2;
        html += `<tr>
            <td class="ccy">${s.ccy}</td>
            <td><span class="bar"><span class="bar-zero"></span><span class="bar-fill ${cls}" style="width:${width}%;"></span></span></td>
            <td class="num pos">${s.up}</td>
            <td class="num flat">${s.flat}</td>
            <td class="num neg">${s.down}</td>
            <td class="num">${s.total}</td>
            <td class="num ${cls}">${s.pct > 0 ? '+' : ''}${s.pct}%</td>
        </tr>`;
    });
    html += `</tbody></table>

    <h2>HISTORIQUE COMPLET DES ANNONCES (${scoreEvents.length})</h2>
    <table>
        <thead><tr><th>DATE</th><th>CCY</th><th>CATÉGORIE</th><th>NOM</th><th>IMPACT</th><th>NOTE</th></tr></thead>
        <tbody>`;
    const sorted = scoreEvents.slice().sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach(ev => {
        const impLabel = ev.impact === 'up' ? '↑ HAUSSIER' : ev.impact === 'down' ? '↓ BAISSIER' : '= NEUTRE';
        const dateFmt = ev.date.split('-').reverse().join('/');
        html += `<tr>
            <td>${dateFmt}</td>
            <td class="ccy">${ev.ccy}</td>
            <td class="flat">${ev.cat}</td>
            <td>${ev.name}</td>
            <td class="${ev.impact}">${impLabel}</td>
            <td class="flat">${ev.note || ''}</td>
        </tr>`;
    });
    html += `</tbody></table>
    <div class="footer">PL Terminal v0.4 — Score qualitatif par annonces · pl-terminal.pages.dev</div>
    <script>setTimeout(() => window.print(), 300);<\/script>
    </body></html>`;

    w.document.write(html);
    w.document.close();
}

// ---- Setup événements SCORE ----
function setupScoreEvents() {
    const addBtn = document.getElementById('score-add-btn');
    const closeBtn = document.getElementById('score-modal-close');
    const cancelBtn = document.getElementById('score-form-cancel');
    const saveBtn = document.getElementById('score-form-save');
    const resetBtn = document.getElementById('score-reset-btn');
    const pdfBtn = document.getElementById('score-pdf-btn');
    const modal = document.getElementById('score-modal');

    if (addBtn) addBtn.addEventListener('click', openScoreModal);
    if (closeBtn) closeBtn.addEventListener('click', closeScoreModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeScoreModal);
    if (saveBtn) saveBtn.addEventListener('click', saveScoreForm);
    if (resetBtn) resetBtn.addEventListener('click', resetScoreEvents);
    if (pdfBtn) pdfBtn.addEventListener('click', exportScorePDF);

    if (modal) {
        modal.addEventListener('click', e => {
            if (e.target.id === 'score-modal') closeScoreModal();
        });
    }

    document.querySelectorAll('.score-impact-btn').forEach(b => {
        b.addEventListener('click', () => selectImpact(b.dataset.impact));
    });

    ['score-filter-ccy','score-filter-cat','score-filter-name','score-filter-date'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', renderScoreHistory);
        if (el) el.addEventListener('change', renderScoreHistory);
    });

    document.addEventListener('keydown', e => {
        const m = document.getElementById('score-modal');
        if (!m || !m.classList.contains('open')) return;
        if (e.key === 'Escape') closeScoreModal();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveScoreForm();
    });
}

// ============================================
// MODULE SCAN — FX Pair Scanner
// Calcule auto BUY/SELL/NEUTRAL pour 28 paires à partir de MACRO data
// Adj bps = (taux_base - taux_quote) * 25 + (score_pondéré_base - score_pondéré_quote) * 10
//        ± modificateur Risk Sentiment selon devise (refuge / risk-on)
// ============================================

const SCAN_RS_KEY = 'pl_scan_risk_sentiment'; // 0-100, saisi par l'utilisateur

// Métadonnées CB par devise (drapeau + abréviation)
const SCAN_CCY_META = {
    USD: { flag: '🇺🇸', cb: 'FED'  },
    EUR: { flag: '🇪🇺', cb: 'ECB'  },
    GBP: { flag: '🇬🇧', cb: 'BOE'  },
    JPY: { flag: '🇯🇵', cb: 'BOJ'  },
    CAD: { flag: '🇨🇦', cb: 'BOC'  },
    AUD: { flag: '🇦🇺', cb: 'RBA'  },
    NZD: { flag: '🇳🇿', cb: 'RBNZ' },
    CHF: { flag: '🇨🇭', cb: 'SNB'  }
};

// 28 paires G10 organisées par catégorie pour les filtres
const SCAN_PAIRS = [
    // Majeurs (7)
    { base: 'EUR', quote: 'USD', cat: 'majors' },
    { base: 'GBP', quote: 'USD', cat: 'majors' },
    { base: 'USD', quote: 'JPY', cat: 'majors' },
    { base: 'USD', quote: 'CHF', cat: 'majors' },
    { base: 'AUD', quote: 'USD', cat: 'majors' },
    { base: 'NZD', quote: 'USD', cat: 'majors' },
    { base: 'USD', quote: 'CAD', cat: 'majors' },

    // EUR Crosses (6)
    { base: 'EUR', quote: 'GBP', cat: 'eur' },
    { base: 'EUR', quote: 'JPY', cat: 'eur' },
    { base: 'EUR', quote: 'CHF', cat: 'eur' },
    { base: 'EUR', quote: 'AUD', cat: 'eur' },
    { base: 'EUR', quote: 'NZD', cat: 'eur' },
    { base: 'EUR', quote: 'CAD', cat: 'eur' },

    // GBP Crosses (5)
    { base: 'GBP', quote: 'JPY', cat: 'gbp' },
    { base: 'GBP', quote: 'CHF', cat: 'gbp' },
    { base: 'GBP', quote: 'AUD', cat: 'gbp' },
    { base: 'GBP', quote: 'NZD', cat: 'gbp' },
    { base: 'GBP', quote: 'CAD', cat: 'gbp' },

    // AUD/NZD crosses (4)
    { base: 'AUD', quote: 'JPY', cat: 'audnzd' },
    { base: 'AUD', quote: 'CHF', cat: 'audnzd' },
    { base: 'AUD', quote: 'NZD', cat: 'audnzd' },
    { base: 'AUD', quote: 'CAD', cat: 'audnzd' },

    // NZD complementary (3)
    { base: 'NZD', quote: 'JPY', cat: 'audnzd' },
    { base: 'NZD', quote: 'CHF', cat: 'audnzd' },
    { base: 'NZD', quote: 'CAD', cat: 'audnzd' },

    // JPY/CHF (3)
    { base: 'CAD', quote: 'JPY', cat: 'jpychf' },
    { base: 'CAD', quote: 'CHF', cat: 'jpychf' },
    { base: 'CHF', quote: 'JPY', cat: 'jpychf' }
];

// Volatilité moyenne approximative par paire pour la note de risque (1-10)
// Basée sur l'ATR daily relatif. Affiné pour matcher l'expérience trader.
const SCAN_PAIR_VOL = {
    'EUR/USD': 4, 'GBP/USD': 5, 'USD/JPY': 6, 'USD/CHF': 4, 'AUD/USD': 5,
    'NZD/USD': 5, 'USD/CAD': 4, 'EUR/GBP': 3, 'EUR/JPY': 6, 'EUR/CHF': 4,
    'EUR/AUD': 6, 'EUR/NZD': 7, 'EUR/CAD': 5, 'GBP/JPY': 7, 'GBP/CHF': 6,
    'GBP/AUD': 7, 'GBP/NZD': 8, 'GBP/CAD': 6, 'AUD/JPY': 7, 'AUD/CHF': 6,
    'AUD/NZD': 4, 'AUD/CAD': 5, 'NZD/JPY': 7, 'NZD/CHF': 6, 'NZD/CAD': 5,
    'CAD/JPY': 6, 'CAD/CHF': 5, 'CHF/JPY': 6
};

// Devises favorisées / pénalisées selon Risk Sentiment
const SCAN_RISKON_FAVORED  = ['AUD', 'NZD'];
const SCAN_RISKOFF_FAVORED = ['JPY', 'CHF', 'USD'];

// État scan
let scanFilter = 'all';
let scanSearch = '';
let scanDetailPair = null; // pour le modal

// ---- Récupérer le score pondéré d'une devise (depuis MACRO) ----
function scanGetWeightedScore(ccy) {
    let p = 0;
    SCORING_FACTORS.forEach(f => {
        p += getFactorValue(f.id, ccy) * f.weight;
    });
    return p;
}

// ---- Risk Sentiment (0-100, persisté localStorage) ----
function scanGetRiskSentiment() {
    const raw = localStorage.getItem(SCAN_RS_KEY);
    if (raw === null) return 50; // neutre par défaut
    const n = parseInt(raw, 10);
    return isNaN(n) ? 50 : Math.max(0, Math.min(100, n));
}

function scanSetRiskSentiment(val) {
    const v = Math.max(0, Math.min(100, parseInt(val, 10)));
    if (isNaN(v)) return;
    localStorage.setItem(SCAN_RS_KEY, String(v));
}

function scanRSLabel(rs) {
    if (rs >= 70) return { label: 'Risk-On', cls: 'up', mood: 'Greed' };
    if (rs >= 55) return { label: 'Risk-On', cls: 'up', mood: 'Mild Greed' };
    if (rs >= 45) return { label: 'Neutral', cls: 'flat', mood: 'Neutral' };
    if (rs >= 30) return { label: 'Risk-Off', cls: 'down', mood: 'Mild Fear' };
    return { label: 'Risk-Off', cls: 'down', mood: 'Fear' };
}

function scanRSInterpretation(rs) {
    if (rs >= 60) return { mood: 'Risk-On', text: 'Favorise AUD, NZD | Défavorable JPY, CHF, USD (partiel)', cls: '' };
    if (rs >= 40) return { mood: 'Neutral', text: 'Pas de biais dominant — privilégier les fondamentaux', cls: 'neutral' };
    return { mood: 'Risk-Off', text: 'Favorise JPY, CHF, USD | Défavorable AUD, NZD', cls: 'risk-off' };
}

// ---- Modificateur Risk Sentiment (en bps) ----
// Plus on est "Risk-On" plus on bonifie AUD/NZD et pénalise JPY/CHF/USD
// Échelle ±25 bps max à RS=100/0
function scanRSModifier(ccy, rs) {
    const deviation = (rs - 50) / 50; // -1 (Risk-Off total) → +1 (Risk-On total)
    const intensity = 25;
    if (SCAN_RISKON_FAVORED.includes(ccy))  return  deviation * intensity;
    if (SCAN_RISKOFF_FAVORED.includes(ccy)) return -deviation * intensity;
    return 0;
}

// ---- Calcul Adj bps d'une paire ----
// Formule :
//   carry component = (rate_base - rate_quote) * 25 bps (1% diff = 25 bps de signal)
//   macro component = (score_base - score_quote) * 10  (les scores pondérés vont de -17 à +17)
//   rs component    = mod_RS(base) - mod_RS(quote)
//   total bps = carry + macro + rs
function scanComputePair(p) {
    const rs = scanGetRiskSentiment();
    const rb = getCurrentRate(p.base);
    const rq = getCurrentRate(p.quote);
    const sb = scanGetWeightedScore(p.base);
    const sq = scanGetWeightedScore(p.quote);

    // Si pas de données du tout → null
    const hasData = (rb !== null || rq !== null || sb !== 0 || sq !== 0);
    if (!hasData) return null;

    const carry  = ((rb || 0) - (rq || 0)) * 25;
    const macro  = (sb - sq) * 10;
    const rsMod  = scanRSModifier(p.base, rs) - scanRSModifier(p.quote, rs);
    const adj    = carry + macro + rsMod;

    // Note de risque 1-10
    const baseVol = SCAN_PAIR_VOL[p.base + '/' + p.quote] || 5;
    const absAdj = Math.abs(adj);
    // bonus risque si le différentiel est très élevé (>60bps)
    const risk = Math.min(10, Math.max(1, baseVol + (absAdj > 60 ? 1 : 0) + (absAdj > 100 ? 1 : 0)));

    // Signal selon seuil
    let signal = 'neutral';
    if (adj >=  20) signal = 'buy';
    if (adj <= -20) signal = 'sell';

    return {
        pair: p.base + '/' + p.quote,
        base: p.base, quote: p.quote, cat: p.cat,
        rb, rq, sb, sq,
        carry, macro, rsMod, adj,
        risk, signal, rs
    };
}

// ---- Render header (titre + Risk Sentiment) ----
function renderScanHeader() {
    const rs = scanGetRiskSentiment();
    const rsLabel = scanRSLabel(rs);

    const numEl = document.getElementById('scan-rs-num');
    const labelEl = document.getElementById('scan-rs-label');
    const moodEl = document.getElementById('scan-rs-mood');
    const inputEl = document.getElementById('scan-rs-input');

    if (numEl) numEl.textContent = rs;
    if (labelEl) {
        labelEl.textContent = rsLabel.label;
        labelEl.className = rsLabel.cls;
    }
    if (moodEl) moodEl.textContent = rsLabel.mood;
    if (inputEl && document.activeElement !== inputEl) inputEl.value = rs;

    // Bandeau interprétation
    const banner = document.getElementById('scan-rs-banner');
    const bannerMood = document.getElementById('scan-rs-banner-mood');
    const bannerText = document.getElementById('scan-rs-banner-text');
    const interp = scanRSInterpretation(rs);

    if (banner) {
        banner.classList.remove('risk-off', 'neutral');
        if (interp.cls) banner.classList.add(interp.cls);
    }
    if (bannerMood) bannerMood.textContent = `${interp.mood} — ${rs}/100`;
    if (bannerText)  bannerText.textContent = interp.text;
}

// ---- Render Best Edge Top 5 ----
function renderScanEdge(results) {
    const list = document.getElementById('scan-edge-list');
    if (!list) return;

    const validResults = results.filter(r => r !== null);
    if (validResults.length === 0) {
        list.innerHTML = '<span class="scan-edge-empty">Saisir des valeurs dans MACRO pour activer le scanner</span>';
        return;
    }

    // Top 5 par |adj| descendant
    const top5 = validResults.slice().sort((a, b) => Math.abs(b.adj) - Math.abs(a.adj)).slice(0, 5);
    list.innerHTML = top5.map(r => {
        const cls = r.adj > 0 ? 'pos' : r.adj < 0 ? 'neg' : '';
        const sign = r.adj > 0 ? '+' : '';
        return `<div class="scan-edge-item" data-pair="${r.pair}">
            <span class="se-pair">${r.pair}</span>
            <span class="se-bps ${cls}">${sign}${r.adj.toFixed(1)} bps</span>
        </div>`;
    }).join('');

    list.querySelectorAll('[data-pair]').forEach(el => {
        el.addEventListener('click', () => openScanDetail(el.dataset.pair));
    });
}

// ---- Render grille des cartes ----
function renderScanGrid(results) {
    const grid = document.getElementById('scan-pair-grid');
    const countEl = document.getElementById('scan-pair-count');
    if (!grid) return;

    const validResults = results.filter(r => r !== null);
    if (countEl) countEl.textContent = validResults.length;

    if (validResults.length === 0) {
        grid.innerHTML = '<div class="scan-empty-state">Saisir des données dans <b>MACRO</b> pour calculer le scanner (au minimum les taux directeurs).</div>';
        return;
    }

    // Filtre catégorie
    let filtered = validResults;
    if (scanFilter !== 'all') {
        filtered = filtered.filter(r => r.cat === scanFilter);
    }
    // Filtre recherche
    const q = scanSearch.trim().toLowerCase().replace(/\s/g, '');
    if (q) {
        filtered = filtered.filter(r =>
            r.pair.toLowerCase().replace('/', '').includes(q) ||
            r.base.toLowerCase().includes(q) ||
            r.quote.toLowerCase().includes(q)
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="scan-empty-state">Aucune paire ne correspond aux filtres.</div>';
        return;
    }

    grid.innerHTML = filtered.map(r => renderScanCard(r)).join('');

    // Click → modal détail
    grid.querySelectorAll('.scan-pair-card').forEach(card => {
        card.addEventListener('click', () => openScanDetail(card.dataset.pair));
    });
}

function renderScanCard(r) {
    const baseMeta = SCAN_CCY_META[r.base];
    const quoteMeta = SCAN_CCY_META[r.quote];

    const sbCls = r.sb > 0 ? 'pos' : r.sb < 0 ? 'neg' : '';
    const sqCls = r.sq > 0 ? 'pos' : r.sq < 0 ? 'neg' : '';
    const sbStr = (r.sb > 0 ? '+' : '') + r.sb.toFixed(1);
    const sqStr = (r.sq > 0 ? '+' : '') + r.sq.toFixed(1);

    const adjCls = r.adj > 0 ? 'pos' : r.adj < 0 ? 'neg' : 'flat';
    const adjSign = r.adj > 0 ? '+' : '';

    let signalLabel = '— NEUTRAL';
    let signalCls = 'neutral';
    if (r.signal === 'buy')  { signalLabel = '↗ BUY';  signalCls = 'buy'; }
    if (r.signal === 'sell') { signalLabel = '↘ SELL'; signalCls = 'sell'; }

    // Note de risque : ▲ rouge si ≥7, ▲ jaune si 5-6, ▲ vert si ≤4, — si 5 sans biais
    let riskIcon = '▲', riskIconCls = 'low';
    if (r.risk >= 7) riskIconCls = 'high';
    else if (r.risk >= 5) riskIconCls = 'med';
    if (r.risk === 5 && Math.abs(r.adj) < 30) { riskIcon = '—'; riskIconCls = ''; }

    return `
        <div class="scan-pair-card signal-${signalCls}" data-pair="${r.pair}">
            <div class="spc-head">
                <span class="spc-pair">${r.pair}</span>
                <span class="spc-signal ${signalCls}">${signalLabel}</span>
            </div>
            <div class="spc-comparison">
                <span class="spc-cb-block">
                    <span class="spc-cb-flag">${baseMeta.flag}</span>
                    <span class="spc-cb-name">${baseMeta.cb}</span>
                    <span class="spc-cb-score ${sbCls}">${sbStr}</span>
                </span>
                <span class="spc-vs">vs</span>
                <span class="spc-cb-block">
                    <span class="spc-cb-flag">${quoteMeta.flag}</span>
                    <span class="spc-cb-name">${quoteMeta.cb}</span>
                    <span class="spc-cb-score ${sqCls}">${sqStr}</span>
                </span>
            </div>
            <div class="spc-metrics">
                <span class="spc-adj ${adjCls}">
                    <span class="spc-adj-label">Adj:</span>${adjSign}${r.adj.toFixed(1)} bps
                </span>
                <span class="spc-risk">
                    <span class="spc-risk-label">Risk</span>
                    <span class="spc-risk-icon ${riskIconCls}">${riskIcon}</span>
                    <span class="spc-risk-value">${r.risk}/10</span>
                </span>
            </div>
            <div class="spc-cta">Cliquer pour analyse complète →</div>
        </div>
    `;
}

// ---- Render tout ----
function renderScanAll() {
    renderScanHeader();
    const results = SCAN_PAIRS.map(scanComputePair);
    renderScanEdge(results);
    renderScanGrid(results);
}

// ---- Modal détail complet ----
function openScanDetail(pairStr) {
    const [base, quote] = pairStr.split('/');
    const pairDef = SCAN_PAIRS.find(p => p.base === base && p.quote === quote);
    if (!pairDef) return;
    const r = scanComputePair(pairDef);
    if (!r) return;

    scanDetailPair = pairStr;
    document.getElementById('scan-detail-title').textContent = `${r.pair} — ANALYSE COMPLÈTE`;

    let signalLabel = '— NEUTRAL';
    if (r.signal === 'buy')  signalLabel = '↗ BUY';
    if (r.signal === 'sell') signalLabel = '↘ SELL';
    const adjSign = r.adj > 0 ? '+' : '';
    const rsInterp = scanRSInterpretation(r.rs);

    const baseMeta = SCAN_CCY_META[base];
    const quoteMeta = SCAN_CCY_META[quote];
    const baseBias = biasFromScore(r.sb);
    const quoteBias = biasFromScore(r.sq);

    document.getElementById('scan-detail-body').innerHTML = `
        <div class="sd-section">
            <div class="sd-big-signal ${r.signal}">
                ${signalLabel}
                <span class="sd-bps-big">${adjSign}${r.adj.toFixed(1)} bps</span>
            </div>
        </div>

        <div class="sd-section">
            <div class="sd-section-title">DÉCOMPOSITION DU SIGNAL</div>
            <div class="sd-row"><span class="sd-key">Carry (taux directeur)</span><span class="sd-val ${r.carry > 0 ? 'pos' : r.carry < 0 ? 'neg' : ''}">${r.carry > 0 ? '+' : ''}${r.carry.toFixed(1)} bps</span></div>
            <div class="sd-row"><span class="sd-key">Macro (score pondéré)</span><span class="sd-val ${r.macro > 0 ? 'pos' : r.macro < 0 ? 'neg' : ''}">${r.macro > 0 ? '+' : ''}${r.macro.toFixed(1)} bps</span></div>
            <div class="sd-row"><span class="sd-key">Risk Sentiment (${r.rs}/100)</span><span class="sd-val ${r.rsMod > 0 ? 'pos' : r.rsMod < 0 ? 'neg' : ''}">${r.rsMod > 0 ? '+' : ''}${r.rsMod.toFixed(1)} bps</span></div>
            <div class="sd-row" style="border-top:1px solid var(--border); margin-top:6px; padding-top:8px;"><span class="sd-key"><b style="color:var(--accent);">TOTAL ADJUSTED</b></span><span class="sd-val ${r.adj > 0 ? 'pos' : r.adj < 0 ? 'neg' : ''}"><b>${adjSign}${r.adj.toFixed(1)} bps</b></span></div>
        </div>

        <div class="sd-section">
            <div class="sd-section-title">${baseMeta.flag} ${base} (BASE)</div>
            <div class="sd-row"><span class="sd-key">Banque centrale</span><span class="sd-val">${baseMeta.cb}</span></div>
            <div class="sd-row"><span class="sd-key">Taux directeur</span><span class="sd-val">${r.rb !== null ? r.rb.toFixed(2) + '%' : '—'}</span></div>
            <div class="sd-row"><span class="sd-key">Score pondéré macro</span><span class="sd-val ${r.sb > 0 ? 'pos' : r.sb < 0 ? 'neg' : ''}">${r.sb > 0 ? '+' : ''}${r.sb.toFixed(2)}</span></div>
            <div class="sd-row"><span class="sd-key">Biais</span><span class="sd-val">${baseBias.label}</span></div>
        </div>

        <div class="sd-section">
            <div class="sd-section-title">${quoteMeta.flag} ${quote} (QUOTE)</div>
            <div class="sd-row"><span class="sd-key">Banque centrale</span><span class="sd-val">${quoteMeta.cb}</span></div>
            <div class="sd-row"><span class="sd-key">Taux directeur</span><span class="sd-val">${r.rq !== null ? r.rq.toFixed(2) + '%' : '—'}</span></div>
            <div class="sd-row"><span class="sd-key">Score pondéré macro</span><span class="sd-val ${r.sq > 0 ? 'pos' : r.sq < 0 ? 'neg' : ''}">${r.sq > 0 ? '+' : ''}${r.sq.toFixed(2)}</span></div>
            <div class="sd-row"><span class="sd-key">Biais</span><span class="sd-val">${quoteBias.label}</span></div>
        </div>

        <div class="sd-section">
            <div class="sd-section-title">CONTEXTE DE RISQUE</div>
            <div class="sd-row"><span class="sd-key">Risk Sentiment global</span><span class="sd-val">${rsInterp.mood} (${r.rs}/100)</span></div>
            <div class="sd-row"><span class="sd-key">Interprétation</span><span class="sd-val" style="font-size:10px; text-align:right; max-width:60%;">${rsInterp.text}</span></div>
            <div class="sd-row"><span class="sd-key">Volatilité de la paire</span><span class="sd-val">${r.risk}/10</span></div>
        </div>

        <div class="sd-section">
            <div class="sd-section-title">MÉTHODOLOGIE</div>
            <p style="color:var(--text-secondary); font-size:10.5px; line-height:1.6;">
                Le différentiel ajusté combine 3 composantes :<br>
                <b style="color:var(--accent);">Carry</b> = (taux ${base} − taux ${quote}) × 25 bps par point de %<br>
                <b style="color:var(--accent);">Macro</b> = (score pondéré ${base} − score pondéré ${quote}) × 10<br>
                <b style="color:var(--accent);">Risk Sentiment</b> = bonus/malus selon que ${base} et ${quote} sont des devises risk-on (AUD, NZD) ou refuge (JPY, CHF, USD).<br><br>
                Signal généré si |Adj| ≥ 20 bps. NEUTRAL sinon.
            </p>
        </div>
    `;

    document.getElementById('scan-detail-modal').classList.add('open');
}

function closeScanDetail() {
    document.getElementById('scan-detail-modal').classList.remove('open');
    scanDetailPair = null;
}

// ---- Setup événements SCAN ----
function setupScanEvents() {
    // Filtres catégorie
    document.querySelectorAll('.scan-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.scan-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            scanFilter = tab.dataset.filter;
            renderScanAll();
        });
    });

    // Recherche
    const search = document.getElementById('scan-search');
    if (search) {
        search.addEventListener('input', e => {
            scanSearch = e.target.value;
            renderScanAll();
        });
    }

    // Risk Sentiment input
    const rsInput = document.getElementById('scan-rs-input');
    const rsSave = document.getElementById('scan-rs-save');
    if (rsInput && rsSave) {
        rsSave.addEventListener('click', () => {
            const v = rsInput.value.trim();
            if (v === '') return;
            scanSetRiskSentiment(v);
            renderScanAll();
        });
        rsInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                rsSave.click();
            }
        });
    }

    // Refresh
    const refresh = document.getElementById('scan-refresh');
    if (refresh) refresh.addEventListener('click', renderScanAll);

    // Modal close
    const closeBtn = document.getElementById('scan-detail-close');
    const modal = document.getElementById('scan-detail-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeScanDetail);
    if (modal) {
        modal.addEventListener('click', e => {
            if (e.target.id === 'scan-detail-modal') closeScanDetail();
        });
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const m = document.getElementById('scan-detail-modal');
            if (m && m.classList.contains('open')) closeScanDetail();
        }
    });
}

// ============================================
// MODULE POS — Retail Positioning (Myfxbook Community Outlook)
// Le widget Myfxbook injecte son HTML de manière asynchrone.
// On observe le DOM et on repeint les couleurs natives (orange/bleu)
// vers notre palette vert/rouge cohérente avec le reste du terminal.
// ============================================

const POS_GREEN = '#4ade80';
const POS_RED   = '#f87171';
const POS_YELLOW = '#fbbf24';
const POS_FG    = '#0a0a0a'; // texte sur fond coloré (notre fond noir)
const POS_BG_GREEN_ALPHA = 'rgba(74, 222, 128, 0.85)';
const POS_BG_RED_ALPHA   = 'rgba(248, 113, 113, 0.85)';

let posRepaintObserver = null;
let posRepaintAttempts = 0;

// Détecte si une couleur CSS est "orange-ish" (utilisé par Myfxbook pour SHORT/baissier)
// Myfxbook utilise typiquement du #FF9900, #F90 ou similaires pour SHORT
function posIsOrangish(color) {
    if (!color) return false;
    const c = color.toLowerCase();
    // Hex orange
    if (/^#(ff9[0-9a-f]{1,3}|f90|fa[0-9a-f]{0,3}|f[78][0-9a-f])/.test(c)) return true;
    // rgb orange
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
        const r = +m[1], g = +m[2], b = +m[3];
        if (r > 200 && g > 100 && g < 200 && b < 80) return true;
    }
    return false;
}

// Détecte si une couleur est "blue-ish" (utilisé par Myfxbook pour LONG/haussier)
function posIsBluish(color) {
    if (!color) return false;
    const c = color.toLowerCase();
    if (/^#(0[0-9a-f]{2}|[0-3][0-9a-f]{2}[0-9a-f]{2})/.test(c)) {
        // Plage du bleu : R bas, B haut
        const m = c.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
        if (m) {
            const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
            return b > 150 && r < 100;
        }
    }
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
        const r = +m[1], g = +m[2], b = +m[3];
        if (b > 150 && r < 100) return true;
    }
    return false;
}

// Heuristique pour identifier les barres LONG vs SHORT dans le widget Myfxbook
// On parcourt le DOM en repaint mode
function posRepaintColors() {
    const container = document.getElementById('pos-myfxbook-container');
    if (!container) return;

    // 1) Repaint des éléments avec attribut bgcolor (vieille technique HTML)
    container.querySelectorAll('[bgcolor]').forEach(el => {
        const bg = (el.getAttribute('bgcolor') || '').toLowerCase();
        if (posIsBluish(bg)) {
            el.setAttribute('bgcolor', POS_GREEN);
            el.style.backgroundColor = POS_GREEN;
            el.style.color = POS_FG;
        } else if (posIsOrangish(bg)) {
            el.setAttribute('bgcolor', POS_RED);
            el.style.backgroundColor = POS_RED;
            el.style.color = POS_FG;
        }
    });

    // 2) Repaint des éléments avec style inline background-color
    container.querySelectorAll('[style*="background"]').forEach(el => {
        const inlineStyle = el.getAttribute('style') || '';
        // Capture toutes les déclarations background-color: XXX et background: XXX
        let newStyle = inlineStyle;
        let touched = false;

        newStyle = newStyle.replace(
            /background(-color)?\s*:\s*([^;]+)/gi,
            (match, _g1, color) => {
                const cleanColor = color.trim();
                if (posIsBluish(cleanColor)) {
                    touched = true;
                    return `background-color: ${POS_GREEN}`;
                }
                if (posIsOrangish(cleanColor)) {
                    touched = true;
                    return `background-color: ${POS_RED}`;
                }
                return match;
            }
        );

        if (touched) {
            el.setAttribute('style', newStyle);
            el.style.color = POS_FG;
            el.style.fontWeight = '600';
            el.style.fontFamily = "'SF Mono', Monaco, Consolas, monospace";
        }
    });

    // 3) Repaint des couleurs de texte (chiffres %): leurs % LONG en bleu → vert,
    //    leurs % SHORT en orange → rouge.
    container.querySelectorAll('*').forEach(el => {
        // On ne touche pas aux conteneurs avec enfants (sinon on casse les enfants)
        if (el.children.length > 0) return;
        const computedColor = el.style.color || '';
        if (posIsBluish(computedColor)) {
            el.style.color = POS_GREEN;
            el.style.fontWeight = '500';
        } else if (posIsOrangish(computedColor)) {
            el.style.color = POS_RED;
            el.style.fontWeight = '500';
        }
    });

    // 4) Heuristique sémantique : si une cellule TD contient "%" et qu'elle est
    //    dans une colonne "long" → vert. C'est plus fiable que d'attaquer les
    //    couleurs car le texte est explicite.
    //    On regarde les en-têtes du tableau pour mapper colonne → type.
    const tables = container.querySelectorAll('table');
    tables.forEach(table => {
        const headerCells = table.querySelectorAll('tr:first-child th, tr:first-child td');
        const colMap = []; // index colonne -> 'long' | 'short' | null
        headerCells.forEach((th, i) => {
            const txt = (th.textContent || '').toLowerCase();
            if (txt.includes('long')) colMap[i] = 'long';
            else if (txt.includes('short')) colMap[i] = 'short';
            else colMap[i] = null;
        });

        // Si on a identifié au moins une colonne long/short, on peut colorier
        if (colMap.some(c => c !== null)) {
            const rows = table.querySelectorAll('tr');
            rows.forEach((row, rowIdx) => {
                if (rowIdx === 0) return; // skip header
                const cells = row.querySelectorAll('td');
                cells.forEach((cell, i) => {
                    if (colMap[i] === 'long') {
                        // Si la cellule contient % → vert, sinon laisse tel quel
                        if (/\d+(\.\d+)?\s*%/.test(cell.textContent)) {
                            cell.style.color = POS_GREEN;
                            cell.style.fontWeight = '500';
                        }
                    } else if (colMap[i] === 'short') {
                        if (/\d+(\.\d+)?\s*%/.test(cell.textContent)) {
                            cell.style.color = POS_RED;
                            cell.style.fontWeight = '500';
                        }
                    }
                });
            });
        }
    });
}

// Initialise l'observateur DOM pour repeindre dès que Myfxbook injecte
function initPosRepaint() {
    const container = document.getElementById('pos-myfxbook-container');
    if (!container) return;

    // Déconnecte un observer précédent éventuel
    if (posRepaintObserver) {
        posRepaintObserver.disconnect();
        posRepaintObserver = null;
    }

    posRepaintAttempts = 0;

    // 1) Tente le repaint immédiat (cas où le widget était déjà chargé)
    posRepaintColors();

    // 2) Observer les futures mutations (le widget Myfxbook charge async)
    posRepaintObserver = new MutationObserver(mutations => {
        // Throttle : on repaint au max toutes les 200ms
        if (posRepaintAttempts < 30) {
            posRepaintAttempts++;
            posRepaintColors();
        }
    });

    posRepaintObserver.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'bgcolor']
    });

    // 3) Force un repaint après 1s, 3s et 5s pour être sûr (au cas où l'observer rate)
    setTimeout(posRepaintColors, 1000);
    setTimeout(posRepaintColors, 3000);
    setTimeout(posRepaintColors, 5000);

    // Mise à jour du timestamp dans le module-source
    const updEl = document.getElementById('pos-update');
    if (updEl) {
        const now = new Date();
        const hh = String(now.getUTCHours()).padStart(2, '0');
        const mm = String(now.getUTCMinutes()).padStart(2, '0');
        updEl.textContent = `myfxbook.com · ${hh}:${mm} GMT`;
    }
}

// ============================================
// MODULE PROB — Rate Probabilities
// 1) Polymarket Fed odds via Gamma API (CORS-friendly, sans clé)
// 2) Schedule G6 des prochains meetings central banks
// ============================================

const PROB_POLY_API = 'https://gamma-api.polymarket.com/events';
let probPolyCache = null;
let probPolyCacheTime = 0;
const PROB_POLY_CACHE_MS = 60 * 1000; // 1 min de cache

// Trouve l'événement Fed le plus proche dans Polymarket
async function fetchPolymarketFed() {
    // Cache pour ne pas saturer
    if (probPolyCache && (Date.now() - probPolyCacheTime) < PROB_POLY_CACHE_MS) {
        return probPolyCache;
    }

    try {
        // Recherche par slug : Polymarket nomme ses events Fed avec des slugs explicites
        // Ex: "fed-decision-in-december-2025", "fomc-decision-january-2026"
        // On cherche les events actifs taggés "Fed" ou "FOMC"
        const url = `${PROB_POLY_API}?closed=false&limit=200&order=endDate&ascending=true`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Polymarket returned ${res.status}`);
        const events = await res.json();
        if (!Array.isArray(events)) throw new Error('Unexpected Polymarket response');

        // Filtre : on cherche les events Fed/FOMC avec une fin proche
        const fedEvents = events.filter(ev => {
            const slug = (ev.slug || '').toLowerCase();
            const title = (ev.title || '').toLowerCase();
            return (
                slug.includes('fed-decision') ||
                slug.includes('fomc-decision') ||
                slug.includes('fomc-meeting') ||
                title.includes('fed decision') ||
                title.includes('fomc')
            ) && ev.markets && ev.markets.length > 0;
        });

        if (fedEvents.length === 0) {
            probPolyCache = { error: 'no-fed-event', events: [] };
            probPolyCacheTime = Date.now();
            return probPolyCache;
        }

        // Trie par endDate ascendant et garde le plus proche
        fedEvents.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
        const nextFed = fedEvents[0];

        // Parse les markets de l'event en outcomes triés par prix
        const outcomes = nextFed.markets.map(m => {
            // Polymarket renvoie outcomePrices comme string JSON "[0.97, 0.03]"
            let prices = [];
            try {
                prices = typeof m.outcomePrices === 'string'
                    ? JSON.parse(m.outcomePrices)
                    : (m.outcomePrices || []);
            } catch(e) { prices = []; }

            let labels = [];
            try {
                labels = typeof m.outcomes === 'string'
                    ? JSON.parse(m.outcomes)
                    : (m.outcomes || []);
            } catch(e) { labels = []; }

            // On veut la proba du "Yes" (outcome 0, prix entre 0 et 1)
            const yesPrice = prices.length > 0 ? parseFloat(prices[0]) : 0;
            return {
                question: m.question || m.groupItemTitle || 'Unknown',
                groupItemTitle: m.groupItemTitle || '',
                pct: Math.round(yesPrice * 100),
                rawPrice: yesPrice
            };
        }).filter(o => !isNaN(o.pct));

        // Trie par % décroissant
        outcomes.sort((a, b) => b.pct - a.pct);

        probPolyCache = {
            event: nextFed,
            outcomes,
            endDate: nextFed.endDate,
            title: nextFed.title,
            slug: nextFed.slug
        };
        probPolyCacheTime = Date.now();
        return probPolyCache;
    } catch (e) {
        console.warn('Polymarket fetch failed:', e);
        return { error: e.message };
    }
}

// Classify outcome label to color (cut → green, hold → orange, hike → red)
function probOutcomeColor(label) {
    const l = (label || '').toLowerCase();
    if (l.includes('cut') || l.includes('decrease') || l.includes('lower') || l.includes('-')) return 'cut';
    if (l.includes('hike') || l.includes('increase') || l.includes('higher') || l.includes('raise')) return 'hike';
    if (l.includes('no change') || l.includes('hold') || l.includes('unchanged') || l.includes('keep')) return 'hold';
    return 'hold';
}

// Render Polymarket Fed odds
async function renderProbPolymarket() {
    const wrap = document.getElementById('prob-poly-content');
    const meetingLabel = document.getElementById('prob-poly-meeting-label');
    if (!wrap) return;

    wrap.innerHTML = '<div class="loading">Fetching Polymarket data...</div>';

    const data = await fetchPolymarketFed();

    if (data.error) {
        wrap.innerHTML = `<div class="prob-poly-error">
            ⚠ Polymarket fetch failed: ${data.error}<br>
            <a href="https://polymarket.com/event/fed-decision" target="_blank" rel="noopener">Open Polymarket Fed Markets →</a>
        </div>`;
        return;
    }

    if (!data.outcomes || data.outcomes.length === 0) {
        wrap.innerHTML = `<div class="prob-poly-error">
            No active Fed decision market on Polymarket right now.<br>
            <a href="https://polymarket.com" target="_blank" rel="noopener">Browse Polymarket →</a>
        </div>`;
        return;
    }

    if (meetingLabel) {
        const endDate = new Date(data.endDate);
        const dateStr = endDate.toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
        meetingLabel.textContent = `${data.title} · resolves ${dateStr}`;
    }

    const maxPct = Math.max(...data.outcomes.map(o => o.pct), 1);

    const outcomesHtml = data.outcomes.map((o, i) => {
        const color = probOutcomeColor(o.question + ' ' + o.groupItemTitle);
        const width = (o.pct / maxPct) * 100;
        const isLeading = i === 0;
        const label = o.groupItemTitle || o.question;
        return `
            <div class="prob-poly-outcome ${isLeading ? 'leading' : ''}">
                <div class="ppo-label">${label}</div>
                <div class="ppo-bar-wrap">
                    <div class="ppo-bar-fill ${color}" style="width: ${width}%;">
                        ${o.pct >= 8 ? o.pct + '%' : ''}
                    </div>
                </div>
                <div class="ppo-pct ${isLeading ? 'high' : ''}">${o.pct}%</div>
            </div>
        `;
    }).join('');

    const polyUrl = `https://polymarket.com/event/${data.slug}`;
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    wrap.innerHTML = `
        <div class="prob-poly-outcomes">${outcomesHtml}</div>
        <div class="prob-poly-meta">
            <span>Total outcomes: ${data.outcomes.length} · Cached 60s</span>
            <span>Last update: ${now} · <a href="${polyUrl}" target="_blank" rel="noopener">View on Polymarket →</a></span>
        </div>
    `;

    // Update header timestamp
    const updateEl = document.getElementById('prob-last-update');
    if (updateEl) updateEl.textContent = now;
}

// ============================================
// SCHEDULE G6 — Prochains meetings centraux
// ============================================

// Schedule des meetings — on prend les données dispo dans ratesData + une fallback hardcodée
// pour les banques que /api/meetings ne couvre pas
const PROB_G6_BANKS = [
    { code: 'FED',  ccy: 'USD', name: 'Federal Reserve' },
    { code: 'ECB',  ccy: 'EUR', name: 'European Central Bank' },
    { code: 'BOE',  ccy: 'GBP', name: 'Bank of England' },
    { code: 'BOJ',  ccy: 'JPY', name: 'Bank of Japan' },
    { code: 'BOC',  ccy: 'CAD', name: 'Bank of Canada' },
    { code: 'RBA',  ccy: 'AUD', name: 'Reserve Bank Australia' }
];

function renderProbSchedule() {
    const list = document.getElementById('prob-schedule-list');
    if (!list) return;

    // On lit les meetings depuis ratesData (chargé par fetchAllData)
    // Si pas dispo, on affiche le loading
    if (!ratesData || !ratesData.banks) {
        list.innerHTML = '<div class="loading">Waiting for CB data...</div>';
        return;
    }

    const banksById = {};
    ratesData.banks.forEach(b => banksById[b.id] = b);

    // On a aussi besoin des meetings — récupérés via /api/meetings, stockés dans une variable globale
    // Comme ils ne sont pas stockés, on fait un nouveau fetch dédié
    fetch('/api/meetings')
        .then(r => r.ok ? r.json() : {})
        .then(meetings => {
            const cards = PROB_G6_BANKS.map(bank => {
                const data = banksById[bank.code] || {};
                const meet = meetings[bank.code];
                const days = daysUntil(meet);

                let countdownText = '—';
                let countdownClass = 'far';
                let cardClass = '';

                if (days === null) {
                    countdownText = 'date unknown';
                    countdownClass = 'far';
                } else if (days === 0) {
                    countdownText = '— TODAY —';
                    countdownClass = 'today';
                    cardClass = 'today';
                } else if (days < 0) {
                    countdownText = 'past';
                    countdownClass = 'far';
                } else if (days <= 7) {
                    countdownText = `in ${days} day${days > 1 ? 's' : ''}`;
                    countdownClass = 'imminent';
                    cardClass = 'imminent';
                } else if (days <= 30) {
                    countdownText = `in ${days} days`;
                    countdownClass = 'far';
                } else {
                    countdownText = `in ${days} days`;
                    countdownClass = 'far';
                }

                const dateStr = meet ? new Date(meet).toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric'
                }) : '—';

                const rateStr = (data.rate !== null && data.rate !== undefined)
                    ? `${Number(data.rate).toFixed(2)}%`
                    : '—';

                return {
                    bank, meet, days, dateStr, rateStr, countdownText, countdownClass, cardClass
                };
            });

            // Trie par jours croissants (les plus proches en premier)
            cards.sort((a, b) => {
                if (a.days === null) return 1;
                if (b.days === null) return -1;
                if (a.days < 0 && b.days >= 0) return 1;
                if (b.days < 0 && a.days >= 0) return -1;
                return a.days - b.days;
            });

            list.innerHTML = cards.map(c => `
                <div class="prob-sched-card ${c.cardClass}">
                    <div class="psc-head">
                        <span class="psc-bank">${c.bank.code}</span>
                        <span class="psc-ccy">${c.bank.ccy}</span>
                    </div>
                    <div class="psc-date">${c.dateStr}</div>
                    <div class="psc-countdown ${c.countdownClass}">${c.countdownText}</div>
                    <div class="psc-rate">
                        <span>Current rate</span>
                        <b>${c.rateStr}</b>
                    </div>
                </div>
            `).join('');
        })
        .catch(e => {
            list.innerHTML = '<div class="loading">Failed to load meetings.</div>';
        });
}

// ============================================
// IFRAME RateProbability handling
// ============================================
function initProbIframe() {
    const iframe = document.getElementById('prob-iframe');
    const fallback = document.getElementById('prob-iframe-fallback');
    if (!iframe || !fallback) return;

    // Si l'iframe charge avec succès → on cache le fallback
    // X-Frame-Options bloque silencieusement, on ne peut pas savoir
    // sauf si on essaie d'accéder à contentDocument et qu'on échoue
    iframe.addEventListener('load', () => {
        try {
            // Si on peut accéder à contentDocument c'est cross-origin OK (impossible mais en cas où)
            // ou pas. De toute façon on cache le fallback.
            // Si l'iframe a vraiment été bloquée par X-Frame-Options, le load se déclenche quand même
            // mais avec une page vide. Difficile à détecter de façon fiable.
            fallback.style.display = 'none';
        } catch (e) {
            // cross-origin attendu — on cache quand même le fallback
            fallback.style.display = 'none';
        }
    });

    // En cas d'erreur de chargement
    iframe.addEventListener('error', () => {
        fallback.style.display = 'flex';
    });
}

// ============================================
// RENDER PROB ALL
// ============================================
function renderProbAll() {
    renderProbPolymarket();
    renderProbSchedule();
    initProbIframe();
}

function setupProbEvents() {
    const refreshBtn = document.getElementById('prob-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            // Invalide le cache et re-render
            probPolyCache = null;
            probPolyCacheTime = 0;
            renderProbAll();
        });
    }
}

// ============================================
// PAGE NAVIGATION (10 pages: home / cb / macro / score / scan / pos / prob / fx / news / cal)
// HOME = page statique HTML — pas de logique JS associée
// ============================================
const PAGES = ['home', 'cb', 'macro', 'score', 'scan', 'pos', 'prob', 'fx', 'news', 'cal'];

function showPage(pageId) {
    if (!PAGES.includes(pageId)) pageId = 'home';

    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    const target = document.getElementById('page-' + pageId);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.page === pageId) link.classList.add('active');
    });

    if (pageId === 'macro') {
        setTimeout(() => {
            renderMacroCharts();
            Object.values(macroChartInstances).forEach(c => c && c.resize && c.resize());
        }, 50);
    }

    if (pageId === 'cb') {
        setTimeout(() => {
            renderAllRateCharts();
        }, 50);
    }

    if (pageId === 'score') {
        setTimeout(() => {
            renderScoreAll();
        }, 50);
    }

    if (pageId === 'scan') {
        setTimeout(() => {
            renderScanAll();
        }, 50);
    }

    if (pageId === 'pos') {
        setTimeout(() => {
            initPosRepaint();
        }, 100);
    }

    if (pageId === 'prob') {
        setTimeout(() => {
            renderProbAll();
        }, 50);
    }

    if (window.location.hash !== '#' + pageId) {
        history.replaceState(null, '', '#' + pageId);
    }
}

function setupPageNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const pageId = link.dataset.page;
            showPage(pageId);
        });
    });

    window.addEventListener('hashchange', () => {
        const pageId = window.location.hash.replace('#', '') || 'home';
        showPage(pageId);
    });

    const initialPage = window.location.hash.replace('#', '') || 'home';
    showPage(initialPage);
}

// ============================================
// INIT
// ============================================
setupPageNavigation();
loadMacroState();
loadScoreEvents();
setupPeriodSelector();
setupCSVButtons();
setupEditableText();
setupScoreEvents();
setupScanEvents();
setupProbEvents();
renderScoreAll();
renderScanAll();
fetchAllData();
setInterval(fetchAllData, 10 * 60 * 1000);
