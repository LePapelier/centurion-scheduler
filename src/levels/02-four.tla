LEVEL t2-four
NAME Le four industriel
MODE trace
DESC La règle : le four reste froid. La sécurité se réenclenche sans cesse.
GOAL Faites flamber le four.

VARIABLES
  securite ∈ {0, 1} = 1
  prechauffe ∈ {0, 1} = 0
  four ∈ {"froid", "brûlant"} = "froid"

ACTION couper ≜ securite = 1 → securite := 0
ACTION prechauffer ≜ securite = 0 ∧ prechauffe = 0 → prechauffe := 1 ∧ securite := 1
ACTION enflammer ≜ prechauffe = 1 ∧ securite = 0 ∧ four = "froid" → four := "brûlant"

INVARIANT four ≠ "brûlant"
COLOR prechauffe + (four = "brûlant")
LABEL securite, prechauffe
