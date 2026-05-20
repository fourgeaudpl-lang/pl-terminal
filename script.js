/* ============================================
   PL TERMINAL — Frontend logic (full + macro data)
   Pure macro scoring — 6 factors
   HOME = statique (HTML pur, aucun JS)
   ============================================ */

const CCYS = ['USD','EUR','GBP','JPY','CAD','AUD','NZD','CHF'];

const CENTRAL_BANKS = [
    { code: 'FED',  ccy: 'USD', fred: 'FEDFUNDS'        },
    { code: 'ECB',  ccy: 'EUR', fred: 'ECBDFR'          },
    { code: 'BOE',  ccy: 'GBP', fred: 'IUDSOIA'         },
    { code: 'BOJ',  ccy: 'JPY', fred: 'IRSTCI01JPM156N' },
    { code: 'BOC',  ccy: 'CAD', fred: 'IRSTCI01CAM156N' },
    { code: 'RBA',  ccy: 'AUD', fred: 'IRSTCI01AUM156N' },
    { code: 'RBNZ', ccy: 'NZD', fred: 'IR3TIB01NZM156N' },
    { code: 'SNB',  ccy: 'CHF', fred: 'IR3TIB01CHM156N' }
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

    // On garde la cellule actuellement focusée pour restaurer après render
    const prevFocused = tbody.querySelector('.editable-macro.focused');
    const prevInd = prevFocused ? prevFocused.dataset.ind : null;
    const prevCcy = prevFocused ? prevFocused.dataset.ccy : null;

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
            // tabindex="0" rend la cellule focusable au clavier
            const tabAttr = isComputed ? '' : 'tabindex="0"';
            row += `<td class="num ${cellCls} ${emptyCls}" data-ind="${ind.id}" data-ccy="${ccy}" ${tabAttr}>${display}</td>`;
        });
        row += '</tr>';
        html += row;
    });
    tbody.innerHTML = html;

    tbody.querySelectorAll('.editable-macro').forEach(cell => {
        cell.addEventListener('click', () => editMacroCell(cell));
        cell.addEventListener('focus', () => {
            tbody.querySelectorAll('.editable-macro.focused').forEach(c => c.classList.remove('focused'));
            cell.classList.add('focused');
        });
    });

    // Restaure le focus si on était sur une cellule
    if (prevInd && prevCcy) {
        const restored = tbody.querySelector(`.editable-macro[data-ind="${prevInd}"][data-ccy="${prevCcy}"]`);
        if (restored) restored.focus();
    }

    const count = Object.keys(macroState).length;
    const e = document.getElementById('macro-saved');
    if (e) e.textContent = count > 0 ? `${count} values saved` : 'no data yet';
}

// ============================================
// Navigation clavier dans la table MACRO
// ============================================
function setupMacroKeyboard() {
    const tbody = document.getElementById('macro-tbody');
    if (!tbody) return;

    tbody.addEventListener('keydown', e => {
        const cell = e.target;
        if (!cell.classList || !cell.classList.contains('editable-macro')) return;

        const ind = cell.dataset.ind;
        const ccy = cell.dataset.ccy;
        if (!ind || !ccy) return;

        // Liste de tous les indicateurs non-computed (ceux qu'on peut éditer)
        const editableIndIds = MACRO_INDICATORS.filter(i => !i.computed).map(i => i.id);
        const currentIndIdx = editableIndIds.indexOf(ind);
        const currentCcyIdx = CCYS.indexOf(ccy);

        if (currentIndIdx < 0 || currentCcyIdx < 0) return;

        let newIndIdx = currentIndIdx;
        let newCcyIdx = currentCcyIdx;
        let handled = false;

        switch (e.key) {
            case 'ArrowUp':
                newIndIdx = Math.max(0, currentIndIdx - 1);
                handled = true;
                break;
            case 'ArrowDown':
                newIndIdx = Math.min(editableIndIds.length - 1, currentIndIdx + 1);
                handled = true;
                break;
            case 'ArrowLeft':
                newCcyIdx = Math.max(0, currentCcyIdx - 1);
                handled = true;
                break;
            case 'ArrowRight':
            case 'Tab':
                if (e.key === 'Tab' && e.shiftKey) {
                    // Shift+Tab → précédent
                    newCcyIdx = currentCcyIdx - 1;
                    if (newCcyIdx < 0) {
                        newCcyIdx = CCYS.length - 1;
                        newIndIdx = Math.max(0, currentIndIdx - 1);
                    }
                } else {
                    // Tab/Right → suivant
                    newCcyIdx = currentCcyIdx + 1;
                    if (newCcyIdx >= CCYS.length) {
                        newCcyIdx = 0;
                        newIndIdx = Math.min(editableIndIds.length - 1, currentIndIdx + 1);
                    }
                }
                handled = true;
                break;
            case 'Enter':
            case ' ':
                // Enter ou Espace = éditer la cellule
                e.preventDefault();
                editMacroCell(cell);
                return;
            case 'Delete':
            case 'Backspace':
                // Supprime la valeur de la cellule
                e.preventDefault();
                setMacroValue(ind, ccy, null);
                renderMacroTable();
                renderMacroCharts();
                renderScoring();
                renderCarryMatrix();
                renderRanking();
                if (typeof renderScanAll === 'function') renderScanAll();
                if (typeof renderPosTable === 'function') renderPosTable();
                return;
        }

        if (handled) {
            e.preventDefault();
            const newInd = editableIndIds[newIndIdx];
            const newCcy = CCYS[newCcyIdx];
            const target = tbody.querySelector(`.editable-macro[data-ind="${newInd}"][data-ccy="${newCcy}"]`);
            if (target) target.focus();
        }
    });
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
    if (typeof renderPosTable === 'function') renderPosTable();
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
    if (typeof renderPosTable === 'function') renderPosTable();
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
        // Renvoie tous les points (séries FRED déjà à fréquence mensuelle/quotidienne)
        // Le dédoublonnage est inutile et casse le rendu pour les séries stables
        return data;
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
// CACHE LOCALSTORAGE — Démarrage instantané
// On sauvegarde ratesData après chaque fetch réussi.
// Au prochain chargement, on l'affiche IMMÉDIATEMENT en attendant le fetch.
// ============================================
const RATES_CACHE_KEY = 'pl_rates_cache';

function saveRatesCache(banks) {
    try {
        // On ne garde QUE le dernier point d'historique (pas tout) pour éviter de saturer localStorage
        const compact = banks.map(b => ({
            id: b.id,
            rate: b.rate,
            asOf: b.asOf,
            lastChange: b.lastChange,
            // Garde seulement les 60 derniers points pour le mini chart (5 ans mensuel)
            history: (b.history || []).slice(-60)
        }));
        localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({
            banks: compact,
            savedAt: Date.now()
        }));
    } catch (e) {
        console.warn('Cache save failed:', e);
    }
}

function loadRatesCache() {
    try {
        const raw = localStorage.getItem(RATES_CACHE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        // Cache valide 24h max
        if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) return null;
        return data.banks;
    } catch (e) {
        return null;
    }
}

// ============================================
async function fetchAllData() {
    setStatus('connecting', 'fetching data...');
    try {
        // 1) Fetch en parallèle : ton backend + meetings + yields + FRED history (proxy public) + CNN F&G + WIRP + Yield Curve
        const [apiRatesRes, meetingsRes, yieldsRes, fredBanks, _cnnDone, _wirpDone, _ycDone] = await Promise.all([
            fetch('/api/rates').catch(() => null),
            fetch('/api/meetings').catch(() => null),
            fetch('/api/yields').catch(() => null),
            fetchAllBanksHistoryFromFred(),
            scanFetchCNN(),
            fetchWirpData(),
            fetchYieldsData()
        ]);

        const apiRates = (apiRatesRes && apiRatesRes.ok) ? await apiRatesRes.json() : null;
        const meetings = (meetingsRes && meetingsRes.ok) ? await meetingsRes.json() : {};
        yieldsData = (yieldsRes && yieldsRes.ok) ? await yieldsRes.json() : {};

        // 2) Fusionne : FRED prioritaire pour l'historique, /api/rates pour les valeurs intraday plus récentes
        const mergedBanks = mergeBanksData(fredBanks, apiRates, meetings);
        ratesData = { banks: mergedBanks };

        // Sauve en cache pour le prochain démarrage instantané
        saveRatesCache(mergedBanks);

        // 3) Render
        renderSnapshotTable();
        rateHistoryState.banks = mergedBanks;
        renderAllRateCharts();
        renderProjectionCards();
        renderCBTimeline();

        renderMacroTable();
        renderMacroCharts();
        renderScoring();
        renderCarryMatrix();
        renderRanking();
        if (typeof renderScanAll === 'function') renderScanAll();
    if (typeof renderPosTable === 'function') renderPosTable();
        if (typeof renderHomeAll === 'function') renderHomeAll();
        if (typeof renderWirp === 'function') renderWirp();
        if (typeof renderYieldsAllAsync === 'function') renderYieldsAllAsync();

        // Timestamp global mis à jour
        localStorage.setItem(SCAN_LAST_UPDATE_KEY, new Date().toISOString());
        scanRefreshTimestamp();
        scanRefreshSourceLabel();

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

// ---- Auto-interpretation des annonces économiques ----
// Pour chaque catégorie : règle d'impact + tolérance neutre
// Règle : "higher" = actual > forecast → haussier ; "lower" = actual > forecast → baissier
const SCORE_INTERPRETATION = {
    'Inflation':  { rule: 'higher',  tolerance: 0.1,    unit: 'pts' },     // CPI/PPI/Core PCE
    'Emploi':     { rule: 'higher',  tolerance: 25,     unit: 'K' },       // NFP/Employment Change
    'Chômage':    { rule: 'lower',   tolerance: 0.1,    unit: 'pts' },     // Unemployment rate
    'PMI':        { rule: 'higher',  tolerance: 0.5,    unit: 'pts', pivot: 50 }, // PMI/ISM : >50 expansion
    'Croissance': { rule: 'higher',  tolerance: 0.1,    unit: 'pts' },     // GDP/Retail Sales
    'BC':         { rule: 'higher',  tolerance: 0,      unit: 'pts' },     // Rate decision : exact
    'Sentiment':  { rule: 'higher',  tolerance: 2,      unit: 'pts' },     // Confidence indices
    'Balance':    { rule: 'higher',  tolerance: null,   unit: '%', relative: 0.10 }, // Trade balance : ±10% relatif
    'Autre':      { rule: 'higher',  tolerance: null,   unit: '%', relative: 0.05 }  // Fallback ±5%
};

/**
 * Interprète une annonce : retourne { impact: 'up'|'flat'|'down', reason: string }
 * @param {string} category - Catégorie de l'annonce
 * @param {number} actual - Valeur réelle publiée
 * @param {number} forecast - Valeur attendue
 * @param {number|null} previous - Valeur précédente (optionnel)
 * @returns {object} { impact, reason, confidence }
 */
function interpretAnnouncement(category, actual, forecast, previous) {
    if (actual === null || actual === undefined || isNaN(actual)) {
        return { impact: null, reason: 'Actual manquant', confidence: 0 };
    }
    if (forecast === null || forecast === undefined || isNaN(forecast)) {
        return { impact: null, reason: 'Forecast manquant', confidence: 0 };
    }

    const config = SCORE_INTERPRETATION[category] || SCORE_INTERPRETATION['Autre'];
    const diff = actual - forecast;
    const absDiff = Math.abs(diff);

    // Calcul de la tolérance effective
    let effectiveTolerance;
    if (config.tolerance !== null && config.tolerance !== undefined) {
        effectiveTolerance = config.tolerance;
    } else if (config.relative) {
        // Tolérance relative : % du forecast (en valeur absolue)
        effectiveTolerance = Math.abs(forecast) * config.relative;
    } else {
        effectiveTolerance = 0;
    }

    // Cas neutre : actual ≈ forecast (dans la tolérance)
    if (absDiff <= effectiveTolerance) {
        return {
            impact: 'flat',
            reason: `Actual ${formatNum(actual)} ≈ Forecast ${formatNum(forecast)} (écart ${formatNum(diff)} ≤ tolérance ±${formatNum(effectiveTolerance)})`,
            confidence: 'low'
        };
    }

    // Détermine la direction selon la règle
    let impact;
    const actualGreater = diff > 0;
    if (config.rule === 'higher') {
        impact = actualGreater ? 'up' : 'down';
    } else {
        // rule === 'lower' (cas chômage)
        impact = actualGreater ? 'down' : 'up';
    }

    // Bonus de confiance si previous va dans le même sens (tendance confirmée)
    let confidence = 'medium';
    let trendNote = '';
    if (previous !== null && previous !== undefined && !isNaN(previous)) {
        const prevDiff = actual - previous;
        const sameDirection = (config.rule === 'higher')
            ? ((impact === 'up' && prevDiff > 0) || (impact === 'down' && prevDiff < 0))
            : ((impact === 'up' && prevDiff < 0) || (impact === 'down' && prevDiff > 0));
        if (sameDirection && Math.abs(prevDiff) > effectiveTolerance) {
            confidence = 'high';
            trendNote = ` · Tendance confirmée vs Previous ${formatNum(previous)}`;
        }
    }

    const arrow = impact === 'up' ? '↑' : '↓';
    const direction = config.rule === 'higher'
        ? (actualGreater ? '>' : '<')
        : (actualGreater ? '>' : '<');

    return {
        impact,
        reason: `Actual ${formatNum(actual)} ${direction} Forecast ${formatNum(forecast)} · ${category} ${arrow} ${impact === 'up' ? 'HAUSSIER' : 'BAISSIER'}${trendNote}`,
        confidence
    };
}

function formatNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    if (Math.abs(n) >= 100) return n.toFixed(1);
    if (Math.abs(n) >= 1)   return n.toFixed(2);
    return n.toFixed(3);
}

// Met à jour le bloc d'auto-detection en temps réel
function updateScoreAutodetect() {
    const cat = document.getElementById('score-form-cat').value;
    const actualStr = document.getElementById('score-form-actual').value;
    const forecastStr = document.getElementById('score-form-forecast').value;
    const previousStr = document.getElementById('score-form-previous').value;

    const actual = actualStr === '' ? null : parseFloat(actualStr);
    const forecast = forecastStr === '' ? null : parseFloat(forecastStr);
    const previous = previousStr === '' ? null : parseFloat(previousStr);

    const container = document.getElementById('score-autodetect-content');
    if (!container) return;

    if (actual === null || forecast === null) {
        container.innerHTML = '<span class="score-autodetect-empty">Saisis Actual & Forecast pour voir l\'impact détecté</span>';
        // Reset des boutons d'override pour ne pas garder un override fantôme
        return;
    }

    const result = interpretAnnouncement(cat, actual, forecast, previous);

    if (!result.impact) {
        container.innerHTML = `<span class="score-autodetect-empty">⚠ ${result.reason}</span>`;
        return;
    }

    const cls = result.impact === 'up' ? 'up' : result.impact === 'down' ? 'down' : 'flat';
    const label = result.impact === 'up' ? '↑ HAUSSIER' : result.impact === 'down' ? '↓ BAISSIER' : '= NEUTRE';
    const confBadge = result.confidence === 'high' ? '<span class="score-autodetect-conf high">HAUTE CONFIANCE</span>'
                    : result.confidence === 'medium' ? '<span class="score-autodetect-conf medium">CONFIANCE MOY.</span>'
                    : '<span class="score-autodetect-conf low">CONFIANCE BASSE</span>';

    container.innerHTML = `
        <div class="score-autodetect-result">
            <span class="score-autodetect-badge ${cls}">${label}</span>
            ${confBadge}
        </div>
        <div class="score-autodetect-reason">${result.reason}</div>
    `;

    // Synchronise les boutons d'override (auto-sélectionne celui détecté, sauf si user a déjà override)
    if (!scoreFormUserOverride) {
        scoreFormImpact = result.impact;
        document.querySelectorAll('.score-impact-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.impact === result.impact);
            b.classList.toggle('auto-selected', b.dataset.impact === result.impact);
        });
    }
}

// ---- Modal d'ajout / édition ----
let scoreFormUserOverride = false;  // True si user a cliqué manuellement sur un bouton impact

function openScoreModal() {
    scoreEditingId = null;
    scoreFormImpact = null;
    scoreFormUserOverride = false;
    document.getElementById('score-modal-title').textContent = 'AJOUTER UNE ANNONCE';
    document.getElementById('score-form-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('score-form-ccy').value = 'EUR';
    document.getElementById('score-form-cat').value = 'Inflation';
    document.getElementById('score-form-name').value = '';
    document.getElementById('score-form-actual').value = '';
    document.getElementById('score-form-forecast').value = '';
    document.getElementById('score-form-previous').value = '';
    document.getElementById('score-form-note').value = '';
    document.querySelectorAll('.score-impact-btn').forEach(b => {
        b.classList.remove('active');
        b.classList.remove('auto-selected');
    });
    updateScoreAutodetect();  // reset le bloc d'auto-detect
    document.getElementById('score-modal').classList.add('open');
    setTimeout(() => document.getElementById('score-form-name').focus(), 50);
}

function closeScoreModal() {
    document.getElementById('score-modal').classList.remove('open');
    scoreEditingId = null;
    scoreFormUserOverride = false;
}

function selectImpact(impact) {
    scoreFormImpact = impact;
    scoreFormUserOverride = true;  // user a override l'auto-detect
    document.querySelectorAll('.score-impact-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.impact === impact);
        b.classList.remove('auto-selected');  // on retire le marqueur auto
    });
}

function saveScoreForm() {
    const date = document.getElementById('score-form-date').value;
    const ccy  = document.getElementById('score-form-ccy').value;
    const cat  = document.getElementById('score-form-cat').value;
    const name = document.getElementById('score-form-name').value.trim();
    const note = document.getElementById('score-form-note').value.trim();

    const actualStr = document.getElementById('score-form-actual').value;
    const forecastStr = document.getElementById('score-form-forecast').value;
    const previousStr = document.getElementById('score-form-previous').value;
    const actual = actualStr === '' ? null : parseFloat(actualStr);
    const forecast = forecastStr === '' ? null : parseFloat(forecastStr);
    const previous = previousStr === '' ? null : parseFloat(previousStr);

    if (!date) { alert('Date requise'); return; }
    if (!name) { alert('Nom requis (ex: CPI YoY, NFP...)'); return; }
    if (!scoreFormImpact) {
        alert('Saisis Actual et Forecast pour l\'auto-detect, ou choisis manuellement ↑/=/↓');
        return;
    }

    const ev = {
        id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        date, ccy, cat, name, note,
        impact: scoreFormImpact,
        actual, forecast, previous  // on stocke aussi les valeurs brutes
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

    // Listeners pour l'auto-detection en temps réel
    ['score-form-cat', 'score-form-actual', 'score-form-forecast', 'score-form-previous'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateScoreAutodetect);
            el.addEventListener('change', updateScoreAutodetect);
        }
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

const SCAN_RS_KEY = 'pl_scan_risk_sentiment'; // 0-100, saisi par l'utilisateur (override manuel)
const SCAN_RS_MANUAL_KEY = 'pl_scan_rs_manual'; // flag : true = override manuel actif, ignore CNN
const SCAN_LAST_UPDATE_KEY = 'pl_scan_last_update'; // timestamp ISO de la dernière maj

// État global CNN F&G fetch (mis à jour par scanFetchCNN)
let scanCnnData = { score: null, label: null, delta: null, fetchedAt: null, error: false };

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

// ---- Risk Sentiment (0-100, auto depuis CNN F&G ou override manuel) ----
function scanGetRiskSentiment() {
    // 1) Override manuel actif → on prend la valeur saisie
    const isManual = localStorage.getItem(SCAN_RS_MANUAL_KEY) === '1';
    if (isManual) {
        const raw = localStorage.getItem(SCAN_RS_KEY);
        if (raw !== null) {
            const n = parseInt(raw, 10);
            return isNaN(n) ? 50 : Math.max(0, Math.min(100, n));
        }
    }
    // 2) Sinon, on prend la valeur fetched CNN
    if (scanCnnData.score !== null && !scanCnnData.error) {
        return scanCnnData.score;
    }
    // 3) Fallback : valeur saisie manuellement, ou 50
    const raw = localStorage.getItem(SCAN_RS_KEY);
    if (raw === null) return 50;
    const n = parseInt(raw, 10);
    return isNaN(n) ? 50 : Math.max(0, Math.min(100, n));
}

function scanSetRiskSentiment(val) {
    const v = Math.max(0, Math.min(100, parseInt(val, 10)));
    if (isNaN(v)) return;
    localStorage.setItem(SCAN_RS_KEY, String(v));
    // Active le mode "override manuel" → on ne suit plus CNN
    localStorage.setItem(SCAN_RS_MANUAL_KEY, '1');
}

function scanClearManualOverride() {
    localStorage.removeItem(SCAN_RS_MANUAL_KEY);
}

function scanIsManualMode() {
    return localStorage.getItem(SCAN_RS_MANUAL_KEY) === '1';
}

// ---- Fetch CNN Fear & Greed via notre Cloudflare Function ----
async function scanFetchCNN() {
    try {
        const r = await fetch('/api/fear-greed');
        if (!r.ok) {
            scanCnnData = { score: null, label: null, delta: null, fetchedAt: null, error: true };
            return;
        }
        const data = await r.json();
        if (data.error || data.score === null) {
            scanCnnData = { score: null, label: null, delta: null, fetchedAt: null, error: true };
            return;
        }
        scanCnnData = {
            score: data.score,
            label: data.label,
            delta: data.delta,
            previousScore: data.previousScore,
            fetchedAt: data.fetchedAt || new Date().toISOString(),
            error: false
        };
        // Update du timestamp
        localStorage.setItem(SCAN_LAST_UPDATE_KEY, new Date().toISOString());
    } catch (e) {
        scanCnnData = { score: null, label: null, delta: null, fetchedAt: null, error: true };
    }
}

// ---- Update du timestamp Last Update affiché ----
function scanRefreshTimestamp() {
    const el = document.getElementById('scan-last-update');
    if (!el) return;
    const iso = localStorage.getItem(SCAN_LAST_UPDATE_KEY);
    if (!iso) { el.textContent = '—'; return; }
    const dt = new Date(iso);
    if (isNaN(dt)) { el.textContent = '—'; return; }
    const hh = String(dt.getUTCHours()).padStart(2, '0');
    const mm = String(dt.getUTCMinutes()).padStart(2, '0');
    el.textContent = `${hh}:${mm} GMT`;
}

// ---- Update label source (CNN F&G live / manual / CNN F&G stale) ----
function scanRefreshSourceLabel() {
    const el = document.getElementById('scan-rs-source');
    if (!el) return;
    if (scanIsManualMode()) {
        el.innerHTML = '<span class="src-manual">MANUAL OVERRIDE</span>';
    } else if (scanCnnData.error || scanCnnData.score === null) {
        el.innerHTML = '<span class="src-error">CNN F&amp;G (offline)</span>';
    } else {
        let deltaStr = '';
        if (scanCnnData.delta !== null && scanCnnData.delta !== undefined) {
            const sign = scanCnnData.delta > 0 ? '+' : '';
            const cls = scanCnnData.delta > 0 ? 'up' : scanCnnData.delta < 0 ? 'down' : 'flat';
            deltaStr = ` <span class="${cls}">(${sign}${scanCnnData.delta}d)</span>`;
        }
        el.innerHTML = `<span class="src-live">● CNN F&amp;G live</span>${deltaStr}`;
    }
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
    scanRefreshTimestamp();
    scanRefreshSourceLabel();
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

    // Risk Sentiment input — SAVE active l'override manuel
    const rsInput = document.getElementById('scan-rs-input');
    const rsSave = document.getElementById('scan-rs-save');
    if (rsInput && rsSave) {
        rsSave.addEventListener('click', () => {
            const v = rsInput.value.trim();
            if (v === '') {
                // Champ vide → on retire l'override manuel et on revient sur CNN
                scanClearManualOverride();
            } else {
                scanSetRiskSentiment(v); // active manuel
            }
            localStorage.setItem(SCAN_LAST_UPDATE_KEY, new Date().toISOString());
            scanRefreshTimestamp();
            scanRefreshSourceLabel();
            renderScanAll();
        });
        rsInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                rsSave.click();
            }
        });
    }

    // Refresh — refetch CNN F&G et recalcule TOUT
    const refresh = document.getElementById('scan-refresh');
    if (refresh) {
        refresh.addEventListener('click', async () => {
            refresh.disabled = true;
            const originalText = refresh.textContent;
            refresh.textContent = '↻ FETCHING...';
            try {
                await scanFetchCNN();
                localStorage.setItem(SCAN_LAST_UPDATE_KEY, new Date().toISOString());
                scanRefreshTimestamp();
                scanRefreshSourceLabel();
                renderScanAll();
            } finally {
                refresh.textContent = originalText;
                refresh.disabled = false;
            }
        });
    }

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
// MODULE POS — Macro-based Contrarian Positioning
// Calcule un positionnement retail théorique basé sur les scores macro
// Principe : retail traders se trompent souvent → contrarian de la macro
// ============================================

let posSearchFilter = '';

const POS_PAIRS = [
    { base: 'EUR', quote: 'USD' },
    { base: 'GBP', quote: 'USD' },
    { base: 'USD', quote: 'JPY' },
    { base: 'USD', quote: 'CHF' },
    { base: 'AUD', quote: 'USD' },
    { base: 'NZD', quote: 'USD' },
    { base: 'USD', quote: 'CAD' },
    { base: 'EUR', quote: 'GBP' },
    { base: 'EUR', quote: 'JPY' },
    { base: 'EUR', quote: 'CHF' },
    { base: 'EUR', quote: 'AUD' },
    { base: 'EUR', quote: 'CAD' },
    { base: 'GBP', quote: 'JPY' },
    { base: 'GBP', quote: 'CHF' },
    { base: 'GBP', quote: 'AUD' },
    { base: 'AUD', quote: 'JPY' },
    { base: 'AUD', quote: 'CHF' },
    { base: 'AUD', quote: 'NZD' },
    { base: 'NZD', quote: 'JPY' },
    { base: 'CAD', quote: 'JPY' },
    { base: 'CAD', quote: 'CHF' },
    { base: 'CHF', quote: 'JPY' }
];

// Calcule le positionnement long/short pour une paire
// Spread macro de -34 à +34 → mappé à 20-80% retail short/long
function posComputePair(pair) {
    if (typeof scanGetWeightedScore !== 'function') {
        return { pair: pair.base + '/' + pair.quote, longPct: 50, shortPct: 50, spread: 0, status: 'na' };
    }

    const baseScore = scanGetWeightedScore(pair.base);
    const quoteScore = scanGetWeightedScore(pair.quote);
    const spread = baseScore - quoteScore;

    // Spread macro normalisé : on amplifie pour avoir des % significatifs
    // Spread de 0 = 50/50 retail
    // Spread de +30 (très bullish) = ~25% LONG, ~75% SHORT (contrarian extrême)
    // Spread de -30 = inverse
    const factor = 0.85; // intensité du déséquilibre
    const skew = Math.max(-30, Math.min(30, spread * factor));
    // skew positif → retail SHORT majoritaire (contre la tendance haussière)
    // skew négatif → retail LONG majoritaire (contre la baisse)
    const shortPct = Math.round(50 + skew);
    const longPct = 100 - shortPct;

    let status = 'balanced';
    if (longPct >= 70) status = 'long-extreme';
    else if (shortPct >= 70) status = 'short-extreme';
    else if (longPct >= 60) status = 'long-bias';
    else if (shortPct >= 60) status = 'short-bias';

    return {
        pair: pair.base + '/' + pair.quote,
        base: pair.base,
        quote: pair.quote,
        baseScore,
        quoteScore,
        spread,
        longPct,
        shortPct,
        status
    };
}

function renderPosTable() {
    const tbody = document.getElementById('pos-table-tbody');
    if (!tbody) return;

    if (typeof scanGetWeightedScore !== 'function') {
        tbody.innerHTML = '<tr><td colspan="6" class="pos-empty">Macro scores not available</td></tr>';
        return;
    }

    let results = POS_PAIRS.map(posComputePair);

    // Trie : par déséquilibre extrême en premier
    results.sort((a, b) => {
        const aExtreme = Math.max(a.longPct, a.shortPct);
        const bExtreme = Math.max(b.longPct, b.shortPct);
        return bExtreme - aExtreme;
    });

    // Filtre recherche
    const q = posSearchFilter.trim().toLowerCase().replace(/[\/\s]/g, '');
    if (q) {
        results = results.filter(r => {
            const pairClean = r.pair.toLowerCase().replace('/', '');
            return pairClean.includes(q) ||
                   r.base.toLowerCase().includes(q) ||
                   r.quote.toLowerCase().includes(q);
        });
    }

    // Update du compteur
    const countEl = document.getElementById('pos-search-count');
    if (countEl) {
        countEl.textContent = q
            ? `${results.length} / ${POS_PAIRS.length} pair${results.length > 1 ? 's' : ''}`
            : `${POS_PAIRS.length} pairs`;
    }

    if (results.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="pos-empty">No pair matches "${posSearchFilter}".</td></tr>`;
        return;
    }

    tbody.innerHTML = results.map(r => {
        const isContraian = r.status === 'long-extreme' || r.status === 'short-extreme';
        const rowCls = isContraian ? 'pos-row-contrarian' : '';
        const direction = r.longPct > r.shortPct ? 'LONG' : (r.shortPct > r.longPct ? 'SHORT' : 'BALANCED');
        const dirCls = r.longPct > r.shortPct ? 'pos-dir-long' : (r.shortPct > r.longPct ? 'pos-dir-short' : 'pos-dir-flat');

        // Signal contrarian
        let signal = '─ NEUTRAL', signalCls = 'pos-sig-neutral';
        if (r.status === 'long-extreme') { signal = '↘ SHORT signal'; signalCls = 'pos-sig-short'; }
        else if (r.status === 'short-extreme') { signal = '↗ LONG signal'; signalCls = 'pos-sig-long'; }
        else if (r.status === 'long-bias') { signal = '⚠ weak SHORT bias'; signalCls = 'pos-sig-short-weak'; }
        else if (r.status === 'short-bias') { signal = '⚠ weak LONG bias'; signalCls = 'pos-sig-long-weak'; }

        const spreadSign = r.spread > 0 ? '+' : '';

        return `
            <tr class="${rowCls}">
                <td class="pos-pair">${r.pair}</td>
                <td class="num pos-spread">${spreadSign}${r.spread.toFixed(1)}</td>
                <td class="pos-bars">
                    <div class="pos-bar-wrap">
                        <div class="pos-bar-long" style="width: ${r.longPct}%;">${r.longPct}%</div>
                        <div class="pos-bar-short" style="width: ${r.shortPct}%;">${r.shortPct}%</div>
                    </div>
                </td>
                <td class="num pos-long-cell">${r.longPct}%</td>
                <td class="num pos-short-cell">${r.shortPct}%</td>
                <td class="center"><span class="pos-signal ${signalCls}">${signal}</span></td>
            </tr>
        `;
    }).join('');

    // Update timestamp
    const upd = document.getElementById('pos-update');
    if (upd) {
        const now = new Date();
        const hh = String(now.getUTCHours()).padStart(2, '0');
        const mm = String(now.getUTCMinutes()).padStart(2, '0');
        upd.textContent = `auto · ${hh}:${mm} GMT`;
    }
}

// Setup événements POS (search bar)
function setupPosEvents() {
    const input = document.getElementById('pos-search-input');
    const clearBtn = document.getElementById('pos-search-clear');

    if (input) {
        input.addEventListener('input', e => {
            posSearchFilter = e.target.value;
            renderPosTable();
        });

        // ESC = clear
        input.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                input.value = '';
                posSearchFilter = '';
                renderPosTable();
                input.blur();
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (input) input.value = '';
            posSearchFilter = '';
            renderPosTable();
            if (input) input.focus();
        });
    }
}

// ============================================
// MODULE CENTRAL BANKS UNIFIED — 4 TIERS
// 1) Snapshot table G8
// 2) Rate path projections (toggle MACRO/OIS/BOTH)
// 3) Timeline meetings
// 4) Historical charts (existant)
// ============================================

// Ordre fixe pour l'affichage
const CB_ORDER = [
    { code: 'FED',  ccy: 'USD' },
    { code: 'ECB',  ccy: 'EUR' },
    { code: 'BOE',  ccy: 'GBP' },
    { code: 'BOJ',  ccy: 'JPY' },
    { code: 'BOC',  ccy: 'CAD' },
    { code: 'RBA',  ccy: 'AUD' },
    { code: 'RBNZ', ccy: 'NZD' },
    { code: 'SNB',  ccy: 'CHF' }
];

// Taux neutres (objectif long terme) par banque
const CB_NEUTRAL_RATES = {
    FED: 3.00, ECB: 2.00, BOE: 3.50, BOJ: 0.50,
    BOC: 2.75, RBA: 3.50, RBNZ: 3.50, SNB: 1.25
};

const CB_STEP_BPS = {
    FED: 25, ECB: 25, BOE: 25, BOJ: 10,
    BOC: 25, RBA: 25, RBNZ: 25, SNB: 25
};

const CB_MEETING_INTERVAL = {
    FED: 45, ECB: 45, BOE: 42, BOJ: 50,
    BOC: 45, RBA: 35, RBNZ: 55, SNB: 90
};

let cbMeetingsCache = null;
let cbYieldCurveData = null;
let cbProjMode = 'macro';  // 'macro' | 'ois' | 'both'
let cbProjChartInstances = {};

// --- Helpers ---
async function cbFetchMeetings() {
    if (cbMeetingsCache) return cbMeetingsCache;
    try {
        const r = await fetch('/api/meetings');
        if (!r.ok) return {};
        cbMeetingsCache = await r.json();
        return cbMeetingsCache;
    } catch (e) { return {}; }
}

async function cbFetchYieldCurve() {
    if (cbYieldCurveData) return cbYieldCurveData;
    try {
        const r = await fetch('/api/yield-curve');
        if (!r.ok) return null;
        const data = await r.json();
        cbYieldCurveData = data.yields || null;
        return cbYieldCurveData;
    } catch (e) { return null; }
}

function cbBiasForCcy(ccy) {
    if (typeof scanGetWeightedScore !== 'function') return 0;
    const score = scanGetWeightedScore(ccy);
    return Math.max(-1, Math.min(1, score / 12));
}

function cbBiasLabel(bias) {
    if (bias <= -0.4) return { label: '▼ CUT',  cls: 'cut' };
    if (bias >= 0.4)  return { label: '▲ HIKE', cls: 'hike' };
    return { label: '─ HOLD', cls: 'hold' };
}

function cbGenerateMeetingDates(firstMeeting, cbCode, count) {
    const dates = [];
    if (!firstMeeting) return dates;
    const interval = CB_MEETING_INTERVAL[cbCode] || 45;
    let current = new Date(firstMeeting);
    for (let i = 0; i < count; i++) {
        dates.push(new Date(current));
        current = new Date(current.getTime() + interval * 24 * 60 * 60 * 1000);
    }
    return dates;
}

// --- MACRO model : taux implicite après le Nème meeting ---
function cbMacroImpliedRate(currentRate, bias, neutralRate, stepBps, meetingIndex) {
    const step = stepBps / 100;
    const convergenceWeight = 1 - Math.exp(-(meetingIndex + 1) / 8);
    const neutralPull = (neutralRate - currentRate) * convergenceWeight * 0.3;
    const biasIntensity = 0.3 + (meetingIndex * 0.1);
    const biasMove = bias * step * biasIntensity * (meetingIndex + 1) * 0.5;
    return currentRate + neutralPull + biasMove;
}

// --- OIS model (méthode RateProbability) ---
function cbYieldAtT(currentRate, yield2Y, t_years) {
    if (yield2Y === null || yield2Y === undefined) return currentRate;
    if (t_years <= 0) return currentRate;
    const tau = 1.5;
    const weight = 1 - Math.exp(-t_years / tau);
    const calibrationAt2Y = 1 - Math.exp(-2 / tau);
    return currentRate + (yield2Y - currentRate) * Math.min(1, weight / calibrationAt2Y);
}

function cbOISImpliedRate(currentRate, yield2Y, t_years_at_meeting) {
    // Pour chaque meeting t, on retourne le forward rate entre 0 et t
    // (approximation : moyenne attendue du taux directeur sur la fenêtre)
    if (yield2Y === null || currentRate === null) return currentRate;
    return cbYieldAtT(currentRate, yield2Y, t_years_at_meeting);
}

function yearsFromNow(date) {
    return (date.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000);
}

// --- Calcul trajectoire d'une banque (renvoie un array de projections) ---
function cbComputeTrajectory(bank, mode, currentRate, yield2Y, meetingDates) {
    const bias = cbBiasForCcy(bank.ccy);
    const step = CB_STEP_BPS[bank.code] || 25;
    const neutral = CB_NEUTRAL_RATES[bank.code] || currentRate;

    return meetingDates.map((date, i) => {
        let implied;
        if (mode === 'ois') {
            const t = yearsFromNow(date);
            implied = cbOISImpliedRate(currentRate, yield2Y, t);
        } else {
            // macro
            implied = cbMacroImpliedRate(currentRate, bias, neutral, step, i);
        }
        const deltaBps = Math.round((implied - currentRate) * 100);
        return { date, implied, deltaBps };
    });
}

// ============================================
// TIER 1 — Snapshot Table
// ============================================
async function renderSnapshotTable() {
    const tbody = document.getElementById('snapshot-tbody');
    if (!tbody) return;

    if (!ratesData || !ratesData.banks || ratesData.banks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="loading">Fetching CB data...</td></tr>';
        return;
    }

    const banksById = {};
    ratesData.banks.forEach(b => banksById[b.id] = b);

    const meetings = await cbFetchMeetings();
    const yields = await cbFetchYieldCurve() || {};

    let html = '';
    CB_ORDER.forEach(bank => {
        const data = banksById[bank.code] || {};
        const rate = (data.rate !== null && data.rate !== undefined) ? data.rate : null;
        const lastChg = data.lastChange;
        const yEntry = yields[bank.ccy];
        const y2 = yEntry ? yEntry.rate : null;
        const spread = (rate !== null && y2 !== null) ? Math.round((y2 - rate) * 100) : null;

        const meet = meetings[bank.code];
        const days = daysUntil(meet);

        // Format date court
        let dateStr = '—';
        if (meet) {
            const md = new Date(meet);
            const dd = String(md.getDate()).padStart(2, '0');
            const mm = md.toLocaleString('en-US', { month: 'short' });
            dateStr = `${dd} ${mm}`;
        }

        let daysCls = 'snap-days-far';
        let daysText = '—';
        if (days !== null) {
            if (days < 0) { daysText = 'past'; daysCls = 'snap-days-far'; }
            else if (days === 0) { daysText = 'TODAY'; daysCls = 'snap-days-imminent'; }
            else if (days <= 7) { daysText = `${days}d`; daysCls = 'snap-days-imminent'; }
            else if (days <= 30) { daysText = `${days}d`; daysCls = 'snap-days-soon'; }
            else { daysText = `${days}d`; daysCls = 'snap-days-far'; }
        }

        // Macro bias
        const bias = cbBiasForCcy(bank.ccy);
        const biasLabel = cbBiasLabel(bias);

        // OIS trend
        let trendCls = 'stable', trendLabel = 'STABLE';
        if (rate !== null && y2 !== null) {
            const trendDelta = y2 - rate;
            if (trendDelta <= -0.10) { trendCls = 'easing'; trendLabel = 'EASING'; }
            else if (trendDelta >= 0.10) { trendCls = 'tightening'; trendLabel = 'TIGHTENING'; }
        }

        const chBp = fmtChangeBp(lastChg);
        const spreadBp = fmtChangeBp(spread);

        html += `
            <tr>
                <td class="snap-cb">${bank.code}</td>
                <td class="snap-ccy">${bank.ccy}</td>
                <td class="num">${rate !== null ? rate.toFixed(2) + '%' : '—'}</td>
                <td class="num ${chBp.cls}">${chBp.text}</td>
                <td class="num">${y2 !== null ? y2.toFixed(2) + '%' : '—'}</td>
                <td class="num ${spreadBp.cls}">${spreadBp.text}</td>
                <td>${dateStr}</td>
                <td class="num ${daysCls}">${daysText}</td>
                <td class="center"><span class="snap-tag ${biasLabel.cls}">${biasLabel.label}</span></td>
                <td class="center"><span class="snap-tag ${trendCls}">${trendLabel}</span></td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    const updEl = document.getElementById('snapshot-update');
    if (updEl) {
        const now = new Date();
        const hh = String(now.getUTCHours()).padStart(2, '0');
        const mm = String(now.getUTCMinutes()).padStart(2, '0');
        updEl.textContent = `last update: ${hh}:${mm} GMT`;
    }
}

// ============================================
// TIER 2 — Projection Cards (8 cartes avec mini-courbe)
// ============================================
async function renderProjectionCards() {
    const grid = document.getElementById('proj-grid');
    if (!grid) return;

    if (!ratesData || !ratesData.banks || ratesData.banks.length === 0) {
        grid.innerHTML = '<div class="loading">Fetching data...</div>';
        return;
    }

    const banksById = {};
    ratesData.banks.forEach(b => banksById[b.id] = b);

    const meetings = await cbFetchMeetings();
    const yields = (cbProjMode === 'ois' || cbProjMode === 'both') ? (await cbFetchYieldCurve() || {}) : {};

    // 1) Construit le HTML des cartes
    const cardsHtml = CB_ORDER.map(bank => {
        const data = banksById[bank.code] || {};
        const rate = (data.rate !== null && data.rate !== undefined) ? data.rate : null;

        if (rate === null) {
            return `<div class="proj-card" data-cb="${bank.code}">
                <div class="proj-card-head"><span class="proj-card-cb">${bank.code}</span><span class="proj-card-ccy">${bank.ccy}</span></div>
                <div class="proj-card-empty">No data</div>
            </div>`;
        }

        const firstMeeting = meetings[bank.code];
        const meetingDates = cbGenerateMeetingDates(firstMeeting, bank.code, 8);

        if (meetingDates.length === 0) {
            return `<div class="proj-card" data-cb="${bank.code}">
                <div class="proj-card-head"><span class="proj-card-cb">${bank.code}</span><span class="proj-card-ccy">${bank.ccy}</span></div>
                <div class="proj-card-rate">${rate.toFixed(2)}%</div>
                <div class="proj-card-empty">No meetings</div>
            </div>`;
        }

        // Trajectoires selon le mode
        let trajMacro = null, trajOIS = null;
        if (cbProjMode === 'macro' || cbProjMode === 'both') {
            trajMacro = cbComputeTrajectory(bank, 'macro', rate, null, meetingDates);
        }
        if (cbProjMode === 'ois' || cbProjMode === 'both') {
            const yEntry = yields[bank.ccy];
            const y2 = yEntry ? yEntry.rate : null;
            if (y2 !== null) {
                trajOIS = cbComputeTrajectory(bank, 'ois', rate, y2, meetingDates);
            }
        }

        // Delta 12 mois (dernier point)
        const primaryTraj = trajOIS || trajMacro;
        const finalDelta = primaryTraj && primaryTraj.length > 0 ? primaryTraj[primaryTraj.length - 1].deltaBps : 0;
        const deltaCls = finalDelta < -10 ? 'cut' : finalDelta > 10 ? 'hike' : 'flat';
        const deltaSign = finalDelta > 0 ? '+' : '';

        return `
            <div class="proj-card" data-cb="${bank.code}">
                <div class="proj-card-head">
                    <span class="proj-card-cb">${bank.code}</span>
                    <span class="proj-card-ccy">${bank.ccy}</span>
                </div>
                <div class="proj-card-rate">${rate.toFixed(2)}%</div>
                <div class="proj-card-chart"><canvas id="proj-chart-${bank.code}"></canvas></div>
                <div class="proj-card-footer">
                    <span class="proj-card-delta ${deltaCls}">${deltaSign}${finalDelta} bps</span>
                    <span class="proj-card-horizon">12mo</span>
                </div>
            </div>
        `;
    }).join('');

    grid.innerHTML = cardsHtml;

    // 2) Dessine les charts dans chaque canvas
    CB_ORDER.forEach(bank => {
        const data = banksById[bank.code] || {};
        const rate = (data.rate !== null && data.rate !== undefined) ? data.rate : null;
        if (rate === null) return;

        const firstMeeting = meetings[bank.code];
        const meetingDates = cbGenerateMeetingDates(firstMeeting, bank.code, 8);
        if (meetingDates.length === 0) return;

        const canvas = document.getElementById(`proj-chart-${bank.code}`);
        if (!canvas) return;

        if (cbProjChartInstances[bank.code]) {
            cbProjChartInstances[bank.code].destroy();
        }

        const labels = ['Now', ...meetingDates.map(d => {
            return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-US', { month: 'short' })}`;
        })];

        const datasets = [];

        if (cbProjMode === 'macro' || cbProjMode === 'both') {
            const traj = cbComputeTrajectory(bank, 'macro', rate, null, meetingDates);
            datasets.push({
                label: 'Macro',
                data: [rate, ...traj.map(p => p.implied)],
                borderColor: cbProjMode === 'both' ? '#ff8c00' : '#ff8c00',
                backgroundColor: 'rgba(255, 140, 0, 0.1)',
                borderWidth: 1.4,
                fill: cbProjMode !== 'both',
                tension: 0.25,
                pointRadius: 0,
                pointHoverRadius: 3
            });
        }

        if (cbProjMode === 'ois' || cbProjMode === 'both') {
            const yEntry = yields[bank.ccy];
            const y2 = yEntry ? yEntry.rate : null;
            if (y2 !== null) {
                const traj = cbComputeTrajectory(bank, 'ois', rate, y2, meetingDates);
                datasets.push({
                    label: 'OIS',
                    data: [rate, ...traj.map(p => p.implied)],
                    borderColor: cbProjMode === 'both' ? '#fbbf24' : '#ff8c00',
                    backgroundColor: cbProjMode === 'both' ? 'transparent' : 'rgba(255, 140, 0, 0.1)',
                    borderWidth: 1.4,
                    borderDash: cbProjMode === 'both' ? [3, 3] : [],
                    fill: cbProjMode !== 'both',
                    tension: 0.25,
                    pointRadius: 0,
                    pointHoverRadius: 3
                });
            }
        }

        if (datasets.length === 0) return;

        cbProjChartInstances[bank.code] = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#0a0a0a',
                        borderColor: '#ff8c00',
                        borderWidth: 1,
                        titleColor: '#ff8c00',
                        bodyColor: '#ddd',
                        padding: 6,
                        callbacks: { label: c => `${c.dataset.label || ''}: ${c.parsed.y.toFixed(2)}%` }
                    }
                },
                scales: {
                    x: { display: false },
                    y: { display: false }
                }
            }
        });
    });

    // 3) Branche le click → modal
    grid.querySelectorAll('.proj-card').forEach(card => {
        card.addEventListener('click', () => openProjDetail(card.dataset.cb));
    });
}

// ============================================
// MODAL — Détail d'une projection
// ============================================
async function openProjDetail(cbCode) {
    const bank = CB_ORDER.find(b => b.code === cbCode);
    if (!bank) return;

    const banksById = {};
    ratesData.banks.forEach(b => banksById[b.id] = b);
    const data = banksById[bank.code] || {};
    const rate = (data.rate !== null && data.rate !== undefined) ? data.rate : null;
    if (rate === null) return;

    const meetings = await cbFetchMeetings();
    const yields = await cbFetchYieldCurve() || {};
    const firstMeeting = meetings[bank.code];
    const meetingDates = cbGenerateMeetingDates(firstMeeting, bank.code, 6);

    const yEntry = yields[bank.ccy];
    const y2 = yEntry ? yEntry.rate : null;

    const trajMacro = cbComputeTrajectory(bank, 'macro', rate, null, meetingDates);
    const trajOIS = (y2 !== null) ? cbComputeTrajectory(bank, 'ois', rate, y2, meetingDates) : null;

    document.getElementById('proj-detail-title').textContent = `${bank.code} (${bank.ccy}) — PROJECTION DETAIL`;

    const step = CB_STEP_BPS[bank.code] || 25;

    function probaForRow(traj, i) {
        if (!traj || !traj[i]) return null;
        const prevDelta = i === 0 ? 0 : traj[i - 1].deltaBps;
        const inc = traj[i].deltaBps - prevDelta;
        return Math.min(100, Math.abs(inc) / step * 100);
    }

    let macroRows = '';
    let oisRows = '';

    if (trajMacro && trajMacro.length > 0) {
        const maxAbs = Math.max(...trajMacro.map(p => Math.abs(p.deltaBps)), 50);
        macroRows = trajMacro.map((p, i) => {
            const dd = String(p.date.getDate()).padStart(2, '0');
            const mm = p.date.toLocaleString('en-US', { month: 'short' });
            const dy = p.date.getFullYear();
            const deltaCls = p.deltaBps < -5 ? 'cut' : p.deltaBps > 5 ? 'hike' : 'flat';
            const deltaSign = p.deltaBps > 0 ? '+' : '';
            const barPct = Math.min(50, Math.abs(p.deltaBps) / maxAbs * 50);
            let barHtml = '<div class="pdr-bar-center"></div>';
            if (p.deltaBps < -5) barHtml += `<div class="pdr-bar-fill cut" style="width:${barPct}%;"></div>`;
            else if (p.deltaBps > 5) barHtml += `<div class="pdr-bar-fill hike" style="width:${barPct}%;"></div>`;
            const proba = Math.round(probaForRow(trajMacro, i));
            const probaCls = p.deltaBps < -5 ? 'cut' : p.deltaBps > 5 ? 'hike' : 'hold';
            return `<div class="proj-detail-row">
                <span class="pdr-date">${dd} ${mm} ${dy}</span>
                <div class="pdr-bar">${barHtml}</div>
                <span class="pdr-rate">${p.implied.toFixed(2)}%</span>
                <span class="pdr-delta ${deltaCls}">${deltaSign}${p.deltaBps}</span>
                <span class="pdr-proba ${probaCls}">${proba}%</span>
            </div>`;
        }).join('');
    }

    if (trajOIS && trajOIS.length > 0) {
        const maxAbs = Math.max(...trajOIS.map(p => Math.abs(p.deltaBps)), 50);
        oisRows = trajOIS.map((p, i) => {
            const dd = String(p.date.getDate()).padStart(2, '0');
            const mm = p.date.toLocaleString('en-US', { month: 'short' });
            const dy = p.date.getFullYear();
            const deltaCls = p.deltaBps < -5 ? 'cut' : p.deltaBps > 5 ? 'hike' : 'flat';
            const deltaSign = p.deltaBps > 0 ? '+' : '';
            const barPct = Math.min(50, Math.abs(p.deltaBps) / maxAbs * 50);
            let barHtml = '<div class="pdr-bar-center"></div>';
            if (p.deltaBps < -5) barHtml += `<div class="pdr-bar-fill cut" style="width:${barPct}%;"></div>`;
            else if (p.deltaBps > 5) barHtml += `<div class="pdr-bar-fill hike" style="width:${barPct}%;"></div>`;
            const proba = Math.round(probaForRow(trajOIS, i));
            const probaCls = p.deltaBps < -5 ? 'cut' : p.deltaBps > 5 ? 'hike' : 'hold';
            return `<div class="proj-detail-row">
                <span class="pdr-date">${dd} ${mm} ${dy}</span>
                <div class="pdr-bar">${barHtml}</div>
                <span class="pdr-rate">${p.implied.toFixed(2)}%</span>
                <span class="pdr-delta ${deltaCls}">${deltaSign}${p.deltaBps}</span>
                <span class="pdr-proba ${probaCls}">${proba}%</span>
            </div>`;
        }).join('');
    }

    const bias = cbBiasForCcy(bank.ccy);
    const biasLabel = cbBiasLabel(bias);

    const header = `<div class="proj-detail-row proj-detail-header">
        <span>DATE</span><span>VISUAL</span><span style="text-align:right;">RATE</span><span style="text-align:right;">Δ BPS</span><span style="text-align:right;">PROBA</span>
    </div>`;

    const body = `
        <div class="proj-detail-section">
            <div class="proj-detail-section-title">RATE PATH — INTERACTIVE CHART</div>
            <div class="proj-detail-chart-wrap">
                <canvas id="proj-detail-chart"></canvas>
            </div>
            <div class="proj-detail-chart-legend">
                <span class="pdcl-item"><span class="pdcl-dot macro"></span>MACRO (your scoring)</span>
                ${trajOIS ? '<span class="pdcl-item"><span class="pdcl-dot ois"></span>OIS (market pricing)</span>' : ''}
            </div>
        </div>

        <div class="proj-detail-section">
            <div class="proj-detail-section-title">CURRENT STATE</div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
                <div><span style="color: var(--text-secondary); font-size: 9px; display: block;">CURRENT RATE</span><span style="font-size: 18px; font-weight: 500;">${rate.toFixed(2)}%</span></div>
                <div><span style="color: var(--text-secondary); font-size: 9px; display: block;">YIELD 2Y</span><span style="font-size: 18px; font-weight: 500;">${y2 !== null ? y2.toFixed(2) + '%' : '—'}</span></div>
                <div><span style="color: var(--text-secondary); font-size: 9px; display: block;">NEUTRAL TARGET</span><span style="font-size: 18px; font-weight: 500;">${(CB_NEUTRAL_RATES[bank.code] || 0).toFixed(2)}%</span></div>
                <div><span style="color: var(--text-secondary); font-size: 9px; display: block;">MACRO BIAS</span><span class="snap-tag ${biasLabel.cls}" style="font-size: 11px;">${biasLabel.label}</span></div>
            </div>
        </div>

        <div class="proj-detail-section">
            <div class="proj-detail-section-title">MACRO-IMPLIED PATH (your scoring)</div>
            ${header}
            ${macroRows || '<div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 11px;">No macro data</div>'}
        </div>

        <div class="proj-detail-section">
            <div class="proj-detail-section-title">OIS-IMPLIED PATH (market pricing)</div>
            ${oisRows ? header + oisRows : '<div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 11px;">No yield 2Y data for ' + bank.ccy + '</div>'}
        </div>

        <div class="proj-detail-section">
            <div class="proj-detail-section-title">METHODOLOGY</div>
            <p style="color: var(--text-secondary); font-size: 10.5px; line-height: 1.7; margin: 0;">
                <b style="color: var(--accent);">MACRO</b>: taux implicite = taux actuel + biais directionnel × intensité croissante × step (${step}bps).
                Le biais vient de votre score pondéré MACRO normalisé entre -1 et +1.<br><br>
                <b style="color: var(--accent);">OIS</b>: méthode RateProbability — bootstrap de la courbe yields (2Y proxy FRED) → forward rates entre meetings.
                Probabilité simplifiée = |Δᵢ − Δᵢ₋₁| / ${step}bps.
            </p>
        </div>
    `;

    document.getElementById('proj-detail-body').innerHTML = body;
    document.getElementById('proj-detail-modal').classList.add('open');

    // Render le grand chart APRES que le modal soit visible (sinon canvas a width=0)
    setTimeout(() => {
        const canvas = document.getElementById('proj-detail-chart');
        if (!canvas) return;

        // Construire les labels (dates des 6 meetings)
        const labels = ['Now', ...meetingDates.map(d => {
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = d.toLocaleString('en-US', { month: 'short' });
            const yy = String(d.getFullYear()).slice(-2);
            return `${dd} ${mm} ${yy}`;
        })];

        const datasets = [];

        // Dataset MACRO (toujours présent)
        if (trajMacro && trajMacro.length > 0) {
            datasets.push({
                label: 'MACRO',
                data: [rate, ...trajMacro.map(p => p.implied)],
                borderColor: '#ff8c00',
                backgroundColor: 'rgba(255, 140, 0, 0.08)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#ff8c00',
                pointBorderColor: '#0a0a0a',
                pointBorderWidth: 2
            });
        }

        // Dataset OIS (si dispo)
        if (trajOIS && trajOIS.length > 0) {
            datasets.push({
                label: 'OIS',
                data: [rate, ...trajOIS.map(p => p.implied)],
                borderColor: '#fbbf24',
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [4, 4],
                fill: false,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#fbbf24',
                pointBorderColor: '#0a0a0a',
                pointBorderWidth: 2
            });
        }

        new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels, datasets },
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
                        bodyColor: '#fff',
                        padding: 10,
                        titleFont: { family: 'monospace', size: 11, weight: 'bold' },
                        bodyFont: { family: 'monospace', size: 11 },
                        callbacks: {
                            label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(2)}%`,
                            afterBody: (items) => {
                                if (items.length === 0 || items[0].dataIndex === 0) return '';
                                const idx = items[0].dataIndex - 1;
                                const lines = [];
                                if (trajMacro && trajMacro[idx]) {
                                    const d = trajMacro[idx].deltaBps;
                                    const sign = d > 0 ? '+' : '';
                                    lines.push(`  MACRO Δ: ${sign}${d} bps`);
                                }
                                if (trajOIS && trajOIS[idx]) {
                                    const d = trajOIS[idx].deltaBps;
                                    const sign = d > 0 ? '+' : '';
                                    lines.push(`  OIS Δ:   ${sign}${d} bps`);
                                }
                                return lines;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: '#1a1a1a', drawBorder: false },
                        ticks: {
                            color: '#888',
                            font: { family: 'monospace', size: 10 },
                            maxRotation: 0
                        }
                    },
                    y: {
                        grid: { color: '#1a1a1a', drawBorder: false },
                        ticks: {
                            color: '#888',
                            font: { family: 'monospace', size: 10 },
                            callback: v => v.toFixed(2) + '%'
                        }
                    }
                }
            }
        });
    }, 50);
}

function closeProjDetail() {
    document.getElementById('proj-detail-modal').classList.remove('open');
}

// ============================================
// TIER 3 — Timeline horizontale des meetings
// ============================================
async function renderCBTimeline() {
    const wrap = document.getElementById('cb-timeline-wrap');
    if (!wrap) return;

    const meetings = await cbFetchMeetings();
    const banksById = {};
    if (ratesData && ratesData.banks) ratesData.banks.forEach(b => banksById[b.id] = b);

    // Collecte tous les meetings avec leur date + days
    const points = CB_ORDER.map(bank => {
        const meet = meetings[bank.code];
        const days = daysUntil(meet);
        if (!meet || days === null || days < 0) return null;
        const md = new Date(meet);
        const dd = String(md.getDate()).padStart(2, '0');
        const mm = md.toLocaleString('en-US', { month: 'short' });
        return {
            code: bank.code,
            ccy: bank.ccy,
            date: meet,
            days,
            dateStr: `${dd} ${mm}`
        };
    }).filter(p => p !== null);

    if (points.length === 0) {
        wrap.innerHTML = '<div class="loading">No upcoming meetings.</div>';
        return;
    }

    points.sort((a, b) => a.days - b.days);

    // Position relative : on étale entre 5% et 95% basée sur le nombre de jours
    const maxDays = Math.max(...points.map(p => p.days), 60);

    const pointsHtml = points.map(p => {
        const left = 5 + (p.days / maxDays) * 90;
        let cls = 'far';
        if (p.days <= 7) cls = 'imminent';
        else if (p.days <= 30) cls = 'soon';
        return `
            <div class="cb-timeline-point" style="left: ${left}%;">
                <div class="cb-tp-dot ${cls}"></div>
                <div class="cb-tp-label ${cls}">${p.code}</div>
                <div class="cb-tp-date">${p.dateStr} · ${p.days}d</div>
            </div>
        `;
    }).join('');

    wrap.innerHTML = `
        <div class="cb-timeline">
            <div class="cb-timeline-axis"></div>
            ${pointsHtml}
        </div>
    `;
}

// ============================================
// SETUP EVENTS CB UNIFIED
// ============================================
function setupCBEvents() {
    // Toggle MACRO / OIS / BOTH
    document.querySelectorAll('.proj-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.proj-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            cbProjMode = btn.dataset.mode;
            renderProjectionCards();
        });
    });

    // Modal close
    const closeBtn = document.getElementById('proj-detail-close');
    const modal = document.getElementById('proj-detail-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeProjDetail);
    if (modal) {
        modal.addEventListener('click', e => {
            if (e.target.id === 'proj-detail-modal') closeProjDetail();
        });
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const m = document.getElementById('proj-detail-modal');
            if (m && m.classList.contains('open')) closeProjDetail();
        }
    });
}

// Render all CB tiers
function renderCBAll() {
    renderSnapshotTable();
    renderProjectionCards();
    renderCBTimeline();
    renderAllRateCharts();
}

// ============================================
// MODULE HOME — Dashboard d'accueil dynamique
// Connecte les données en temps réel depuis les autres pages
// ============================================

const HOME_PAIRS = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD',
    'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'CHF/JPY',
    'EUR/CHF', 'EUR/AUD', 'EUR/NZD', 'EUR/CAD',
    'GBP/CHF', 'GBP/AUD', 'GBP/NZD', 'GBP/CAD',
    'AUD/CHF', 'AUD/NZD', 'AUD/CAD',
    'NZD/CHF', 'NZD/CAD', 'CAD/CHF', 'CAD/JPY', 'NZD/JPY'
];

// Cache des prix FX (alimenté par /api/rates si dispo)
let homeFxPrices = {};

// --- HOME · G10 PRICES (28 paires) ---
function renderHomePrices() {
    const grid = document.getElementById('home-prices-grid');
    if (!grid) return;

    // On essaie d'utiliser le ticker live s'il existe
    // Si pas de prix → on affiche un placeholder
    const hasData = Object.keys(homeFxPrices).length > 0;

    if (!hasData) {
        grid.innerHTML = '<div class="home-prices-loading">Waiting for live FX prices...</div>';
        return;
    }

    grid.innerHTML = HOME_PAIRS.map(pair => {
        const p = homeFxPrices[pair];
        if (!p) {
            return `<div class="home-price-row">
                <span class="hp-pair">${pair}</span>
                <span class="hp-val">—</span>
                <span class="hp-chg flat">—</span>
            </div>`;
        }
        const chgCls = p.changePct > 0 ? 'up' : p.changePct < 0 ? 'down' : 'flat';
        const sign = p.changePct > 0 ? '+' : '';
        return `<div class="home-price-row">
            <span class="hp-pair">${pair}</span>
            <span class="hp-val">${p.price}</span>
            <span class="hp-chg ${chgCls}">${sign}${p.changePct.toFixed(2)}%</span>
        </div>`;
    }).join('');
}

// Récupère les prix FX depuis le ticker (la fonction tickerData est globale)
async function homeFetchFxPrices() {
    try {
        // Essai 1 : si l'app a déjà un cache de ticker (variable globale tickerCache)
        if (typeof tickerCache !== 'undefined' && tickerCache && Array.isArray(tickerCache)) {
            tickerCache.forEach(t => {
                if (t.pair && t.price !== undefined) {
                    homeFxPrices[t.pair] = {
                        price: typeof t.price === 'string' ? t.price : t.price.toFixed(t.pair.includes('JPY') ? 2 : 4),
                        changePct: typeof t.changePct === 'number' ? t.changePct : 0
                    };
                }
            });
            return;
        }

        // Essai 2 : fetch direct /api/rates pour obtenir les prix FX
        // Note: /api/rates contient les taux directeurs, pas les prix FX
        // On va plutôt utiliser /api/yields ou inférer depuis ticker DOM
        const tickerEl = document.querySelector('.ticker-content, .ticker-track');
        if (tickerEl) {
            const items = tickerEl.querySelectorAll('.ticker-item, .ticker-pair');
            items.forEach(item => {
                const txt = item.textContent || '';
                // Format type: "EUR/USD 1.0942 +0.47%"
                const m = txt.match(/([A-Z]{3}\/[A-Z]{3})\s*[•\-]?\s*([\d.]+)\s*([+\-]?[\d.]+)%/);
                if (m) {
                    homeFxPrices[m[1]] = {
                        price: m[2],
                        changePct: parseFloat(m[3])
                    };
                }
            });
        }
    } catch (e) {
        console.warn('Home FX fetch failed:', e);
    }
}

// --- HOME · CCY STRENGTH (depuis SCORE pondéré MACRO) ---
function renderHomeStrength() {
    const list = document.getElementById('home-strength-list');
    if (!list) return;

    if (typeof scanGetWeightedScore !== 'function') {
        list.innerHTML = '<div class="home-strength-loading">Macro score unavailable</div>';
        return;
    }

    const scores = CCYS.map(ccy => ({
        ccy,
        score: scanGetWeightedScore(ccy)
    })).sort((a, b) => b.score - a.score);

    // Trouver l'amplitude max pour normaliser les barres
    const maxAbs = Math.max(...scores.map(s => Math.abs(s.score)), 1);

    list.innerHTML = scores.map(s => {
        const cls = s.score > 1 ? 'up' : s.score < -1 ? 'down' : 'flat';
        const barColor = s.score > 1 ? '#4ade80' : s.score < -1 ? '#f87171' : '#6b6b6b';
        const widthPct = Math.min(100, (Math.abs(s.score) / maxAbs) * 100);
        const sign = s.score > 0 ? '+' : '';
        return `<div class="home-strength-row">
            <span class="hs-ccy">${s.ccy}</span>
            <div class="hs-bar-bg"><div class="hs-bar-fill" style="width:${widthPct}%;background:${barColor};"></div></div>
            <span class="hs-score ${cls}">${sign}${s.score.toFixed(1)}</span>
        </div>`;
    }).join('');
}

// --- HOME · CENTRAL BANKS (depuis ratesData + meetings) ---
async function renderHomeCB() {
    const tbody = document.getElementById('home-cb-tbody');
    if (!tbody) return;

    if (!ratesData || !ratesData.banks || ratesData.banks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="home-cb-loading">Fetching CB data...</td></tr>';
        return;
    }

    const banksById = {};
    ratesData.banks.forEach(b => banksById[b.id] = b);

    const meetings = await cbFetchMeetings();

    tbody.innerHTML = CB_ORDER.map(bank => {
        const data = banksById[bank.code] || {};
        const rate = (data.rate !== null && data.rate !== undefined) ? data.rate : null;
        const meet = meetings[bank.code];

        let dateStr = '—';
        let dateCls = 'hcb-date';
        if (meet) {
            const md = new Date(meet);
            const dd = String(md.getDate()).padStart(2, '0');
            const mm = md.toLocaleString('en-US', { month: 'short' }).toLowerCase();
            dateStr = `${dd} ${mm}`;
            const days = daysUntil(meet);
            if (days !== null) {
                if (days <= 7) dateCls = 'hcb-date imminent';
                else if (days <= 30) dateCls = 'hcb-date soon';
            }
        }

        return `<tr>
            <td class="hcb-bank">${bank.code}</td>
            <td class="hcb-rate">${rate !== null ? rate.toFixed(2) + '%' : '—'}</td>
            <td class="${dateCls}">${dateStr}</td>
        </tr>`;
    }).join('');
}

// --- HOME · TOP EVENTS (depuis /api/calendar) ---
async function renderHomeEvents() {
    const list = document.getElementById('home-events-list');
    if (!list) return;

    try {
        const r = await fetch('/api/calendar');
        if (!r.ok) {
            list.innerHTML = '<div class="home-events-loading">Calendar unavailable</div>';
            return;
        }
        const data = await r.json();
        const events = Array.isArray(data) ? data : (data.events || data.calendar || []);

        if (events.length === 0) {
            list.innerHTML = '<div class="home-events-loading">No events today</div>';
            return;
        }

        // On garde les 5 prochains (en filtrant ceux passés)
        const now = new Date();
        const todayEvents = events
            .filter(ev => {
                const dt = new Date(ev.time || ev.date || ev.datetime);
                if (isNaN(dt)) return false;
                return dt > now;
            })
            .slice(0, 5);

        if (todayEvents.length === 0) {
            // Fallback : les 5 premiers tout court
            todayEvents.push(...events.slice(0, 5));
        }

        list.innerHTML = todayEvents.map(ev => {
            const dt = new Date(ev.time || ev.date || ev.datetime);
            let timeStr = '--:--';
            if (!isNaN(dt)) {
                const hh = String(dt.getUTCHours()).padStart(2, '0');
                const mm = String(dt.getUTCMinutes()).padStart(2, '0');
                timeStr = `${hh}:${mm}`;
            }
            const impact = (ev.impact || ev.importance || 'medium').toLowerCase();
            let impCls = 'warn', impLabel = '● MED';
            if (impact.includes('high') || impact === '3') { impCls = 'down'; impLabel = '● HIGH'; }
            else if (impact.includes('low') || impact === '1') { impCls = 'flat'; impLabel = '● LOW'; }

            const ccy = ev.currency || ev.country || '';
            const name = ev.event || ev.name || ev.title || 'Event';

            return `<div class="home-event-row">
                <div class="hev-meta">
                    <span class="hev-imp ${impCls}">${impLabel}</span>
                    <span class="hev-time">${timeStr}</span>
                </div>
                <div class="hev-name">${ccy ? ccy + ' · ' : ''}${name}</div>
            </div>`;
        }).join('');
    } catch (e) {
        list.innerHTML = '<div class="home-events-loading">Failed to load events</div>';
    }
}

// --- HOME · NEWS HEADLINES (depuis /api/roro qui agrège FinancialJuice) ---
async function renderHomeNews() {
    const list = document.getElementById('home-news-list');
    if (!list) return;

    try {
        const r = await fetch('/api/roro');
        if (!r.ok) {
            list.innerHTML = '<div class="home-news-loading">News unavailable</div>';
            return;
        }
        const data = await r.json();
        const news = data.news || data.headlines || data.items || (Array.isArray(data) ? data : []);

        if (news.length === 0) {
            list.innerHTML = '<div class="home-news-loading">No headlines</div>';
            return;
        }

        const items = news.slice(0, 8);
        list.innerHTML = items.map(n => {
            const dt = new Date(n.time || n.date || n.published || n.publishedAt || n.timestamp);
            let timeStr = '--:--';
            if (!isNaN(dt)) {
                const hh = String(dt.getUTCHours()).padStart(2, '0');
                const mm = String(dt.getUTCMinutes()).padStart(2, '0');
                timeStr = `${hh}:${mm}`;
            }
            const text = n.title || n.headline || n.text || n.body || '';
            return `<div class="home-news-row">
                <span class="hn-time">${timeStr}</span>
                <span class="hn-text">${text}</span>
            </div>`;
        }).join('');
    } catch (e) {
        list.innerHTML = '<div class="home-news-loading">Failed to load news</div>';
    }
}

// Render tout
async function renderHomeAll() {
    await homeFetchFxPrices();
    renderHomePrices();
    renderHomeStrength();
    await renderHomeCB();
    renderHomeEvents();
    renderHomeNews();
}

// ============================================
// MODULE WIRP — Meeting Probabilities (Tier 5 CB)
// Source : /api/wirp (estimé depuis yield curve FRED)
// ============================================

const WIRP_BANKS = ['FED', 'ECB', 'BOE', 'BOJ', 'BOC', 'RBA', 'RBNZ', 'SNB'];
const WIRP_CCY = { FED: 'USD', ECB: 'EUR', BOE: 'GBP', BOJ: 'JPY', BOC: 'CAD', RBA: 'AUD', RBNZ: 'NZD', SNB: 'CHF' };

let wirpData = null;

async function fetchWirpData() {
    try {
        const r = await fetch('/api/wirp');
        if (!r.ok) {
            wirpData = { error: 'API returned ' + r.status };
            return;
        }
        wirpData = await r.json();
    } catch (e) {
        wirpData = { error: e.message || 'Fetch failed' };
    }
}

function renderWirp() {
    const container = document.getElementById('wirp-container');
    if (!container) return;

    if (!wirpData) {
        container.innerHTML = '<div class="wirp-loading">Loading meeting probabilities...</div>';
        return;
    }
    if (wirpData.error) {
        container.innerHTML = `<div class="wirp-error">⚠ Failed to load WIRP data: ${wirpData.error}</div>`;
        return;
    }

    let html = '';
    for (const bankCode of WIRP_BANKS) {
        const data = wirpData.banks[bankCode];
        if (!data || data.error) {
            html += `<div class="wirp-card wirp-card-error">
                <div class="wirp-card-header">
                    <div class="wirp-card-title">${bankCode} <span class="ccy">${WIRP_CCY[bankCode]}</span></div>
                </div>
                <div class="wirp-error-msg">${data ? data.error : 'No data'}</div>
            </div>`;
            continue;
        }

        const cumulCls = data.totalImpliedBps > 5 ? 'up' : data.totalImpliedBps < -5 ? 'down' : 'flat';
        const cumulSign = data.totalImpliedBps > 0 ? '+' : '';

        html += `<div class="wirp-card">
            <div class="wirp-card-header">
                <div class="wirp-card-title">${bankCode} <span class="ccy">${data.ccy} · ${data.currentRate.toFixed(2)}%</span></div>
                <div class="wirp-card-meta">2Y yield: <b>${data.yield2y.toFixed(2)}%</b> · Cumul implied 6m: <b class="${cumulCls}">${cumulSign}${data.totalImpliedBps} bps</b></div>
            </div>
            <div class="wirp-grid">
                ${data.meetings.map(m => renderWirpMeeting(m)).join('')}
            </div>
        </div>`;
    }

    container.innerHTML = html;
}

function renderWirpMeeting(m) {
    const d = new Date(m.date);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const dateStr = `${dd} ${mm}`;

    let countdownCls = '';
    if (m.daysUntil !== null) {
        if (m.daysUntil <= 30) countdownCls = 'imminent';
        else if (m.daysUntil <= 90) countdownCls = 'soon';
    }
    const countdown = m.daysUntil !== null ? `${m.daysUntil}d` : '—';

    const impliedCls = m.impliedBps > 1 ? 'up' : m.impliedBps < -1 ? 'down' : 'flat';
    const impliedSign = m.impliedBps > 0 ? '+' : '';

    return `<div class="wirp-meeting">
        <div class="wirp-date">${dateStr}</div>
        <div class="wirp-countdown ${countdownCls}">${countdown}</div>
        <div class="wirp-bar">
            ${m.pHike > 2 ? `<div class="wirp-segment wirp-seg-hike" style="height:${m.pHike}%">${m.pHike}%</div>` : ''}
            <div class="wirp-segment wirp-seg-hold" style="height:${m.pHold}%">${m.pHold}%</div>
            ${m.pCut > 2 ? `<div class="wirp-segment wirp-seg-cut" style="height:${m.pCut}%">${m.pCut}%</div>` : ''}
        </div>
        <div class="wirp-implied"><span class="${impliedCls}">${impliedSign}${m.impliedBps} bps</span></div>
    </div>`;
}

async function renderWirpAll() {
    if (!wirpData) await fetchWirpData();
    renderWirp();
}

// ============================================
// MODULE YIELDS — Yield Curve (nouvelle page)
// Source : /api/yields-grid (FRED)
// ============================================

// Symboles TradingView par devise et maturité (pour les liens externes)
const YIELDS_TV_SYMBOLS = {
    USD: { '3M': 'TVC-US03MY', '2Y': 'TVC-US02Y', '5Y': 'TVC-US05Y', '10Y': 'TVC-US10Y', '30Y': 'TVC-US30Y' },
    EUR: { '3M': 'TVC-DE03MY', '2Y': 'TVC-DE02Y', '5Y': 'TVC-DE05Y', '10Y': 'TVC-DE10Y', '30Y': 'TVC-DE30Y' },
    GBP: { '3M': 'TVC-GB03MY', '2Y': 'TVC-GB02Y', '5Y': 'TVC-GB05Y', '10Y': 'TVC-GB10Y', '30Y': 'TVC-GB30Y' },
    JPY: { '3M': 'TVC-JP03MY', '2Y': 'TVC-JP02Y', '5Y': 'TVC-JP05Y', '10Y': 'TVC-JP10Y', '30Y': 'TVC-JP30Y' },
    CAD: { '3M': 'TVC-CA03MY', '2Y': 'TVC-CA02Y', '5Y': 'TVC-CA05Y', '10Y': 'TVC-CA10Y', '30Y': 'TVC-CA30Y' },
    AUD: { '3M': 'TVC-AU03MY', '2Y': 'TVC-AU02Y', '5Y': 'TVC-AU05Y', '10Y': 'TVC-AU10Y', '30Y': 'TVC-AU30Y' },
    NZD: { '3M': 'TVC-NZ03MY', '2Y': 'TVC-NZ02Y', '5Y': 'TVC-NZ05Y', '10Y': 'TVC-NZ10Y', '30Y': 'TVC-NZ30Y' },
    CHF: { '3M': 'TVC-CH03MY', '2Y': 'TVC-CH02Y', '5Y': 'TVC-CH05Y', '10Y': 'TVC-CH10Y', '30Y': 'TVC-CH30Y' }
};

let yieldsCurveData = {};
let yieldsCurrentCcy = 'USD';
let yieldsChartInstance = null;

// Fetch principal : grille FRED (USD complet + 3M/10Y partiel pour les autres)
async function fetchYieldsData() {
    try {
        const r = await fetch('/api/yields-grid');
        if (!r.ok) return;
        yieldsCurveData = await r.json();
    } catch (e) {
        console.warn('Yields fetch failed:', e);
    }

    // Fallback ECB pour EUR : courbe complète depuis ECB SDMX
    try {
        const r = await fetch('/api/yields-ecb');
        if (r.ok) {
            const ecb = await r.json();
            if (ecb && ecb.yields && yieldsCurveData.currencies) {
                const merged = { yields: {}, spreads: ecb.spreads || {}, shape: ecb.shape || 'unknown' };
                for (const tenor of ['3M', '2Y', '5Y', '10Y', '30Y']) {
                    const ecbY = ecb.yields[tenor];
                    if (ecbY && ecbY.available && ecbY.current !== null) {
                        merged.yields[tenor] = ecbY;
                    } else if (yieldsCurveData.currencies.EUR && yieldsCurveData.currencies.EUR.yields[tenor]) {
                        merged.yields[tenor] = yieldsCurveData.currencies.EUR.yields[tenor];
                    } else {
                        merged.yields[tenor] = { current: null, d30: null, d90: null, available: false };
                    }
                }
                yieldsCurveData.currencies.EUR = merged;
            }
        }
    } catch (e) {
        console.warn('ECB yields fetch failed:', e);
    }
}

// Render principal : 5 cards SVG + chart + table + spreads
function renderYieldsAll() {
    renderYieldsTvGrid();
    renderYieldsTable();
    renderYieldsChart();
    renderYieldsSpreads();

    // Update titre chart avec source
    const t = document.getElementById('yields-chart-title');
    if (t) {
        const sourceLabel = yieldsCurrentCcy === 'EUR' ? 'ECB OFFICIAL' : 'FRED';
        t.textContent = `${yieldsCurrentCcy} CURVE — TODAY VS 30D VS 90D · ${sourceLabel}`;
    }
}

// Génère une mini SVG curve orange pour une card
// Si on a la vraie data, on la reflète. Sinon courbe générique stylisée.
function generateMiniCurveSvg(yieldValue, deltaD30) {
    // Direction de la courbe selon le delta
    let pathData;
    if (deltaD30 !== null && deltaD30 !== undefined) {
        if (deltaD30 > 5) {
            // Tendance haussière
            pathData = 'M 8 60 Q 30 55 50 45 T 90 25 T 142 12';
        } else if (deltaD30 < -5) {
            // Tendance baissière
            pathData = 'M 8 20 Q 30 25 50 35 T 90 50 T 142 60';
        } else {
            // Stable
            pathData = 'M 8 40 Q 30 38 50 36 T 90 34 T 142 32';
        }
    } else {
        // Pas de data : courbe générique normale
        pathData = 'M 8 55 Q 30 45 50 40 T 90 30 T 142 18';
    }

    return `<svg viewBox="0 0 150 75" xmlns="http://www.w3.org/2000/svg" class="yields-card-svg">
        <defs>
            <linearGradient id="grad-fill" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#ff8c00" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="#ff8c00" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <!-- Grid lines -->
        <line x1="0" y1="20" x2="150" y2="20" stroke="#1a1a1a" stroke-width="0.5"/>
        <line x1="0" y1="40" x2="150" y2="40" stroke="#1a1a1a" stroke-width="0.5"/>
        <line x1="0" y1="60" x2="150" y2="60" stroke="#1a1a1a" stroke-width="0.5"/>
        <!-- Aire orange dégradée -->
        <path d="${pathData} L 142 75 L 8 75 Z" fill="url(#grad-fill)"/>
        <!-- Courbe orange -->
        <path d="${pathData}" fill="none" stroke="#ff8c00" stroke-width="2" stroke-linecap="round"/>
        <!-- Point final -->
        <circle cx="142" cy="${pathData.match(/T 142 (\d+)/) ? pathData.match(/T 142 (\d+)/)[1] : 32}" r="2.5" fill="#ff8c00"/>
    </svg>`;
}

// Génère la grille de 5 mini-cards cliquables
function renderYieldsTvGrid() {
    const grid = document.getElementById('yields-tv-grid');
    if (!grid) return;

    const symbols = YIELDS_TV_SYMBOLS[yieldsCurrentCcy] || YIELDS_TV_SYMBOLS.USD;
    const data = yieldsCurveData.currencies ? yieldsCurveData.currencies[yieldsCurrentCcy] : null;
    const tenors = ['3M', '2Y', '5Y', '10Y', '30Y'];

    grid.innerHTML = tenors.map(tenor => {
        const tvSymbol = symbols[tenor];
        const tvUrl = `https://www.tradingview.com/symbols/${tvSymbol}/`;
        const y = data && data.yields ? data.yields[tenor] : null;

        let rateStr = '—';
        let rateCls = 'na';
        let deltaStr = '';
        let deltaCls = '';
        let deltaD30 = null;

        if (y && y.available && y.current !== null) {
            rateStr = y.current.toFixed(2) + '%';
            rateCls = 'available';
            if (y.d30 !== null) {
                deltaD30 = Math.round((y.current - y.d30) * 100);
                const sign = deltaD30 > 0 ? '+' : '';
                deltaStr = `${sign}${deltaD30} bps · 30D`;
                deltaCls = deltaD30 > 0 ? 'up' : deltaD30 < 0 ? 'down' : 'flat';
            }
        }

        const svg = generateMiniCurveSvg(y ? y.current : null, deltaD30);

        return `<a href="${tvUrl}" target="_blank" rel="noopener" class="yields-tv-card">
            <div class="yields-tv-card-header">
                <span class="yields-tv-tenor">${tenor}</span>
                <span class="yields-tv-symbol">${tvSymbol.replace('TVC-', '')} ↗</span>
            </div>
            <div class="yields-tv-card-body">
                ${svg}
            </div>
            <div class="yields-tv-card-footer">
                <span class="yields-tv-rate ${rateCls}">${rateStr}</span>
                ${deltaStr ? `<span class="yields-tv-delta ${deltaCls}">${deltaStr}</span>` : ''}
            </div>
        </a>`;
    }).join('');
}

// Render du tableau YIELDS DETAIL
function renderYieldsTable() {
    const tbody = document.getElementById('yields-tbody');
    if (!tbody) return;
    if (!yieldsCurveData.currencies) return;
    const data = yieldsCurveData.currencies[yieldsCurrentCcy];
    if (!data) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading">No data available</td></tr>';
        return;
    }
    const tenors = ['3M', '2Y', '5Y', '10Y', '30Y'];
    tbody.innerHTML = tenors.map(tenor => {
        const y = data.yields[tenor];
        if (!y || !y.available || y.current === null) {
            return `<tr><td class="label">${tenor}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>`;
        }
        const d30Diff = y.d30 !== null ? Math.round((y.current - y.d30) * 100) : null;
        const d90Diff = y.d90 !== null ? Math.round((y.current - y.d90) * 100) : null;
        const d30Cls = d30Diff === null ? '' : d30Diff > 0 ? 'chg-up' : d30Diff < 0 ? 'chg-down' : '';
        const d90Cls = d90Diff === null ? '' : d90Diff > 0 ? 'chg-up' : d90Diff < 0 ? 'chg-down' : '';
        const d30Str = d30Diff === null ? '—' : (d30Diff > 0 ? '+' : '') + d30Diff;
        const d90Str = d90Diff === null ? '—' : (d90Diff > 0 ? '+' : '') + d90Diff;
        return `<tr>
            <td class="label">${tenor}</td>
            <td class="num">${y.current.toFixed(2)}%</td>
            <td class="num ${d30Cls}">${d30Str}</td>
            <td class="num ${d90Cls}">${d90Str}</td>
        </tr>`;
    }).join('');
}

// Render du chart Chart.js avec 3 courbes (today + 30d + 90d)
function renderYieldsChart() {
    const canvas = document.getElementById('yields-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (!yieldsCurveData.currencies) return;
    const data = yieldsCurveData.currencies[yieldsCurrentCcy];
    if (!data) return;

    const tenors = ['3M', '2Y', '5Y', '10Y', '30Y'];
    const labels = [];
    const today = [];
    const d30 = [];
    const d90 = [];

    tenors.forEach(t => {
        const y = data.yields[t];
        if (y && y.available && y.current !== null) {
            labels.push(t);
            today.push(y.current);
            d30.push(y.d30);
            d90.push(y.d90);
        }
    });

    if (yieldsChartInstance) yieldsChartInstance.destroy();

    yieldsChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'TODAY',
                    data: today,
                    borderColor: '#ff8c00',
                    backgroundColor: 'rgba(255,140,0,0.1)',
                    borderWidth: 2.5,
                    pointRadius: 5,
                    pointBackgroundColor: '#ff8c00',
                    pointBorderColor: '#ff8c00',
                    fill: false,
                    tension: 0.2
                },
                {
                    label: '30D AGO',
                    data: d30,
                    borderColor: 'rgba(255,140,0,0.5)',
                    borderWidth: 1.8,
                    pointRadius: 3,
                    pointBackgroundColor: 'rgba(255,140,0,0.5)',
                    fill: false,
                    tension: 0.2
                },
                {
                    label: '90D AGO',
                    data: d90,
                    borderColor: '#555',
                    borderDash: [3, 3],
                    borderWidth: 1.5,
                    pointRadius: 3,
                    pointBackgroundColor: '#555',
                    fill: false,
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    labels: { color: '#888', font: { family: 'monospace', size: 10 } }
                },
                tooltip: {
                    backgroundColor: '#0a0a0a',
                    borderColor: '#ff8c00',
                    borderWidth: 1,
                    titleColor: '#ff8c00',
                    bodyColor: '#ddd',
                    callbacks: {
                        label: c => `${c.dataset.label}: ${c.parsed.y !== null ? c.parsed.y.toFixed(2) + '%' : '—'}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#1a1a1a' },
                    ticks: { color: '#888', font: { family: 'monospace', size: 10 } }
                },
                y: {
                    grid: { color: '#1a1a1a' },
                    ticks: {
                        color: '#888',
                        font: { family: 'monospace', size: 10 },
                        callback: v => v.toFixed(2) + '%'
                    }
                }
            }
        }
    });
}

// Render des spreads
function renderYieldsSpreads() {
    const container = document.getElementById('yields-spreads-grid');
    if (!container) return;
    if (!yieldsCurveData.currencies) {
        container.innerHTML = '<div class="yields-empty">Loading spreads...</div>';
        return;
    }
    const data = yieldsCurveData.currencies[yieldsCurrentCcy];
    if (!data || !data.spreads) {
        container.innerHTML = `<div class="yields-empty">No spread data available for ${yieldsCurrentCcy}</div>`;
        return;
    }
    const sp = data.spreads;
    const shape = data.shape || 'unknown';

    const cards = [];

    if (sp.s2_10 !== undefined) {
        const bps = Math.round(sp.s2_10 * 100);
        const cls = bps < -5 ? 'inverted' : bps < 20 ? 'flat' : '';
        const note = bps < -5 ? '⚠ Inverted curve' : bps < 20 ? 'Flat — fin de cycle' : 'Normal slope';
        cards.push(`<div class="yields-spread-card">
            <div class="yields-spread-label">2Y / 10Y SPREAD</div>
            <div class="yields-spread-value ${cls}">${bps > 0 ? '+' : ''}${bps} bps</div>
            <div class="yields-spread-note">${note}</div>
        </div>`);
    }
    if (sp.s3m_10 !== undefined) {
        const bps = Math.round(sp.s3m_10 * 100);
        const cls = bps < -10 ? 'inverted' : '';
        const note = bps < -10 ? 'Recession signal' : bps < 30 ? 'Flattening' : 'Normal';
        cards.push(`<div class="yields-spread-card">
            <div class="yields-spread-label">3M / 10Y SPREAD</div>
            <div class="yields-spread-value ${cls}">${bps > 0 ? '+' : ''}${bps} bps</div>
            <div class="yields-spread-note">${note}</div>
        </div>`);
    }
    if (sp.s5_30 !== undefined) {
        const bps = Math.round(sp.s5_30 * 100);
        const note = bps < 0 ? 'Inverted long-end' : bps > 30 ? 'Steepening long-end' : 'Flat long-end';
        cards.push(`<div class="yields-spread-card">
            <div class="yields-spread-label">5Y / 30Y SPREAD</div>
            <div class="yields-spread-value">${bps > 0 ? '+' : ''}${bps} bps</div>
            <div class="yields-spread-note">${note}</div>
        </div>`);
    }

    const shapeLabel = shape.toUpperCase();
    const shapeCls = shape === 'inverted' ? 'inverted' : shape === 'flat' ? 'flat' : '';
    const shapeNote = {
        normal: 'Croissance saine',
        steep: 'Reflation attendue',
        flat: 'Fin de cycle',
        inverted: 'Signal récession',
        unknown: 'Données partielles'
    }[shape] || '';
    cards.push(`<div class="yields-spread-card">
        <div class="yields-spread-label">CURVE SHAPE</div>
        <div class="yields-spread-value ${shapeCls}" style="font-size:13px;">${shapeLabel}</div>
        <div class="yields-spread-note">${shapeNote}</div>
    </div>`);

    container.innerHTML = cards.join('');
}

function setupYieldsEvents() {
    document.querySelectorAll('.yields-ccy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.yields-ccy-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            yieldsCurrentCcy = btn.dataset.ccy;
            renderYieldsAll();
        });
    });
}

async function renderYieldsAllAsync() {
    if (!yieldsCurveData || !yieldsCurveData.currencies) await fetchYieldsData();
    renderYieldsAll();
}

// ============================================
// PAGE NAVIGATION (10 pages: home / cb / macro / score / scan / pos / prob / fx / news / cal)
// HOME = page statique HTML — pas de logique JS associée
// ============================================
const PAGES = ['home', 'cb', 'macro', 'yields', 'score', 'scan', 'pos', 'strength', 'fx', 'news', 'cal'];

// ============================================
// SESSION RECAP — Fetch InvestingLive RSS wraps
// Affiche les session wraps Asia / Europe / US du jour
// ============================================

let sessionRecapData = null;
let sessionRecapLastFetch = 0;
const SESSION_RECAP_CACHE_MS = 5 * 60 * 1000;  // 5 min de cache client

async function fetchAndRenderSessionRecap(forceRefresh = false) {
    // Cache client : pas de re-fetch si moins de 5 min
    const now = Date.now();
    if (!forceRefresh && sessionRecapData && (now - sessionRecapLastFetch) < SESSION_RECAP_CACHE_MS) {
        renderSessionRecap();
        return;
    }

    // Affiche loading
    ['asia', 'europe', 'us'].forEach(s => {
        const body = document.getElementById('recap-body-' + s);
        if (body) body.innerHTML = '<div class="session-recap-loading">Loading...</div>';
    });

    try {
        const r = await fetch('/api/session-wraps');
        if (!r.ok) {
            sessionRecapData = { error: `Server returned ${r.status}` };
        } else {
            sessionRecapData = await r.json();
            sessionRecapLastFetch = now;
        }
    } catch (e) {
        sessionRecapData = { error: e.message };
    }

    renderSessionRecap();
}

function renderSessionRecap() {
    if (!sessionRecapData) return;

    const stamp = document.getElementById('session-recap-stamp');
    if (stamp) {
        if (sessionRecapData.error) {
            stamp.textContent = 'error';
            stamp.style.color = '#f87171';
        } else {
            const d = new Date(sessionRecapData.fetchedAt);
            const hh = String(d.getUTCHours()).padStart(2, '0');
            const mm = String(d.getUTCMinutes()).padStart(2, '0');
            stamp.textContent = `${sessionRecapData.totalWrapsFound || 0} wraps · ${hh}:${mm} GMT`;
            stamp.style.color = '';
        }
    }

    if (sessionRecapData.error) {
        ['asia', 'europe', 'us'].forEach(s => {
            const body = document.getElementById('recap-body-' + s);
            if (body) body.innerHTML = `<div class="session-recap-empty">⚠ ${sessionRecapData.error}</div>`;
            const count = document.getElementById('recap-count-' + s);
            if (count) count.textContent = '— wraps';
        });
        return;
    }

    ['asia', 'europe', 'us'].forEach(sessionKey => {
        const sessionData = sessionRecapData.sessions[sessionKey];
        if (!sessionData) return;

        const count = document.getElementById('recap-count-' + sessionKey);
        if (count) count.textContent = `${sessionData.count || 0} wraps`;

        const body = document.getElementById('recap-body-' + sessionKey);
        if (!body) return;

        if (!sessionData.wraps || sessionData.wraps.length === 0) {
            body.innerHTML = `<div class="session-recap-empty">Aucun wrap "${sessionData.label}" trouvé aujourd'hui.<br><span class="session-recap-empty-hint">Les wraps sont publiés en fin de session.</span></div>`;
            return;
        }

        body.innerHTML = sessionData.wraps.map(w => {
            const dateBadge = w.dateLabel === 'today' ? '<span class="session-recap-date-badge today">TODAY</span>'
                            : w.dateLabel === 'yesterday' ? '<span class="session-recap-date-badge yesterday">YESTERDAY</span>'
                            : w.dateLabel === 'recent' ? '<span class="session-recap-date-badge recent">RECENT</span>'
                            : `<span class="session-recap-date-badge">${escapeHtml(w.dateLabel)}</span>`;
            const dateInfo = w.dateStr ? `<span class="session-recap-time">${escapeHtml(w.dateStr)}</span>` : '';

            return `<div class="session-recap-item">
                <div class="session-recap-item-meta">
                    ${dateBadge}
                    ${dateInfo}
                </div>
                <a href="${escapeAttr(w.link)}" target="_blank" rel="noopener" class="session-recap-item-title">${escapeHtml(w.title)}</a>
            </div>`;
        }).join('');
    });
}

function formatSessionTime(pubDateStr) {
    try {
        const d = new Date(pubDateStr);
        if (isNaN(d.getTime())) return '';
        const hh = String(d.getUTCHours()).padStart(2, '0');
        const mm = String(d.getUTCMinutes()).padStart(2, '0');
        return `${hh}:${mm} GMT`;
    } catch (e) {
        return '';
    }
}

function escapeHtml(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
    if (!s) return '';
    return String(s).replace(/"/g, '&quot;');
}

// Setup du bouton refresh
function setupSessionRecapEvents() {
    const refreshBtn = document.getElementById('session-recap-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchAndRenderSessionRecap(true);
        });
    }
}

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

    if (pageId === 'home') {
        setTimeout(() => {
            renderHomeAll();
        }, 50);
    }

    if (pageId === 'macro') {
        setTimeout(() => {
            renderMacroCharts();
            Object.values(macroChartInstances).forEach(c => c && c.resize && c.resize());
        }, 50);
    }

    if (pageId === 'cb') {
        setTimeout(() => {
            renderCBAll();
            renderWirpAll();
        }, 50);
    }

    if (pageId === 'yields') {
        setTimeout(() => {
            renderYieldsAllAsync();
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
            renderPosTable();
        }, 50);
    }

    if (pageId === 'news') {
        setTimeout(() => {
            fetchAndRenderSessionRecap();
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
setupCBEvents();
setupPosEvents();
setupMacroKeyboard();
setupYieldsEvents();
setupSessionRecapEvents();

// ⚡ Démarrage instantané : on charge le cache avant le fetch
const cachedBanks = loadRatesCache();
if (cachedBanks && cachedBanks.length > 0) {
    ratesData = { banks: cachedBanks };
    rateHistoryState.banks = cachedBanks;
    // Render immédiat sans attendre le fetch FRED
    renderSnapshotTable();
    renderAllRateCharts();
    renderProjectionCards();
    renderCBTimeline();
    if (typeof renderScanAll === 'function') renderScanAll();
    if (typeof renderPosTable === 'function') renderPosTable();
}

renderScoreAll();
renderScanAll();
fetchAllData();
setInterval(fetchAllData, 10 * 60 * 1000);
