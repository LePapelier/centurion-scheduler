import type { State } from '../core/spec'
import type { CompiledLevel } from '../dsl/ast'

export interface HudCallbacks {
  onUndo(): void
  onReset(): void
  /** Clic sur une action activée dans la spec. */
  onAction(name: string): void
  /** Survol d'une action activée (null = fin de survol). */
  onHoverAction(name: string | null): void
}

export interface HudUpdate {
  readonly moves: number
  readonly par: number
  readonly state: State
  readonly prevState: State | null
  readonly enabled: ReadonlySet<string>
  readonly trace: readonly string[]
  readonly violated: boolean
}

/**
 * HUD spec-centrique : la spec TLA-simplifiée est le panneau principal,
 * les actions activées y sont surlignées et cliquables.
 */
export class Hud {
  private readonly varEls = new Map<string, HTMLElement>()
  private readonly actionEls = new Map<string, HTMLElement>()
  private readonly invEl: HTMLElement
  private readonly movesEl: HTMLElement
  private readonly traceEl: HTMLElement
  private readonly hintEl: HTMLElement
  private readonly victoryEl: HTMLElement
  private readonly victoryBody: HTMLElement
  readonly tooltip: HTMLElement

  constructor(root: HTMLElement, level: CompiledLevel, cb: HudCallbacks) {
    const panel = document.createElement('div')
    panel.className = 'panel'
    panel.innerHTML = `
      <h1>${level.name}</h1>
      <p class="desc">${level.description}</p>
      <div class="spec">
        <div class="kw">VARIABLES</div>
        <div class="vars"></div>
        <div class="actions"></div>
        <div class="inv"><span class="kw">INVARIANT</span> <span class="src">${level.invariantSrc}</span></div>
      </div>
      <div class="moves"></div>
      <div class="hint"></div>
      <div class="trace"></div>
      <div class="buttons">
        <button data-act="undo">← annuler</button>
        <button data-act="reset">réinitialiser</button>
      </div>`
    root.appendChild(panel)

    const varsEl = panel.querySelector('.vars')!
    for (const v of Object.keys(level.init)) {
      const el = document.createElement('span')
      el.className = 'var'
      varsEl.appendChild(el)
      this.varEls.set(v, el)
    }

    const actionsEl = panel.querySelector('.actions')!
    for (const a of level.actionsSrc) {
      const el = document.createElement('div')
      el.className = 'action'
      el.innerHTML = `<span class="kw">ACTION</span> <span class="aname">${a.name}</span> ≜ <span class="guard">${a.guardSrc}</span> <span class="arrow">→</span> <span class="upd">${a.updateSrc}</span>`
      el.addEventListener('click', () => {
        if (el.classList.contains('enabled')) cb.onAction(a.name)
      })
      el.addEventListener('mouseenter', () => {
        if (el.classList.contains('enabled')) cb.onHoverAction(a.name)
      })
      el.addEventListener('mouseleave', () => cb.onHoverAction(null))
      actionsEl.appendChild(el)
      this.actionEls.set(a.name, el)
    }

    this.invEl = panel.querySelector('.inv')!
    this.movesEl = panel.querySelector('.moves')!
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

  update(u: HudUpdate): void {
    for (const [name, el] of this.varEls) {
      el.innerHTML = `${name} = <b>${JSON.stringify(u.state[name])}</b>`
      el.classList.toggle('changed', u.prevState !== null && u.prevState[name] !== u.state[name])
    }
    for (const [name, el] of this.actionEls) {
      el.classList.toggle('enabled', u.enabled.has(name))
      el.classList.remove('hovered')
    }
    this.invEl.classList.toggle('violated', u.violated)
    this.movesEl.textContent = `coups : ${u.moves} — par : ${u.par}`
    this.traceEl.innerHTML = u.trace
      .map((a) => `<span class="step">${a}</span>`)
      .join('<span class="arrow">→</span>')
  }

  /** Surlignage inverse : survol d'un nœud du graphe → actions correspondantes. */
  setHoverActions(names: ReadonlySet<string>): void {
    for (const [name, el] of this.actionEls) el.classList.toggle('hovered', names.has(name))
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
    const medal =
      moves === par ? 'trace optimale — scheduler parfaitement démoniaque' : `optimum : ${par} coups`
    this.victoryBody.innerHTML = `
      <p>${trace.join(' → ')}</p>
      <p><b>${moves}</b> coups — ${medal}</p>`
    this.victoryEl.classList.remove('hidden')
  }

  hideVictory(): void {
    this.victoryEl.classList.add('hidden')
  }
}
