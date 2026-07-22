LEVEL p2-mutex-corrige
NAME Le mutex corrigé
MODE prove
DESC Le mutex corrigé tient. Prouvez-le.
GOAL Chaque « crit » lève son drapeau — les deux, puis la règle.

VARIABLES
  pc[i ∈ {0, 1}] ∈ {"idle", "ready", "crit"} = "idle"
  flag[i ∈ {0, 1}] ∈ {0, 1} = 0

ACTION check(i ∈ {0, 1}) ≜ pc[i] = "idle" ∧ flag[1-i] = 0 → pc[i] := "ready"
ACTION enter(i ∈ {0, 1}) ≜ pc[i] = "ready" ∧ flag[1-i] = 0 → pc[i] := "crit" ∧ flag[i] := 1
ACTION exit(i ∈ {0, 1}) ≜ pc[i] = "crit" → pc[i] := "idle" ∧ flag[i] := 0

ATOM Crit(i ∈ {0, 1}) ≜ pc[i] = "crit"
ATOM Flag(i ∈ {0, 1}) ≜ flag[i] = 1

INVARIANT ¬(Crit0 ∧ Crit1)
COLOR (pc0 = "crit") + (pc1 = "crit")
LABEL pc0, pc1
