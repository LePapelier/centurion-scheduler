LEVEL t5-triangle
NAME Le triangle ferroviaire
MODE trace
DESC La règle : jamais les trois trains coincés sur l'anneau. Chaque train prend son entrée, puis la suivante.
GOAL Provoquez le blocage circulaire.

VARIABLES
  t0 ∈ {"quai", "entré", "passé"} = "quai"
  t1 ∈ {"quai", "entré", "passé"} = "quai"
  t2 ∈ {"quai", "entré", "passé"} = "quai"
  s0 ∈ {0, 1} = 0
  s1 ∈ {0, 1} = 0
  s2 ∈ {0, 1} = 0

ACTION avancer0 ≜ t0 = "quai" ∧ s0 = 0 → t0 := "entré" ∧ s0 := 1
ACTION franchir0 ≜ t0 = "entré" ∧ s1 = 0 → t0 := "passé" ∧ s1 := 1
ACTION degager0 ≜ t0 = "passé" → t0 := "quai" ∧ s0 := 0 ∧ s1 := 0
ACTION avancer1 ≜ t1 = "quai" ∧ s1 = 0 → t1 := "entré" ∧ s1 := 1
ACTION franchir1 ≜ t1 = "entré" ∧ s2 = 0 → t1 := "passé" ∧ s2 := 1
ACTION degager1 ≜ t1 = "passé" → t1 := "quai" ∧ s1 := 0 ∧ s2 := 0
ACTION avancer2 ≜ t2 = "quai" ∧ s2 = 0 → t2 := "entré" ∧ s2 := 1
ACTION franchir2 ≜ t2 = "entré" ∧ s0 = 0 → t2 := "passé" ∧ s0 := 1
ACTION degager2 ≜ t2 = "passé" → t2 := "quai" ∧ s2 := 0 ∧ s0 := 0

INVARIANT ¬(t0 = "entré" ∧ t1 = "entré" ∧ t2 = "entré")
COLOR (t0 = "entré") + (t1 = "entré") + (t2 = "entré")
LABEL t0, t1, t2
