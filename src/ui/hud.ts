import type { State } from '../core/spec'
import type { CompiledLevel } from '../dsl/ast'
import { hl, hlValue } from './highlight'

export interface HudCallbacks {
  onUndo(): void
  onReset(): void
  onSelectLevel(index: number): void
  onNext(): void
  /** Suppression d'une brique par son nom (mode prove). */
  onDeleteBrick?(name: string): void
  /** Clic sur un jeton d'action : insérer son nom dans l'éditeur. */
  onInsertAction?(name: string): void
  /** Bascule du son ; retourne le nouvel état. */
  onToggleAudio?(): boolean
  audioEnabled?(): boolean
}

export interface LevelInfo {
  readonly name: string
  /** Meilleur score enregistré, ou undefined. */
  readonly best?: number
}

export interface Brick {
  /** Alias réutilisable dans les formules suivantes. */
  readonly name: string
  readonly src: string
  /** Noms des briques dont la preuve dépend (vide pour une brique donnée). */
  readonly deps: readonly string[]
  readonly given: boolean
  /** Supprimable (aucune autre brique ne la mentionne). */
  readonly deletable?: boolean
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
  private readonly cb: HudCallbacks
  private popoverEl!: HTMLElement
  private victoryKeyTimer: number | null = null
  private readonly victoryKeyHandler = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Enter' || !this.victoryEl.isConnected) return
    if (this.victoryEl.classList.contains('hidden')) return
    ev.preventDefault()
    ;(this.nextBtn.style.display === 'none'
      ? (this.victoryEl.querySelector('[data-act=replay]') as HTMLButtonElement)
      : this.nextBtn
    ).click()
  }

  /** Emplacement de l'éditeur (console trace, ou candidate prove). */
  readonly editorMount: HTMLElement

  constructor(
    root: HTMLElement,
    level: CompiledLevel,
    levelInfos: readonly LevelInfo[],
    currentIndex: number,
    unlocked: number,
    cb: HudCallbacks,
  ) {
    this.cb = cb
    const panel = document.createElement('div')
    panel.className = 'panel'
    panel.innerHTML = `
      <div class="levels"></div>
      <h1>${level.name}</h1>
      <p class="desc">${level.description}</p>
      ${level.tutorial.map((t) => `<p class="tutorial">${t}</p>`).join('')}
      ${level.goal !== '' ? `<p class="goal">▸ ${level.goal}</p>` : ''}
      <div class="spec">
        <div class="chips vars"></div>
        <div class="chips actions"></div>
        <div class="rule"><span class="rule-icon">◈</span> <span class="src">${hl(level.invariantSrc)}</span></div>
      </div>`
    root.appendChild(panel)

    // Popover partagé : définition complète d'une action au survol de son jeton.
    this.popoverEl = document.createElement('div')
    this.popoverEl.className = 'popover hidden'
    root.appendChild(this.popoverEl)

    // Barre de commande : saisie, briques et feedback, centrées en bas.
    const bar = document.createElement('div')
    bar.className = 'commandbar'
    bar.innerHTML = `
      ${
        level.mode === 'prove'
          ? `<div class="bricks"><div class="kw">BRIQUES</div><div class="bricks-list"></div></div>
             <div class="goal-status"></div>`
          : ''
      }
      <div class="moves"></div>
      <div class="status"></div>
      <div class="hint"></div>
      <div class="trace"></div>
      <div class="editor-row">
        <div class="editor-mount"></div>
        <div class="buttons">
          <button data-act="undo">← annuler</button>
          <button data-act="reset">réinitialiser</button>
        </div>
      </div>`
    root.appendChild(bar)

    const levelsEl = panel.querySelector('.levels')!
    levelInfos.forEach(({ name, best }, i) => {
      const b = document.createElement('button')
      b.className = 'lvl'
      b.textContent = String(i + 1)
      b.title = i <= unlocked ? `${name}${best !== undefined ? ` — record : ${best}` : ''}` : 'verrouillé'
      b.disabled = i > unlocked
      b.classList.toggle('active', i === currentIndex)
      b.addEventListener('click', () => cb.onSelectLevel(i))
      levelsEl.appendChild(b)
    })
    if (cb.onToggleAudio !== undefined) {
      const snd = document.createElement('button')
      snd.className = 'lvl sound'
      snd.textContent = cb.audioEnabled?.() === false ? '🔇' : '🔊'
      snd.title = 'son'
      snd.addEventListener('click', () => {
        snd.textContent = cb.onToggleAudio!() ? '🔊' : '🔇'
      })
      levelsEl.appendChild(snd)
    }

    const varsEl = panel.querySelector('.vars')!
    for (const v of Object.keys(level.init)) {
      const el = document.createElement('span')
      el.className = 'chip var'
      varsEl.appendChild(el)
      this.varEls.set(v, el)
    }

    const actionsEl = panel.querySelector('.actions')!
    for (const a of level.actionsSrc) {
      const el = document.createElement('button')
      el.className = 'chip action'
      el.textContent = a.name
      el.addEventListener('click', () => {
        if (el.classList.contains('enabled') || level.mode === 'prove') cb.onInsertAction?.(a.name)
      })
      el.addEventListener('mouseenter', () => {
        this.popoverEl.innerHTML = `<span class="kw">ACTION</span> <span class="aname">${a.name}</span> ≜ ${hl(a.guardSrc)} <span class="arrow">→</span> ${hl(a.updateSrc)}`
        this.popoverEl.classList.remove('hidden')
        const r = el.getBoundingClientRect()
        this.popoverEl.style.left = `${Math.min(r.left, window.innerWidth - 380)}px`
        this.popoverEl.style.top = `${r.bottom + 6}px`
      })
      el.addEventListener('mouseleave', () => this.popoverEl.classList.add('hidden'))
      actionsEl.appendChild(el)
      this.actionEls.set(a.name, el)
    }

    this.invEl = panel.querySelector('.rule')
    this.bricksEl = bar.querySelector('.bricks-list')
    this.goalEl = bar.querySelector('.goal-status')
    this.movesEl = bar.querySelector('.moves')!
    this.statusEl = bar.querySelector('.status')!
    this.traceEl = bar.querySelector('.trace')!
    this.hintEl = bar.querySelector('.hint')!
    this.editorMount = bar.querySelector('.editor-mount')!
    bar.querySelector('[data-act=undo]')!.addEventListener('click', cb.onUndo)
    bar.querySelector('[data-act=reset]')!.addEventListener('click', cb.onReset)
    if (level.mode !== 'trace')
      (bar.querySelector('[data-act=undo]') as HTMLElement).style.display = 'none'

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
      el.innerHTML = `<span class="hl-var">${name}</span><span class="hl-op">=</span>${hlValue(state[name])}`
      const changed = prevState !== null && prevState[name] !== state[name]
      el.classList.remove('changed')
      if (changed) {
        // Redémarre l'animation de tick même si la classe était déjà posée.
        void el.offsetWidth
        el.classList.add('changed')
      }
    }
  }

  setEnabledActions(names: ReadonlySet<string>): void {
    for (const [name, el] of this.actionEls) el.classList.toggle('enabled', names.has(name))
  }

  /** Fait « tiquer » le jeton d'une action qui vient d'être jouée. */
  pulseAction(name: string): void {
    const el = this.actionEls.get(name)
    if (el === undefined) return
    el.classList.remove('played')
    void el.offsetWidth
    el.classList.add('played')
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
          <span class="box">□</span> <span class="bname">${b.name}</span> ≜ <span class="src">${hl(b.src)}</span>
          ${b.given ? '<span class="tag">donnée</span>' : ''}
          ${b.deletable === true ? `<button class="bdel" data-name="${b.name}" title="supprimer">✕</button>` : ''}
          ${b.deps.length > 0 ? `<div class="deps">└ s'appuie sur : ${b.deps.map((d) => `<span class="dep">${d}</span>`).join(' · ')}</div>` : ''}
        </div>`,
      )
      .join('')
    this.bricksEl.querySelectorAll<HTMLButtonElement>('.bdel').forEach((btn) => {
      btn.addEventListener('click', () => this.cb.onDeleteBrick?.(btn.dataset.name!))
    })
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

  /** La formule prouvée vole de l'éditeur vers le mur de briques. */
  flyToBricks(html: string): void {
    if (this.bricksEl === null) return
    const from = this.editorMount.getBoundingClientRect()
    const to = this.bricksEl.getBoundingClientRect()
    const fly = document.createElement('div')
    fly.className = 'fly'
    fly.innerHTML = html
    fly.style.left = `${from.left + 8}px`
    fly.style.top = `${from.top}px`
    document.body.appendChild(fly)
    requestAnimationFrame(() => {
      fly.style.transform = `translate(${to.left - from.left}px, ${to.bottom - 16 - from.top}px) scale(0.85)`
      fly.style.opacity = '0.15'
    })
    window.setTimeout(() => fly.remove(), 500)
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
    // Au tick suivant : l'Entrée qui vient de déclencher la victoire ne doit
    // pas être elle-même interprétée comme « niveau suivant ».
    this.victoryKeyTimer = window.setTimeout(() => {
      this.victoryKeyTimer = null
      window.addEventListener('keydown', this.victoryKeyHandler)
    }, 0)
  }

  hideVictory(): void {
    this.victoryEl.classList.add('hidden')
    if (this.victoryKeyTimer !== null) {
      window.clearTimeout(this.victoryKeyTimer)
      this.victoryKeyTimer = null
    }
    window.removeEventListener('keydown', this.victoryKeyHandler)
  }
}
