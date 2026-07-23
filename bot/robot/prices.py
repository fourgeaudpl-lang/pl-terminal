"""Prix spot FX (lecture seule) pour le mark-to-market du paper trading.

Source par défaut : open.er-api.com (gratuit, sans clé). On récupère les taux
USD -> * puis on reconstruit n'importe quelle paire par triangulation.

Aucune connexion à un courtier : ces prix servent UNIQUEMENT à valoriser le
portefeuille virtuel. Ils ne sont pas de qualité "exécution".
"""

from __future__ import annotations

import json
import urllib.request

from .currencies import pip_size

_DEFAULT_SOURCE = "https://open.er-api.com/v6/latest/USD"


def fetch_usd_rates(source: str = _DEFAULT_SOURCE, timeout: float = 10.0) -> dict[str, float]:
    """Renvoie {DEVISE: taux USD->DEVISE}. USD vaut 1.0."""
    req = urllib.request.Request(source, headers={"User-Agent": "pl-terminal-bot"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    rates = data.get("rates", {})
    rates["USD"] = 1.0
    return rates


def cross_rate(base: str, quote: str, usd_rates: dict[str, float]) -> float | None:
    """Prix de base/quote via triangulation par l'USD."""
    rb, rq = usd_rates.get(base), usd_rates.get(quote)
    if not rb or not rq:
        return None
    # USD->base = rb, USD->quote = rq  =>  base/quote = rq / rb
    return rq / rb


def pip_diff(base: str, quote: str, entry: float, current: float) -> float:
    """Écart en pips entre deux prix d'une paire."""
    return (current - entry) / pip_size(base, quote)
