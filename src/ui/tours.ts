import type { TourStep } from './tour'

/**
 * Visites guidées : une phrase max par étape, l'action fait avancer.
 * Gates émis par main.ts : ds:camera-moved, ds:action-played,
 * ds:cti-shown, ds:brick-proved, ds:alias-used.
 */
export const tours: Record<string, readonly TourStep[]> = {
  't1-fusible': [
    {
      target: '.editor-mount',
      html: 'Tapez <code>load</code> puis <b>Entrée</b>.',
      gate: 'ds:action-played',
    },
    {
      target: '#app canvas',
      html: 'Chaque bille est un état. <b>Faites pivoter</b> le graphe.',
      gate: 'ds:camera-moved',
    },
    {
      target: '.rule',
      html: 'La <b>règle</b>. Brisez-la.',
      gate: 'next',
    },
  ],

  'p1-fusible-sur': [
    {
      target: '#app canvas',
      html: 'Nouveau rôle : <b>prouver</b>. Les états sombres n’arrivent jamais — mais comptent.',
      gate: 'next',
    },
    {
      target: '.editor-mount',
      html: 'Tapez <code>charge <= 1</code> et regardez le graphe.',
      gate: 'ds:cti-shown',
    },
    {
      target: '#app canvas',
      html: 'Une <b>fuite</b> : une action s’échappe de votre formule. Élargissez : <code>charge <= 2</code> ↵',
      gate: 'ds:brick-proved',
    },
    {
      target: '.goal-status',
      html: 'Brique posée — la règle est garantie.',
      gate: 'next',
    },
  ],

  'p2-mutex-corrige': [
    {
      target: '.bricks',
      html: '<code>C0</code> est un nom : tapez-le dans une formule.',
      gate: 'ds:alias-used',
    },
    {
      target: '.editor-mount',
      html: 'Nommez les vôtres : <code>C1 ≜ formule</code>.',
      gate: 'next',
    },
  ],
}
