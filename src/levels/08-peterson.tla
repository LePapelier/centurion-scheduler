LEVEL p3-peterson
NAME Peterson
MODE prove
DESC Peterson : drapeaux + tour de politesse. Le boss.
GOAL Prouvez la règle avec F0 et F1.

VARIABLES
  pc[i ∈ {0, 1}] ∈ {"idle", "want", "wait", "crit"} = "idle"
  flag[i ∈ {0, 1}] ∈ {0, 1} = 0
  turn ∈ {0, 1} = 0

ACTION want(i ∈ {0, 1})  ≜ pc[i] = "idle" → pc[i] := "want" ∧ flag[i] := 1
ACTION defer(i ∈ {0, 1}) ≜ pc[i] = "want" → pc[i] := "wait" ∧ turn := 1 - i
ACTION enter(i ∈ {0, 1}) ≜ pc[i] = "wait" ∧ (flag[1-i] = 0 ∨ turn = i) → pc[i] := "crit"
ACTION exit(i ∈ {0, 1})  ≜ pc[i] = "crit" → pc[i] := "idle" ∧ flag[i] := 0

ATOM Crit(i ∈ {0, 1}) ≜ pc[i] = "crit"
ATOM Wait(i ∈ {0, 1}) ≜ pc[i] = "wait"
ATOM Idle(i ∈ {0, 1}) ≜ pc[i] = "idle"
ATOM Flag(i ∈ {0, 1}) ≜ flag[i] = 1
ATOM Tour(i ∈ {0, 1}) ≜ turn = i

INVARIANT ¬(Crit0 ∧ Crit1)
LEMMA F(i ∈ {0, 1}) ≜ ¬Idle[i] ⇒ Flag[i]
COLOR (pc0 = "crit") + (pc1 = "crit")
LABEL pc0, pc1, turn
