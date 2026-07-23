"""Teste la génération de signaux par paire et l'effet de la surcouche news."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from robot.calendar_feed import NewsSurprise, event_direction  # noqa: E402
from robot.currencies import PAIRS, pip_size  # noqa: E402
from robot.scoring import Fundamentals  # noqa: E402
from robot.signals import generate_signals  # noqa: E402


def _weak(rate=0.25):
    return Fundamentals(rate=rate, spread=-0.6, cpi=0.2, gdp=0.0,
                        unemployment=7.0, pmi_manuf=44, pmi_services=44)


def _strong(rate=5.0):
    return Fundamentals(rate=rate, spread=1.5, cpi=5, gdp=4,
                        unemployment=3.0, pmi_manuf=60, pmi_services=60)


def test_28_pairs():
    assert len(PAIRS) == 28
    assert pip_size("USD", "JPY") == 0.01
    assert pip_size("EUR", "USD") == 0.0001


def test_strong_vs_weak_gives_directional_signal():
    fund = {c: _weak() for c in ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NZD", "CHF"]}
    fund["USD"] = _strong()  # USD très fort
    _, signals = generate_signals(fund, threshold=6.0)
    usd_pairs = [s for s in signals if "USD" in s.symbol and s.direction != "FLAT"]
    assert usd_pairs, "USD fort doit générer des signaux"
    for s in usd_pairs:
        if s.base == "USD":
            assert s.direction == "LONG"
        else:
            assert s.direction == "SHORT"


def test_news_can_flip_or_strengthen():
    fund = {c: _weak() for c in ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NZD", "CHF"]}
    # Neutre au départ : pas de signal EURUSD
    _, base_signals = generate_signals(fund, threshold=6.0)
    eurusd = next(s for s in base_signals if s.symbol == "EURUSD")
    assert eurusd.direction == "FLAT"

    # Grosse surprise haussière sur EUR -> doit pousser EURUSD vers LONG
    surprise = NewsSurprise(
        ccy="EUR", event="CPI YoY", impact="high", actual=3.0, estimate=2.0,
        time="", surprise_raw=1.0, surprise_pct=0.5, direction=+1, bias=1.0,
    )
    _, sig2 = generate_signals(fund, [surprise], news_weight=8.0, threshold=6.0)
    eurusd2 = next(s for s in sig2 if s.symbol == "EURUSD")
    assert eurusd2.rel_score > eurusd.rel_score
    assert eurusd2.direction == "LONG"


def test_event_direction_mapping():
    assert event_direction("US CPI YoY") == +1
    assert event_direction("Unemployment Rate") == -1
    assert event_direction("Initial Jobless Claims") == -1
    assert event_direction("Something Unknown") is None
