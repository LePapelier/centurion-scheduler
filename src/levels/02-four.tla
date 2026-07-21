LEVEL t2-four
NAME Le four industriel
MODE trace
DESC La règle : le four reste froid. Deux doses de gaz, pas trois.
GOAL Faites flamber le four.

VARIABLES
  securite ∈ {0, 1} = 1
  gaz ∈ {0, 1, 2, 3} = 0
  four ∈ {"froid", "brûlant"} = "froid"

ACTION couper ≜ securite = 1 → securite := 0
ACTION injecter ≜ securite = 0 ∧ gaz < 3 → gaz := gaz + 1 ∧ securite := 1
ACTION purger ≜ gaz > 0 ∧ securite = 1 → gaz := 0
ACTION enflammer ≜ securite = 0 ∧ gaz = 2 ∧ four = "froid" → four := "brûlant"

INVARIANT four ≠ "brûlant"
COLOR gaz
LABEL securite, gaz
