import type { CompiledLevel } from '../dsl/ast'
import type { Graph, Node } from './explore'
import { stateKey, type State } from './spec'

export interface FullSpace {
  /** Graphe de l'espace d'états COMPLET (produit des domaines). */
  readonly graph: Graph
  /** Indice de l'état initial. */
  readonly init: number
  /** Indices des états atteignables depuis l'init. */
  readonly reachable: ReadonlySet<number>
}

const MAX_STATES = 5_000

/**
 * L'induction quantifie sur TOUS les états, pas seulement les atteignables :
 * c'est là que vivent les contre-exemples à l'induction. On énumère donc le
 * produit cartésien des domaines déclarés (ordre déterministe).
 */
export function buildFullSpace(level: CompiledLevel): FullSpace {
  const vars = Object.keys(level.init)
  const doms = vars.map((v) => {
    const d = level.domains.get(v)
    if (d === undefined) throw new Error(`variable sans domaine : ${v}`)
    return d
  })
  const total = doms.reduce((n, d) => n * d.length, 1)
  if (total > MAX_STATES) throw new Error(`espace complet trop grand (${total} états)`)

  const nodes: Node[] = []
  const index = new Map<string, number>()
  const current: Record<string, string | number> = {}
  const enumerate = (v: number): void => {
    if (v === vars.length) {
      const state: State = { ...current }
      const key = stateKey(state)
      index.set(key, nodes.length)
      nodes.push({ state, key, violating: !level.invariant(state), depth: 0 })
      return
    }
    for (const value of doms[v]) {
      current[vars[v]] = value
      enumerate(v + 1)
    }
  }
  enumerate(0)

  const edges: { from: number; to: number; action: string }[] = []
  const successors: number[][] = nodes.map(() => [])
  for (let i = 0; i < nodes.length; i++) {
    for (const action of level.actions) {
      if (!action.guard(nodes[i].state)) continue
      const to = index.get(stateKey(action.update(nodes[i].state)))
      if (to === undefined) throw new Error(`action ${action.name} : sortie de domaine`)
      successors[i].push(edges.length)
      edges.push({ from: i, to, action: action.name })
    }
  }

  const init = index.get(stateKey(level.init))
  if (init === undefined) throw new Error('état initial hors domaine')

  const reachable = new Set<number>([init])
  const queue = [init]
  while (queue.length > 0) {
    const at = queue.pop()!
    for (const e of successors[at]) {
      const to = edges[e].to
      if (!reachable.has(to)) {
        reachable.add(to)
        queue.push(to)
      }
    }
  }

  return { graph: { nodes, edges, successors, par: -1 }, init, reachable }
}
