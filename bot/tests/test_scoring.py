"""Vérifie que le port Python du scoring reproduit bien les seuils de script.js."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from robot.scoring import (  # noqa: E402
    Fundamentals,
    bias_from_score,
    score_currency,
    score_monetary,
    score_pmi,
    score_spread,
    score_unemp,
)


def test_score_monetary_thresholds():
    assert score_monetary(4.5) == 2
    assert score_monetary(3.0) == 1
    assert score_monetary(1.5) == 0
    assert score_monetary(0.5) == -1
    assert score_monetary(0.1) == -2
    assert score_monetary(None) == 0


def test_score_spread_and_unemp():
    assert score_spread(1.0) == 2
    assert score_spread(-0.6) == -2
    assert score_unemp(3.5) == 2     # <= 3.5
    assert score_unemp(7.0) == -2


def test_score_pmi_average():
    assert score_pmi(56, 54) == 2    # avg 55 -> 2
    assert score_pmi(None, 46) == -1   # 46 dans [45, 48) -> -1
    assert score_pmi(None, 44) == -2   # 44 < 45 -> -2
    assert score_pmi(None, None) == 0


def test_bias_labels():
    assert bias_from_score(13) == "STRONG BULL"
    assert bias_from_score(8) == "BULLISH"
    assert bias_from_score(0) == "NEUTRAL"
    assert bias_from_score(-8) == "BEARISH"


def test_score_currency_weighted():
    # Devise hawkish/forte : tous facteurs à +2 -> weighted = 17 (= MAX_ABS_SCORE)
    f = Fundamentals(rate=5, spread=1.5, cpi=5, gdp=4, unemployment=3.0,
                     pmi_manuf=60, pmi_services=60)
    sb = score_currency("USD", f)
    assert sb.weighted == 17.0
    assert sb.bias == "STRONG BULL"
    assert sb.confidence == 1.0
