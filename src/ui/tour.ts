export interface TourStep {
  /** Sélecteur CSS de l'élément présenté (null = bulle centrée). */
  readonly target: string | null
  readonly html: string
  /** 'next' = bouton Suivant ; sinon nom d'un CustomEvent document à attendre. */
  readonly gate: 'next' | string
}

/**
 * Visite guidée bloquante : l'élément visé est mis en lumière (le reste
 * assombri via un box-shadow géant), une bulle l'explique, et chaque étape
 * n'avance que sur l'action demandée (bouton ou événement du jeu).
 */
export function runTour(steps: readonly TourStep[], onDone: () => void): void {
  const bubble = document.createElement('div')
  bubble.className = 'tour-bubble'
  document.body.appendChild(bubble)
  let cleanupGate: (() => void) | null = null
  let lastTarget: HTMLElement | null = null

  const finish = (): void => {
    cleanupGate?.()
    lastTarget?.classList.remove('tour-target')
    bubble.remove()
    onDone()
  }

  const show = (i: number): void => {
    cleanupGate?.()
    lastTarget?.classList.remove('tour-target')
    if (i >= steps.length) return finish()
    const step = steps[i]

    const target = step.target === null ? null : document.querySelector<HTMLElement>(step.target)
    lastTarget = target
    target?.classList.add('tour-target')
    target?.scrollIntoView({ block: 'nearest' })

    bubble.innerHTML = `
      <div class="tour-text">${step.html}</div>
      <div class="tour-controls">
        <span class="tour-count">${i + 1}/${steps.length}</span>
        ${step.gate === 'next' ? '<button class="tour-next">suivant →</button>' : '<span class="tour-wait">à vous…</span>'}
        <button class="tour-skip">passer le tuto</button>
      </div>`
    bubble.querySelector('.tour-skip')!.addEventListener('click', finish)

    // Position : sous l'élément visé, sinon centrée.
    if (target !== null) {
      const r = target.getBoundingClientRect()
      const width = 340
      bubble.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - width - 12))}px`
      bubble.style.top = `${Math.min(r.bottom + 10, window.innerHeight - 160)}px`
      bubble.style.transform = ''
    } else {
      bubble.style.left = '50%'
      bubble.style.top = '40%'
      bubble.style.transform = 'translate(-50%, -50%)'
    }

    if (step.gate === 'next') {
      bubble.querySelector('.tour-next')!.addEventListener('click', () => show(i + 1))
      cleanupGate = null
    } else {
      const handler = (): void => show(i + 1)
      document.addEventListener(step.gate, handler, { once: true })
      cleanupGate = () => document.removeEventListener(step.gate, handler)
    }
  }

  show(0)
}
