LEVEL m4-disjonction
NAME La tablée
MODE match
DESC Trois philosophes, trois fourchettes. Chacun prend sa fourchette gauche, puis la droite, mange, puis repose tout.
TUTORIAL ∨ (tapez \/) est la disjonction : vraie dès qu'un des deux côtés l'est. Elle s'enchaîne : a ∨ b ∨ c.
GOAL Caractérisez les états où au moins un philosophe mange.

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

TARGET p0 = "eat" ∨ p1 = "eat" ∨ p2 = "eat"
COLOR (p0 = "eat") + (p1 = "eat") + (p2 = "eat")
LABEL p0, p1, p2
