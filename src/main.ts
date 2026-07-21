import type { Completion } from '@codemirror/autocomplete'
import * as THREE from 'three'
import { explore, type Graph } from './core/explore'
import { buildFullSpace, type FullSpace } from './core/fullspace'
import { currentNode, newGame, play, undo, type Game } from './core/game'
import { checkCandidate, impliesGoal, usedBricks } from './core/prove'
import type { CompiledLevel, Expr } from './dsl/ast'
import { countTokens, parseExpr, substituteAliases } from './dsl/parse'
import { layout } from './layout/force'
import { levels } from './levels'
import { GraphView } from './render/graph'
import { color } from './render/palette'
import { SceneCtx } from './render/scene'
import { loadProgress, recordScore, saveProgress, unlock } from './ui/campaign'
import { FormulaEditor, OPERATOR_COMPLETIONS, type EditorOpts } from './ui/editor'
import { hl, hlValue } from './ui/highlight'
import { Hud, type Brick } from './ui/hud'
import { runTour } from './ui/tour'
import { tours } from './ui/tours'

const app = document.getElementById('app')!
const progress = loadProgress()

/** Rayon du graphe posé (pour cadrer la caméra). */
function graphRadius(positions: Float32Array): number {
  let r = 0
  for (let i = 0; i < positions.length; i += 3)
    r = Math.max(r, Math.hypot(positions[i], positions[i + 1], positions[i + 2]))
  return r
}

// ——— Helpers communs ———

/** Couleur sémantique : gradient bleu → ambré → rose sur COLOR, rose si violant. */
function semanticColors(level: CompiledLevel, graph: Graph): THREE.Color[] {
  const values = graph.nodes.map((n) => level.colorValue?.(n.state) ?? 0)
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  return graph.nodes.map((n, i) => {
    if (n.violating) return color.violating.clone()
    const t = (values[i] - min) / span
    return t < 0.5
      ? color.nodeCold.clone().lerp(color.nodeWarm, t * 2)
      : color.nodeWarm.clone().lerp(color.violating, (t - 0.5) * 2)
  })
}

function nodeLabels(level: CompiledLevel, graph: Graph): string[] {
  return graph.nodes.map((n) => level.labelVars.map((v) => String(n.state[v])).join('·'))
}

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

/**
 * Inspection au clic : sélectionne un état → fenêtre avec la valuation,
 * flèches sortantes étiquetées par leur action (dans GraphView).
 * Un clic dans le vide (ou ✕) désélectionne. Le drag caméra n'inspecte pas.
 */
function attachInspection(
  ctx: SceneCtx,
  view: GraphView,
  graph: Graph,
  hud: Hud,
  badges: (i: number) => string,
  opts: { refocus(): void; recenter(): void },
): void {
  const canvas = ctx.renderer.domElement
  const ndc = new THREE.Vector2()
  const toNdc = (ev: PointerEvent): THREE.Vector2 => {
    const r = canvas.getBoundingClientRect()
    return ndc.set(
      ((ev.clientX - r.left) / r.width) * 2 - 1,
      -((ev.clientY - r.top) / r.height) * 2 + 1,
    )
  }
  // Hook e2e : le pick est injoignable par événements synthétiques fiables partout.
  ;(window as unknown as Record<string, unknown>).__pick = (x: number, y: number) =>
    view.pick(toNdc({ clientX: x, clientY: y } as PointerEvent))
  ;(window as unknown as Record<string, unknown>).__view = view
  ;(window as unknown as Record<string, unknown>).__nodeScreen = (i: number) => {
    const p = view.nodePosition(i, new THREE.Vector3()).project(ctx.camera)
    const r = canvas.getBoundingClientRect()
    return [((p.x + 1) / 2) * r.width, ((1 - p.y) / 2) * r.height].map(Math.round)
  }

  let downAt: [number, number] | null = null
  canvas.addEventListener('pointerdown', (ev) => {
    downAt = [ev.clientX, ev.clientY]
  })
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.buttons === 0) canvas.style.cursor = view.pick(toNdc(ev)) === null ? '' : 'pointer'
  })
  canvas.addEventListener('pointerup', (ev) => {
    if (downAt === null) return
    const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1])
    downAt = null
    if (moved > 5) return
    const hit = view.pick(toNdc(ev))
    if (hit === null) {
      view.setSelected(null)
      hud.hideInspector()
      opts.refocus() // le clavier reprend la main sans re-cliquer le panneau
      return
    }
    view.setSelected(hit)
    const state = graph.nodes[hit].state
    const rows = Object.entries(state)
      .map(([k, v]) => `<div class="row"><span class="hl-var">${k}</span> <span class="hl-op">=</span> <b>${hlValue(v)}</b></div>`)
      .join('')
    const out = graph.successors[hit].length
    hud.showInspector(
      ev.clientX,
      ev.clientY,
      `${rows}${badges(hit)}<div class="note">${out === 0 ? 'aucune action possible' : `${out} action${out > 1 ? 's' : ''} — flèches étiquetées`}</div>`,
      () => {
        view.setSelected(null)
        opts.refocus()
      },
    )
    opts.refocus()
  })
  // Double-clic dans le vide : recadrer la caméra.
  canvas.addEventListener('dblclick', (ev) => {
    if (view.pick(toNdc(ev as PointerEvent)) === null) opts.recenter()
  })
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
  const hasNext = index + 1 < levels.length

  // Visite guidée : la victoire est différée tant que le tour est actif.
  let tourActive = false
  let pendingWin: (() => void) | null = null

  const win = (score: number, title: string, body: string): void => {
    const previousBest = progress.scores[level.id]
    recordScore(progress, level.id, score)
    unlock(progress, Math.min(index + 1, levels.length - 1))
    const record =
      previousBest === undefined
        ? '<p class="record">premier succès enregistré</p>'
        : score < previousBest
          ? `<p class="record">nouveau record ! (ancien : ${previousBest})</p>`
          : `<p class="record">record : ${previousBest}</p>`
    const show = (): void => hud.showVictory(title, body + record, hasNext)
    if (tourActive) pendingWin = show
    else show()
  }

  const hud = new Hud(
    app,
    level,
    levels.map((l) => ({ name: l.name, best: progress.scores[l.id] })),
    index,
    progress.unlocked,
    {
      onUndo: () => modeHooks.onUndo?.(),
      onReset: () => {
        hud.hideVictory()
        modeHooks.onReset()
      },
      onSelectLevel: loadLevel,
      onNext: () => loadLevel(index + 1),
      onDeleteBrick: (name) => modeHooks.onDeleteBrick?.(name),
    },
  )

  const ctx = new SceneCtx(app)
  let lastCameraEvent = 0
  ctx.controls.addEventListener('change', () => {
    const now = performance.now()
    if (now - lastCameraEvent > 300) {
      lastCameraEvent = now
      document.dispatchEvent(new CustomEvent('ds:camera-moved'))
    }
  })

  const modeHooks =
    level.mode === 'trace' ? setupTrace(level, ctx, hud, win) : setupProve(level, ctx, hud, win)

  const tour = tours[level.id]
  if (tour !== undefined && progress.tours[level.id] !== true) {
    tourActive = true
    runTour(tour, () => {
      tourActive = false
      progress.tours[level.id] = true
      saveProgress(progress)
      pendingWin?.()
      pendingWin = null
    })
  }

  return () => ctx.dispose()
}

interface ModeHooks {
  onReset(): void
  onUndo?(): void
  onDeleteBrick?(name: string): void
}

type Win = (score: number, title: string, body: string) => void

// ——— MODE trace : l'adversaire au clavier ———

function setupTrace(level: CompiledLevel, ctx: SceneCtx, hud: Hud, win: Win): ModeHooks {
  const graph = explore(level)
  const positions = layout(
    graph.nodes.length,
    graph.edges.map((e) => [e.from, e.to] as const),
  )
  const view = new GraphView(ctx, graph, positions, semanticColors(level, graph), nodeLabels(level, graph))
  ctx.frameRadius(graphRadius(positions))
  attachInspection(
    ctx,
    view,
    graph,
    hud,
    (i) => (graph.nodes[i].violating ? '<div class="badge bad">viole l’INVARIANT</div>' : ''),
    { refocus: () => editor.focus(), recenter: () => glideTo(currentNode(game, graph)) },
  )

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

  const editorOpts: EditorOpts = {
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
      refresh(e === undefined ? -1 : graph.edges[e].to)
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
      document.dispatchEvent(new CustomEvent('ds:action-played'))
    },
    lint: (text) =>
      resolve(text) !== null ? null : `« ${text} » : pas une action activée (Ctrl-Espace pour la liste)`,
  }
  const editor = new FormulaEditor(editorOpts)

  refresh()
  editor.focus()

  const doUndo = (): void => {
    if (!locked && game.moves.length > 0) {
      game = undo(game)
      prevState = null
      refresh()
      editor.focus()
    }
  }
  editorOpts.onEmptyBackspace = doUndo

  return {
    onReset: () => {
      game = newGame(level.id)
      prevState = null
      locked = false
      editor.setText('')
      refresh()
      editor.focus()
    },
    onUndo: doUndo,
  }
}

// ——— MODE prove : construire le mur de briques ———

interface ProofBrick extends Brick {
  readonly expr: Expr
}

function setupProve(level: CompiledLevel, ctx: SceneCtx, hud: Hud, win: Win): ModeHooks {
  const space: FullSpace = buildFullSpace(level)
  const graph = space.graph
  const positions = layout(
    graph.nodes.length,
    graph.edges.map((e) => [e.from, e.to] as const),
  )
  const labels = nodeLabels(level, graph)
  const view = new GraphView(ctx, graph, positions, semanticColors(level, graph), labels)
  view.revealCascade(space.init)
  ctx.frameRadius(graphRadius(positions))
  attachInspection(
    ctx,
    view,
    graph,
    hud,
    (i) => {
      const parts: string[] = []
      parts.push(
        space.reachable.has(i)
          ? '<div class="badge ok">atteignable</div>'
          : '<div class="badge ghost">état fantôme</div>',
      )
      if (graph.nodes[i].violating) parts.push('<div class="badge bad">viole l’INVARIANT</div>')
      return parts.join('')
    },
    {
      refocus: () => editor.focus(),
      recenter: () => {
        const from = ctx.controls.target.clone()
        ctx.addTween({
          dur: 450,
          step: (k) => ctx.controls.target.copy(from).multiplyScalar(1 - k),
        })
      },
    },
  )

  const goal = parseExpr(level.invariantSrc)
  const faint = new Set<number>()
  for (let i = 0; i < graph.nodes.length; i++) if (!space.reachable.has(i)) faint.add(i)

  let bricks: ProofBrick[] = level.lemmas.map((l) => ({
    name: l.name,
    src: l.src,
    expr: l.expr,
    deps: [],
    given: true,
  }))
  let locked = false

  /** Alias : chaque brique est réutilisable par son nom dans les formules. */
  const aliases = (): Map<string, Expr> => new Map(bricks.map((b) => [b.name, b.expr]))

  /** Une brique est supprimable si aucune autre ne mentionne son nom. */
  const decorated = (): Brick[] =>
    bricks.map((b) => ({
      ...b,
      deletable:
        !locked &&
        !b.given &&
        !bricks.some(
          (o) => o !== b && new RegExp(`(^|[^A-Za-z0-9_])${b.name}([^A-Za-z0-9_]|$)`).test(o.src),
        ),
    }))

  const autoName = (): string => {
    for (let i = bricks.length + 1; ; i++) {
      const name = `L${i}`
      if (!bricks.some((b) => b.name === name) && level.init[name] === undefined) return name
    }
  }

  /** « nom ≜ formule » ou formule nue ; alias substitués. Lève si invalide. */
  const parseCandidate = (text: string): { name: string | null; src: string; expr: Expr } => {
    const m = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:≜|==)\s*(.+)$/)
    const name = m?.[1] ?? null
    const src = m?.[2].trim() ?? text
    if (name !== null) {
      if (level.init[name] !== undefined) throw new Error(`« ${name} » est une variable`)
      if (bricks.some((b) => b.name === name)) throw new Error(`brique « ${name} » déjà prise`)
    }
    return { name, src, expr: substituteAliases(parseExpr(src), aliases()) }
  }

  const baseStyles = {
    current: space.init,
    frontier: EMPTY,
    traceEdges: EMPTY,
    enabledEdges: EMPTY,
    highlight: -1,
    dimmed: faint,
  }

  const refreshGoal = (): boolean => {
    const proved = impliesGoal(space, bricks.map((b) => b.expr), goal)
    hud.setGoalStatus(
      `objectif : vos briques impliquent l'INVARIANT — ${proved ? '<b>OUI ✓</b>' : 'pas encore'}`,
      proved,
    )
    return proved
  }

  const idle = (): void => {
    view.setStyles(baseStyles)
    hud.setFailingActions(EMPTY as unknown as Set<string>)
    hud.setStatus(
      `espace complet : <b>${graph.nodes.length}</b> états, dont <b>${space.reachable.size}</b> atteignables — les fantômes sont assombris`,
    )
  }

  /** Aperçu live d'une candidate ; retourne le rapport si elle est parsable. */
  const preview = (text: string): ReturnType<typeof checkCandidate> | null => {
    if (text === '') {
      idle()
      return null
    }
    let report
    try {
      report = checkCandidate(space, bricks.map((b) => b.expr), parseCandidate(text).expr)
    } catch {
      return null // le lint souligne déjà
    }
    view.setStyles({
      ...baseStyles,
      region: report.region,
      ctiEdges: new Set(report.ctis),
      highlight: report.initOk ? -1 : space.init,
    })
    const failing = new Set(report.ctis.map((e) => graph.edges[e].action))
    hud.setFailingActions(failing)
    if (!report.initOk) {
      hud.setStatus(`l'état initial est <b>hors</b> de la région — une brique doit le contenir`)
    } else if (report.ctis.length > 0) {
      const e = graph.edges[report.ctis[0]]
      hud.setStatus(
        `<b>${report.ctis.length}</b> CTI — ex. <b>${e.action}</b> : ${labels[e.from]} → ${labels[e.to]}`,
      )
      document.dispatchEvent(new CustomEvent('ds:cti-shown'))
    } else {
      hud.setStatus(`inductive ✓ — Entrée pour en faire une brique`)
    }
    return report
  }

  const editor = new FormulaEditor({
    parent: hud.editorMount,
    placeholder: 'formule, ou nom ≜ formule — les noms de briques sont réutilisables',
    completions: () => [
      ...bricks.map((b) => ({ label: b.name, detail: `□ ${b.src}`, type: 'class', boost: 2 })),
      ...formulaCompletions(level),
    ],
    onChange: (text) => {
      if (!locked) preview(text)
    },
    onSubmit: (text) => {
      if (locked || text === '') return
      const report = preview(text)
      if (report === null || !report.ok) return
      const { name, src, expr } = parseCandidate(text)
      const used = usedBricks(space, bricks.map((b) => b.expr), expr)
      bricks = [...bricks, {
        name: name ?? autoName(),
        src,
        expr,
        deps: bricks.filter((_, i) => used[i]).map((b) => b.name),
        given: false,
      }]
      hud.renderBricks(decorated())
      editor.setText('')
      idle()
      document.dispatchEvent(new CustomEvent('ds:brick-proved'))
      if (refreshGoal()) {
        locked = true
        // Score = cône de dépendances de la preuve : l'exploration ne coûte rien.
        const kept = bricks.map(() => true)
        for (let i = 0; i < bricks.length; i++) {
          kept[i] = false
          if (!impliesGoal(space, bricks.filter((_, j) => kept[j]).map((b) => b.expr), goal))
            kept[i] = true
        }
        const need = new Set(bricks.filter((_, i) => kept[i]).map((b) => b.name))
        for (let grew = true; grew; ) {
          grew = false
          for (const b of bricks)
            if (need.has(b.name))
              for (const d of b.deps)
                if (!need.has(d)) {
                  need.add(d)
                  grew = true
                }
        }
        const useful = bricks.filter((b) => need.has(b.name) && !b.given)
        const score = useful.reduce((n, b) => n + countTokens(b.src), 0)
        const wall = useful.map((b) => `□ ${b.name} ≜ ${hl(b.src)}`).join('<br>')
        const extra = bricks.filter((b) => !b.given).length - useful.length
        win(
          score,
          'Invariant prouvé',
          `<p class="formula">${wall}</p><p><b>${useful.length}</b> briques utiles, <b>${score}</b> tokens${extra > 0 ? ` (${extra} brique${extra > 1 ? 's' : ''} hors preuve, non comptée${extra > 1 ? 's' : ''})` : ''}</p>`,
        )
      }
    },
    lint: (text) => {
      try {
        checkCandidate(space, [], parseCandidate(text).expr)
        return null
      } catch (err) {
        return (err as Error).message
      }
    },
  })

  hud.updateVars(level.init, null)
  hud.setEnabledActions(EMPTY as unknown as Set<string>)
  hud.renderBricks(decorated())
  hud.setMoves('')
  refreshGoal()
  idle()
  editor.focus()

  return {
    onReset: () => {
      locked = false
      bricks = bricks.filter((b) => b.given)
      hud.renderBricks(decorated())
      editor.setText('')
      refreshGoal()
      idle()
      editor.focus()
    },
    onDeleteBrick: (name) => {
      if (locked) return
      bricks = bricks.filter((b) => b.name !== name)
      hud.renderBricks(decorated())
      refreshGoal()
      preview(editor.getText())
      editor.focus()
    },
  }
}

loadLevel(Math.min(progress.unlocked, levels.length - 1))
