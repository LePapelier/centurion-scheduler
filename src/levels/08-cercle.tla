LEVEL r2-philosophes
NAME Briser le cercle
MODE repair
DESC La tablée du niveau 6 se bloque quand chacun tient sa fourchette gauche : attente circulaire, plus personne ne mangera.
TUTORIAL Une réparation peut regarder TOUT l'état : la garde d'un philosophe peut mentionner les autres. Le deadlock a trois derniers pas possibles — un renfort par prise de fourchette.
GOAL Rendez l'attente circulaire inatteignable sans affamer personne.

VARIABLES
  p0 ∈ {"think", "left", "eat"} = "think"
  p1 ∈ {"think", "left", "eat"} = "think"
  p2 ∈ {"think", "left", "eat"} = "think"
  f0 ∈ {0, 1} = 0
  f1 ∈ {0, 1} = 0
  f2 ∈ {0, 1} = 0

ACTION takeL0 ≜ p0 = "think" ∧ f0 = 0 → p0 := "left" ∧ f0 := 1
ACTION takeR0 ≜ p0 = "left" ∧ f1 = 0 → p0 := "eat" ∧ f1 := 1
ACTION done0  ≜ p0 = "eat" → p0 := "think" ∧ f0 := 0 ∧ f1 := 0
ACTION takeL1 ≜ p1 = "think" ∧ f1 = 0 → p1 := "left" ∧ f1 := 1
ACTION takeR1 ≜ p1 = "left" ∧ f2 = 0 → p1 := "eat" ∧ f2 := 1
ACTION done1  ≜ p1 = "eat" → p1 := "think" ∧ f1 := 0 ∧ f2 := 0
ACTION takeL2 ≜ p2 = "think" ∧ f2 = 0 → p2 := "left" ∧ f2 := 1
ACTION takeR2 ≜ p2 = "left" ∧ f0 = 0 → p2 := "eat" ∧ f0 := 1
ACTION done2  ≜ p2 = "eat" → p2 := "think" ∧ f2 := 0 ∧ f0 := 0

INVARIANT ¬(p0 = "left" ∧ p1 = "left" ∧ p2 = "left")
REPAIR takeL0
REPAIR takeL1
REPAIR takeL2
REQUIRE p0 = "eat"
REQUIRE p1 = "eat"
REQUIRE p2 = "eat"
COLOR (p0 = "left") + (p1 = "left") + (p2 = "left")
LABEL p0, p1, p2
