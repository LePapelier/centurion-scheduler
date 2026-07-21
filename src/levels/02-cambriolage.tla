LEVEL t2-cambriolage
NAME Le cambriolage
MODE trace
DESC La règle : le coffre reste fermé. Le gardien revient toujours.
GOAL Ouvrez le coffre.

VARIABLES
  gardien ∈ {0, 1} = 1
  cle ∈ {0, 1} = 0
  coffre ∈ {"fermé", "ouvert"} = "fermé"

ACTION distraire ≜ gardien = 1 → gardien := 0
ACTION voler_cle ≜ gardien = 0 ∧ cle = 0 → cle := 1 ∧ gardien := 1
ACTION ouvrir ≜ cle = 1 ∧ gardien = 0 ∧ coffre = "fermé" → coffre := "ouvert"

INVARIANT coffre ≠ "ouvert"
COLOR cle + (coffre = "ouvert")
LABEL gardien, cle
