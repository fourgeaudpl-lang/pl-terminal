"""Chargement de la configuration du robot (config.yaml + variables d'env)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

import yaml

from .risk import RiskParams


@dataclass
class Config:
    # Terminal déployé (réutilise tes clés Finnhub/FRED stockées côté Cloudflare).
    terminal_base_url: str = ""

    # Fichiers
    snapshot_path: str = "macro_snapshot.yaml"
    portfolio_path: str = "portfolio.json"

    # Signaux
    news_weight: float = 4.0
    signal_threshold: float = 6.0

    # News
    min_impact: str = "medium"
    within_hours: float = 6.0

    # Paper trading
    paper_enabled: bool = True

    # Alertes
    webhook_url: str = ""

    # Risque
    risk: RiskParams = field(default_factory=RiskParams)


def load_config(path: str = "config.yaml") -> Config:
    data = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}

    risk_data = data.get("risk", {}) or {}
    risk = RiskParams(
        account_equity=risk_data.get("account_equity", 10_000.0),
        risk_per_trade_pct=risk_data.get("risk_per_trade_pct", 0.5),
        stop_pips=risk_data.get("stop_pips", 40.0),
        reward_risk=risk_data.get("reward_risk", 2.0),
        max_open_risk_pct=risk_data.get("max_open_risk_pct", 2.0),
        pip_value_per_lot=risk_data.get("pip_value_per_lot", 10.0),
    )

    cfg = Config(
        terminal_base_url=os.environ.get("TERMINAL_BASE_URL", data.get("terminal_base_url", "")),
        snapshot_path=data.get("snapshot_path", "macro_snapshot.yaml"),
        portfolio_path=data.get("portfolio_path", "portfolio.json"),
        news_weight=data.get("news_weight", 4.0),
        signal_threshold=data.get("signal_threshold", 6.0),
        min_impact=data.get("min_impact", "medium"),
        within_hours=data.get("within_hours", 6.0),
        paper_enabled=data.get("paper_enabled", True),
        webhook_url=os.environ.get("WEBHOOK_URL", data.get("webhook_url", "")),
        risk=risk,
    )
    return cfg
