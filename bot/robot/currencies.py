"""Les 8 devises majeures, les 28 paires, et les utilitaires de pips.

Convention identique au terminal : CCYS = USD, EUR, GBP, JPY, CAD, AUD, NZD, CHF.
"""

from __future__ import annotations

from itertools import combinations

# Les 8 majors (ordre repris de script.js -> const CCYS)
CCYS = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NZD", "CHF"]

# Ordre de convention du marché : la devise la plus "forte" est cotée en base.
# (EUR > GBP > AUD > NZD > USD > CAD > CHF > JPY)
_CONVENTION_ORDER = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"]


def _ordered(a: str, b: str) -> tuple[str, str]:
    """Renvoie (base, quote) dans la convention de marché habituelle."""
    ia, ib = _CONVENTION_ORDER.index(a), _CONVENTION_ORDER.index(b)
    return (a, b) if ia < ib else (b, a)


def all_pairs() -> list[tuple[str, str]]:
    """Les 28 paires (base, quote) de C(8,2), en convention de marché."""
    return [_ordered(a, b) for a, b in combinations(CCYS, 2)]


def pair_symbol(base: str, quote: str) -> str:
    """'EUR', 'USD' -> 'EURUSD'."""
    return f"{base}{quote}"


def pip_size(base: str, quote: str) -> float:
    """Taille d'un pip pour la paire.

    JPY coté à 2 décimales -> 1 pip = 0.01. Sinon 1 pip = 0.0001.
    """
    return 0.01 if quote == "JPY" or base == "JPY" else 0.0001


def price_to_pips(delta_price: float, base: str, quote: str) -> float:
    """Convertit une variation de prix en pips."""
    return delta_price / pip_size(base, quote)


PAIRS = all_pairs()
