LEVEL t2-verrous
NAME Les deux verrous
MODE trace
DESC Deux verrous. Jamais les deux à la fois, dit la règle.
GOAL Prenez les deux verrous.

VARIABLES
  a ∈ {0, 1} = 0
  b ∈ {0, 1} = 0

ACTION takeA ≜ a = 0 → a := 1
ACTION takeB ≜ b = 0 → b := 1

INVARIANT ¬(a = 1 ∧ b = 1)
COLOR a + b
LABEL a, b
