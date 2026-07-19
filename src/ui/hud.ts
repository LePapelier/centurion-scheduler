import type { State } from '../core/spec'
import type { CompiledLevel } from '../dsl/ast'

export interface HudCallbacks {
  onUndo(): void
  onReset(): void
  onSelectLevel(index: number): void
  onNext(): void
}

/**
 * HUD spec-centrique, reconstruit à chaque chargement de niveau.
 * La spec est affichée ; le jeu se joue au clavier dans le ou les
 * éditeurs (montés par main.ts dans les emplacements fournis).
 */
export class Hud {
  private readonly varEls = new Map<string, HTMLElement>()
  private readonly actionEls = new Map<string, HTMLElement>()
  private readonly invEl: HTMLElement | null
  private readonly movesEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly traceEl: HTMLElement
  private readonly hintEl: HTMLElement
  private readonly victoryEl: HTMLElement
  private readonly victoryBody: HTMLElement
  private readonly nextBtn: HTMLButtonElement

  /** Emplacement de l'éditeur principal (modes trace et match). */
  readonly editorMount: HTMLElement
  /** Emplacements des slots de renfort, par action (mode repair). */
  readonly repairMounts = new Map<string, HTMLElement>()

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
        ${level.invariantSrc !== '' ? `<div class="inv"><span class="kw">INVARIANT</span> <span class="src">${level.invariantSrc}</span></div>` : ''}
        ${level.requires.map((r) => `<div class="req"><span class="kw">REQUIRE</span> <span class="src">${r.src}</span></div>`).join('')}
      </div>
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

    // Sélecteur de niveaux.
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

    // Actions ; en mode repair, les actions réparables reçoivent un slot « ∧ [___] ».
    const actionsEl = panel.querySelector('.actions')!
    for (const a of level.actionsSrc) {
      const el = document.createElement('div')
      el.className = 'action'
      el.innerHTML = `<span class="kw">ACTION</span> <span class="aname">${a.name}</span> ≜ <span class="guard">${a.guardSrc}</span><span class="slot"></span> <span class="arrow">→</span> <span class="upd">${a.updateSrc}</span>`
      actionsEl.appendChild(el)
      this.actionEls.set(a.name, el)
      if (level.mode === 'repair' && level.repairables.includes(a.name)) {
        el.classList.add('repairable')
        const slot = el.querySelector('.slot') as HTMLElement
        slot.innerHTML = ' ∧ '
        const mount = document.createElement('span')
        mount.className = 'slot-editor'
        slot.appendChild(mount)
        this.repairMounts.set(a.name, mount)
      }
    }

    this.invEl = panel.querySelector('.inv')
    this.movesEl = panel.querySelector('.moves')!
    this.statusEl = panel.querySelector('.status')!
    this.traceEl = panel.querySelector('.trace')!
    this.hintEl = panel.querySelector('.hint')!
    this.editorMount = panel.querySelector('.editor-mount')!
    panel.querySelector('[data-act=undo]')!.addEventListener('click', cb.onUndo)
    panel.querySelector('[data-act=reset]')!.addEventListener('click', cb.onReset)
    if (level.mode !== 'trace')
      (panel.querySelector('[data-act=undo]') as HTMLElement).style.display = 'none'

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

  setInvariantViolated(violated: boolean): void {
    this.invEl?.classList.toggle('violated', violated)
  }

  /** Coche/décoche visuellement chaque ligne REQUIRE (mode repair). */
  setRequires(ok: readonly boolean[]): void {
    this.victoryEl.parentElement!.querySelectorAll('.req').forEach((el, i) => {
      el.classList.toggle('ok', ok[i] === true)
    })
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
