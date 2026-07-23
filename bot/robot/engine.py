"""Orchestration d'un cycle du robot.

Un "run" =
  1. charge les fondamentaux (snapshot + spreads live du terminal)
  2. récupère les annonces récentes et calcule les surprises
  3. génère les signaux par paire
  4. construit les plans de trade (sizing + SL/TP)
  5. met à jour le paper trading (mark-to-market + ouverture des nouveaux)
  6. envoie les alertes
"""

from __future__ import annotations

from datetime import datetime, timezone

from . import calendar_feed, macro, prices
from .alerts import dispatch
from .config import Config
from .paper import Portfolio
from .risk import plan_all
from .signals import actionable, generate_signals


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_once(cfg: Config, *, verbose: bool = True) -> dict:
    ts = _now_iso()

    # 1) Fondamentaux
    fundamentals = macro.load_snapshot(cfg.snapshot_path)
    if cfg.terminal_base_url:
        macro.enrich_spreads_from_terminal(fundamentals, cfg.terminal_base_url)

    # 2) Annonces / surprises
    surprises = []
    if cfg.terminal_base_url:
        try:
            events = calendar_feed.fetch_events(cfg.terminal_base_url)
            surprises = calendar_feed.compute_surprises(
                events, min_impact=cfg.min_impact, within_hours=cfg.within_hours
            )
        except Exception as exc:
            print(f"[engine] calendrier indisponible ({exc})")

    # 3) Signaux
    scores, signals = generate_signals(
        fundamentals, surprises,
        news_weight=cfg.news_weight, threshold=cfg.signal_threshold,
    )
    live = actionable(signals)

    # 4) Plans de trade
    plans = plan_all(live, cfg.risk)

    # 5) Paper trading
    paper_summary = {}
    if cfg.paper_enabled:
        paper_summary = _update_paper(cfg, plans, ts)

    # 6) Alertes
    if verbose:
        _emit(cfg, ts, scores, live, plans, surprises, paper_summary)

    return {
        "ts": ts,
        "scores": scores,
        "signals": signals,
        "actionable": live,
        "plans": plans,
        "surprises": surprises,
        "paper": paper_summary,
    }


def _update_paper(cfg: Config, plans, ts: str) -> dict:
    pf = Portfolio.load(cfg.portfolio_path)
    pf.equity = pf.equity or cfg.risk.account_equity
    pf.pip_value_per_lot = cfg.risk.pip_value_per_lot

    usd_rates = {}
    try:
        usd_rates = prices.fetch_usd_rates()
    except Exception as exc:
        print(f"[engine] prix spot indisponibles ({exc}); pas de mark-to-market")

    mtm = {}
    if usd_rates:
        mtm = pf.mark_to_market(usd_rates)
        # Ouverture des nouveaux signaux au prix spot courant
        for plan in plans:
            base, quote = plan.symbol[:3], plan.symbol[3:]
            px = prices.cross_rate(base, quote, usd_rates)
            if px is not None:
                pf.open_position(plan, px, ts, reason="signal macro")

    pf.save(cfg.portfolio_path)
    return {
        "equity": pf.equity,
        "open": len(pf.open_positions()),
        "realized_pnl": pf.realized_pnl(),
        **mtm,
    }


def _emit(cfg, ts, scores, live, plans, surprises, paper_summary) -> None:
    lines: list[str] = []

    if surprises:
        lines.append("⚡ ANNONCES RÉCENTES (surprise vs consensus)")
        for s in surprises[:8]:
            sign = "haussier" if s.is_bullish else "baissier"
            lines.append(
                f"   {s.ccy} {s.event}: {s.actual} vs {s.estimate} → {sign}"
            )
        lines.append("")

    lines.append(f"BIAIS PAR DEVISE (score pondéré, comme le terminal)")
    for ccy, sb in sorted(scores.items(), key=lambda kv: kv[1].weighted, reverse=True):
        lines.append(f"   {ccy}: {sb.weighted:+.1f}  {sb.bias}")
    lines.append("")

    if live:
        lines.append(f"SIGNAUX ({len(live)})")
        for s in live[:12]:
            lines.append("   " + s.as_line())
    else:
        lines.append("Aucun signal au-dessus du seuil.")
    lines.append("")

    if plans:
        lines.append("PLANS DE TRADE (à valider à la main — aucun ordre envoyé)")
        for p in plans:
            lines.append("   " + p.as_line())
        lines.append("")

    if paper_summary:
        lines.append(
            f"PAPER: equity={paper_summary.get('equity', 0):.0f}  "
            f"ouvertes={paper_summary.get('open', 0)}  "
            f"P&L réalisé={paper_summary.get('realized_pnl', 0):+.0f}  "
            f"latent={paper_summary.get('unrealized_ccy', 0):+.0f}"
        )

    dispatch(f"🤖 PL ROBOT — {ts}", lines, cfg.webhook_url)
