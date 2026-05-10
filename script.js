/* ============================================
   PL TERMINAL — Frontend logic (full + macro data)
   Pure macro scoring — 6 factors
   ============================================ */

const CCYS = ['USD','EUR','GBP','JPY','CAD','AUD','NZD','CHF'];

const CENTRAL_BANKS = [
    { code: 'FED',  ccy: 'USD' },
    { code: 'ECB',  ccy: 'EUR' },
    { code: 'RBA',  ccy: 'AUD' },
    { code: 'RBNZ', ccy: 'NZD' }
];

const CCY_TO_BANK = { USD: 'FED', EUR: 'ECB', AUD: 'RBA', NZD: 'RBNZ' };

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

// 6 facteurs macro purs (sans Momentum/Risk/Géo)
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
setInterval(updateClock, 1000);
updateClock();

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

// Politique monétaire (Taux directeur — formule Excel B5)
function scoreMonetary(ccy) {
    const v = getMacroValue('rate', ccy);
    if (v === null) return 0;
    if (v >= 4)    return 2;
    if (v >= 3)    return 1;
    if (v >= 1.5)  return 0;
    if (v >= 0.5)  return -1;
    return -2;
}

// Différentiel de taux (Spread 10Y-2Y — formule Excel B17)
function scoreSpread(ccy) {
    const v = getMacroValue('spread', ccy);
    if (v === null) return 0;
    if (v >= 1)     return 2;
    if (v >= 0.5)   return 1;
    if (v >= 0)     return 0;
    if (v >= -0.5)  return -1;
    return -2;
}

// Inflation tendance (CPI YoY — formule Excel B7)
function scoreCPI(ccy) {
    const v = getMacroValue('cpi', ccy);
    if (v === null) return 0;
    if (v >= 4)    return 2;
    if (v >= 3)    return 1;
    if (v >= 1.5)  return 0;
    if (v >= 1)    return -1;
    return -2;
}

// Croissance PIB (PIB YoY — formule Excel B9)
function scoreGDP(ccy) {
    const v = getMacroValue('gdp', ccy);
    if (v === null) return 0;
    if (v >= 3)  return 2;
    if (v >= 2)  return 1;
    if (v >= 1)  return 0;
    if (v >= 0)  return -1;
    return -2;
}

// Chômage inversé (formule Excel B10)
function scoreUnemp(ccy) {
    const v = getMacroValue('unemployment', ccy);
    if (v === null) return 0;
    if (v <= 3.5)  return 2;
    if (v <= 4.5)  return 1;
    if (v <= 5.5)  return 0;
    if (v <= 6.5)  return -1;
    return -2;
}

// PMI moyen Manuf+Services (formule Excel B11/B12)
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

// Seuils calibrés sur score pondéré max ±17 (6 facteurs macro purs)
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
// FETCH ALL
// ============================================
async function fetchAllData() {
    setStatus('connecting', 'fetching data...');
    try {
        const [r1, r2, r3] = await Promise.all([
            fetch('/api/rates'),
            fetch('/api/meetings'),
            fetch('/api/yields')
        ]);
        if (!r1.ok) throw new Error('Rates failed');
        ratesData = await r1.json();
        const meetings = r2.ok ? await r2.json() : {};
        yieldsData = r3.ok ? await r3.json() : {};
        renderRatesTable(ratesData, meetings);
        if (ratesData.banks) {
            rateHistoryState.banks = ratesData.banks;
            renderAllRateCharts();
        }
        renderMacroTable();
        renderMacroCharts();
        renderScoring();
        renderCarryMatrix();
        renderRanking();
        setStatus('live', 'live');
    } catch (e) {
        console.error('Fetch error:', e);
        setStatus('error', 'connection error');
    }
}

// ============================================
// PAGE NAVIGATION (5 pages: cb / macro / fx / news / cal)
// ============================================
const PAGES = ['cb', 'macro', 'fx', 'news', 'cal'];

function showPage(pageId) {
    if (!PAGES.includes(pageId)) pageId = 'cb';

    // Hide all pages, show the target one
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    const target = document.getElementById('page-' + pageId);
    if (target) target.classList.add('active');

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.page === pageId) link.classList.add('active');
    });

    // Re-render charts when MACRO page becomes visible (Chart.js doesn't render hidden)
    if (pageId === 'macro') {
        setTimeout(() => {
            renderMacroCharts();
            // Force chart resize
            Object.values(macroChartInstances).forEach(c => c && c.resize && c.resize());
        }, 50);
    }

    // Re-render rate history charts when CB page becomes visible
    if (pageId === 'cb') {
        setTimeout(() => {
            renderAllRateCharts();
        }, 50);
    }

    // Update URL hash without scrolling
    if (window.location.hash !== '#' + pageId) {
        history.replaceState(null, '', '#' + pageId);
    }
}

function setupPageNavigation() {
    // Click handlers on nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const pageId = link.dataset.page;
            showPage(pageId);
        });
    });

    // Handle browser back/forward
    window.addEventListener('hashchange', () => {
        const pageId = window.location.hash.replace('#', '') || 'cb';
        showPage(pageId);
    });

    // Initial page from URL hash, or default to 'cb'
    const initialPage = window.location.hash.replace('#', '') || 'cb';
    showPage(initialPage);
}

// ============================================
// INIT
// ============================================
setupPageNavigation();
loadMacroState();
setupPeriodSelector();
setupCSVButtons();
setupEditableText();
fetchAllData();
setInterval(fetchAllData, 10 * 60 * 1000);
