LEVEL t5-triangle
NAME Le triangle ferroviaire
MODE trace
DESC La règle : jamais les trois trains coincés sur l'anneau. Chaque train prend son entrée, puis la suivante.
GOAL Provoquez le blocage circulaire.

VARIABLES
  t[i ∈ {0, 1, 2}] ∈ {"quai", "entré", "passé"} = "quai"
  s[i ∈ {0, 1, 2}] ∈ {0, 1} = 0

ACTION avancer(i ∈ {0, 1, 2})  ≜ t[i] = "quai" ∧ s[i] = 0 → t[i] := "entré" ∧ s[i] := 1
ACTION franchir(i ∈ {0, 1, 2}) ≜ t[i] = "entré" ∧ s[(i+1)%3] = 0 → t[i] := "passé" ∧ s[(i+1)%3] := 1
ACTION degager(i ∈ {0, 1, 2})  ≜ t[i] = "passé" → t[i] := "quai" ∧ s[i] := 0 ∧ s[(i+1)%3] := 0

INVARIANT ¬(t0 = "entré" ∧ t1 = "entré" ∧ t2 = "entré")
COLOR (t0 = "entré") + (t1 = "entré") + (t2 = "entré")
LABEL t0, t1, t2
