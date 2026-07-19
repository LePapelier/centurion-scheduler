LEVEL t1-fusible
NAME Le fusible
MODE trace
DESC Un circuit encaisse des charges et peut s'aérer. Trop de charge et le fusible saute.
TUTORIAL Un système = des VARIABLES et des ACTIONS gardées. Une action est jouable quand sa garde (avant la →) est vraie dans l'état courant.
TUTORIAL Vous êtes l'ordonnanceur : tapez le nom d'une action (l'autocomplétion aide) puis Entrée. Amenez le système dans un état qui viole l'INVARIANT.
GOAL Faites sauter le fusible.

VARIABLES
  charge ∈ {0, 1, 2, 3} = 0

ACTION load ≜ charge < 3 → charge := charge + 1
ACTION vent ≜ charge > 0 → charge := charge - 1

INVARIANT charge < 3
COLOR charge
LABEL charge
