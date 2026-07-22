LEVEL p2-mutex-corrige
NAME Le mutex corrigé
MODE prove
DESC Le mutex corrigé tient. Prouvez-le.
GOAL Une brique miroir C1, puis la règle.

VARIABLES
  pc0 ∈ {"idle", "ready", "crit"} = "idle"
  pc1 ∈ {"idle", "ready", "crit"} = "idle"
  flag0 ∈ {0, 1} = 0
  flag1 ∈ {0, 1} = 0

ACTION check0 ≜ pc0 = "idle" ∧ flag1 = 0 → pc0 := "ready"
ACTION enter0 ≜ pc0 = "ready" ∧ flag1 = 0 → pc0 := "crit" ∧ flag0 := 1
ACTION exit0  ≜ pc0 = "crit" → pc0 := "idle" ∧ flag0 := 0
ACTION check1 ≜ pc1 = "idle" ∧ flag0 = 0 → pc1 := "ready"
ACTION enter1 ≜ pc1 = "ready" ∧ flag0 = 0 → pc1 := "crit" ∧ flag1 := 1
ACTION exit1  ≜ pc1 = "crit" → pc1 := "idle" ∧ flag1 := 0

ATOM Crit0 ≜ pc0 = "crit"
ATOM Crit1 ≜ pc1 = "crit"
ATOM Flag0 ≜ flag0 = 1
ATOM Flag1 ≜ flag1 = 1

INVARIANT ¬(Crit0 ∧ Crit1)
LEMMA C0 ≜ Crit0 ⇒ Flag0
COLOR (pc0 = "crit") + (pc1 = "crit")
LABEL pc0, pc1
