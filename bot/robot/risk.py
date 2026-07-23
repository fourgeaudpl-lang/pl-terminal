"""Gestion du risque : sizing, stop-loss / take-profit suggérés.

Rien n'est exécuté. On produit juste, pour chaque signal, une proposition
cohérente que TU valides à la main : combien risquer, où placer le stop et
la cible, et le ratio rendement/risque.

Règle de base (celle de tout desk sérieux) : on définit d'abord le risque
en pourcentage du capital, PUIS la taille de position en découle du stop.
"""

from __future__ import annotations

from dataclasses import dataclass

from .signals import PairSignal


@dataclass
class RiskParams:
    account_equity: float = 10_000.0   # capital (démo) en devise du compte
    risk_per_trade_pct: float = 0.5    # % du capital risqué par trade
    stop_pips: float = 40.0            # distance du stop en pips
    reward_risk: float = 2.0          # cible = reward_risk * stop
    max_open_risk_pct: float = 2.0     # risque cumulé max simultané (%)
    pip_value_per_lot: float = 10.0    # valeur d'1 pip pour 1 lot standard (approx USD)


@dataclass
class TradePlan:
    symbol: str
    direction: str
    risk_amount: float     # montant risqué (devise du compte)
    stop_pips: float
    target_pips: float
    reward_risk: float
    size_lots: float       # taille suggérée en lots standards
    conviction: float

    def as_line(self) -> str:
        return (
            f"{self.direction:5} {self.symbol}  "
            f"risque={self.risk_amount:.0f}  SL={self.stop_pips:.0f}p  "
            f"TP={self.target_pips:.0f}p  R:R={self.reward_risk:.1f}  "
            f"taille≈{self.size_lots:.2f} lot"
        )


def plan_trade(sig: PairSignal, rp: RiskParams) -> TradePlan:
    """Construit un plan de trade (sizing + SL/TP) pour un signal donné.

    La taille est modulée par la conviction : à pleine conviction on risque
    `risk_per_trade_pct`, sinon proportionnellement moins (jamais plus).
    """
    risk_amount = rp.account_equity * (rp.risk_per_trade_pct / 100.0) * max(0.1, sig.conviction)
    # size_lots tel que stop_pips * pip_value_per_lot * lots = risk_amount
    denom = rp.stop_pips * rp.pip_value_per_lot
    size_lots = (risk_amount / denom) if denom > 0 else 0.0
    return TradePlan(
        symbol=sig.symbol,
        direction=sig.direction,
        risk_amount=risk_amount,
        stop_pips=rp.stop_pips,
        target_pips=rp.stop_pips * rp.reward_risk,
        reward_risk=rp.reward_risk,
        size_lots=round(size_lots, 2),
        conviction=sig.conviction,
    )


def plan_all(signals: list[PairSignal], rp: RiskParams) -> list[TradePlan]:
    """Plans pour tous les signaux actionnables, en respectant le risque cumulé max.

    On classe par conviction et on empile jusqu'à atteindre `max_open_risk_pct`.
    """
    plans: list[TradePlan] = []
    used_risk_pct = 0.0
    for sig in sorted(signals, key=lambda s: s.conviction, reverse=True):
        if sig.direction == "FLAT":
            continue
        plan = plan_trade(sig, rp)
        add_pct = plan.risk_amount / rp.account_equity * 100.0
        if used_risk_pct + add_pct > rp.max_open_risk_pct:
            continue  # on refuse : dépasserait le risque simultané autorisé
        used_risk_pct += add_pct
        plans.append(plan)
    return plans
