"""PL Terminal — Robot de signaux FX macro.

Service Python autonome qui transforme les fondamentaux macro (les mêmes
que le terminal pl-terminal) en signaux directionnels sur les 28 paires
des 8 devises majeures, avec une surcouche "surprise vs consensus" sur les
annonces économiques.

MODE PAR DÉFAUT : signaux / alertes uniquement + paper trading virtuel.
Aucun ordre réel n'est passé. Aucun courtier n'est connecté.
"""

__version__ = "0.1.0"
