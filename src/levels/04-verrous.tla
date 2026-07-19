LEVEL m2-conjonction
NAME Les deux verrous
MODE match
DESC Deux verrous indépendants, pris et rendus librement.
TUTORIAL ∧ (tapez /\) est la conjonction : « a = 1 ∧ b = 1 » exige les deux à la fois. Elle se lit de gauche à droite et se parenthèse librement.
GOAL Caractérisez les états où les deux verrous sont pris en même temps.

VARIABLES
  a ∈ {0, 1} = 0
  b ∈ {0, 1} = 0

ACTION takeA ≜ a = 0 → a := 1
ACTION dropA ≜ a = 1 → a := 0
ACTION takeB ≜ b = 0 → b := 1
ACTION dropB ≜ b = 1 → b := 0

TARGET a = 1 ∧ b = 1
COLOR a + b
LABEL a, b
