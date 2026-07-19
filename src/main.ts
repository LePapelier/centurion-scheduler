import * as THREE from 'three'
import { explore } from './core/explore'
import { currentNode, isVictory, newGame, play, undo, type Game } from './core/game'
import { layout } from './layout/force'
import { levels } from './levels'
import { GraphView } from './render/graph'
import { SceneCtx } from './render/scene'
import { Hud } from './ui/hud'

const level = levels[0]
const graph = explore(level)
const positions = layout(
  graph.nodes.length,
  graph.edges.map((e) => [e.from, e.to] as const),
)

// ——— Sémantique visuelle des nœuds, dérivée du DSL. ———

/** Couleur : gradient bleu → ambre → rouge sur la valeur COLOR, rouge fixe si violant. */
function semanticColors(): THREE.Color[] {
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

const labelTexts = graph.nodes.map((n) =>
  level.labelVars.map((v) => String(n.state[v])).join('·'),
)

const app = document.getElementById('app')!
const ctx = new SceneCtx(app)
const view = new GraphView(ctx, graph, positions, semanticColors(), labelTexts)

let game: Game = newGame(level.id)
let prevState: (typeof level)['init'] | null = null
let locked = false // vrai après victoire, jusqu'au reset
let hoverNode = -1 // nœud sous la souris (graphe)
let hoverAction: string | null = null // action survolée (spec)

/** Arêtes sortantes du nœud courant, indexées par nom d'action. */
function enabledMoves(): Map<string, number> {
  const current = currentNode(game, graph)
  const map = new Map<string, number>()
  if (!graph.nodes[current].violating)
    for (const e of graph.successors[current]) map.set(graph.edges[e].action, e)
  return map
}

function playAction(name: string): void {
  const e = enabledMoves().get(name)
  if (e === undefined || locked) return
  prevState = graph.nodes[currentNode(game, graph)].state
  game = play(game, graph, e)
  refresh()
}

const hud = new Hud(app, level, {
  onUndo: () => {
    if (!locked && game.moves.length > 0) {
      game = undo(game)
      prevState = null
      refresh()
    }
  },
  onReset: () => {
    game = newGame(level.id)
    prevState = null
    locked = false
    hud.hideVictory()
    refresh()
  },
  onAction: playAction,
  onHoverAction: (name) => {
    hoverAction = name
    refresh(false)
  },
})

/** Glissement doux de la cible caméra vers le nœud courant. */
function glideTo(node: number): void {
  const from = ctx.controls.target.clone()
  const to = view.nodePosition(node, new THREE.Vector3())
  ctx.addTween({
    dur: 500,
    step: (k) => ctx.controls.target.lerpVectors(from, to, k),
  })
}

/**
 * Resynchronise tout l'affichage depuis l'état de jeu.
 * `structural` = false pour un simple changement de survol.
 */
function refresh(structural = true): void {
  const current = currentNode(game, graph)
  const moves = enabledMoves()

  view.reveal(current, null)
  const frontier = new Set<number>()
  for (const e of moves.values()) {
    view.reveal(graph.edges[e].to, current)
    frontier.add(graph.edges[e].to)
  }

  const highlight = hoverAction !== null ? graph.edges[moves.get(hoverAction)!].to : hoverNode
  view.setStyles({
    current,
    frontier,
    traceEdges: new Set(game.moves),
    enabledEdges: new Set(moves.values()),
    highlight,
  })

  if (!structural) return
  glideTo(current)

  hud.update({
    moves: game.moves.length,
    par: graph.par,
    state: graph.nodes[current].state,
    prevState,
    enabled: new Set(moves.keys()),
    trace: game.moves.map((e) => graph.edges[e].action),
    violated: graph.nodes[current].violating,
  })

  if (isVictory(game, graph)) {
    locked = true
    hud.setHint('')
    hud.showVictory(
      game.moves.length,
      graph.par,
      game.moves.map((e) => graph.edges[e].action),
    )
  } else if (moves.size === 0) {
    hud.setHint('aucune action activée — annulez un coup')
  } else {
    hud.setHint('cliquez une action activée, ou un état orange du graphe')
  }
}

// ——— Interaction pointeur sur le graphe. ———

const ndc = new THREE.Vector2()
function toNdc(ev: PointerEvent): THREE.Vector2 {
  const r = ctx.renderer.domElement.getBoundingClientRect()
  return ndc.set(
    ((ev.clientX - r.left) / r.width) * 2 - 1,
    -((ev.clientY - r.top) / r.height) * 2 + 1,
  )
}

/** Actions menant au nœud `to` depuis le nœud courant. */
function actionsTo(to: number): string[] {
  return [...enabledMoves()]
    .filter(([, e]) => graph.edges[e].to === to)
    .map(([name]) => name)
}

let downAt: [number, number] | null = null
const canvas = ctx.renderer.domElement

canvas.addEventListener('pointerdown', (ev) => {
  downAt = [ev.clientX, ev.clientY]
})

canvas.addEventListener('pointerup', (ev) => {
  if (!downAt || locked) return
  const [x, y] = downAt
  downAt = null
  if (Math.hypot(ev.clientX - x, ev.clientY - y) > 5) return // c'était un drag caméra
  const hit = view.pick(toNdc(ev))
  if (hit === null) return
  const names = actionsTo(hit)
  if (names.length > 0) playAction(names[0])
})

canvas.addEventListener('pointermove', (ev) => {
  if (locked) return
  const hit = view.pick(toNdc(ev))
  const names = hit === null ? [] : actionsTo(hit)
  const newHover = names.length > 0 ? hit! : -1
  if (names.length > 0) {
    canvas.style.cursor = 'pointer'
    hud.showTooltip(ev.clientX, ev.clientY, names.join(' / '))
  } else {
    canvas.style.cursor = ''
    hud.hideTooltip()
  }
  hud.setHoverActions(new Set(names))
  if (newHover !== hoverNode) {
    hoverNode = newHover
    refresh(false)
  }
})

refresh()
