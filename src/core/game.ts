import type { Graph } from './explore'

/**
 * Une partie = niveau + journal de coups (indices d'arêtes du graphe).
 * Entièrement sérialisable ; le graphe étant déterministe, deux clients
 * qui rejouent le même journal obtiennent le même état — base du 1v1.
 */
export interface Game {
  readonly levelId: string
  readonly moves: readonly number[]
}

export function newGame(levelId: string): Game {
  return { levelId, moves: [] }
}

/** Nœud courant obtenu en rejouant le journal depuis l'état initial (nœud 0). */
export function currentNode(game: Game, graph: Graph): number {
  let at = 0
  for (const move of game.moves) {
    const edge = graph.edges[move]
    if (edge === undefined || edge.from !== at)
      throw new Error(`coup invalide ${move} depuis le nœud ${at}`)
    at = edge.to
  }
  return at
}

/** Joue une arête sortante du nœud courant. Lève si le coup est illégal. */
export function play(game: Game, graph: Graph, edgeIndex: number): Game {
  const at = currentNode(game, graph)
  const edge = graph.edges[edgeIndex]
  if (edge === undefined || edge.from !== at)
    throw new Error(`coup invalide ${edgeIndex} depuis le nœud ${at}`)
  return { ...game, moves: [...game.moves, edgeIndex] }
}

export function undo(game: Game): Game {
  return { ...game, moves: game.moves.slice(0, -1) }
}

export function isVictory(game: Game, graph: Graph): boolean {
  return graph.nodes[currentNode(game, graph)].violating
}
