import * as THREE from 'three'
import { explore, type Graph } from './core/explore'
import { buildFullSpace, type FullSpace } from './core/fullspace'
import { currentNode, newGame, play, undo, type Game } from './core/game'
import { checkCandidate, checkObligations, impliesGoal, usedBricks } from './core/prove'
import type { CompiledLevel, Expr } from './dsl/ast'
import { countTokens } from './dsl/parse'
import { layout } from './layout/force'
import { levels } from './levels'
import { GraphView } from './render/graph'
import { color } from './render/palette'
import { SceneCtx } from './render/scene'
import { audio } from './ui/audio'
import { loadProgress, recordScore, saveProgress, unlock } from './ui/campaign'
import { HornBuilder, clauseComplete, clauseExpr, clauseSrc, type HornClause } from './ui/hornBuilder'
import { hl, hlValue } from './ui/highlight'
import { Hud, type Brick } from './ui/hud'

// http://…/?reset : repartir de zéro (progression, records, tours, audio).
if (new URLSearchParams(location.search).has('reset')) {
  localStorage.clear()
  history.replaceState(null, '', location.pathname)
}

const app = document.getElementById('app')!
const progress = loadProgress()

/** Rayon du graphe posé — restreint à un sous-ensemble de nœuds si fourni
 *  (prove : cadrer le cœur atteignable, pas la périphérie fantôme). */
function graphRadius(positions: Float32Array, subset?: Iterable<number>): number {
  let r = 0
  const indices = subset ?? Array.from({ length: positions.length / 3 }, (_, i) => i)
  for (const i of indices)
    r = Math.max(r, Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]))
  return r
}

// ——— Helpers communs ———

/** Une teinte distincte par action (hues régulièrement espacées). Déterministe. */
function actionPalette(level: CompiledLevel): Map<string, THREE.Color> {
  const names = level.actionsSrc.map((a) => a.name)
  const m = new Map<string, THREE.Color>()
  names.forEach((name, i) => {
    const c = new THREE.Color()
    // Couleurs assez profondes pour que le premier mélange colore franchement.
    c.setHSL((i / Math.max(names.length, 1) + 0.02) % 1, 0.72, 0.52)
    m.set(name, c)
  })
  return m
}

function actionHex(level: CompiledLevel): Map<string, string> {
  return new Map([...actionPalette(level)].map(([n, c]) => [n, `#${c.getHexString()}`]))
}

/**
 * Couleur SÉMANTIQUE par chemin : l'état initial est blanc ; chaque nœud
 * prend la couleur de son parent BFS mélangée à la teinte de l'action
 * empruntée — la couleur raconte la suite d'actions qui y mène. États
 * violants : rose (la cible reste lisible) ; inatteignables : gris neutre.
 */
function semanticColors(level: CompiledLevel, graph: Graph, init: number): THREE.Color[] {
  const palette = actionPalette(level)
  const white = new THREE.Color(0xf7faff)
  const acc: (THREE.Color | null)[] = graph.nodes.map(() => null)
  const depth: number[] = graph.nodes.map(() => 0)
  acc[init] = white.clone()
  const queue = [init]
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]
    for (const e of graph.successors[at]) {
      const to = graph.edges[e].to
      if (acc[to] !== null) continue
      const tint = palette.get(graph.edges[e].action) ?? white
      depth[to] = depth[at] + 1
      // Incrément décroissant : fort près du départ, faible au loin — les
      // états profonds sont franchement colorés au lieu de virer au blanc.
      const strength = 0.62 / (1 + 0.5 * depth[at])
      acc[to] = acc[at]!.clone().lerp(tint, strength)
      queue.push(to)
    }
  }
  const neutral = new THREE.Color(0x39435a)
  return graph.nodes.map((n, i) =>
    n.violating ? color.violating.clone() : (acc[i] ?? neutral.clone()),
  )
}

function nodeLabels(level: CompiledLevel, graph: Graph): string[] {
  return graph.nodes.map((n) => level.labelVars.map((v) => String(n.state[v])).join('·'))
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

  const win = (score: number, title: string, body: string): void => {
    audio.chime()
    const previousBest = progress.scores[level.id]
    recordScore(progress, level.id, score)
    unlock(progress, Math.min(index + 1, levels.length - 1))
    const record =
      previousBest === undefined
        ? '<p class="record">premier succès enregistré</p>'
        : score < previousBest
          ? `<p class="record">nouveau record ! (ancien : ${previousBest})</p>`
          : `<p class="record">record : ${previousBest}</p>`
    // Casser = triomphe doré du démon ; prouver = sceau vert.
    const tone = level.mode === 'trace' ? 'gold' : 'green'
    hud.showVictory(title, body + record, hasNext, tone)
  }

  const hud = new Hud(
    app,
    level,
    levels.map((l) => ({ name: l.name, best: progress.scores[l.id], mode: l.mode })),
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
      onInsertAction: (name) => modeHooks.onInsertAction?.(name),
      onPlayAction: (name) => modeHooks.onPlayAction?.(name),
      onHoverAction: (name) => modeHooks.onHoverAction?.(name),
      onObligationClick: (i) => modeHooks.onObligationClick?.(i),
      onToggleAudio: () => audio.toggle(),
      audioEnabled: () => audio.enabled,
      actionColor: actionHex(level),
    },
  )

  const ctx = new SceneCtx(app)

  const modeHooks =
    level.mode === 'trace' ? setupTrace(level, ctx, hud, win) : setupProve(level, ctx, hud, win)

  return () => {
    modeHooks.onDispose?.()
    ctx.dispose()
  }
}

interface ModeHooks {
  onReset(): void
  onUndo?(): void
  onDeleteBrick?(name: string): void
  onInsertAction?(name: string): void
  onPlayAction?(name: string): void
  onHoverAction?(name: string | null): void
  onObligationClick?(index: number): void
  onDispose?(): void
}

type Win = (score: number, title: string, body: string) => void

// ——— MODE trace : l'adversaire au clavier ———

function setupTrace(level: CompiledLevel, ctx: SceneCtx, hud: Hud, win: Win): ModeHooks {
  const graph = explore(level)
  const positions = layout(
    graph.nodes.length,
    graph.edges.map((e) => [e.from, e.to] as const),
  )
  const view = new GraphView(ctx, graph, positions, semanticColors(level, graph, 0), nodeLabels(level, graph))
  ctx.frameRadius(graphRadius(positions))
  attachInspection(
    ctx,
    view,
    graph,
    hud,
    (i) => (graph.nodes[i].violating ? '<div class="badge bad">viole l’INVARIANT</div>' : ''),
    { refocus: () => undefined, recenter: () => glideTo(currentNode(game, graph)) },
  )

  let game: Game = newGame(level.id)
  let prevState: (typeof level)['init'] | null = null
  let locked = false

  const beacons = new Set<number>()
  for (let i = 0; i < graph.nodes.length; i++) if (graph.nodes[i].violating) beacons.add(i)
  /** Après la victoire : les états jamais explorés restent en gris. */
  let mapDimmed: Set<number> | undefined
  let wasStuck = false

  // L'espace découvert lors des parties précédentes reste visible.
  view.revealMany(progress.discovered[level.id] ?? [])
  const saveDiscovered = (): void => {
    const seen: number[] = []
    for (let i = 0; i < graph.nodes.length; i++) if (view.revealed[i]) seen.push(i)
    progress.discovered[level.id] = seen
    saveProgress(progress)
  }

  const enabledMoves = (): Map<string, number> => {
    const at = currentNode(game, graph)
    const map = new Map<string, number>()
    if (!graph.nodes[at].violating)
      for (const e of graph.successors[at]) map.set(graph.edges[e].action, e)
    return map
  }

  const glideTo = (node: number): void => {
    const from = ctx.controls.target.clone()
    const to = view.nodePosition(node, new THREE.Vector3())
    ctx.addTween({ dur: 500, step: (k) => ctx.controls.target.lerpVectors(from, to, k) }, 'glide')
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
    const traceNodes = new Set<number>([0])
    for (const e of game.moves) traceNodes.add(graph.edges[e].to)
    view.setStyles({
      current: at,
      frontier,
      traceEdges: new Set(game.moves),
      enabledEdges: new Set(moves.values()),
      highlight: ghost,
      beacons, // les états interdits luisent à travers le brouillard
      dimmed: mapDimmed,
      traceNodes,
    })
    hud.updateVars(graph.nodes[at].state, prevState)
    hud.setEnabledActions(new Set(moves.keys()))
    hud.setInvariantViolated(graph.nodes[at].violating)
    hud.setMoves(`coups : ${game.moves.length} — par : ${graph.par}`)
    hud.setTrace(game.moves.map((e) => graph.edges[e].action))
    if (graph.nodes[at].violating) {
      locked = true
      // Révélation : tout le state space éclot, le jamais-exploré en gris.
      if (mapDimmed === undefined) {
        mapDimmed = new Set<number>()
        for (let i = 0; i < graph.nodes.length; i++) if (!view.revealed[i]) mapDimmed.add(i)
        view.revealCascade(at)
        view.setStyles({
          current: at,
          frontier: EMPTY,
          traceEdges: new Set(game.moves),
          enabledEdges: EMPTY,
          highlight: -1,
          dimmed: mapDimmed,
        })
      }
      const trace = game.moves.map((e) => graph.edges[e].action)
      const medal =
        game.moves.length === graph.par
          ? 'trace optimale — scheduler parfaitement démoniaque'
          : `optimum : ${graph.par} coups`
      win(
        game.moves.length,
        'Règle brisée !',
        `<p>${trace.join(' → ')}</p><p><b>${game.moves.length}</b> coups — ${medal}</p>`,
      )
    }
    // Impasse : le joueur doit le SAVOIR (bannière + nappe sonore à l'entrée).
    const stuck = !graph.nodes[at].violating && moves.size === 0
    hud.setDeadlock(stuck)
    if (stuck && !wasStuck) audio.doom()
    wasStuck = stuck
    // À la victoire, la secousse joue seule ; le glissement suit.
    if (graph.nodes[at].violating) window.setTimeout(() => glideTo(at), 400)
    else glideTo(at)
  }

  /** Jouer une action par son bouton. Tous les effets du pas. */
  const playByName = (name: string): void => {
    if (locked) return
    const e = enabledMoves().get(name)
    if (e === undefined) return
    prevState = graph.nodes[currentNode(game, graph)].state
    game = play(game, graph, e)
    // Le pas se sent : lumière le long de l'arête, flash, impulsion, tick.
    view.travelEdge(e)
    view.flashNode(graph.edges[e].to)
    ctx.punch()
    audio.tick()
    hud.pulseAction(name)
    refresh()
    if (graph.nodes[graph.edges[e].to].violating) {
      view.shockwave(graph.edges[e].to)
      ctx.shake()
      audio.doom()
    }
    saveDiscovered()
  }

  const doUndo = (): void => {
    if (!locked && game.moves.length > 0) {
      game = undo(game)
      prevState = null
      refresh()
    }
  }

  // Backspace = annuler, même sans champ de saisie.
  const keydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Backspace' && ctx.renderer.domElement.isConnected) {
      ev.preventDefault()
      doUndo()
    }
  }
  window.addEventListener('keydown', keydown)

  refresh()

  return {
    onReset: () => {
      game = newGame(level.id)
      prevState = null
      locked = false
      refresh()
    },
    onUndo: doUndo,
    onPlayAction: playByName,
    onHoverAction: (name) => {
      if (locked) return
      const e = name === null ? undefined : enabledMoves().get(name)
      refresh(e === undefined ? -1 : graph.edges[e].to)
    },
    onDispose: () => window.removeEventListener('keydown', keydown),
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
  const view = new GraphView(ctx, graph, positions, semanticColors(level, graph, space.init), labels)
  view.revealCascade(space.init)
  audio.whoosh()
  // Cadrer le cœur atteignable : la périphérie fantôme reste hors champ.
  ctx.frameRadius(graphRadius(positions, space.reachable) * 1.25)
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
      refocus: () => undefined,
      recenter: () => {
        const from = ctx.controls.target.clone()
        ctx.addTween(
          {
            dur: 450,
            step: (k) => ctx.controls.target.copy(from).multiplyScalar(1 - k),
          },
          'glide',
        )
      },
    },
  )

  const goal = level.invariantExpr
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
  let lastRegionKey = ''

  /** Vocabulaire : pièces élémentaires du niveau + briques acquises. */
  const pieces = (): Map<string, Expr> =>
    new Map([
      ...level.atoms.map((a) => [a.name, a.expr] as const),
      ...bricks.map((b) => [b.name, b.expr] as const),
    ])

  /** Une brique est supprimable si aucune autre ne mentionne son nom.
   *  (Gating : le ✕ n'apparaît qu'à partir du niveau des alias.) */
  const allowDelete = level.id !== 'p1-fusible-sur'
  const decorated = (): Brick[] =>
    bricks.map((b) => ({
      ...b,
      deletable:
        allowDelete &&
        !locked &&
        !b.given &&
        !bricks.some(
          (o) => o !== b && new RegExp(`(^|[^A-Za-z0-9_])${b.name}([^A-Za-z0-9_]|$)`).test(o.src),
        ),
    }))

  const autoName = (): string => {
    for (let i = bricks.length + 1; ; i++) {
      const name = `L${i}`
      if (!pieces().has(name) && level.init[name] === undefined) return name
    }
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
      `vos briques garantissent la règle — ${proved ? '<b>OUI ✓</b>' : 'pas encore'}`,
      proved,
    )
    return proved
  }

  // Obligations par action pour un jeu de clauses. Mémorise le témoin cliqué.
  let oblEdges: (number | null)[] = []
  const refreshObligations = (extra: Expr | null): void => {
    const clauses = [...bricks.map((b) => b.expr), ...(extra ? [extra] : [])]
    const obl = checkObligations(space, clauses)
    const rows: { label: string; ok: boolean; detail?: string }[] = [
      { label: 'départ ⊨ tes clauses', ok: obl.initOk },
    ]
    oblEdges = [null]
    for (const a of level.actionsSrc) {
      const e = obl.failing.get(a.name)
      rows.push({
        label: `${a.name} préserve`,
        ok: e === undefined,
        detail: e === undefined ? undefined : `${labels[graph.edges[e].from]} → ${labels[graph.edges[e].to]}`,
      })
      oblEdges.push(e ?? null)
    }
    hud.renderObligations(rows)
  }

  const idle = (): void => {
    view.setStyles(baseStyles)
    hud.setFailingActions(EMPTY as unknown as Set<string>)
    hud.setStatus(
      `<b>${graph.nodes.length}</b> états, <b>${space.reachable.size}</b> atteignables — fantômes assombris`,
    )
    refreshObligations(null)
  }

  const atomExpr = new Map(level.atoms.map((a) => [a.name, a.expr] as const))

  // Clause en cours de construction (constructeur SI…ALORS).
  let current: HornClause = { body: [], head: null }

  /** Affiche le rapport d'induction d'une candidate sur le graphe et le statut. */
  const showReport = (report: ReturnType<typeof checkCandidate>): void => {
    view.setStyles({
      ...baseStyles,
      region: report.region,
      ctiEdges: new Set(report.ctis),
      highlight: report.initOk ? -1 : space.init,
    })
    hud.setFailingActions(new Set(report.ctis.map((e) => graph.edges[e].action)))
    const regionKey = `${report.region.size}:${report.ctis.length}`
    if (regionKey !== lastRegionKey) {
      lastRegionKey = regionKey
      view.sweep(report.region, space.init)
    }
    if (!report.initOk) {
      hud.setStatus(`l'état initial <b>échappe</b> à votre clause`)
    } else if (report.ctis.length > 0) {
      const e = graph.edges[report.ctis[0]]
      hud.setStatus(
        `<b>${report.ctis.length}</b> fuite${report.ctis.length > 1 ? 's' : ''} — <b>${e.action}</b> : ${labels[e.from]} → ${labels[e.to]}`,
      )
    } else {
      hud.setStatus(`aucune fuite ✓ — « poser la clause » (ou Entrée)`)
    }
  }

  /** Aperçu de la clause en cours ; null si incomplète. */
  const preview = (c: HornClause): ReturnType<typeof checkCandidate> | null => {
    if (locked) return null
    if (!clauseComplete(c)) {
      idle()
      hud.setStatus(`assemblez une clause : <b>SI</b> des prémisses <b>ALORS</b> une conclusion`)
      return null
    }
    let expr
    try {
      expr = clauseExpr(c, atomExpr)
    } catch (err) {
      hud.setStatus(`<span class="err">✗ ${(err as Error).message}</span>`)
      return null
    }
    const report = checkCandidate(space, bricks.map((b) => b.expr), expr)
    showReport(report)
    refreshObligations(expr) // les obligations intègrent la clause en cours
    return report
  }

  const builder = new HornBuilder({
    parent: hud.editorMount,
    atoms: level.atoms.map((a) => ({ name: a.name, src: a.src })),
    onChange: (c) => {
      current = c
      preview(c)
    },
    onSubmit: (c) => {
      if (locked) return
      const report = preview(c)
      if (report === null || !report.ok) return
      const src = clauseSrc(c)
      const expr = clauseExpr(c, atomExpr)
      const used = usedBricks(space, bricks.map((b) => b.expr), expr)
      bricks = [...bricks, {
        name: autoName(),
        src,
        expr,
        deps: bricks.filter((_, i) => used[i]).map((b) => b.name),
        given: false,
      }]
      hud.flyToBricks(`□ ${hl(src)}`)
      audio.impact()
      hud.renderBricks(decorated())
      builder.reset()
      current = { body: [], head: null }
      idle()
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
        // Vague sur les états atteignables, puis la victoire.
        view.sweep(space.reachable, space.init)
        audio.whoosh()
        window.setTimeout(
          () =>
            win(
              score,
              'Règle garantie',
              `<p class="formula">${wall}</p><p><b>${useful.length}</b> briques utiles, <b>${score}</b> tokens${extra > 0 ? ` (${extra} brique${extra > 1 ? 's' : ''} hors preuve, non comptée${extra > 1 ? 's' : ''})` : ''}</p>`,
            ),
          700,
        )
      }
    },
  })

  // Entrée = poser la clause, même hors du focus des chips.
  const keydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Enter' && !locked && ctx.renderer.domElement.isConnected) {
      ev.preventDefault()
      builder.submit()
    }
  }
  window.addEventListener('keydown', keydown)

  hud.updateVars(level.init, null)
  hud.setEnabledActions(EMPTY as unknown as Set<string>)
  hud.renderBricks(decorated())
  hud.setMoves('')
  refreshGoal()
  idle()

  return {
    onReset: () => {
      locked = false
      bricks = bricks.filter((b) => b.given)
      hud.renderBricks(decorated())
      builder.reset()
      current = { body: [], head: null }
      refreshGoal()
      idle()
    },
    onDeleteBrick: (name) => {
      if (locked) return
      bricks = bricks.filter((b) => b.name !== name)
      hud.renderBricks(decorated())
      refreshGoal()
      preview(current)
    },
    // Clic sur un atome du panneau : l'ajoute au corps de la clause.
    onInsertAction: (name) => builder.toggleBody(name),
    // Clic sur une obligation en échec : surligne sa transition témoin.
    onObligationClick: (i) => {
      const e = oblEdges[i]
      if (e === null || e === undefined) return
      view.setStyles({ ...baseStyles, ctiEdges: new Set([e]), highlight: graph.edges[e].to })
      view.flashNode(graph.edges[e].from)
      view.flashNode(graph.edges[e].to)
    },
    onDispose: () => window.removeEventListener('keydown', keydown),
  }
}

loadLevel(Math.min(progress.unlocked, levels.length - 1))
