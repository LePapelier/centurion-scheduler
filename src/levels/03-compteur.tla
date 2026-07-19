LEVEL m1-egalite
NAME Le compteur
MODE match
DESC Un compteur monte jusqu'à 3 puis se remet à zéro.
TUTORIAL Nouvelle arme : la FORMULE D'ÉTAT. Elle est vraie ou fausse dans chaque état — « n = 3 » sélectionne les états où n vaut 3. Les comparaisons < ≤ (tapez <=) > ≥ existent aussi.
TUTORIAL Tapez une formule : sa sélection s'affiche en direct. Vert = correct, rouge = manquant, blanc = en trop. Égalez exactement la cible, en aussi peu de symboles que possible.
GOAL Caractérisez les états rouges : le compteur au débordement.

VARIABLES
  n ∈ {0, 1, 2, 3} = 0

ACTION incr  ≜ n < 3 → n := n + 1
ACTION reset ≜ n = 3 → n := 0

TARGET n = 3
COLOR n
LABEL n
