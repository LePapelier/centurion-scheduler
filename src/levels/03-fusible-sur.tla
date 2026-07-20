LEVEL p1-fusible-sur
NAME Le fusible blindé
MODE prove
DESC Le circuit corrigé : la garde de load s'arrête un cran plus tôt. Cette fois le fusible ne PEUT pas sauter — prouvez-le.
GOAL Prouvez l'INVARIANT par induction.

VARIABLES
  charge ∈ {0, 1, 2, 3} = 0

ACTION load ≜ charge < 2 → charge := charge + 1
ACTION vent ≜ charge > 0 → charge := charge - 1

INVARIANT charge < 3
COLOR charge
LABEL charge
