import type { Level, State } from './spec'
import { stateKey } from './spec'

export interface Node {
  readonly state: State
  readonly key: string
  /** true = viole l'invariant. */
  readonly violating: boolean
  /** Distance BFS depuis l'état initial. */
  readonly depth: number
}

export interface Edge {
  readonly from: number
  readonly to: number
  readonly action: string
}

export interface Graph {
  readonly nodes: readonly Node[]
  readonly edges: readonly Edge[]
  /** Pour chaque nœud, indices des arêtes sortantes (dans `edges`). */
  readonly successors: readonly (readonly number[])[]
  /** Longueur minimale d'une trace violante (-1 si le système est sûr). */
  readonly par: number
}

const MAX_STATES = 50_000

/**
 * Exploration exhaustive par BFS depuis l'état initial.
 * L'ordre des nœuds et des arêtes est déterministe (ordre BFS, ordre des
 * actions du niveau) : les indices sont donc stables entre clients.
 */
export function explore(level: Level): Graph {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const successors: number[][] = []
  const index = new Map<string, number>()

  const addNode = (state: State, depth: number): number => {
    const key = stateKey(state)
    const existing = index.get(key)
    if (existing !== undefined) return existing
    const id = nodes.length
    if (id >= MAX_STATES) throw new Error(`explore: plus de ${MAX_STATES} états`)
    nodes.push({ state, key, violating: !level.invariant(state), depth })
    successors.push([])
    index.set(key, id)
    return id
  }

  addNode(level.init, 0)
  // BFS : `nodes` sert de file, `head` de curseur.
  for (let head = 0; head < nodes.length; head++) {
    const node = nodes[head]
    if (node.violating) continue // état terminal du jeu : on ne développe pas au-delà
    for (const action of level.actions) {
      if (!action.guard(node.state)) continue
      const to = addNode(action.update(node.state), node.depth + 1)
      successors[head].push(edges.length)
      edges.push({ from: head, to, action: action.name })
    }
  }

  let par = -1
  for (const node of nodes) {
    if (node.violating && (par === -1 || node.depth < par)) par = node.depth
  }

  return { nodes, edges, successors, par }
}
