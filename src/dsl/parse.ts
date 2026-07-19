/**
 * Parseur du mini-DSL TLA-simplifié.
 *
 * Structure d'un niveau (une directive par ligne, commentaires \* ou //) :
 *
 *   LEVEL mutex-naif
 *   NAME Mutex naïf
 *   DESC … (répétable, concaténé)
 *   VARIABLES
 *     pc0 ∈ {"idle", "ready", "crit"} = "idle"      (domaine optionnel)
 *   ACTION check0 ≜ pc0 = "idle" ∧ flag1 = 0 → pc0 := "ready"
 *   INVARIANT ¬(pc0 = "crit" ∧ pc1 = "crit")
 *   COLOR (pc0 = "crit") + (pc1 = "crit")           (optionnel)
 *   LABEL pc0, pc1                                  (optionnel)
 *
 * Aliases ASCII : /\ ∧, \/ ∨, ~ ¬, /= ou # ≠, <= ≥ etc., -> →, == ≜, \in ∈.
 * Les affectations d'une action sont SIMULTANÉES (sémantique TLA : les
 * membres droits sont évalués dans l'état de départ).
 */
import type { State } from '../core/spec'
import { stateKey } from '../core/spec'
import type { Assignment, CompiledLevel, Expr, Value } from './ast'

// ——— Tokenizer ———

type TokKind =
  | 'ident' | 'num' | 'str'
  | 'lparen' | 'rparen' | 'lbrace' | 'rbrace' | 'comma'
  | 'and' | 'or' | 'not' | 'arrow' | 'defeq' | 'assign' | 'in'
  | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' | 'plus' | 'minus'

interface Tok {
  readonly kind: TokKind
  readonly text: string
  readonly pos: number // offset dans la ligne source
}

const SYMBOLS: readonly (readonly [string, TokKind])[] = [
  // Les plus longs d'abord.
  ['\\in', 'in'], ['/\\', 'and'], ['\\/', 'or'], ['/=', 'ne'],
  [':=', 'assign'], ['->', 'arrow'], ['==', 'defeq'], ['<=', 'le'], ['>=', 'ge'],
  ['&&', 'and'], ['||', 'or'],
  ['∧', 'and'], ['∨', 'or'], ['¬', 'not'], ['→', 'arrow'], ['≜', 'defeq'],
  ['∈', 'in'], ['≠', 'ne'], ['≤', 'le'], ['≥', 'ge'],
  ['~', 'not'], ['!', 'not'], ['#', 'ne'], ['=', 'eq'], ['<', 'lt'], ['>', 'gt'],
  ['+', 'plus'], ['-', 'minus'], ['(', 'lparen'], [')', 'rparen'],
  ['{', 'lbrace'], ['}', 'rbrace'], [',', 'comma'],
]

function tokenize(src: string, line: number): Tok[] {
  const toks: Tok[] = []
  let i = 0
  outer: while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t') { i++; continue }
    if (c === '"') {
      const end = src.indexOf('"', i + 1)
      if (end === -1) throw new Error(`ligne ${line} : chaîne non terminée`)
      toks.push({ kind: 'str', text: src.slice(i + 1, end), pos: i })
      i = end + 1
      continue
    }
    if (/[0-9]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9]/.test(src[j])) j++
      toks.push({ kind: 'num', text: src.slice(i, j), pos: i })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++
      toks.push({ kind: 'ident', text: src.slice(i, j), pos: i })
      i = j
      continue
    }
    for (const [sym, kind] of SYMBOLS) {
      if (src.startsWith(sym, i)) {
        toks.push({ kind, text: sym, pos: i })
        i += sym.length
        continue outer
      }
    }
    throw new Error(`ligne ${line} : caractère inattendu « ${c} »`)
  }
  return toks
}

// ——— Parseur d'expressions (descente récursive) ———

class P {
  private at = 0
  constructor(
    private readonly toks: Tok[],
    private readonly line: number,
  ) {}

  peek(): Tok | undefined { return this.toks[this.at] }
  next(): Tok {
    const t = this.toks[this.at++]
    if (t === undefined) throw this.err('fin de ligne inattendue')
    return t
  }
  eat(kind: TokKind): Tok {
    const t = this.next()
    if (t.kind !== kind) throw this.err(`« ${t.text} » inattendu`)
    return t
  }
  tryEat(kind: TokKind): boolean {
    if (this.peek()?.kind === kind) { this.at++; return true }
    return false
  }
  err(msg: string): Error { return new Error(`ligne ${this.line} : ${msg}`) }
  atEnd(): boolean { return this.at >= this.toks.length }
  /** Position source du prochain token (pour découper la ligne). */
  nextPos(): number { return this.peek()?.pos ?? -1 }

  // or ← and (∨ and)*        and ← not (∧ not)*        not ← ¬ not | cmp
  // cmp ← add ((=|≠|<|≤|>|≥) add)?        add ← unary ((+|-) unary)*
  expr(): Expr { return this.or() }

  private or(): Expr {
    let e = this.and()
    while (this.peek()?.kind === 'or') {
      this.next()
      e = { kind: 'bin', op: 'or', left: e, right: this.and(), line: this.line }
    }
    return e
  }

  private and(): Expr {
    let e = this.not()
    while (this.peek()?.kind === 'and') {
      this.next()
      e = { kind: 'bin', op: 'and', left: e, right: this.not(), line: this.line }
    }
    return e
  }

  private not(): Expr {
    if (this.tryEat('not')) return { kind: 'not', arg: this.not() }
    return this.cmp()
  }

  cmp(): Expr {
    const e = this.add()
    const k = this.peek()?.kind
    if (k === 'eq' || k === 'ne' || k === 'lt' || k === 'le' || k === 'gt' || k === 'ge') {
      this.next()
      return { kind: 'bin', op: k, left: e, right: this.add(), line: this.line }
    }
    return e
  }

  private add(): Expr {
    let e = this.unary()
    for (;;) {
      const k = this.peek()?.kind
      if (k !== 'plus' && k !== 'minus') return e
      this.next()
      e = { kind: 'bin', op: k === 'plus' ? 'add' : 'sub', left: e, right: this.unary(), line: this.line }
    }
  }

  private unary(): Expr {
    if (this.tryEat('minus')) {
      const arg = this.unary()
      return { kind: 'bin', op: 'sub', left: { kind: 'num', value: 0 }, right: arg, line: this.line }
    }
    const t = this.next()
    switch (t.kind) {
      case 'num': return { kind: 'num', value: Number(t.text) }
      case 'str': return { kind: 'str', value: t.text }
      case 'ident': return { kind: 'var', name: t.text, line: this.line }
      case 'lparen': {
        const e = this.expr()
        this.eat('rparen')
        return e
      }
      default: throw this.err(`« ${t.text} » inattendu`)
    }
  }

  /**
   * x := e (∧ y := e)*.
   * Le membre droit se parse SOUS le niveau ∧ (sinon le ∧ séparateur
   * serait avalé) ; un RHS booléen serait de toute façon rejeté à l'éval.
   */
  assignments(): Assignment[] {
    const out: Assignment[] = []
    do {
      const name = this.eat('ident').text
      this.eat('assign')
      out.push({ name, expr: this.cmp(), line: this.line })
    } while (this.tryEat('and'))
    if (!this.atEnd()) throw this.err(`« ${this.peek()!.text} » inattendu après les affectations`)
    return out
  }

  /** Littéral : nombre, chaîne, ou nombre négatif. */
  literal(): Value {
    const t = this.next()
    if (t.kind === 'num') return Number(t.text)
    if (t.kind === 'str') return t.text
    if (t.kind === 'minus') return -Number(this.eat('num').text)
    throw this.err(`littéral attendu, « ${t.text} » trouvé`)
  }
}

// ——— Évaluation ———

export function evalExpr(e: Expr, s: State): Value {
  switch (e.kind) {
    case 'num': return e.value
    case 'str': return e.value
    case 'var': {
      const v = s[e.name]
      if (v === undefined) throw new Error(`ligne ${e.line} : variable inconnue « ${e.name} »`)
      return v
    }
    case 'not': return !bool(evalExpr(e.arg, s))
    case 'bin': {
      if (e.op === 'and') return bool(evalExpr(e.left, s)) && bool(evalExpr(e.right, s))
      if (e.op === 'or') return bool(evalExpr(e.left, s)) || bool(evalExpr(e.right, s))
      const l = evalExpr(e.left, s)
      const r = evalExpr(e.right, s)
      switch (e.op) {
        case 'eq': return l === r
        case 'ne': return l !== r
        case 'lt': return num(l, e.line) < num(r, e.line)
        case 'le': return num(l, e.line) <= num(r, e.line)
        case 'gt': return num(l, e.line) > num(r, e.line)
        case 'ge': return num(l, e.line) >= num(r, e.line)
        case 'add': return num(l, e.line) + num(r, e.line)
        case 'sub': return num(l, e.line) - num(r, e.line)
      }
    }
  }
}

function bool(v: Value): boolean {
  if (typeof v !== 'boolean') throw new Error(`booléen attendu, « ${v} » trouvé`)
  return v
}

/** Coercition bool → 0/1 (permet COLOR (pc0 = "crit") + (pc1 = "crit")). */
function num(v: Value, line: number): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  throw new Error(`ligne ${line} : nombre attendu, « ${v} » trouvé`)
}

// ——— Compilation d'un niveau ———

export function compileLevel(src: string): CompiledLevel {
  let id = ''
  let name = ''
  const desc: string[] = []
  const init: Record<string, Value & (string | number)> = {}
  const domains = new Map<string, readonly Value[]>()
  const actions: { name: string; guard: Expr; assigns: Assignment[]; guardSrc: string; updateSrc: string }[] = []
  let invariant: Expr | null = null
  let invariantSrc = ''
  let colorExpr: Expr | null = null
  let labelVars: string[] = []
  let inVariables = false

  const lines = src.split('\n')
  for (let li = 0; li < lines.length; li++) {
    const lineNo = li + 1
    const line = lines[li].replace(/(\\\*|\/\/).*$/, '').trim()
    if (line === '') continue

    const kw = line.split(/\s+/, 1)[0]
    const rest = line.slice(kw.length).trim()
    if (['LEVEL', 'NAME', 'DESC', 'VARIABLES', 'ACTION', 'INVARIANT', 'COLOR', 'LABEL'].includes(kw))
      inVariables = kw === 'VARIABLES'

    switch (kw) {
      case 'LEVEL': id = rest; break
      case 'NAME': name = rest; break
      case 'DESC': desc.push(rest); break
      case 'VARIABLES': break
      case 'ACTION': {
        const m = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(≜|==)\s*(.*)$/)
        if (!m) throw new Error(`ligne ${lineNo} : attendu « ACTION nom ≜ garde → affectations »`)
        const p = new P(tokenize(m[3], lineNo), lineNo)
        const guard = p.expr()
        const cut = p.nextPos()
        p.eat('arrow')
        const cutEnd = p.nextPos()
        const assigns = p.assignments()
        actions.push({
          name: m[1],
          guard,
          assigns,
          guardSrc: m[3].slice(0, cut).trim(),
          updateSrc: m[3].slice(cutEnd).trim(),
        })
        break
      }
      case 'INVARIANT': {
        const p = new P(tokenize(rest, lineNo), lineNo)
        invariant = p.expr()
        if (!p.atEnd()) throw new Error(`ligne ${lineNo} : « ${p.peek()!.text} » inattendu`)
        invariantSrc = rest
        break
      }
      case 'COLOR': {
        const p = new P(tokenize(rest, lineNo), lineNo)
        colorExpr = p.expr()
        break
      }
      case 'LABEL':
        labelVars = rest.split(',').map((v) => v.trim()).filter(Boolean)
        break
      default: {
        if (!inVariables)
          throw new Error(`ligne ${lineNo} : directive inconnue « ${kw} »`)
        // Déclaration de variable : nom [∈ {littéraux}] = littéral
        const p = new P(tokenize(line, lineNo), lineNo)
        const varName = p.eat('ident').text
        if (p.tryEat('in')) {
          p.eat('lbrace')
          const dom: Value[] = []
          do dom.push(p.literal())
          while (p.tryEat('comma'))
          p.eat('rbrace')
          domains.set(varName, dom)
        }
        p.eat('eq')
        const v = p.literal()
        if (typeof v === 'boolean') throw new Error(`ligne ${lineNo} : littéral nombre ou chaîne attendu`)
        if (!p.atEnd()) throw new Error(`ligne ${lineNo} : « ${p.peek()!.text} » inattendu`)
        const dom = domains.get(varName)
        if (dom && !dom.includes(v))
          throw new Error(`ligne ${lineNo} : ${varName} = ${JSON.stringify(v)} hors de son domaine`)
        init[varName] = v
      }
    }
  }

  if (id === '') throw new Error('directive LEVEL manquante')
  if (invariant === null) throw new Error('directive INVARIANT manquante')
  if (actions.length === 0) throw new Error('aucune ACTION déclarée')
  for (const a of actions)
    for (const asg of a.assigns)
      if (init[asg.name] === undefined)
        throw new Error(`ligne ${asg.line} : affectation à une variable non déclarée « ${asg.name} »`)
  for (const v of labelVars)
    if (init[v] === undefined) throw new Error(`LABEL : variable non déclarée « ${v} »`)
  const inv = invariant

  const compiledActions = actions.map((a) => ({
    name: a.name,
    guard: (s: State) => bool(evalExpr(a.guard, s)),
    update: (s: State): State => {
      // Sémantique TLA : membres droits évalués dans l'état de départ.
      const next: Record<string, string | number> = { ...s }
      for (const asg of a.assigns) {
        const v = evalExpr(asg.expr, s)
        if (typeof v === 'boolean')
          throw new Error(`ligne ${asg.line} : ${asg.name} := booléen (utiliser 0/1)`)
        const dom = domains.get(asg.name)
        if (dom && !dom.includes(v))
          throw new Error(
            `action ${a.name} : ${asg.name} = ${JSON.stringify(v)} hors de son domaine (état ${stateKey(s)})`,
          )
        next[asg.name] = v
      }
      return next
    },
  }))

  return {
    id,
    name: name || id,
    description: desc.join(' '),
    init,
    actions: compiledActions,
    invariant: (s) => bool(evalExpr(inv, s)),
    actionsSrc: actions.map((a) => ({ name: a.name, guardSrc: a.guardSrc, updateSrc: a.updateSrc })),
    invariantSrc,
    labelVars: labelVars.length > 0 ? labelVars : Object.keys(init),
    colorValue: colorExpr ? (s) => num(evalExpr(colorExpr, s), 0) : undefined,
  }
}
