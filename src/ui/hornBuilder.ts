import type { Expr } from '../dsl/ast'

/** Un littéral : un atome, éventuellement nié. */
export interface Literal {
  readonly atom: string
  readonly neg: boolean
}

/** Une clause de Horn : conjonction de prémisses ⇒ une conclusion (ou ⊥). */
export interface HornClause {
  readonly body: readonly Literal[]
  readonly head: Literal | 'bottom' | null
}

export interface HornBuilderOpts {
  readonly parent: HTMLElement
  readonly atoms: readonly { readonly name: string; readonly src: string }[]
  /** Teinte par atome (reprise de la palette d'actions), facultative. */
  readonly onChange: (clause: HornClause) => void
  readonly onSubmit: (clause: HornClause) => void
}

/** Source affichable d'un littéral. */
function litSrc(l: Literal): string {
  return l.neg ? `¬${l.atom}` : l.atom
}

/** Source affichable d'une clause : « SI a ∧ b ALORS c ». */
export function clauseSrc(c: HornClause): string {
  const body = c.body.map(litSrc).join(' ∧ ')
  const head = c.head === 'bottom' ? '⊥' : c.head === null ? '…' : litSrc(c.head)
  return body === '' ? head : `${body} ⇒ ${head}`
}

/** AST d'une clause, atomes substitués par leur formule. */
export function clauseExpr(c: HornClause, atomExpr: ReadonlyMap<string, Expr>): Expr {
  const lit = (l: Literal): Expr => {
    const e = atomExpr.get(l.atom)
    if (e === undefined) throw new Error(`atome inconnu « ${l.atom} »`)
    return l.neg ? { kind: 'not', arg: e } : e
  }
  const body =
    c.body.length === 0
      ? null
      : c.body
          .map(lit)
          .reduce((left, right) => ({ kind: 'bin', op: 'and', left, right, line: 1 }))
  if (c.head === 'bottom' || c.head === null) {
    // corps ⇒ ⊥  ≡  ¬corps ; corps vide ⇒ ⊥ = faux (clause impossible).
    return body === null ? { kind: 'num', value: 0 } : { kind: 'not', arg: body }
  }
  const head = lit(c.head)
  return body === null ? head : { kind: 'bin', op: 'implies', left: body, right: head, line: 1 }
}

/** true si la clause est complète (une tête et — si tête = ⊥ — un corps). */
export function clauseComplete(c: HornClause): boolean {
  if (c.head === null) return false
  if (c.head === 'bottom') return c.body.length > 0
  return true
}

/**
 * Constructeur visuel « SI … ALORS … » : garantit la forme Horn par
 * construction. Les prémisses (corps) se cochent parmi les atomes, chacun
 * cyclant vide → positif → nié → vide. La conclusion (tête) est un unique
 * atome, sa négation, ou ⊥.
 */
export class HornBuilder {
  private body = new Map<string, boolean>() // atome → nié ?
  private head: Literal | 'bottom' | null = null
  private readonly opts: HornBuilderOpts
  private readonly bodyEl: HTMLElement
  private readonly headEl: HTMLElement
  private readonly submitBtn: HTMLButtonElement

  constructor(opts: HornBuilderOpts) {
    this.opts = opts
    const root = document.createElement('div')
    root.className = 'horn'
    root.innerHTML = `
      <div class="horn-line"><span class="horn-kw si">SI</span> <span class="horn-body"></span></div>
      <div class="horn-line"><span class="horn-kw alors">ALORS</span> <span class="horn-head"></span>
        <button class="horn-submit">poser la clause ↵</button></div>`
    opts.parent.appendChild(root)
    this.bodyEl = root.querySelector('.horn-body')!
    this.headEl = root.querySelector('.horn-head')!
    this.submitBtn = root.querySelector('.horn-submit')!
    this.submitBtn.addEventListener('click', () => this.submit())
    this.render()
  }

  private clause(): HornClause {
    return {
      body: [...this.body].map(([atom, neg]) => ({ atom, neg })),
      head: this.head,
    }
  }

  private cycleBody(atom: string): void {
    const cur = this.body.get(atom)
    if (cur === undefined) this.body.set(atom, false) // vide → positif
    else if (cur === false) this.body.set(atom, true) // positif → nié
    else this.body.delete(atom) // nié → vide
    this.render()
    this.opts.onChange(this.clause())
  }

  private setHead(h: Literal | 'bottom'): void {
    // Re-cliquer bascule positif↔nié ; un 3ᵉ clic retire.
    if (h !== 'bottom' && this.head !== null && this.head !== 'bottom' && this.head.atom === h.atom) {
      this.head = this.head.neg ? null : { atom: h.atom, neg: true }
    } else if (h === 'bottom' && this.head === 'bottom') {
      this.head = null
    } else {
      this.head = h
    }
    this.render()
    this.opts.onChange(this.clause())
  }

  private render(): void {
    this.bodyEl.innerHTML = ''
    for (const a of this.opts.atoms) {
      const state = this.body.get(a.name)
      const chip = document.createElement('button')
      chip.className = `horn-chip${state === undefined ? '' : state ? ' neg' : ' pos'}`
      chip.textContent = state === true ? `¬${a.name}` : a.name
      chip.title = a.src
      chip.addEventListener('click', () => this.cycleBody(a.name))
      this.bodyEl.appendChild(chip)
      if (a !== this.opts.atoms[this.opts.atoms.length - 1]) {
        const sep = document.createElement('span')
        sep.className = 'horn-sep'
        sep.textContent = '∧'
        this.bodyEl.appendChild(sep)
      }
    }

    this.headEl.innerHTML = ''
    for (const a of this.opts.atoms) {
      const sel = this.head !== null && this.head !== 'bottom' && this.head.atom === a.name
      const chip = document.createElement('button')
      chip.className = `horn-chip${sel ? (this.head !== 'bottom' && (this.head as Literal).neg ? ' neg' : ' pos') : ''}`
      chip.textContent = sel && this.head !== 'bottom' && (this.head as Literal).neg ? `¬${a.name}` : a.name
      chip.addEventListener('click', () => this.setHead({ atom: a.name, neg: false }))
      this.headEl.appendChild(chip)
    }
    const bot = document.createElement('button')
    bot.className = `horn-chip bottom${this.head === 'bottom' ? ' pos' : ''}`
    bot.textContent = '⊥'
    bot.title = 'contradiction : le corps ne doit jamais tenir'
    bot.addEventListener('click', () => this.setHead('bottom'))
    this.headEl.appendChild(bot)
  }

  /** Ajoute/cycle un atome dans le corps (clic depuis le panneau des pièces). */
  toggleBody(atom: string): void {
    if (this.opts.atoms.some((a) => a.name === atom)) this.cycleBody(atom)
  }

  /** Active/désactive le bouton « poser » selon que la clause est posable (sans fuite). */
  setReady(ready: boolean): void {
    this.submitBtn.classList.toggle('disabled', !ready)
    this.submitBtn.title = ready ? '' : 'clause impossible à poser : elle a une fuite'
  }

  submit(): void {
    if (this.submitBtn.classList.contains('disabled')) return
    if (clauseComplete(this.clause())) this.opts.onSubmit(this.clause())
  }

  reset(): void {
    this.body.clear()
    this.head = null
    this.render()
    this.opts.onChange(this.clause())
  }

  /** Pré-remplit depuis une clause d'action (le joueur part de la matière donnée). */
  load(clause: HornClause): void {
    this.body = new Map(clause.body.map((l) => [l.atom, l.neg]))
    this.head = clause.head
    this.render()
    this.opts.onChange(this.clause())
  }
}
