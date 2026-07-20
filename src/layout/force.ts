/**
 * Force-layout 3D maison (Fruchterman–Reingold) : calculé une fois au
 * chargement puis figé — aucune simulation pendant le jeu. O(n²) par
 * itération, largement suffisant pour < ~2000 nœuds.
 * RNG seedé : le layout est identique à chaque chargement (et entre clients).
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function layout(
  n: number,
  edges: readonly (readonly [number, number])[],
  iterations = 250,
  seed = 42,
): Float32Array {
  const pos = new Float32Array(n * 3)
  const disp = new Float32Array(n * 3)
  if (n === 0) return pos

  const rand = mulberry32(seed)
  for (let i = 0; i < n * 3; i++) pos[i] = (rand() - 0.5) * 2

  const k = 1 // longueur idéale d'arête (l'échelle finale est renormalisée)
  const k2 = k * k

  for (let iter = 0; iter < iterations; iter++) {
    const t = 0.3 * k * (1 - iter / iterations) + 0.01 // température décroissante
    disp.fill(0)

    // Répulsion entre toutes les paires.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i * 3] - pos[j * 3]
        const dy = pos[i * 3 + 1] - pos[j * 3 + 1]
        const dz = pos[i * 3 + 2] - pos[j * 3 + 2]
        const d2 = dx * dx + dy * dy + dz * dz + 1e-6
        const f = k2 / d2
        disp[i * 3] += dx * f
        disp[i * 3 + 1] += dy * f
        disp[i * 3 + 2] += dz * f
        disp[j * 3] -= dx * f
        disp[j * 3 + 1] -= dy * f
        disp[j * 3 + 2] -= dz * f
      }
    }

    // Attraction le long des arêtes (ressorts).
    for (const [a, b] of edges) {
      if (a === b) continue
      const dx = pos[a * 3] - pos[b * 3]
      const dy = pos[a * 3 + 1] - pos[b * 3 + 1]
      const dz = pos[a * 3 + 2] - pos[b * 3 + 2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6
      const f = d / k
      disp[a * 3] -= dx * f
      disp[a * 3 + 1] -= dy * f
      disp[a * 3 + 2] -= dz * f
      disp[b * 3] += dx * f
      disp[b * 3 + 1] += dy * f
      disp[b * 3 + 2] += dz * f
    }

    // Déplacement plafonné par la température.
    for (let i = 0; i < n; i++) {
      const dx = disp[i * 3]
      const dy = disp[i * 3 + 1]
      const dz = disp[i * 3 + 2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6
      const step = Math.min(d, t) / d
      pos[i * 3] += dx * step
      pos[i * 3 + 1] += dy * step
      pos[i * 3 + 2] += dz * step
    }
  }

  // Recentrage et mise à l'échelle : rayon RMS ∝ racine cubique de n.
  const c = [0, 0, 0]
  for (let i = 0; i < n; i++)
    for (let a = 0; a < 3; a++) c[a] += pos[i * 3 + a] / n
  let rms = 0
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      pos[i * 3 + a] -= c[a]
      rms += pos[i * 3 + a] ** 2
    }
  }
  rms = Math.sqrt(rms / Math.max(n, 1))
  const target = 5.5 * Math.cbrt(n / 10)
  const scale = rms > 1e-6 ? target / rms : 1
  for (let i = 0; i < n * 3; i++) pos[i] *= scale

  return pos
}
