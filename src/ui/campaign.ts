const KEY = 'demonic-scheduler-progress'

export interface Progress {
  /** Indice du plus haut niveau débloqué. */
  unlocked: number
  /** Meilleur score par id de niveau (coups ou tokens — moins = mieux). */
  scores: Record<string, number>
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw !== null) {
      const p = JSON.parse(raw) as Progress
      if (typeof p.unlocked === 'number' && typeof p.scores === 'object') return p
    }
  } catch {
    // stockage indisponible ou corrompu → progression vierge
  }
  return { unlocked: 0, scores: {} }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // stockage indisponible : la progression ne persiste pas, tant pis
  }
}

export function recordScore(p: Progress, levelId: string, score: number): void {
  const best = p.scores[levelId]
  if (best === undefined || score < best) p.scores[levelId] = score
  saveProgress(p)
}

export function unlock(p: Progress, levelIndex: number): void {
  if (levelIndex > p.unlocked) {
    p.unlocked = levelIndex
    saveProgress(p)
  }
}
