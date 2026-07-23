# PL Robot — robot de signaux FX macro

Service Python qui transforme les fondamentaux macro (les **mêmes** que ton
terminal `pl-terminal`) en **signaux directionnels** sur les 28 paires des 8
devises majeures, avec une surcouche **« surprise vs consensus »** sur les
annonces économiques en direct.

> **Mode actuel : signaux / alertes + paper trading uniquement.**
> Aucun ordre réel n'est passé, aucun courtier n'est connecté, aucun argent
> réel n'est en jeu. C'est volontaire : on valide la stratégie d'abord.

---

## À lire avant tout — ce que ce robot est, et ce qu'il n'est pas

**Ce qu'il fait, comme un trader macro de banque :** il se forge une vue
directionnelle par devise à partir des fondamentaux (politique monétaire,
différentiel de taux, inflation, croissance, emploi, PMI), puis achète la
devise forte contre la faible, et ajuste quand une annonce surprend le
consensus.

**Ce qu'il n'est pas :**
- ❌ Ce n'est **pas** un scalpeur de news à la microseconde. Ce jeu-là, en
  retail, on le perd (spread qui explose, slippage, faux départs). On raisonne
  « surprise vs consensus » sur un horizon jours, pas au tick.
- ❌ Ce n'est **pas** une garantie de gain. Un signal n'est pas une prédiction.
- ❌ Il **n'exécute rien**. Par choix, pour l'instant.

**La règle d'or :** signaux → **backtest** → **paper trading** (démo) →
et seulement si l'edge est prouvé, une éventuelle bascule vers du réel en tout
petit. Ne saute aucune étape.

---

## Architecture

```
bot/
├── run.py                 # point d'entrée CLI (once | loop)
├── backtest.py            # backtest scaffold (edge avant paper)
├── config.yaml            # réglages du robot
├── macro_snapshot.yaml    # LES FONDAMENTAUX (ta source de vérité)
├── requirements.txt
└── robot/
    ├── currencies.py      # 8 majors, 28 paires, pips
    ├── scoring.py         # port fidèle du scoring de script.js
    ├── macro.py           # chargement fondamentaux (+ spreads live du terminal)
    ├── calendar_feed.py   # annonces + surprise vs consensus
    ├── signals.py         # score par devise -> signal par paire
    ├── risk.py            # sizing + stop-loss / take-profit suggérés
    ├── prices.py          # prix spot (lecture seule) pour le paper
    ├── paper.py           # portefeuille virtuel (JSON)
    ├── alerts.py          # console + webhook Discord/Slack
    └── engine.py          # orchestration d'un cycle
```

Le moteur de score est un **port 1:1** de `script.js` (mêmes seuils, mêmes
poids). Le robot et le terminal donnent donc toujours le même biais pour une
même photo de fondamentaux.

### Réutilisation de ton terminal

Si tu renseignes `terminal_base_url` (ton déploiement Cloudflare Pages), le
robot appelle directement :
- `/api/yields` → spreads de taux 10Y-2Y en direct (facteur « rate_diff »)
- `/api/calendar` → calendrier économique G10 (source Finnhub)

Il **réutilise ainsi tes clés FRED/Finnhub** déjà stockées côté serveur : rien
à recopier. Sans URL, le robot tourne à 100 % hors-ligne à partir du seul
`macro_snapshot.yaml`.

---

## Installation

```bash
cd bot
pip install -r requirements.txt        # seule dépendance : PyYAML
```

## Utilisation

```bash
# Un cycle unique (affiche biais, signaux, plans, paper)
python run.py once

# Mode "en direct" : recalcule toutes les 5 minutes
python run.py loop --every 300
```

Optionnel — alertes Discord/Slack et connexion au terminal :

```bash
export TERMINAL_BASE_URL="https://ton-terminal.pages.dev"
export WEBHOOK_URL="https://discord.com/api/webhooks/xxx/yyy"
python run.py loop --every 300
```

## Tenir les fondamentaux à jour

`macro_snapshot.yaml` est **ta source de vérité** — exactement les champs de la
page MACRO du terminal. Quand un chiffre tombe (CPI, PIB, PMI, décision de
banque centrale), mets-le à jour ici. Le facteur `spread` peut être laissé vide
et sera récupéré en direct via `/api/yields`.

## Backtest (à faire avant le paper)

```bash
python backtest.py --history history.yaml --prices prices.csv --horizon 20
```

- `history.yaml` : une liste datée de snapshots de fondamentaux.
- `prices.csv` : colonnes `date,symbol,close`.

Le backtest confronte chaque signal au rendement forward de la paire et sort un
hit rate + P&L moyen en pips. C'est un **scaffold honnête** (pas de coûts ni de
spread modélisés) : il sert à détecter un edge, pas à promettre un rendement.

## Réglages clés (`config.yaml`)

| Réglage | Rôle |
|---|---|
| `signal_threshold` | écart de score (base − quote) requis pour un signal |
| `news_weight` | poids d'une surprise d'annonce maximale (en points de score) |
| `min_impact` / `within_hours` | filtre des annonces « en direct » |
| `risk.risk_per_trade_pct` | % du capital risqué par trade |
| `risk.stop_pips` / `reward_risk` | stop-loss et ratio rendement/risque |
| `risk.max_open_risk_pct` | risque cumulé simultané maximum |

---

## Et pour passer un jour à l'exécution ?

Le code est déjà structuré pour ça : les `TradePlan` (symbole, sens, taille,
SL, TP) sont le format qu'attendrait un courtier. Le jour où tu voudras
exécuter — **après** un paper trading concluant sur compte démo — il suffira
d'ajouter un module `broker/` (ex. OANDA v20 en démo) qui consomme ces plans.
On ne le fait pas maintenant : d'abord prouver l'edge.

## Avertissement

Le trading du forex avec effet de levier comporte un risque élevé de perte en
capital. Cet outil est éducatif et fournit des signaux indicatifs, pas des
conseils en investissement. Reste sur compte démo tant que la stratégie n'a pas
fait ses preuves.
