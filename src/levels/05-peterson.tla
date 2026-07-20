LEVEL p3-peterson
NAME Peterson
MODE prove
DESC L'algorithme de Peterson : drapeaux + tour de politesse. Le sommet de la campagne — prouvez son exclusion mutuelle.
TUTORIAL Deux briques vous sont DONNÉES : les drapeaux suivent les pc. Elles ne suffisent pas — il manque ce que le tour garantit à celui qui est en section critique pendant que l'autre attend.
GOAL Prouvez l'INVARIANT en vous appuyant sur les briques données.

VARIABLES
  pc0 ∈ {"idle", "want", "wait", "crit"} = "idle"
  pc1 ∈ {"idle", "want", "wait", "crit"} = "idle"
  flag0 ∈ {0, 1} = 0
  flag1 ∈ {0, 1} = 0
  turn ∈ {0, 1} = 0

ACTION want0  ≜ pc0 = "idle" → pc0 := "want" ∧ flag0 := 1
ACTION defer0 ≜ pc0 = "want" → pc0 := "wait" ∧ turn := 1
ACTION enter0 ≜ pc0 = "wait" ∧ (flag1 = 0 ∨ turn = 0) → pc0 := "crit"
ACTION exit0  ≜ pc0 = "crit" → pc0 := "idle" ∧ flag0 := 0
ACTION want1  ≜ pc1 = "idle" → pc1 := "want" ∧ flag1 := 1
ACTION defer1 ≜ pc1 = "want" → pc1 := "wait" ∧ turn := 0
ACTION enter1 ≜ pc1 = "wait" ∧ (flag0 = 0 ∨ turn = 1) → pc1 := "crit"
ACTION exit1  ≜ pc1 = "crit" → pc1 := "idle" ∧ flag1 := 0

INVARIANT ¬(pc0 = "crit" ∧ pc1 = "crit")
LEMMA pc0 ≠ "idle" ⇒ flag0 = 1
LEMMA pc1 ≠ "idle" ⇒ flag1 = 1
COLOR (pc0 = "crit") + (pc1 = "crit")
LABEL pc0, pc1, turn
