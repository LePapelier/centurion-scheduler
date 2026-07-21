import { compileLevel } from '../dsl/parse'
import fusible from './01-fusible.tla?raw'
import four from './02-four.tla?raw'
import mutex from './03-mutex.tla?raw'
import banque from './04-banque.tla?raw'
import sas from './05-sas.tla?raw'
import fusibleSur from './06-fusible-sur.tla?raw'
import mutexCorrige from './07-mutex-corrige.tla?raw'
import peterson from './08-peterson.tla?raw'

/**
 * La campagne : chapitre « casser » (trace), puis chapitre « prouver ».
 *
 * Règles de design des niveaux (décisions Paul, juillet 2026) :
 * - Les ACTIONS sont strictement des interactions avec le système modélisé
 *   (transitions internes : load, check0, prechauffer…) — jamais des gestes
 *   narratifs d'un agent externe (voler une clé, distraire un gardien).
 * - Toute action doit servir sur au moins un chemin gagnant DEPUIS un état
 *   atteignable (les actions de récupération comptent) — ni décor, ni
 *   piège pur.
 * - Un niveau trace doit avoir de la tension : impasses possibles (le jeu
 *   les annonce), boucles de récupération, l'ORDRE fait le puzzle —
 *   jamais « tout input gagne ».
 * - L'affichage ne doit jamais donner la réponse à copier (l'invariant
 *   affiché n'est pas une solution).
 * - Public sans bagage formel : thèmes concrets, zéro paragraphe explicatif.
 */
export const levels = [fusible, four, mutex, banque, sas, fusibleSur, mutexCorrige, peterson].map(
  compileLevel,
)
