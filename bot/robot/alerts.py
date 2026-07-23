"""Alertes : sortie console + webhook optionnel (Discord / Slack / générique).

C'est le "output" du robot en mode signaux : au lieu de passer un ordre, il
te notifie. Rien n'est envoyé nulle part si aucun webhook n'est configuré.
"""

from __future__ import annotations

import json
import urllib.request


def notify_console(title: str, lines: list[str]) -> None:
    bar = "─" * 60
    print(bar)
    print(title)
    print(bar)
    for ln in lines:
        print("  " + ln)
    print(bar)


def notify_webhook(url: str, title: str, lines: list[str], timeout: float = 10.0) -> bool:
    """Poste un message. Format Slack/Discord-compatible via champ `content`/`text`.

    Renvoie True si le POST a réussi (2xx), False sinon.
    """
    if not url:
        return False
    body = title + "\n" + "\n".join(lines)
    # Discord attend {"content": ...}, Slack {"text": ...} : on envoie les deux.
    payload = json.dumps({"content": body, "text": body}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "pl-terminal-bot"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 300
    except Exception as exc:
        print(f"[alerts] webhook échec: {exc}")
        return False


def dispatch(title: str, lines: list[str], webhook_url: str | None = None) -> None:
    """Envoie l'alerte sur tous les canaux configurés."""
    notify_console(title, lines)
    if webhook_url:
        ok = notify_webhook(webhook_url, title, lines)
        print(f"[alerts] webhook {'OK' if ok else 'KO'}")
