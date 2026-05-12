/* ============================================
   PL TERMINAL — Frontend logic (full + macro data)
   Pure macro scoring — 6 factors
   HOME = statique (HTML pur, aucun JS)
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
// PAGE NAVIGATION (7 pages: home / cb / macro / score / fx / news / cal)
// HOME = page statique HTML — pas de logique JS associée
// ============================================
const PAGES = ['home', 'cb', 'macro', 'score', 'fx', 'news', 'cal'];

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
renderScoreAll();
fetchAllData();
setInterval(fetchAllData, 10 * 60 * 1000);
