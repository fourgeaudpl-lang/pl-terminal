"""Suivi des annonces économiques + calcul de la "surprise vs consensus".

C'est la partie "suivre les annonces en direct". On consomme le même
calendrier que le terminal (/api/calendar, source Finnhub, G10), et pour
chaque événement à impact fort dont le chiffre vient de tomber, on mesure
l'écart entre le publié (`actual`) et le consensus (`estimate`).

La "surprise" est ensuite orientée dans le sens haussier/baissier POUR la
devise selon l'indicateur (un CPI plus fort que prévu = hawkish = haussier ;
un chômage plus fort que prévu = baissier ; etc.).
"""

from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone

# Sens de l'impact d'une SURPRISE HAUSSIÈRE (actual > estimate) sur la devise.
# +1 : chiffre supérieur au consensus => haussier pour la devise
# -1 : chiffre supérieur au consensus => baissier pour la devise
# On matche par mots-clés dans le libellé de l'événement (insensible à la casse).
_EVENT_DIRECTION = [
    # (motif dans le nom de l'évènement, sens)
    ("cpi", +1),
    ("inflation", +1),
    ("ppi", +1),
    ("gdp", +1),
    ("retail sales", +1),
    ("pmi", +1),
    ("ism", +1),
    ("nonfarm", +1),
    ("non-farm", +1),
    ("payroll", +1),
    ("employment change", +1),
    ("earnings", +1),
    ("trade balance", +1),
    ("industrial production", +1),
    ("confidence", +1),
    ("sentiment", +1),
    ("rate decision", +1),
    ("interest rate", +1),
    # Sens inversé : "moins c'est mieux" pour la devise
    ("unemployment rate", -1),
    ("jobless", -1),
    ("initial claims", -1),
    ("claimant", -1),
]


def event_direction(name: str) -> int | None:
    """Sens de l'impact d'une surprise haussière. None si indicateur inconnu."""
    low = name.lower()
    # On teste d'abord les motifs "-1" les plus spécifiques (unemployment rate)
    for pat, sign in sorted(_EVENT_DIRECTION, key=lambda x: -len(x[0])):
        if pat in low:
            return sign
    return None


def _to_float(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


@dataclass
class NewsSurprise:
    ccy: str
    event: str
    impact: str
    actual: float
    estimate: float
    time: str
    surprise_raw: float     # actual - estimate
    surprise_pct: float | None  # (actual-estimate)/|estimate|, si estimate != 0
    direction: int          # sens appliqué (+1/-1)
    bias: float             # score orienté devise dans [-1, +1] approx (borné)

    @property
    def is_bullish(self) -> bool:
        return self.bias > 0


def _http_get_json(url: str, timeout: float = 10.0):
    req = urllib.request.Request(url, headers={"User-Agent": "pl-terminal-bot"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_events(base_url: str) -> list[dict]:
    """Récupère les événements bruts via /api/calendar du terminal."""
    payload = _http_get_json(f"{base_url.rstrip('/')}/api/calendar")
    return payload.get("events", [])


def compute_surprises(
    events: list[dict],
    *,
    min_impact: str = "medium",
    within_hours: float | None = 6.0,
    now: datetime | None = None,
) -> list[NewsSurprise]:
    """Filtre les événements déjà publiés et calcule leur surprise orientée.

    - min_impact : "low" | "medium" | "high" (garde cet impact et au-dessus).
    - within_hours : ne garde que les publications des N dernières heures
      (None = pas de filtre temporel). C'est le "en direct".
    """
    impact_rank = {"low": 0, "medium": 1, "high": 2}
    threshold = impact_rank.get(str(min_impact).lower(), 1)
    now = now or datetime.now(timezone.utc)

    out: list[NewsSurprise] = []
    for e in events:
        actual = _to_float(e.get("actual"))
        estimate = _to_float(e.get("estimate"))
        if actual is None or estimate is None:
            continue  # pas encore publié ou pas de consensus -> rien à mesurer

        if impact_rank.get(str(e.get("impact", "")).lower(), 0) < threshold:
            continue

        direction = event_direction(e.get("event", ""))
        if direction is None:
            continue  # indicateur dont on ne connaît pas le sens

        # Filtre "en direct" : publication récente
        if within_hours is not None:
            ts = _parse_time(e.get("time"))
            if ts is not None:
                age_h = (now - ts).total_seconds() / 3600.0
                if age_h < 0 or age_h > within_hours:
                    continue

        surprise_raw = actual - estimate
        denom = abs(estimate) if estimate != 0 else None
        surprise_pct = (surprise_raw / denom) if denom else None

        # bias borné dans [-1, 1] : on sature à ±10% de surprise relative.
        if surprise_pct is not None:
            mag = max(-1.0, min(1.0, surprise_pct / 0.10))
        else:
            mag = 1.0 if surprise_raw > 0 else (-1.0 if surprise_raw < 0 else 0.0)
        bias = direction * mag

        out.append(
            NewsSurprise(
                ccy=e.get("currency", ""),
                event=e.get("event", ""),
                impact=e.get("impact", ""),
                actual=actual,
                estimate=estimate,
                time=e.get("time", ""),
                surprise_raw=surprise_raw,
                surprise_pct=surprise_pct,
                direction=direction,
                bias=bias,
            )
        )
    return out


def _parse_time(t) -> datetime | None:
    if not t:
        return None
    # Finnhub renvoie souvent "YYYY-MM-DD HH:MM:SS" (UTC). On tolère l'ISO aussi.
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(str(t)[:19], fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None
