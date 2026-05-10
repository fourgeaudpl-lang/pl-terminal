/* ============================================
   PL TERMINAL — Frontend logic (full)
   ============================================ */

const CCYS = ['USD','EUR','GBP','JPY','CAD','AUD','NZD','CHF'];

const CENTRAL_BANKS = [
    { code: 'FED',  ccy: 'USD' },
    { code: 'ECB',  ccy: 'EUR' },
    { code: 'RBA',  ccy: 'AUD' },
    { code: 'RBNZ', ccy: 'NZD' }
];

// Map ccy → bank code (when central bank rate exists in our /api/rates response)
const CCY_TO_BANK = { USD: 'FED', EUR: 'ECB', AUD: 'RBA', NZD: 'RBNZ' };

// État global
let rateHistoryState = { banks: [], selectedYears: 5, chartInstances: {} };
let yieldsData = {};
let ratesData = {};

// Scoring weights & factors (matches Excel)
const SCORING_FACTORS = [
    { id: 'monetary',   label: 'Politique monétaire (hawkish+)', weight: 2,   src: 'manual' },
    { id: 'rate_diff',  label: 'Différentiel de taux',           weight: 2,   src: 'auto'   },
    { id: 'inflation',  label: 'Inflation (tendance)',            weight: 1,   src: 'manual' },
    { id: 'gdp',        label: 'Croissance PIB',                  weight: 1.5, src: 'manual' },
    { id: 'employment', label: 'Emploi / Chômage',                weight: 1,   src: 'manual' },
    { id: 'pmi',        label: 'PMI / Activité',                  weight: 1,   src: 'manual' },
    { id: 'momentum',   label: 'Momentum technique',              weight: 1,   src: 'manual' },
    { id: 'risk',       label: 'Risk Sentiment (risk-on/off)',    weight: 1,   src: 'manual' },
    { id: 'geo',        label: 'Géopolitique / Risque',           weight: 0.5, src: 'manual' }
];

// ---- Horloge GMT ----
function updateClock() {
    const now = new Date();
    const h = String(now.getUTCHours()).padStart(2, '0');
    const m = String(now.getUTCMinutes()).padStart(2, '0');
    const s = String(now.getUTCSeconds()).padStart(2, '0');
    const el = document.getElementById('clock');
    if (el) el.textContent = `${h}:${m}:${s} GMT`;
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
    return Math.ceil((target - new Date()) / (1000 * 60 * 60 * 24));
}

function formatChangeBp(bp) {
    if (bp === null || bp === undefined || isNaN(bp)) return { text: '--', cls: 'change-flat' };
    if (bp === 0) return { text: 'UNCH', cls: 'change-flat' };
    const sign = bp > 0 ? '+' : '−';
    return { text: `${sign}${Math.abs(Math.round(bp))}`, cls: bp > 0 ? 'change-up' : 'change-down' };
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
    if (!dot || !text) return;
    dot.classList.remove('live', 'error');
    if (state === 'live') dot.classList.add('live');
    if (state === 'error') dot.classList.add('error');
    text.textContent = message;
}

// ---- localStorage helpers (saisie manuelle) ----
function getManualValue(key, defaultValue) {
    const stored = localStorage.getItem(`pl_${key}`);
    if (stored === null) return defaultValue;
    const parsed = parseFloat(stored);
    return isNaN(parsed) ? defaultValue : parsed;
}

function setManualValue(key, value) {
    localStorage.setItem(`pl_${key}`, String(value));
}

function clearManualValue(key) {
    localStorage.removeItem(`pl_${key}`);
}

// ---- Module 1 : tableau des taux ----
function renderRatesTable(ratesPayload, meetingsData) {
    const tbody = document.getElementById('rates-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const banksById = {};
    if (ratesPayload && Array.isArray(ratesPayload.banks)) {
        ratesPayload.banks.forEach(b => { banksById[b.id] = b; });
    }

    CENTRAL_BANKS.forEach(bank => {
        const apiData = banksById[bank.code] || {};
        const meeting = meetingsData[bank.code] || null;
        const tr = document.createElement('tr');
        const change = formatChangeBp(apiData.lastChange);
        const days = daysUntil(meeting);
        const daysFmt = formatDays(days);
        const rateText = (apiData.rate !== null && apiData.rate !== undefined)
            ? Number(apiData.rate).toFixed(2) : '--';

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
    const el = document.getElementById('last-update');
    if (el) el.textContent = `last update: ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')} GMT`;
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
    if (rateHistoryState.chartInstances[bankId]) {
        rateHistoryState.chartInstances[bankId].destroy();
    }
    const filtered = filterHistoryByYears(history, years);
    if (filtered.length === 0) return;

    const lastPoint = filtered[filtered.length - 1];
    const todayStr = new Date().toISOString().split('T')[0];
    const dataPoints = [...filtered];
    if (lastPoint.date !== todayStr) {
        dataPoints.push({ date: todayStr, value: lastPoint.value });
    }

    const ctx = canvas.getContext('2d');
    rateHistoryState.chartInstances[bankId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dataPoints.map(p => p.date),
            datasets: [{
                data: dataPoints.map(p => p.value),
                borderColor: '#ff8c00',
                backgroundColor: 'rgba(255,140,0,0.08)',
                borderWidth: 1.5,
                stepped: 'before',
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4
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
                    callbacks: { label: c => `${c.parsed.y.toFixed(2)}%` }
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
                        callback: v => v.toFixed(1) + '%'
                    }
                }
            }
        }
    });
}

function renderAllRateCharts() {
    rateHistoryState.banks.forEach(bank => {
        renderRateChart(bank.id, bank.history || [], rateHistoryState.selectedYears);
        const labelEl = document.getElementById(`chart-current-${bank.id}`);
        if (labelEl) labelEl.textContent = bank.rate !== null && bank.rate !== undefined
            ? `${bank.rate.toFixed(2)}%` : '—';
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

// ---- Get current rate from API or fallback ----
function getCurrentRate(ccy) {
    const bankCode = CCY_TO_BANK[ccy];
    if (!bankCode || !ratesData.banks) return null;
    const bank = ratesData.banks.find(b => b.id === bankCode);
    return bank ? bank.rate : null;
}

// ---- Calculate auto factors ----
function calcAutoFactor(factorId, ccy) {
    if (factorId === 'rate_diff') {
        // Score based on rate vs USD
        const rateUSD = getCurrentRate('USD');
        const rateCcy = getCurrentRate(ccy);
        if (rateUSD === null || rateCcy === null) return 0;
        const diff = rateCcy - rateUSD;
        if (diff > 1.5) return 2;
        if (diff > 0.5) return 1;
        if (diff < -1.5) return -2;
        if (diff < -0.5) return -1;
        return 0;
    }
    return 0;
}

// ---- Module 5 : SCORING ----
function getFactorValue(factorId, ccy) {
    const factor = SCORING_FACTORS.find(f => f.id === factorId);
    if (!factor) return 0;
    if (factor.src === 'auto') return calcAutoFactor(factorId, ccy);
    // manual
    return getManualValue(`scoring_${factorId}_${ccy}`, 0);
}

function classForScore(score) {
    if (score >= 1.5) return 'pos-strong';
    if (score > 0) return 'pos';
    if (score <= -1.5) return 'neg-strong';
    if (score < 0) return 'neg';
    return 'neutral';
}

function biasFromScore(score) {
    if (score >= 8) return { label: 'STRONG BULL', cls: 'bias-strong-bullish' };
    if (score >= 4) return { label: 'BULLISH',     cls: 'bias-bullish' };
    if (score >= 2) return { label: 'MILD BULL',   cls: 'bias-mild-bullish' };
    if (score <= -8) return { label: 'STRONG BEAR',cls: 'bias-strong-bearish' };
    if (score <= -4) return { label: 'BEARISH',    cls: 'bias-bearish' };
    if (score <= -2) return { label: 'MILD BEAR',  cls: 'bias-mild-bearish' };
    return { label: 'NEUTRAL', cls: 'bias-neutral' };
}

function renderScoring() {
    const tbody = document.getElementById('scoring-tbody');
    if (!tbody) return;

    let html = '';
    // Factor rows
    SCORING_FACTORS.forEach(factor => {
        let row = `<tr><td class="factor-name">${factor.label}</td><td class="num weight-cell">${factor.weight}</td>`;
        CCYS.forEach(ccy => {
            const value = getFactorValue(factor.id, ccy);
            const cls = classForScore(value);
            const editable = factor.src === 'manual' ? 'editable-cell' : '';
            const display = value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
            row += `<td class="num ${cls} ${editable}" data-factor="${factor.id}" data-ccy="${ccy}">${display}</td>`;
        });
        const srcTag = factor.src === 'auto' ? '<span class="src-auto">auto</span>' : '<span class="src-manual">manual</span>';
        row += `<td>${srcTag}</td></tr>`;
        html += row;
    });

    // Score brut row
    let bruts = {};
    let pondereds = {};
    CCYS.forEach(ccy => {
        let brut = 0, pondered = 0;
        SCORING_FACTORS.forEach(factor => {
            const v = getFactorValue(factor.id, ccy);
            brut += v;
            pondered += v * factor.weight;
        });
        bruts[ccy] = brut;
        pondereds[ccy] = pondered;
    });

    let brutRow = '<tr class="score-row"><td colspan="2" class="score-label">SCORE BRUT (somme)</td>';
    CCYS.forEach(ccy => {
        const v = bruts[ccy];
        const cls = classForScore(v);
        const display = v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
        brutRow += `<td class="num ${cls}">${display}</td>`;
    });
    brutRow += '<td></td></tr>';
    html += brutRow;

    let pondRow = '<tr class="score-row score-pondere"><td colspan="2" class="score-label">SCORE PONDÉRÉ</td>';
    CCYS.forEach(ccy => {
        const v = pondereds[ccy];
        const cls = classForScore(v);
        const display = v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
        pondRow += `<td class="num ${cls}">${display}</td>`;
    });
    pondRow += '<td></td></tr>';
    html += pondRow;

    let biasRow = '<tr class="bias-row"><td colspan="2" class="score-label">BIAIS</td>';
    CCYS.forEach(ccy => {
        const b = biasFromScore(pondereds[ccy]);
        biasRow += `<td class="num ${b.cls}">${b.label}</td>`;
    });
    biasRow += '<td></td></tr>';
    html += biasRow;

    tbody.innerHTML = html;

    // Wire up click handlers for editable cells
    tbody.querySelectorAll('.editable-cell').forEach(cell => {
        cell.addEventListener('click', () => editScoringCell(cell));
    });

    const updEl = document.getElementById('scoring-update');
    if (updEl) {
        const now = new Date();
        updEl.textContent = `last update: ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')} GMT`;
    }
}

function editScoringCell(cell) {
    const factor = cell.dataset.factor;
    const ccy = cell.dataset.ccy;
    const current = getManualValue(`scoring_${factor}_${ccy}`, 0);
    const input = prompt(`Enter score for ${ccy} (between -2 and +2, e.g. -1, 0, 0.5, 1):`, current);
    if (input === null) return;
    const v = parseFloat(input);
    if (isNaN(v) || v < -2 || v > 2) {
        alert('Invalid value. Must be between -2 and +2.');
        return;
    }
    setManualValue(`scoring_${factor}_${ccy}`, v);
    renderScoring();
}

// ---- Module 6 : CARRY MATRIX ----
function renderCarryMatrix() {
    const tbody = document.querySelector('#carry-table tbody');
    if (!tbody) return;

    let html = '<tr><td class="ccy-h"></td>';
    CCYS.forEach(ccy => { html += `<th class="ccy-h">${ccy}</th>`; });
    html += '</tr>';

    CCYS.forEach(longCcy => {
        html += `<tr><td class="factor-name">${longCcy}</td>`;
        CCYS.forEach(shortCcy => {
            if (longCcy === shortCcy) {
                html += '<td class="carry-diag">—</td>';
            } else {
                const longRate = getCurrentRate(longCcy);
                const shortRate = getCurrentRate(shortCcy);
                if (longRate === null || shortRate === null) {
                    html += '<td class="carry-na">—</td>';
                } else {
                    const diff = longRate - shortRate;
                    let cls;
                    if (diff >= 2) cls = 'carry-cell-strong-pos';
                    else if (diff > 0) cls = 'carry-cell-pos';
                    else if (diff <= -2) cls = 'carry-cell-strong-neg';
                    else if (diff < 0) cls = 'carry-cell-neg';
                    else cls = 'carry-zero';
                    const sign = diff > 0 ? '+' : '';
                    html += `<td class="num ${cls}">${sign}${diff.toFixed(2)}</td>`;
                }
            }
        });
        html += '</tr>';
    });

    tbody.innerHTML = html;
}

// ---- Module 7 : CARRY RANKING ----
function renderRanking() {
    const tbody = document.getElementById('ranking-tbody');
    if (!tbody) return;

    let html = '';
    const rateUSD = getCurrentRate('USD');

    CCYS.forEach(ccy => {
        const rate = getCurrentRate(ccy);
        const carry = (rate !== null && rateUSD !== null) ? rate - rateUSD : null;
        const yields = yieldsData.yields ? yieldsData.yields[ccy] : null;

        // 2Y: from FRED for USD, from manual for others
        let y2 = null;
        if (ccy === 'USD' && yields && yields.y2 !== null) y2 = yields.y2;
        else y2 = getManualValue(`yield_2y_${ccy}`, null);

        const y10 = yields ? yields.y10 : null;
        const spread = (y10 !== null && y2 !== null) ? y10 - y2 : null;

        let signal, signalCls;
        if (spread === null) { signal = '—'; signalCls = 'signal-na'; }
        else if (spread < 0) { signal = 'INVERTED'; signalCls = 'signal-inverted'; }
        else if (spread < 0.3) { signal = 'FLAT'; signalCls = 'signal-flat'; }
        else if (spread > 1.0) { signal = 'PENTUE'; signalCls = 'signal-pentue'; }
        else { signal = 'NORMALE'; signalCls = 'signal-normale'; }

        const carryCls = carry === null ? 'neutral' : carry > 0 ? 'pos' : carry < 0 ? 'neg' : 'neutral';
        const carryText = carry === null ? '—' : (carry > 0 ? '+' : '') + carry.toFixed(2);
        const spreadText = spread === null ? '—' : (spread > 0 ? '+' : '') + spread.toFixed(2);
        const spreadCls = spread === null ? 'neutral' : spread < 0 ? 'neg' : 'pos';

        // y2 cell: editable if not USD
        const y2Display = y2 === null ? '—' : y2.toFixed(2);
        const y2Editable = ccy !== 'USD' ? 'editable-cell' : '';

        html += `
            <tr>
                <td class="factor-name">${ccy}</td>
                <td class="num">${rate !== null ? rate.toFixed(2) : '—'}</td>
                <td class="num ${carryCls}">${carryText}</td>
                <td class="num ${y2Editable}" data-yield-ccy="${ccy}">${y2Display}</td>
                <td class="num">${y10 !== null ? y10.toFixed(2) : '—'}</td>
                <td class="num ${spreadCls}">${spreadText}</td>
                <td class="${signalCls}">${signal}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    tbody.querySelectorAll('.editable-cell').forEach(cell => {
        cell.addEventListener('click', () => editYield2Y(cell));
    });
}

function editYield2Y(cell) {
    const ccy = cell.dataset.yieldCcy;
    const current = getManualValue(`yield_2y_${ccy}`, '');
    const input = prompt(`Enter 2Y yield for ${ccy} (e.g. 2.50):`, current);
    if (input === null) return;
    if (input === '') {
        clearManualValue(`yield_2y_${ccy}`);
    } else {
        const v = parseFloat(input);
        if (isNaN(v)) { alert('Invalid number'); return; }
        setManualValue(`yield_2y_${ccy}`, v);
    }
    renderRanking();
}

// ---- Fetch all data ----
async function fetchAllData() {
    setStatus('connecting', 'fetching data...');
    try {
        const [ratesRes, meetingsRes, yieldsRes] = await Promise.all([
            fetch('/api/rates'),
            fetch('/api/meetings'),
            fetch('/api/yields')
        ]);
        if (!ratesRes.ok) throw new Error('Rates failed');
        ratesData = await ratesRes.json();
        const meetingsData = meetingsRes.ok ? await meetingsRes.json() : {};
        yieldsData = yieldsRes.ok ? await yieldsRes.json() : {};

        renderRatesTable(ratesData, meetingsData);

        if (ratesData.banks) {
            rateHistoryState.banks = ratesData.banks;
            renderAllRateCharts();
        }

        renderScoring();
        renderCarryMatrix();
        renderRanking();

        setStatus('live', 'live');
    } catch (err) {
        console.error('Fetch error:', err);
        setStatus('error', 'connection error');
    }
}

// ---- Démarrage ----
setupPeriodSelector();
fetchAllData();
setInterval(fetchAllData, 10 * 60 * 1000);
