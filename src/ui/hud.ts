import type { State } from '../core/spec'
import type { CompiledLevel } from '../dsl/ast'

export interface HudCallbacks {
  onUndo(): void
  onReset(): void
  onSelectLevel(index: number): void
  onNext(): void
}

export interface Brick {
  /** Alias réutilisable dans les formules suivantes. */
  readonly name: string
  readonly src: string
  /** Noms des briques dont la preuve dépend (vide pour une brique donnée). */
  readonly deps: readonly string[]
  readonly given: boolean
}

/**
 * HUD spec-centrique, reconstruit à chaque chargement de niveau.
 * Mode trace : console d'ordonnancement. Mode prove : mur de briques,
 * candidate en cours, statut de l'objectif.
 */
export class Hud {
  private readonly varEls = new Map<string, HTMLElement>()
  private readonly actionEls = new Map<string, HTMLElement>()
  private readonly invEl: HTMLElement | null
  private readonly movesEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly traceEl: HTMLElement
  private readonly hintEl: HTMLElement
  private readonly bricksEl: HTMLElement | null
  private readonly goalEl: HTMLElement | null
  private readonly victoryEl: HTMLElement
  private readonly victoryBody: HTMLElement
  private readonly nextBtn: HTMLButtonElement
  private inspectorEl: HTMLElement

  /** Emplacement de l'éditeur (console trace, ou candidate prove). */
  readonly editorMount: HTMLElement

  constructor(
    root: HTMLElement,
    level: CompiledLevel,
    levelNames: readonly string[],
    currentIndex: number,
    unlocked: number,
    cb: HudCallbacks,
  ) {
    const panel = document.createElement('div')
    panel.className = 'panel'
    panel.innerHTML = `
      <div class="levels"></div>
      <h1>${level.name}</h1>
      <p class="desc">${level.description}</p>
      ${level.tutorial.map((t) => `<p class="tutorial">${t}</p>`).join('')}
      ${level.goal !== '' ? `<p class="goal">▸ ${level.goal}</p>` : ''}
      <div class="spec">
        <div class="kw">VARIABLES</div>
        <div class="vars"></div>
        <div class="actions"></div>
        <div class="inv"><span class="kw">INVARIANT</span> <span class="src">${level.invariantSrc}</span></div>
      </div>
      ${
        level.mode === 'prove'
          ? `<div class="bricks"><div class="kw">BRIQUES</div><div class="bricks-list"></div></div>
             <div class="goal-status"></div>`
          : ''
      }
      <div class="editor-mount"></div>
      <div class="moves"></div>
      <div class="status"></div>
      <div class="hint"></div>
      <div class="trace"></div>
      <div class="buttons">
        <button data-act="undo">← annuler</button>
        <button data-act="reset">réinitialiser</button>
      </div>`
    root.appendChild(panel)

    const levelsEl = panel.querySelector('.levels')!
    levelNames.forEach((name, i) => {
      const b = document.createElement('button')
      b.className = 'lvl'
      b.textContent = String(i + 1)
      b.title = i <= unlocked ? name : 'verrouillé'
      b.disabled = i > unlocked
      b.classList.toggle('active', i === currentIndex)
      b.addEventListener('click', () => cb.onSelectLevel(i))
      levelsEl.appendChild(b)
    })

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
      actionsEl.appendChild(el)
      this.actionEls.set(a.name, el)
    }

    this.invEl = panel.querySelector('.inv')
    this.bricksEl = panel.querySelector('.bricks-list')
    this.goalEl = panel.querySelector('.goal-status')
    this.movesEl = panel.querySelector('.moves')!
    this.statusEl = panel.querySelector('.status')!
    this.traceEl = panel.querySelector('.trace')!
    this.hintEl = panel.querySelector('.hint')!
    this.editorMount = panel.querySelector('.editor-mount')!
    panel.querySelector('[data-act=undo]')!.addEventListener('click', cb.onUndo)
    panel.querySelector('[data-act=reset]')!.addEventListener('click', cb.onReset)
    if (level.mode !== 'trace')
      (panel.querySelector('[data-act=undo]') as HTMLElement).style.display = 'none'

    this.inspectorEl = document.createElement('div')
    this.inspectorEl.className = 'inspector hidden'
    root.appendChild(this.inspectorEl)

    this.victoryEl = document.createElement('div')
    this.victoryEl.className = 'victory hidden'
    this.victoryEl.innerHTML = `
      <div class="card">
        <h2></h2>
        <div class="body"></div>
        <button data-act="replay">rejouer</button>
        <button data-act="next">niveau suivant →</button>
      </div>`
    root.appendChild(this.victoryEl)
    this.victoryBody = this.victoryEl.querySelector('.body')!
    this.nextBtn = this.victoryEl.querySelector('[data-act=next]') as HTMLButtonElement
    this.victoryEl.querySelector('[data-act=replay]')!.addEventListener('click', cb.onReset)
    this.nextBtn.addEventListener('click', cb.onNext)
  }

  updateVars(state: State, prevState: State | null): void {
    for (const [name, el] of this.varEls) {
      el.innerHTML = `${name} = <b>${JSON.stringify(state[name])}</b>`
      el.classList.toggle('changed', prevState !== null && prevState[name] !== state[name])
    }
  }

  setEnabledActions(names: ReadonlySet<string>): void {
    for (const [name, el] of this.actionEls) el.classList.toggle('enabled', names.has(name))
  }

  /** Surligne les actions fautives (sources de CTI). */
  setFailingActions(names: ReadonlySet<string>): void {
    for (const [name, el] of this.actionEls) el.classList.toggle('failing', names.has(name))
  }

  setInvariantViolated(violated: boolean): void {
    this.invEl?.classList.toggle('violated', violated)
  }

  renderBricks(bricks: readonly Brick[]): void {
    if (this.bricksEl === null) return
    this.bricksEl.innerHTML = bricks
      .map(
        (b) => `
        <div class="brick${b.given ? ' given' : ''}">
          <span class="box">□</span> <span class="bname">${b.name}</span> ≜ <span class="src">${b.src}</span>
          ${b.given ? '<span class="tag">donnée</span>' : ''}
          ${b.deps.length > 0 ? `<div class="deps">└ s'appuie sur : ${b.deps.map((d) => `<span class="dep">${d}</span>`).join(' · ')}</div>` : ''}
        </div>`,
      )
      .join('')
  }

  setGoalStatus(html: string, proved: boolean): void {
    if (this.goalEl === null) return
    this.goalEl.innerHTML = html
    this.goalEl.classList.toggle('proved', proved)
  }

  setMoves(text: string): void {
    this.movesEl.textContent = text
  }

  setStatus(html: string): void {
    this.statusEl.innerHTML = html
  }

  setHint(text: string): void {
    this.hintEl.textContent = text
  }

  setTrace(names: readonly string[]): void {
    this.traceEl.innerHTML = names
      .map((a) => `<span class="step">${a}</span>`)
      .join('<span class="arrow">→</span>')
  }

  /** Fenêtre d'inspection d'un état, près du point cliqué. */
  showInspector(x: number, y: number, html: string, onClose: () => void): void {
    this.inspectorEl.innerHTML = `<button class="close">✕</button>${html}`
    this.inspectorEl.classList.remove('hidden')
    this.inspectorEl.querySelector('.close')!.addEventListener('click', () => {
      this.hideInspector()
      onClose()
    })
    const w = 230
    this.inspectorEl.style.left = `${Math.min(x + 16, window.innerWidth - w - 12)}px`
    this.inspectorEl.style.top = `${Math.min(y + 12, window.innerHeight - this.inspectorEl.offsetHeight - 12)}px`
  }

  hideInspector(): void {
    this.inspectorEl.classList.add('hidden')
  }

  showVictory(title: string, bodyHtml: string, hasNext: boolean): void {
    this.victoryEl.querySelector('h2')!.textContent = title
    this.victoryBody.innerHTML = bodyHtml
    this.nextBtn.style.display = hasNext ? '' : 'none'
    this.victoryEl.classList.remove('hidden')
  }

  hideVictory(): void {
    this.victoryEl.classList.add('hidden')
  }
}
