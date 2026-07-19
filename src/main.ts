import type { Completion } from '@codemirror/autocomplete'
import * as THREE from 'three'
import { explore, type Graph } from './core/explore'
import { currentNode, newGame, play, undo, type Game } from './core/game'
import { matchStates, sameSet } from './core/match'
import { checkRepair } from './core/repair'
import type { CompiledLevel } from './dsl/ast'
import { countTokens, parseExpr } from './dsl/parse'
import { layout } from './layout/force'
import { levels } from './levels'
import { GraphView } from './render/graph'
import { SceneCtx } from './render/scene'
import { loadProgress, recordScore, unlock } from './ui/campaign'
import { FormulaEditor, OPERATOR_COMPLETIONS } from './ui/editor'
import { Hud } from './ui/hud'

const app = document.getElementById('app')!
const progress = loadProgress()
const levelNames = levels.map((l) => l.name)

// ——— Helpers communs ———

/** Couleur sémantique : gradient bleu → ambre → rouge sur COLOR, rouge si violant. */
function semanticColors(level: CompiledLevel, graph: Graph): THREE.Color[] {
  const base = new THREE.Color(0x4a78b0)
  const mid = new THREE.Color(0xe0913c)
  const hot = new THREE.Color(0xff3b52)
  const values = graph.nodes.map((n) => level.colorValue?.(n.state) ?? 0)
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  return graph.nodes.map((n, i) => {
    if (n.violating) return hot.clone()
    const t = (values[i] - min) / span
    return t < 0.5 ? base.clone().lerp(mid, t * 2) : mid.clone().lerp(hot, (t - 0.5) * 2)
  })
}

/** Complétions variables + valeurs de domaine + opérateurs. */
function formulaCompletions(level: CompiledLevel): Completion[] {
  const out: Completion[] = Object.keys(level.init).map((v) => ({ label: v, type: 'variable' }))
  const seen = new Set<string>()
  for (const dom of level.domains.values())
    for (const v of dom) {
      const label = JSON.stringify(v)
      if (!seen.has(label)) {
        seen.add(label)
        out.push({ label, type: 'constant' })
      }
    }
  return [...out, ...OPERATOR_COMPLETIONS]
}

const EMPTY = new Set<number>()
const noStyles = {
  current: null,
  frontier: EMPTY,
  traceEdges: EMPTY,
  enabledEdges: EMPTY,
  highlight: -1,
}

// ——— Chargement d'un niveau ———

let disposeCurrent: (() => void) | null = null

function loadLevel(index: number): void {
  disposeCurrent?.()
  app.innerHTML = ''
  disposeCurrent = startLevel(index)
}

function startLevel(index: number): () => void {
  const level = levels[index]
  const graph = explore(level)
  const positions = layout(
    graph.nodes.length,
    graph.edges.map((e) => [e.from, e.to] as const),
  )
  const ctx = new SceneCtx(app)
  const view = new GraphView(
    ctx,
    graph,
    positions,
    semanticColors(level, graph),
    graph.nodes.map((n) => level.labelVars.map((v) => String(n.state[v])).join('·')),
  )
  const hasNext = index + 1 < levels.length

  const win = (score: number, title: string, body: string): void => {
    recordScore(progress, level.id, score)
    unlock(progress, Math.min(index + 1, levels.length - 1))
    hud.showVictory(title, body, hasNext)
  }

  const hud = new Hud(app, level, levelNames, index, progress.unlocked, {
    onUndo: () => modeHooks.onUndo?.(),
    onReset: () => {
      hud.hideVictory()
      modeHooks.onReset()
    },
    onSelectLevel: loadLevel,
    onNext: () => loadLevel(index + 1),
  })

  const modeHooks =
    level.mode === 'trace'
      ? setupTrace(level, graph, ctx, view, hud, win)
      : level.mode === 'match'
        ? setupMatch(level, graph, ctx, view, hud, win)
        : setupRepair(level, graph, ctx, view, hud, win)

  return () => ctx.dispose()
}

interface ModeHooks {
  onReset(): void
  onUndo?(): void
}

type Win = (score: number, title: string, body: string) => void

// ——— MODE trace : l'adversaire au clavier ———

function setupTrace(
  level: CompiledLevel,
  graph: Graph,
  ctx: SceneCtx,
  view: GraphView,
  hud: Hud,
  win: Win,
): ModeHooks {
  let game: Game = newGame(level.id)
  let prevState: (typeof level)['init'] | null = null
  let locked = false

  const enabledMoves = (): Map<string, number> => {
    const at = currentNode(game, graph)
    const map = new Map<string, number>()
    if (!graph.nodes[at].violating)
      for (const e of graph.successors[at]) map.set(graph.edges[e].action, e)
    return map
  }

  /** Nom exact, ou préfixe non ambigu, d'une action activée. */
  const resolve = (text: string): string | null => {
    if (text === '') return null
    const names = [...enabledMoves().keys()]
    if (names.includes(text)) return text
    const hits = names.filter((n) => n.startsWith(text))
    return hits.length === 1 ? hits[0] : null
  }

  const glideTo = (node: number): void => {
    const from = ctx.controls.target.clone()
    const to = view.nodePosition(node, new THREE.Vector3())
    ctx.addTween({ dur: 500, step: (k) => ctx.controls.target.lerpVectors(from, to, k) })
  }

  const refresh = (ghost = -1): void => {
    const at = currentNode(game, graph)
    const moves = enabledMoves()
    view.reveal(at, null)
    const frontier = new Set<number>()
    for (const e of moves.values()) {
      view.reveal(graph.edges[e].to, at)
      frontier.add(graph.edges[e].to)
    }
    view.setStyles({
      current: at,
      frontier,
      traceEdges: new Set(game.moves),
      enabledEdges: new Set(moves.values()),
      highlight: ghost,
    })
    hud.updateVars(graph.nodes[at].state, prevState)
    hud.setEnabledActions(new Set(moves.keys()))
    hud.setInvariantViolated(graph.nodes[at].violating)
    hud.setMoves(`coups : ${game.moves.length} — par : ${graph.par}`)
    hud.setTrace(game.moves.map((e) => graph.edges[e].action))
    if (graph.nodes[at].violating) {
      locked = true
      const trace = game.moves.map((e) => graph.edges[e].action)
      const medal =
        game.moves.length === graph.par
          ? 'trace optimale — scheduler parfaitement démoniaque'
          : `optimum : ${graph.par} coups`
      win(
        game.moves.length,
        'Invariant violé',
        `<p>${trace.join(' → ')}</p><p><b>${game.moves.length}</b> coups — ${medal}</p>`,
      )
    } else if (moves.size === 0) {
      hud.setHint('aucune action activée — annulez un coup')
    } else {
      hud.setHint('')
    }
    glideTo(at)
  }

  const editor = new FormulaEditor({
    parent: hud.editorMount,
    placeholder: 'nom d’une action activée, puis Entrée',
    completions: () =>
      [...enabledMoves().entries()].map(([name, e]) => ({
        label: name,
        type: 'function',
        detail: level.actionsSrc.find((a) => a.name === name)?.updateSrc,
        boost: graph.nodes[graph.edges[e].to].violating ? 1 : 0,
      })),
    onChange: (text) => {
      if (locked) return
      const name = resolve(text)
      const e = name === null ? undefined : enabledMoves().get(name)
      view.setStyles({
        current: currentNode(game, graph),
        frontier: new Set([...enabledMoves().values()].map((x) => graph.edges[x].to)),
        traceEdges: new Set(game.moves),
        enabledEdges: new Set(enabledMoves().values()),
        highlight: e === undefined ? -1 : graph.edges[e].to,
      })
    },
    onSubmit: (text) => {
      if (locked) return
      const name = resolve(text)
      const e = name === null ? undefined : enabledMoves().get(name)
      if (e === undefined) return
      prevState = graph.nodes[currentNode(game, graph)].state
      game = play(game, graph, e)
      editor.setText('')
      refresh()
    },
    lint: (text) =>
      resolve(text) !== null ? null : `« ${text} » : pas une action activée (Ctrl-Espace pour la liste)`,
  })

  refresh()
  editor.focus()

  return {
    onReset: () => {
      game = newGame(level.id)
      prevState = null
      locked = false
      editor.setText('')
      refresh()
      editor.focus()
    },
    onUndo: () => {
      if (!locked && game.moves.length > 0) {
        game = undo(game)
        prevState = null
        refresh()
        editor.focus()
      }
    },
  }
}

// ——— MODE match : caractériser un ensemble d'états ———

const GOOD = new THREE.Color(0x3fae6a) // cible ∩ formule
const MISS = new THREE.Color(0xff3b52) // cible manquée
const EXTRA = new THREE.Color(0xf2f6ff) // sélectionné hors cible

function setupMatch(
  level: CompiledLevel,
  graph: Graph,
  ctx: SceneCtx,
  view: GraphView,
  hud: Hud,
  win: Win,
): ModeHooks {
  const target = matchStates(graph, level.target!)
  let locked = false
  view.revealAll()
  ctx.controls.target.set(0, 0, 0)

  const preview = (matched: ReadonlySet<number>): void => {
    const overrides = new Map<number, THREE.Color>()
    for (const i of target) overrides.set(i, matched.has(i) ? GOOD : MISS)
    for (const i of matched) if (!target.has(i)) overrides.set(i, EXTRA)
    view.setStyles({ ...noStyles, overrides })
  }

  const status = (matched: ReadonlySet<number> | null, text: string): void => {
    if (matched === null) {
      hud.setStatus(`cible : <b>${target.size}</b> états — ${text}`)
      return
    }
    let good = 0
    for (const i of matched) if (target.has(i)) good++
    const extra = matched.size - good
    hud.setStatus(
      `<b>${good}/${target.size}</b> corrects` +
        (extra > 0 ? `, <b>${extra}</b> en trop` : '') +
        (text !== '' ? ` — ${text}` : ''),
    )
  }

  const editor = new FormulaEditor({
    parent: hud.editorMount,
    placeholder: 'formule d’état — ex. n = 3 (Ctrl-Espace : complétion)',
    completions: () => formulaCompletions(level),
    onChange: (text) => {
      if (locked) return
      if (text === '') {
        preview(EMPTY)
        status(null, 'tapez une formule')
        return
      }
      let matched: Set<number>
      try {
        matched = matchStates(graph, parseExpr(text))
      } catch {
        return // le lint souligne déjà ; on garde le dernier aperçu
      }
      preview(matched)
      const tokens = countTokens(text)
      status(matched, `${tokens} tokens`)
      if (sameSet(matched, target)) {
        locked = true
        win(
          tokens,
          'Caractérisation exacte',
          `<p class="formula">${text}</p><p><b>${tokens}</b> tokens</p>`,
        )
      }
    },
    onSubmit: () => undefined, // tout est live, Entrée n'a rien à faire
    lint: (text) => {
      try {
        matchStates(graph, parseExpr(text))
        return null
      } catch (err) {
        return (err as Error).message
      }
    },
  })

  hud.updateVars(level.init, null)
  hud.setEnabledActions(EMPTY as unknown as Set<string>)
  preview(EMPTY)
  status(null, 'tapez une formule')
  editor.focus()

  return {
    onReset: () => {
      locked = false
      editor.setText('')
      preview(EMPTY)
      status(null, 'tapez une formule')
      editor.focus()
    },
  }
}

// ——— MODE repair : renforcer les gardes ———

function setupRepair(
  level: CompiledLevel,
  graph: Graph,
  ctx: SceneCtx,
  view: GraphView,
  hud: Hud,
  win: Win,
): ModeHooks {
  let locked = false
  view.revealAll()
  ctx.controls.target.set(0, 0, 0)
  const editors = new Map<string, FormulaEditor>()

  const recompute = (): void => {
    if (locked) return
    const extras = new Map<string, ReturnType<typeof parseExpr>>()
    for (const [action, ed] of editors) {
      const text = ed.getText()
      if (text === '') continue
      try {
        extras.set(action, parseExpr(text))
      } catch {
        return // slot invalide : le lint souligne, on fige l'aperçu
      }
    }
    let result
    try {
      result = checkRepair(graph, extras, level.requires)
    } catch {
      return
    }
    view.setStyles({
      ...noStyles,
      dimmed: result.unreachable,
      killedEdges: result.killedEdges,
    })
    hud.setRequires(result.requiresOk)
    const reqOk = result.requiresOk.filter(Boolean).length
    const tokens = [...editors.values()].reduce((n, ed) => n + countTokens(ed.getText()), 0)
    hud.setStatus(
      `${result.safe ? 'plus aucune violation atteignable ✓' : 'violation encore atteignable'}` +
        ` — REQUIRE : <b>${reqOk}/${level.requires.length}</b>` +
        ` — transitions tuées : ${result.killedEdges.size} — ${tokens} tokens`,
    )
    if (result.safe && reqOk === level.requires.length && extras.size > 0) {
      locked = true
      const parts = [...editors.entries()]
        .filter(([, ed]) => ed.getText() !== '')
        .map(([a, ed]) => `${a} : ∧ ${ed.getText()}`)
      win(
        tokens,
        'Système réparé',
        `<p class="formula">${parts.join('<br>')}</p><p><b>${tokens}</b> tokens ajoutés</p>`,
      )
    }
  }

  for (const action of level.repairables) {
    const mount = hud.repairMounts.get(action)!
    editors.set(
      action,
      new FormulaEditor({
        parent: mount,
        placeholder: 'renfort…',
        completions: () => formulaCompletions(level),
        onChange: () => recompute(),
        onSubmit: () => recompute(),
        lint: (text) => {
          try {
            parseExpr(text)
            // Vérifie l'évaluabilité sur un état (variables connues).
            checkRepair(graph, new Map([[action, parseExpr(text)]]), [])
            return null
          } catch (err) {
            return (err as Error).message
          }
        },
      }),
    )
  }

  hud.updateVars(level.init, null)
  hud.setEnabledActions(new Set(level.repairables))
  view.setStyles(noStyles)
  hud.setStatus('renforcez les gardes surlignées — l’aperçu est immédiat')
  recompute()

  return {
    onReset: () => {
      locked = false
      for (const ed of editors.values()) ed.setText('')
      view.setStyles(noStyles)
      recompute()
    },
  }
}

loadLevel(Math.min(progress.unlocked, levels.length - 1))
