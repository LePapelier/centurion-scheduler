import * as THREE from 'three'
import { explore } from './core/explore'
import { currentNode, isVictory, newGame, play, undo, type Game } from './core/game'
import { layout } from './layout/force'
import { mutex } from './levels/mutex'
import { GraphView } from './render/graph'
import { SceneCtx } from './render/scene'
import { Hud } from './ui/hud'

const level = mutex
const graph = explore(level)
const positions = layout(
  graph.nodes.length,
  graph.edges.map((e) => [e.from, e.to] as const),
)

const app = document.getElementById('app')!
const ctx = new SceneCtx(app)
const view = new GraphView(ctx, graph, positions)

let game: Game = newGame(level.id)
let locked = false // vrai après victoire, jusqu'au reset

const hud = new Hud(app, level.name, level.description, {
  onUndo: () => {
    if (!locked && game.moves.length > 0) {
      game = undo(game)
      refresh()
    }
  },
  onReset: () => {
    game = newGame(level.id)
    locked = false
    hud.hideVictory()
    refresh()
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

function refresh(): void {
  const current = currentNode(game, graph)

  // Brouillard : révéler le courant et ses successeurs immédiats.
  view.reveal(current, null)
  const enabledEdges = new Set<number>()
  const frontier = new Set<number>()
  if (!graph.nodes[current].violating) {
    for (const e of graph.successors[current]) {
      view.reveal(graph.edges[e].to, current)
      enabledEdges.add(e)
      frontier.add(graph.edges[e].to)
    }
  }

  const onTrace = new Set<number>([0])
  const traceEdges = new Set<number>(game.moves)
  for (const e of game.moves) onTrace.add(graph.edges[e].to)

  view.setStyles({ current, frontier, onTrace, traceEdges, enabledEdges })
  glideTo(current)

  hud.update(
    game.moves.length,
    graph.par,
    graph.nodes[current].state,
    game.moves.map((e) => graph.edges[e].action),
  )

  if (isVictory(game, graph)) {
    locked = true
    hud.setHint('')
    hud.showVictory(
      game.moves.length,
      graph.par,
      game.moves.map((e) => graph.edges[e].action),
    )
  } else if (frontier.size === 0) {
    hud.setHint('aucune transition possible — annulez un coup')
  } else {
    hud.setHint('cliquez un état orange pour ordonnancer un pas')
  }
}

// ——— Interaction pointeur : clic (sans glisser) sur un successeur = coup. ———

const ndc = new THREE.Vector2()
function toNdc(ev: PointerEvent): THREE.Vector2 {
  const r = ctx.renderer.domElement.getBoundingClientRect()
  return ndc.set(
    ((ev.clientX - r.left) / r.width) * 2 - 1,
    -((ev.clientY - r.top) / r.height) * 2 + 1,
  )
}

/** Arêtes courantes menant au nœud `to` (plusieurs actions possibles). */
function edgesTo(to: number): number[] {
  const current = currentNode(game, graph)
  return graph.successors[current].filter((e) => graph.edges[e].to === to)
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
  const candidates = edgesTo(hit)
  if (candidates.length === 0) return
  game = play(game, graph, candidates[0])
  refresh()
})

canvas.addEventListener('pointermove', (ev) => {
  if (locked) return
  const hit = view.pick(toNdc(ev))
  const candidates = hit === null ? [] : edgesTo(hit)
  if (candidates.length > 0) {
    canvas.style.cursor = 'pointer'
    hud.showTooltip(ev.clientX, ev.clientY, candidates.map((e) => graph.edges[e].action).join(' / '))
  } else {
    canvas.style.cursor = ''
    hud.hideTooltip()
  }
})

refresh()
