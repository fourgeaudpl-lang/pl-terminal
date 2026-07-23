"""Moteur de score macro — port fidèle de script.js (PL Terminal).

Reprend EXACTEMENT les mêmes seuils et poids que le terminal :
  - scoreMonetary / scoreSpread / scoreCPI / scoreGDP / scoreUnemp / scorePMI
  - SCORING_FACTORS et leurs poids
  - biasFromScore

Ainsi, le robot et le terminal donnent toujours le même biais pour une même
photo de fondamentaux.
"""

from __future__ import annotations

from dataclasses import dataclass


# --- Scores par facteur (port 1:1 des fonctions score*() de script.js) -------

def score_monetary(rate: float | None) -> float:
    if rate is None:
        return 0
    if rate >= 4:
        return 2
    if rate >= 3:
        return 1
    if rate >= 1.5:
        return 0
    if rate >= 0.5:
        return -1
    return -2


def score_spread(spread: float | None) -> float:
    if spread is None:
        return 0
    if spread >= 1:
        return 2
    if spread >= 0.5:
        return 1
    if spread >= 0:
        return 0
    if spread >= -0.5:
        return -1
    return -2


def score_cpi(cpi: float | None) -> float:
    if cpi is None:
        return 0
    if cpi >= 4:
        return 2
    if cpi >= 3:
        return 1
    if cpi >= 1.5:
        return 0
    if cpi >= 1:
        return -1
    return -2


def score_gdp(gdp: float | None) -> float:
    if gdp is None:
        return 0
    if gdp >= 3:
        return 2
    if gdp >= 2:
        return 1
    if gdp >= 1:
        return 0
    if gdp >= 0:
        return -1
    return -2


def score_unemp(unemp: float | None) -> float:
    if unemp is None:
        return 0
    if unemp <= 3.5:
        return 2
    if unemp <= 4.5:
        return 1
    if unemp <= 5.5:
        return 0
    if unemp <= 6.5:
        return -1
    return -2


def score_pmi(pmi_manuf: float | None, pmi_services: float | None) -> float:
    if pmi_manuf is None and pmi_services is None:
        return 0
    if pmi_manuf is None:
        avg = pmi_services
    elif pmi_services is None:
        avg = pmi_manuf
    else:
        avg = (pmi_manuf + pmi_services) / 2
    if avg >= 55:
        return 2
    if avg >= 52:
        return 1
    if avg >= 48:
        return 0
    if avg >= 45:
        return -1
    return -2


# --- Facteurs pondérés (port de SCORING_FACTORS) -----------------------------

# (id, label, poids)
SCORING_FACTORS = [
    ("monetary", "Politique monétaire (hawkish+)", 2.0),
    ("rate_diff", "Différentiel de taux (spread 10Y-2Y)", 2.0),
    ("inflation", "Inflation (CPI)", 1.0),
    ("gdp", "Croissance PIB", 1.5),
    ("employment", "Emploi / Chômage", 1.0),
    ("pmi", "PMI / Activité", 1.0),
]

# Score pondéré maximal possible (pour normaliser en confiance 0..1)
MAX_ABS_SCORE = sum(2 * w for _, _, w in SCORING_FACTORS)  # = 17.0


@dataclass
class Fundamentals:
    """Photo des fondamentaux d'une devise (mêmes champs que le terminal)."""

    rate: float | None = None          # taux directeur %
    spread: float | None = None        # spread 10Y-2Y %
    cpi: float | None = None           # inflation CPI YoY %
    gdp: float | None = None           # PIB YoY %
    unemployment: float | None = None  # chômage %
    pmi_manuf: float | None = None
    pmi_services: float | None = None


@dataclass
class ScoreBreakdown:
    ccy: str
    factors: dict[str, float]  # id -> score brut (-2..+2)
    raw: float                 # somme brute
    weighted: float            # score pondéré
    bias: str                  # STRONG BULL / BULLISH / ... / NEUTRAL
    confidence: float          # |weighted| / MAX_ABS_SCORE, dans [0, 1]


def bias_from_score(weighted: float) -> str:
    """Port de biasFromScore() (labels seulement)."""
    if weighted >= 12:
        return "STRONG BULL"
    if weighted >= 7:
        return "BULLISH"
    if weighted >= 3:
        return "MILD BULL"
    if weighted <= -12:
        return "STRONG BEAR"
    if weighted <= -7:
        return "BEARISH"
    if weighted <= -3:
        return "MILD BEAR"
    return "NEUTRAL"


def score_currency(ccy: str, f: Fundamentals) -> ScoreBreakdown:
    """Calcule le score complet d'une devise à partir de ses fondamentaux."""
    factors = {
        "monetary": score_monetary(f.rate),
        "rate_diff": score_spread(f.spread),
        "inflation": score_cpi(f.cpi),
        "gdp": score_gdp(f.gdp),
        "employment": score_unemp(f.unemployment),
        "pmi": score_pmi(f.pmi_manuf, f.pmi_services),
    }
    raw = sum(factors.values())
    weighted = sum(factors[fid] * w for fid, _, w in SCORING_FACTORS)
    return ScoreBreakdown(
        ccy=ccy,
        factors=factors,
        raw=raw,
        weighted=weighted,
        bias=bias_from_score(weighted),
        confidence=min(1.0, abs(weighted) / MAX_ABS_SCORE),
    )
