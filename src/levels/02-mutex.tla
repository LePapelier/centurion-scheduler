LEVEL t2-mutex
NAME Mutex naïf
MODE trace
DESC Deux processus protègent leur section critique par un drapeau — mais chacun teste le drapeau de l'autre AVANT de lever le sien.
TUTORIAL Deux processus s'entrelacent : à chaque pas, VOUS choisissez qui avance. Un ordonnancement malveillant suffit à casser un protocole faux.
GOAL Faites entrer les deux processus en section critique en même temps.

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
COLOR (pc0 = "crit") + (pc1 = "crit")
LABEL pc0, pc1
