"""Paper trading : portefeuille 100% virtuel, persisté en JSON.

Sert à bâtir un track record des signaux SANS aucun argent réel ni courtier.
Chaque position ouverte enregistre son prix d'entrée ; le mark-to-market
utilise les prix spot (module prices) pour calculer un P&L en pips et en
devise du compte.

C'est l'étape de validation obligatoire avant même d'envisager du réel.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field

from .currencies import pip_size
from .prices import cross_rate


@dataclass
class Position:
    id: str
    symbol: str
    base: str
    quote: str
    direction: str      # LONG / SHORT
    entry: float
    size_lots: float
    stop_pips: float
    target_pips: float
    opened_at: str
    reason: str = ""
    status: str = "OPEN"    # OPEN / CLOSED
    exit: float | None = None
    closed_at: str | None = None
    pnl_pips: float | None = None
    pnl_ccy: float | None = None


@dataclass
class Portfolio:
    equity: float = 10_000.0
    pip_value_per_lot: float = 10.0
    positions: list[Position] = field(default_factory=list)

    # --- persistance --------------------------------------------------------
    @classmethod
    def load(cls, path: str) -> "Portfolio":
        if not os.path.exists(path):
            return cls()
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        pf = cls(
            equity=data.get("equity", 10_000.0),
            pip_value_per_lot=data.get("pip_value_per_lot", 10.0),
        )
        pf.positions = [Position(**p) for p in data.get("positions", [])]
        return pf

    def save(self, path: str) -> None:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "equity": self.equity,
                    "pip_value_per_lot": self.pip_value_per_lot,
                    "positions": [asdict(p) for p in self.positions],
                },
                fh,
                indent=2,
                ensure_ascii=False,
            )

    # --- opérations ---------------------------------------------------------
    def open_positions(self) -> list[Position]:
        return [p for p in self.positions if p.status == "OPEN"]

    def has_open(self, symbol: str) -> bool:
        return any(p.symbol == symbol and p.status == "OPEN" for p in self.positions)

    def open_position(self, plan, entry: float, when: str, reason: str = "") -> Position | None:
        """Ouvre une position virtuelle depuis un TradePlan. Ignore si déjà ouverte."""
        if self.has_open(plan.symbol):
            return None
        base, quote = plan.symbol[:3], plan.symbol[3:]
        pos = Position(
            id=f"{plan.symbol}-{when}",
            symbol=plan.symbol,
            base=base,
            quote=quote,
            direction=plan.direction,
            entry=entry,
            size_lots=plan.size_lots,
            stop_pips=plan.stop_pips,
            target_pips=plan.target_pips,
            opened_at=when,
            reason=reason,
        )
        self.positions.append(pos)
        return pos

    def _signed_pips(self, pos: Position, price: float) -> float:
        raw = (price - pos.entry) / pip_size(pos.base, pos.quote)
        return raw if pos.direction == "LONG" else -raw

    def mark_to_market(self, usd_rates: dict[str, float]) -> dict:
        """Valorise les positions ouvertes. Déclenche SL/TP si atteints."""
        unrealized_pips = 0.0
        unrealized_ccy = 0.0
        for pos in self.open_positions():
            price = cross_rate(pos.base, pos.quote, usd_rates)
            if price is None:
                continue
            pips = self._signed_pips(pos, price)
            # Stop / target virtuels
            if pips <= -pos.stop_pips:
                self._close(pos, pos.entry + _px_from_pips(pos, -pos.stop_pips), "SL")
            elif pips >= pos.target_pips:
                self._close(pos, pos.entry + _px_from_pips(pos, pos.target_pips), "TP")
            else:
                unrealized_pips += pips
                unrealized_ccy += pips * self.pip_value_per_lot * pos.size_lots
        return {"unrealized_pips": unrealized_pips, "unrealized_ccy": unrealized_ccy}

    def _close(self, pos: Position, exit_price: float, when: str) -> None:
        pips = self._signed_pips(pos, exit_price)
        pos.status = "CLOSED"
        pos.exit = exit_price
        pos.closed_at = when
        pos.pnl_pips = pips
        pos.pnl_ccy = pips * self.pip_value_per_lot * pos.size_lots
        self.equity += pos.pnl_ccy

    def realized_pnl(self) -> float:
        return sum(p.pnl_ccy or 0.0 for p in self.positions if p.status == "CLOSED")


def _px_from_pips(pos: Position, pips: float) -> float:
    """Retourne la variation de PRIX correspondant à `pips` dans le sens du trade."""
    delta = pips * pip_size(pos.base, pos.quote)
    return delta if pos.direction == "LONG" else -delta
