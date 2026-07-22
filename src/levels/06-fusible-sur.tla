LEVEL p1-fusible-sur
NAME Le fusible blindé
MODE prove
DESC Le circuit corrigé ne peut plus griller. Prouvez-le.
GOAL Prouvez la règle.

VARIABLES
  charge ∈ {0, 1, 2, 3, 4} = 0

ACTION load ≜ charge < 2 → charge := charge + 1
ACTION vent ≜ charge > 0 → charge := charge - 1

ATOM Grille ≜ charge = 3
ATOM Marge ≜ charge ≤ 2

INVARIANT ¬Grille
COLOR charge
LABEL charge
