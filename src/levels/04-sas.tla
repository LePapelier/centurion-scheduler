LEVEL t5-sas
NAME Le sas
MODE trace
DESC La règle : jamais les deux portes ouvertes. La dépressurisation, elle, ne vérifie rien.
GOAL Ouvrez les deux portes en même temps.

VARIABLES
  interieure ∈ {"fermée", "ouverte"} = "fermée"
  exterieure ∈ {"fermée", "ouverte"} = "fermée"
  pression ∈ {"basse", "haute"} = "basse"

ACTION ouvrir_int ≜ pression = "haute" ∧ interieure = "fermée" → interieure := "ouverte"
ACTION fermer_int ≜ interieure = "ouverte" → interieure := "fermée"
ACTION ouvrir_ext ≜ pression = "basse" ∧ exterieure = "fermée" → exterieure := "ouverte"
ACTION fermer_ext ≜ exterieure = "ouverte" → exterieure := "fermée"
ACTION pressuriser ≜ exterieure = "fermée" ∧ pression = "basse" → pression := "haute"
ACTION depressuriser ≜ pression = "haute" → pression := "basse"

INVARIANT ¬(interieure = "ouverte" ∧ exterieure = "ouverte")
COLOR (interieure = "ouverte") + (exterieure = "ouverte")
LABEL interieure, exterieure, pression
