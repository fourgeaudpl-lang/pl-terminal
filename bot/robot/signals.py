"""Génération des signaux par paire.

Logique d'un trader macro : on achète la devise fondamentalement forte
contre la devise faible. Le score relatif d'une paire = score(base) - score(quote).

On y ajoute une surcouche "annonces en direct" : si une devise vient de
surprendre le consensus (calendar_feed), on décale son score effectif dans
le sens de la surprise, ce qui peut faire basculer / renforcer un signal.

Sortie : une liste de PairSignal triée par conviction décroissante.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .currencies import PAIRS
from .scoring import MAX_ABS_SCORE, Fundamentals, ScoreBreakdown, score_currency
from .calendar_feed import NewsSurprise


# Poids de la surcouche news : combien de points de score pondéré vaut une
# surprise maximale (bias = ±1) sur une devise. Réglable via config.
DEFAULT_NEWS_WEIGHT = 4.0

# Seuil de score relatif (base - quote) au-delà duquel on émet un signal.
DEFAULT_SIGNAL_THRESHOLD = 6.0


@dataclass
class PairSignal:
    base: str
    quote: str
    symbol: str
    direction: str          # "LONG" | "SHORT" | "FLAT"
    rel_score: float        # score effectif base - quote
    conviction: float       # |rel_score| normalisé dans [0, 1]
    base_score: float       # score pondéré effectif de la base (news inclus)
    quote_score: float      # score pondéré effectif de la quote (news inclus)
    news_notes: list[str] = field(default_factory=list)

    def as_line(self) -> str:
        arrow = {"LONG": "▲ LONG ", "SHORT": "▼ SHORT", "FLAT": "· FLAT "}[self.direction]
        note = f"  ⚡{'; '.join(self.news_notes)}" if self.news_notes else ""
        return (
            f"{arrow} {self.symbol}  score={self.rel_score:+.1f}  "
            f"conv={self.conviction*100:4.0f}%{note}"
        )


def _news_offset(ccy: str, surprises: list[NewsSurprise], news_weight: float) -> tuple[float, list[str]]:
    """Somme des décalages de score dus aux annonces récentes d'une devise."""
    offset = 0.0
    notes: list[str] = []
    for s in surprises:
        if s.ccy != ccy:
            continue
        offset += s.bias * news_weight
        sign = "hawkish/haussier" if s.bias > 0 else "dovish/baissier"
        notes.append(f"{ccy} {s.event} {s.actual} vs {s.estimate} ({sign})")
    return offset, notes


def generate_signals(
    fundamentals: dict[str, Fundamentals],
    surprises: list[NewsSurprise] | None = None,
    *,
    news_weight: float = DEFAULT_NEWS_WEIGHT,
    threshold: float = DEFAULT_SIGNAL_THRESHOLD,
) -> tuple[dict[str, ScoreBreakdown], list[PairSignal]]:
    """Renvoie (scores par devise, signaux par paire triés par conviction)."""
    surprises = surprises or []

    # 1) Score fondamental de chaque devise + décalage news.
    scores: dict[str, ScoreBreakdown] = {}
    eff_score: dict[str, float] = {}
    news_notes: dict[str, list[str]] = {}
    for ccy, f in fundamentals.items():
        sb = score_currency(ccy, f)
        scores[ccy] = sb
        offset, notes = _news_offset(ccy, surprises, news_weight)
        eff_score[ccy] = sb.weighted + offset
        news_notes[ccy] = notes

    # 2) Signal par paire à partir du score relatif.
    # Normalisation de la conviction : un écart max théorique vaut 2*MAX_ABS_SCORE.
    max_rel = 2 * MAX_ABS_SCORE
    signals: list[PairSignal] = []
    for base, quote in PAIRS:
        rel = eff_score[base] - eff_score[quote]
        if rel >= threshold:
            direction = "LONG"
        elif rel <= -threshold:
            direction = "SHORT"
        else:
            direction = "FLAT"
        signals.append(
            PairSignal(
                base=base,
                quote=quote,
                symbol=f"{base}{quote}",
                direction=direction,
                rel_score=rel,
                conviction=min(1.0, abs(rel) / max_rel),
                base_score=eff_score[base],
                quote_score=eff_score[quote],
                news_notes=news_notes[base] + news_notes[quote],
            )
        )

    signals.sort(key=lambda s: abs(s.rel_score), reverse=True)
    return scores, signals


def actionable(signals: list[PairSignal]) -> list[PairSignal]:
    """Ne garde que les signaux non-FLAT."""
    return [s for s in signals if s.direction != "FLAT"]
