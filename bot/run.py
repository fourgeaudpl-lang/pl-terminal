#!/usr/bin/env python3
"""Point d'entrée du robot de signaux FX.

Usage :
    python run.py once            # un seul cycle et on sort
    python run.py loop --every 300  # boucle toutes les 300s (mode "en direct")

MODE SIGNAUX / ALERTES + PAPER TRADING UNIQUEMENT.
Aucun ordre réel n'est jamais passé, aucun courtier n'est connecté.
"""

from __future__ import annotations

import argparse
import time

from robot.config import load_config
from robot.engine import run_once


def main() -> None:
    parser = argparse.ArgumentParser(description="PL Terminal — robot de signaux FX")
    parser.add_argument("mode", choices=["once", "loop"], nargs="?", default="once")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--every", type=int, default=300, help="intervalle (s) en mode loop")
    args = parser.parse_args()

    cfg = load_config(args.config)

    if args.mode == "once":
        run_once(cfg)
        return

    print(f"[loop] cycle toutes les {args.every}s — Ctrl+C pour arrêter")
    try:
        while True:
            run_once(cfg)
            time.sleep(args.every)
    except KeyboardInterrupt:
        print("\n[loop] arrêt demandé.")


if __name__ == "__main__":
    main()
