LEVEL t2-porte
NAME La porte blindée
MODE trace
DESC La règle : cette porte reste fermée. Un geste brusque et elle se bloque.
GOAL Ouvrez la porte interdite.

VARIABLES
  cle ∈ {0, 1} = 0
  porte ∈ {"fermée", "ouverte", "bloquée"} = "fermée"

ACTION forcer ≜ porte = "fermée" → porte := "bloquée"
ACTION voler_cle ≜ cle = 0 ∧ porte = "fermée" → cle := 1
ACTION ouvrir ≜ cle = 1 ∧ porte = "fermée" → porte := "ouverte"

INVARIANT porte ≠ "ouverte"
COLOR cle
LABEL cle, porte
