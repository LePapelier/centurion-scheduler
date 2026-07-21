LEVEL t4-banque
NAME Le double retrait
MODE trace
DESC La règle : le compte ne passe jamais dans le rouge. Deux guichets, un solde.
GOAL Mettez le compte dans le rouge.

VARIABLES
  solde ∈ {-1, 0, 1} = 1
  g0 ∈ {"libre", "vu", "servi"} = "libre"
  g1 ∈ {"libre", "vu", "servi"} = "libre"

ACTION consulter0 ≜ g0 = "libre" ∧ solde > 0 → g0 := "vu"
ACTION retirer0 ≜ g0 = "vu" → solde := solde - 1 ∧ g0 := "servi"
ACTION consulter1 ≜ g1 = "libre" ∧ solde > 0 → g1 := "vu"
ACTION retirer1 ≜ g1 = "vu" → solde := solde - 1 ∧ g1 := "servi"

INVARIANT solde ≥ 0
COLOR 1 - solde
LABEL solde, g0, g1
