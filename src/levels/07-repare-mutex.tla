LEVEL r1-mutex
NAME Réparer le mutex
MODE repair
DESC Le mutex naïf est cassé : l'entrée en section critique ne re-vérifie pas le drapeau adverse.
TUTORIAL Mode RÉPARATION : votre formule se conjoint (∧) à la garde de l'action choisie — elle ne peut que retirer des transitions. Les transitions tuées s'estompent en direct.
TUTORIAL Réparé = plus aucun état rouge atteignable, SANS bloquer les REQUIRE (chaque processus doit encore pouvoir entrer en section critique).
GOAL Renforcez enter0 et enter1 pour rendre l'exclusion mutuelle inviolable.

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
REPAIR enter0
REPAIR enter1
REQUIRE pc0 = "crit"
REQUIRE pc1 = "crit"
COLOR (pc0 = "crit") + (pc1 = "crit")
LABEL pc0, pc1
