LEVEL m3-negation
NAME L'envers du mutex
MODE match
DESC Le mutex naïf du niveau 2, vu en entier cette fois : 9 états atteignables, dont l'interdit.
TUTORIAL ¬ (tapez ~) est la négation ; elle porte sur ce qui la suit — parenthésez le reste : ¬(… ∧ …). Souvent, ≠ (tapez /=) et ∨ (tapez \/) donnent une formule plus courte que ¬.
GOAL Caractérisez tous les états SÛRS — le complément exact de l'état interdit.

VARIABLES
  pc0 ∈ {"idle", "ready", "crit"} = "idle"
  pc1 ∈ {"idle", "ready", "crit"} = "idle"
  flag0 ∈ {0, 1} = 0
  flag1 ∈ {0, 1} = 0

ACTION check0 ≜ pc0 = "idle" ∧ flag1 = 0 → pc0 := "ready"
ACTION enter0 ≜ pc0 = "ready" → pc0 := "crit" ∧ flag0 := 1
ACTION exit0  ≜ pc0 = "crit" → pc0 := "idle" ∧ flag0 := 0
ACTION check1 ≜ pc1 = "idle" ∧ flag0 = 0 → pc1 := "ready"
ACTION enter1 ≜ pc1 = "ready" → pc1 := "crit" ∧ flag1 := 1
ACTION exit1  ≜ pc1 = "crit" → pc1 := "idle" ∧ flag1 := 0

INVARIANT ¬(pc0 = "crit" ∧ pc1 = "crit")
TARGET ¬(pc0 = "crit" ∧ pc1 = "crit")
COLOR (pc0 = "crit") + (pc1 = "crit")
LABEL pc0, pc1
