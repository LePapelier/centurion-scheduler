LEVEL t4-banque
NAME Le double retrait
MODE trace
DESC La règle : le compte ne passe jamais dans le rouge. Deux guichets, un solde.
GOAL Mettez le compte dans le rouge.

VARIABLES
  solde ∈ {-1, 0, 1} = 1
  g[i ∈ {0, 1}] ∈ {"libre", "vu", "servi"} = "libre"

ACTION consulter(i ∈ {0, 1}) ≜ g[i] = "libre" ∧ solde > 0 → g[i] := "vu"
ACTION retirer(i ∈ {0, 1}) ≜ g[i] = "vu" → solde := solde - 1 ∧ g[i] := "servi"

INVARIANT solde ≥ 0
COLOR 1 - solde
LABEL solde, g0, g1
