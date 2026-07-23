"""Chargement des fondamentaux macro.

Deux sources, combinées :
  1. macro_snapshot.yaml   -> valeurs saisies à la main (comme dans le terminal,
                              qui les stocke en localStorage). Source de vérité.
  2. Terminal Cloudflare    -> /api/yields pour calculer le spread 10Y-2Y en direct
                              (facteur "rate_diff"), si une URL est configurée.

Le tout produit un dict {ccy: Fundamentals} prêt pour scoring.score_currency.
"""

from __future__ import annotations

import json
import urllib.request

import yaml

from .currencies import CCYS
from .scoring import Fundamentals


def load_snapshot(path: str) -> dict[str, Fundamentals]:
    """Lit macro_snapshot.yaml -> {ccy: Fundamentals}.

    Format attendu :
        USD:
          rate: 4.5
          cpi: 3.1
          gdp: 2.4
          unemployment: 4.1
          pmi_manuf: 49.2
          pmi_services: 52.8
          spread: 0.4        # optionnel, sinon récupéré via /api/yields
    """
    with open(path, "r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}

    out: dict[str, Fundamentals] = {}
    for ccy in CCYS:
        row = data.get(ccy, {}) or {}
        out[ccy] = Fundamentals(
            rate=row.get("rate"),
            spread=row.get("spread"),
            cpi=row.get("cpi"),
            gdp=row.get("gdp"),
            unemployment=row.get("unemployment"),
            pmi_manuf=row.get("pmi_manuf"),
            pmi_services=row.get("pmi_services"),
        )
    return out


def _http_get_json(url: str, timeout: float = 10.0):
    req = urllib.request.Request(url, headers={"User-Agent": "pl-terminal-bot"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def enrich_spreads_from_terminal(
    fundamentals: dict[str, Fundamentals], base_url: str
) -> list[str]:
    """Complète le champ `spread` via /api/yields du terminal déployé.

    Ne touche PAS aux spreads déjà renseignés dans le snapshot.
    Renvoie la liste des devises effectivement mises à jour.
    """
    updated: list[str] = []
    try:
        payload = _http_get_json(f"{base_url.rstrip('/')}/api/yields")
    except Exception as exc:  # réseau indispo, clé absente, etc. -> on continue
        print(f"[macro] /api/yields indisponible ({exc}); spreads du snapshot conservés")
        return updated

    yields = payload.get("yields", {})
    for ccy in CCYS:
        y = yields.get(ccy)
        if not y:
            continue
        spread = y.get("spread")
        if spread is None:
            continue
        if fundamentals[ccy].spread is None:
            fundamentals[ccy].spread = spread
            updated.append(ccy)
    return updated
