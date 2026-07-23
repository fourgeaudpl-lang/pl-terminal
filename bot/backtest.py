#!/usr/bin/env python3
"""Backtest minimal (scaffold) du moteur de signaux.

But : mesurer si les signaux ont un edge, AVANT tout paper/live. On rejoue une
série de photos de fondamentaux datées et on confronte chaque signal au
rendement forward de la paire.

Entrées :
  --history history.yaml   liste datée de snapshots :
        - date: "2025-01-01"
          fundamentals: { USD: {rate: 4.5, ...}, EUR: {...}, ... }
        - date: "2025-02-01"
          fundamentals: { ... }
  --prices prices.csv      colonnes : date,symbol,close  (close = prix spot)
  --horizon 20             horizon forward en lignes de prix (jours)

Sortie : hit rate global et P&L moyen en pips par signal. C'est un point de
départ honnête, pas un moteur de backtest institutionnel (pas de coûts, pas
de spread intrabar, pas de gestion fine du timing d'annonce).
"""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict

import yaml

from robot.currencies import pip_size
from robot.scoring import Fundamentals
from robot.signals import actionable, generate_signals


def _load_history(path: str):
    with open(path, "r", encoding="utf-8") as fh:
        rows = yaml.safe_load(fh) or []
    out = []
    for row in rows:
        fund = {
            ccy: Fundamentals(**vals)
            for ccy, vals in (row.get("fundamentals", {}) or {}).items()
        }
        out.append((row["date"], fund))
    return out


def _load_prices(path: str):
    # {symbol: [(date, close), ...]} trié par date
    px = defaultdict(list)
    with open(path, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            px[r["symbol"]].append((r["date"], float(r["close"])))
    for sym in px:
        px[sym].sort(key=lambda t: t[0])
    return px


def _forward_pips(prices, symbol, date, horizon):
    series = prices.get(symbol)
    if not series:
        return None
    idx = next((i for i, (d, _) in enumerate(series) if d >= date), None)
    if idx is None or idx + horizon >= len(series):
        return None
    entry = series[idx][1]
    exit_ = series[idx + horizon][1]
    return (exit_ - entry) / pip_size(symbol[:3], symbol[3:])


def main() -> None:
    ap = argparse.ArgumentParser(description="Backtest scaffold du robot")
    ap.add_argument("--history", required=True)
    ap.add_argument("--prices", required=True)
    ap.add_argument("--horizon", type=int, default=20)
    ap.add_argument("--threshold", type=float, default=6.0)
    args = ap.parse_args()

    history = _load_history(args.history)
    prices = _load_prices(args.prices)

    n, wins, total_pips = 0, 0, 0.0
    for date, fund in history:
        _, signals = generate_signals(fund, threshold=args.threshold)
        for s in actionable(signals):
            fwd = _forward_pips(prices, s.symbol, date, args.horizon)
            if fwd is None:
                continue
            signed = fwd if s.direction == "LONG" else -fwd
            n += 1
            wins += 1 if signed > 0 else 0
            total_pips += signed

    if n == 0:
        print("Aucun signal évaluable (vérifie les dates/paires du CSV).")
        return
    print(f"Signaux évalués : {n}")
    print(f"Hit rate        : {wins / n * 100:.1f}%")
    print(f"P&L moyen       : {total_pips / n:+.1f} pips / signal")
    print(f"P&L cumulé      : {total_pips:+.0f} pips")


if __name__ == "__main__":
    main()
