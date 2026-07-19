import type { State } from '../core/spec'

export interface HudCallbacks {
  onUndo(): void
  onReset(): void
}

/** HUD DOM : panneau niveau/état, trace jouée, écran de victoire. */
export class Hud {
  private readonly movesEl: HTMLElement
  private readonly stateEl: HTMLElement
  private readonly traceEl: HTMLElement
  private readonly hintEl: HTMLElement
  private readonly victoryEl: HTMLElement
  private readonly victoryBody: HTMLElement
  readonly tooltip: HTMLElement

  constructor(root: HTMLElement, name: string, description: string, cb: HudCallbacks) {
    const panel = document.createElement('div')
    panel.className = 'panel'
    panel.innerHTML = `
      <h1>${name}</h1>
      <p class="desc">${description}</p>
      <div class="moves"></div>
      <div class="state"></div>
      <div class="hint"></div>
      <div class="trace"></div>
      <div class="buttons">
        <button data-act="undo">← annuler</button>
        <button data-act="reset">réinitialiser</button>
      </div>`
    root.appendChild(panel)
    this.movesEl = panel.querySelector('.moves')!
    this.stateEl = panel.querySelector('.state')!
    this.traceEl = panel.querySelector('.trace')!
    this.hintEl = panel.querySelector('.hint')!
    panel.querySelector('[data-act=undo]')!.addEventListener('click', cb.onUndo)
    panel.querySelector('[data-act=reset]')!.addEventListener('click', cb.onReset)

    this.victoryEl = document.createElement('div')
    this.victoryEl.className = 'victory hidden'
    this.victoryEl.innerHTML = `
      <div class="card">
        <h2>Invariant violé</h2>
        <div class="body"></div>
        <button>rejouer</button>
      </div>`
    root.appendChild(this.victoryEl)
    this.victoryBody = this.victoryEl.querySelector('.body')!
    this.victoryEl.querySelector('button')!.addEventListener('click', cb.onReset)

    this.tooltip = document.createElement('div')
    this.tooltip.className = 'tooltip hidden'
    root.appendChild(this.tooltip)
  }

  update(moves: number, par: number, state: State, trace: readonly string[]): void {
    this.movesEl.textContent = `coups : ${moves} — par : ${par}`
    this.stateEl.innerHTML = Object.entries(state)
      .map(([k, v]) => `<span class="var">${k}=<b>${v}</b></span>`)
      .join(' ')
    this.traceEl.innerHTML = trace.map((a) => `<span class="step">${a}</span>`).join('<span class="arrow">→</span>')
  }

  setHint(text: string): void {
    this.hintEl.textContent = text
  }

  showTooltip(x: number, y: number, text: string): void {
    this.tooltip.classList.remove('hidden')
    this.tooltip.textContent = text
    this.tooltip.style.left = `${x + 14}px`
    this.tooltip.style.top = `${y + 10}px`
  }

  hideTooltip(): void {
    this.tooltip.classList.add('hidden')
  }

  showVictory(moves: number, par: number, trace: readonly string[]): void {
    const medal = moves === par ? 'trace optimale — scheduler parfaitement démoniaque' : `optimum : ${par} coups`
    this.victoryBody.innerHTML = `
      <p>${trace.join(' → ')}</p>
      <p><b>${moves}</b> coups — ${medal}</p>`
    this.victoryEl.classList.remove('hidden')
  }

  hideVictory(): void {
    this.victoryEl.classList.add('hidden')
  }
}
