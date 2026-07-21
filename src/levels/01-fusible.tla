LEVEL t1-fusible
NAME Le fusible
MODE trace
DESC Trop de charge et le fusible saute.
GOAL Faites sauter le fusible.

VARIABLES
  charge ∈ {0, 1, 2, 3} = 0

ACTION load ≜ charge < 3 → charge := charge + 1

INVARIANT charge < 3
COLOR charge
LABEL charge
