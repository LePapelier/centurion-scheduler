import type { Action, Level, State } from '../core/spec'

/**
 * Mutex naïf « test puis set » : chaque processus vérifie le drapeau de
 * l'autre AVANT de lever le sien. Entre le test et le set, l'autre peut
 * faire de même — les deux entrent en section critique.
 */
function processActions(i: 0 | 1): Action[] {
  const other = 1 - i
  return [
    {
      name: `check${i}`,
      guard: (s: State) => s[`pc${i}`] === 'idle' && s[`flag${other}`] === 0,
      update: (s: State) => ({ ...s, [`pc${i}`]: 'ready' }),
    },
    {
      name: `enter${i}`,
      guard: (s: State) => s[`pc${i}`] === 'ready',
      update: (s: State) => ({ ...s, [`pc${i}`]: 'crit', [`flag${i}`]: 1 }),
    },
    {
      name: `exit${i}`,
      guard: (s: State) => s[`pc${i}`] === 'crit',
      update: (s: State) => ({ ...s, [`pc${i}`]: 'idle', [`flag${i}`]: 0 }),
    },
  ]
}

export const mutex: Level = {
  id: 'mutex-naif',
  name: 'Mutex naïf',
  description:
    'Deux processus protègent leur section critique par un drapeau — ' +
    'mais chacun teste le drapeau de l’autre avant de lever le sien. ' +
    'Ordonnancez les pas pour les faire entrer tous les deux en section critique.',
  init: { pc0: 'idle', pc1: 'idle', flag0: 0, flag1: 0 },
  actions: [...processActions(0), ...processActions(1)],
  invariant: (s: State) => !(s.pc0 === 'crit' && s.pc1 === 'crit'),
}
