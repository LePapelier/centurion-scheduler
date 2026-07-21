LEVEL t2-mutex
NAME Mutex naïf
MODE trace
DESC Deux processus, un seul droit d’entrée — en principe.
GOAL Faites-les entrer tous les deux en « crit ».

VARIABLES
  pc0 ∈ {"idle", "ready", "crit"} = "idle"
  pc1 ∈ {"idle", "ready", "crit"} = "idle"
  flag0 ∈ {0, 1} = 0
  flag1 ∈ {0, 1} = 0

ACTION check0 ≜ pc0 = "idle" ∧ flag1 = 0 → pc0 := "ready"
ACTION enter0 ≜ pc0 = "ready" → pc0 := "crit" ∧ flag0 := 1
ACTION check1 ≜ pc1 = "idle" ∧ flag0 = 0 → pc1 := "ready"
ACTION enter1 ≜ pc1 = "ready" → pc1 := "crit" ∧ flag1 := 1

INVARIANT ¬(pc0 = "crit" ∧ pc1 = "crit")
COLOR (pc0 = "crit") + (pc1 = "crit")
LABEL pc0, pc1
