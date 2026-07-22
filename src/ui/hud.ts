import type { State } from '../core/spec'
import type { CompiledLevel } from '../dsl/ast'
import { hl, hlValue } from './highlight'

/** Domaine affiché : {0..3} si entiers contigus, sinon la liste des valeurs. */
function fmtDomain(dom: readonly (string | number)[]): string {
  if (
    dom.length > 2 &&
    dom.every((v) => typeof v === 'number') &&
    dom.every((v, i) => i === 0 || v === (dom[i - 1] as number) + 1)
  ) {
    return `{<span class="hl-num">${dom[0]}</span>..<span class="hl-num">${dom[dom.length - 1]}</span>}`
  }
  return `{${dom.map((v) => hlValue(v)).join(', ')}}`
}

export interface HudCallbacks {
  onUndo(): void
  onReset(): void
  onSelectLevel(index: number): void
  onNext(): void
  /** Suppression d'une brique par son nom (mode prove). */
  onDeleteBrick?(name: string): void
  /** Clic sur un jeton d'action : insérer son nom dans l'éditeur (prove). */
  onInsertAction?(name: string): void
  /** Clic sur un bouton d'action : jouer le pas (trace). */
  onPlayAction?(name: string): void
  /** Survol d'un bouton d'action (trace) : aperçu du nœud visé. */
  onHoverAction?(name: string | null): void
  /** Bascule du son ; retourne le nouvel état. */
  onToggleAudio?(): boolean
  audioEnabled?(): boolean
  /** Teinte sémantique de chaque action (légende du graphe). */
  actionColor?: ReadonlyMap<string, string>
  /** Clic sur une obligation en échec (index de ligne). */
  onObligationClick?(index: number): void
}

export interface LevelInfo {
  readonly name: string
  /** Meilleur score enregistré, ou undefined. */
  readonly best?: number
  readonly mode: 'trace' | 'prove'
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
  private readonly deadlockEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly traceEl: HTMLElement
  private readonly hintEl: HTMLElement
  private readonly bricksEl: HTMLElement | null
  private readonly goalEl: HTMLElement | null
  private readonly oblEl: HTMLElement | null
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
        <div class="chips atoms"></div>
        <div class="rule ${level.mode === 'trace' ? 'break' : 'prove'}"><span class="rule-tag">${
          level.mode === 'trace' ? 'règle à briser' : 'règle à garantir'
        }</span> <span class="src">${hl(level.invariantSrc)}</span></div>
        <div class="moves-top"></div>
      </div>`
    root.appendChild(panel)

    // Popover partagé : définition complète d'une action au survol de son jeton.
    this.popoverEl = document.createElement('div')
    this.popoverEl.className = 'popover hidden'
    root.appendChild(this.popoverEl)

    // Barre de commande : saisie, briques et feedback, centrées en bas.
    const bar = document.createElement('div')
    bar.className = 'commandbar'
    // L'éditeur est EN HAUT de la barre : son menu d'autocomplétion s'ouvre
    // vers le haut, dans la zone du graphe (vide), sans masquer les briques.
    bar.innerHTML = `
      <div class="editor-mount"></div>
      ${
        level.mode === 'prove'
          ? `<div class="obligations"><div class="kw">OBLIGATIONS <span class="obl-sub">— toutes au vert</span></div><div class="obl-list"></div></div>
             <div class="bricks"><div class="kw">BRIQUES</div><div class="bricks-list"></div></div>
             <div class="goal-status"></div>`
          : ''
      }
      <div class="actionbar"></div>
      <div class="chips varsbar"></div>
      <div class="deadlock hidden">⛔ blocage — plus aucune action possible : <b>annulez</b> (Backspace)</div>
      <div class="status"></div>
      <div class="hint"></div>
      <div class="trace"></div>
      <div class="buttons">
        <button data-act="undo">← annuler</button>
        <button data-act="reset">réinitialiser</button>
      </div>`
    root.appendChild(bar)

    const levelsEl = panel.querySelector('.levels')!
    levelInfos.forEach(({ name, best, mode }, i) => {
      // Séparation des chapitres : « casser » (trace) puis « prouver ».
      if (i === 0 || levelInfos[i - 1].mode !== mode) {
        const chap = document.createElement('span')
        chap.className = 'chapter'
        chap.textContent = mode === 'trace' ? 'casser' : 'prouver'
        levelsEl.appendChild(chap)
      }
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

    // Haut à gauche : les TYPES (domaines déclarés). Centre : les valeurs live.
    const typesEl = panel.querySelector('.vars')!
    for (const [name, dom] of level.domains) {
      const el = document.createElement('span')
      el.className = 'chip type'
      el.innerHTML = `<span class="hl-var">${name}</span> <span class="hl-op">∈</span> ${fmtDomain(dom)}`
      typesEl.appendChild(el)
    }

    const varsEl = bar.querySelector('.varsbar')!
    for (const v of Object.keys(level.init)) {
      const el = document.createElement('span')
      el.className = 'chip var'
      varsEl.appendChild(el)
      this.varEls.set(v, el)
    }

    // Trace : les actions SONT l'input, au centre de la barre. Prove : référence dans le panneau.
    const actionsEl =
      level.mode === 'trace' ? bar.querySelector('.actionbar')! : panel.querySelector('.actions')!
    for (const a of level.actionsSrc) {
      const el = document.createElement('button')
      el.className = 'chip action'
      el.textContent = a.name
      // Pastille de couleur = teinte de l'action sur le graphe (légende).
      const ac = cb.actionColor?.get(a.name)
      if (ac !== undefined) {
        el.style.setProperty('--ac', ac)
        const dot = document.createElement('span')
        dot.className = 'ac-dot'
        el.prepend(dot)
      }
      el.addEventListener('click', () => {
        if (level.mode === 'trace') {
          if (el.classList.contains('enabled')) cb.onPlayAction?.(a.name)
        } else {
          cb.onInsertAction?.(a.name)
        }
      })
      el.addEventListener('mouseenter', () => {
        this.popoverEl.innerHTML = `
          <div class="pop-name">${a.name}</div>
          <div class="pop-row"><span class="pop-tag guard">QUAND</span> ${hl(a.guardSrc)}</div>
          <div class="pop-row"><span class="pop-tag effect">FAIT</span> ${hl(a.updateSrc)}</div>`
        this.popoverEl.classList.remove('hidden')
        const r = el.getBoundingClientRect()
        this.popoverEl.style.left = `${Math.min(r.left, window.innerWidth - 380)}px`
        // Dans la barre du bas, le popover s'ouvre vers le haut.
        if (level.mode === 'trace') {
          this.popoverEl.style.top = `${r.top - this.popoverEl.offsetHeight - 8}px`
        } else {
          this.popoverEl.style.top = `${r.bottom + 6}px`
        }
        cb.onHoverAction?.(a.name)
      })
      el.addEventListener('mouseleave', () => {
        this.popoverEl.classList.add('hidden')
        cb.onHoverAction?.(null)
      })
      actionsEl.appendChild(el)
      this.actionEls.set(a.name, el)
    }

    // Prove : les pièces élémentaires — le vocabulaire des candidates.
    const atomsEl = panel.querySelector('.atoms')!
    for (const a of level.atoms) {
      const el = document.createElement('button')
      el.className = 'chip atom'
      el.textContent = a.name
      el.addEventListener('click', () => cb.onInsertAction?.(a.name))
      el.addEventListener('mouseenter', () => {
        this.popoverEl.innerHTML = `<span class="aname">${a.name}</span> <span class="pop-def">${hl(a.src)}</span>`
        this.popoverEl.classList.remove('hidden')
        const r = el.getBoundingClientRect()
        this.popoverEl.style.left = `${Math.min(r.left, window.innerWidth - 380)}px`
        this.popoverEl.style.top = `${r.bottom + 6}px`
      })
      el.addEventListener('mouseleave', () => this.popoverEl.classList.add('hidden'))
      atomsEl.appendChild(el)
    }

    this.invEl = panel.querySelector('.rule')
    this.bricksEl = bar.querySelector('.bricks-list')
    this.goalEl = bar.querySelector('.goal-status')
    this.oblEl = bar.querySelector('.obl-list')
    this.movesEl = panel.querySelector('.moves-top')!
    this.deadlockEl = bar.querySelector('.deadlock')!
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
          <span class="box">□</span> <span class="bname">${b.name}</span> <span class="def-sep">:</span> <span class="src">${hl(b.src)}</span>
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

  /** Check-list des obligations : départ + une ligne par action. */
  renderObligations(rows: readonly { label: string; ok: boolean; detail?: string }[]): void {
    if (this.oblEl === null) return
    this.oblEl.innerHTML = rows
      .map(
        (r, i) => `
        <div class="obl${r.ok ? ' ok' : ' ko'}" data-i="${i}">
          <span class="obl-mark">${r.ok ? '✓' : '✗'}</span>
          <span class="obl-label">${r.label}</span>
          ${r.detail !== undefined ? `<span class="obl-detail">${r.detail}</span>` : ''}
        </div>`,
      )
      .join('')
    this.oblEl.querySelectorAll<HTMLElement>('.obl.ko').forEach((el) => {
      el.addEventListener('click', () => this.cb.onObligationClick?.(Number(el.dataset.i)))
    })
  }

  setMoves(text: string): void {
    this.movesEl.textContent = text
  }

  /** Bannière de blocage : le joueur doit savoir qu'il est coincé. */
  setDeadlock(stuck: boolean): void {
    this.deadlockEl.classList.toggle('hidden', !stuck)
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

  showVictory(title: string, bodyHtml: string, hasNext: boolean, tone: 'gold' | 'green' = 'gold'): void {
    this.victoryEl.querySelector('h2')!.textContent = title
    this.victoryBody.innerHTML = bodyHtml
    this.nextBtn.style.display = hasNext ? '' : 'none'
    this.victoryEl.classList.remove('gold', 'green')
    this.victoryEl.classList.add(tone)
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
