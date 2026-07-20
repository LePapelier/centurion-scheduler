import * as THREE from 'three'

/**
 * Palette unique du jeu — alignée sur l'identité visuelle du portfolio
 * (fond bleu nuit, anneaux émissifs, gris-bleu, jaune chaud, pastels).
 */
export const hex = {
  background: 0x070b14,
  fog: 0x111a2e,

  nodeCold: 0x5e9ccc, // valeur sémantique basse
  nodeWarm: 0xffb347, // valeur sémantique haute
  violating: 0xff6b9d, // états interdits / CTI
  frontier: 0xffd166, // jouable (trace)
  region: 0x55e8f6, // région de la candidate (prove)
  selected: 0xf7faff,

  edgeBase: 0xb6c2d9,
  edgeAccent: 0xffd166, // trace jouée / transitions activées / sélection
  edgeCti: 0xff6b9d,

  haloCurrent: 0x55e8f6,
  haloViolating: 0xff6b9d,
} as const

export const color = Object.fromEntries(
  Object.entries(hex).map(([k, v]) => [k, new THREE.Color(v)]),
) as Record<keyof typeof hex, THREE.Color>

export const labelColor = '#F7FAFF'
export const edgeLabelColor = '#FFD166'

/** Teintes du fond de particules (reprises du portfolio). */
export const particleColors: readonly (readonly [number, number, number])[] = [
  [0.384, 0.965, 1.0],
  [0.784, 0.714, 1.0],
  [1.0, 0.42, 0.42],
  [0.286, 0.949, 0.639],
  [0.918, 0.847, 0.706],
  [1.0, 0.82, 0.4],
]
