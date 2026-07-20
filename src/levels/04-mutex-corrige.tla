LEVEL p2-mutex-corrige
NAME Le mutex corrigé
MODE prove
DESC Le mutex du niveau 2, corrigé : l'entrée re-vérifie le drapeau adverse. Vous l'avez cassé — prouvez maintenant que celui-ci tient.
TUTORIAL Tapez l'invariant tel quel : des états fantômes (assombris) s'en échappent — il n'est pas inductif seul. La brique donnée C0 interdit les fantômes absurdes du processus 0 ; il manque la miroir côté processus 1.
TUTORIAL Une brique se nomme : « C1 ≜ votre formule ». Son nom se réutilise ensuite tel quel — inutile de retaper C0.
GOAL Prouvez l'INVARIANT : une brique miroir C1, puis lui.

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

INVARIANT ¬(pc0 = "crit" ∧ pc1 = "crit")
LEMMA C0 ≜ pc0 = "crit" ⇒ flag0 = 1
COLOR (pc0 = "crit") + (pc1 = "crit")
LABEL pc0, pc1
