import { compileLevel } from '../dsl/parse'
import fusible from './01-fusible.tla?raw'
import four from './02-four.tla?raw'
import mutex from './03-mutex.tla?raw'
import fusibleSur from './04-fusible-sur.tla?raw'
import mutexCorrige from './05-mutex-corrige.tla?raw'
import peterson from './06-peterson.tla?raw'

/**
 * La campagne : chapitre « casser » (trace), puis chapitre « prouver ».
 *
 * Règles de design des niveaux (décisions Paul, juillet 2026) :
 * - Les ACTIONS sont strictement des interactions avec le système modélisé
 *   (transitions internes : load, check0, prechauffer…) — jamais des gestes
 *   narratifs d'un agent externe (voler une clé, distraire un gardien).
 * - Toute action doit être sur au moins un chemin gagnant — ni décor, ni
 *   piège pur.
 * - Un niveau trace doit avoir de la tension : l'ORDRE fait le puzzle,
 *   jamais « tout input gagne ».
 * - L'affichage ne doit jamais donner la réponse à copier (l'invariant
 *   affiché n'est pas une solution).
 * - Public sans bagage formel : thèmes concrets, zéro paragraphe explicatif.
 */
export const levels = [fusible, four, mutex, fusibleSur, mutexCorrige, peterson].map(compileLevel)
