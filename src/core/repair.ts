import type { Expr } from '../dsl/ast'
import { evalExpr } from '../dsl/parse'
import type { Graph } from './explore'

export interface RepairResult {
  /** Le système réparé est-il sûr (aucun état violant atteignable) ? */
  readonly safe: boolean
  /** Pour chaque REQUIRE : encore satisfaisable par un état atteignable ? */
  readonly requiresOk: readonly boolean[]
  /** Arêtes du graphe original tuées par les renforts. */
  readonly killedEdges: ReadonlySet<number>
  /** Nœuds du graphe original devenus inatteignables. */
  readonly unreachable: ReadonlySet<number>
}

/**
 * Effet d'un renforcement de gardes. Renforcer ne peut que RETIRER des
 * transitions : l'espace d'états réparé est un sous-graphe de l'original,
 * donc un simple filtrage-BFS suffit — pas de ré-exploration.
 * Les renforts sont évalués dans l'état SOURCE de chaque transition ;
 * une erreur d'évaluation (variable inconnue…) remonte au lint appelant.
 */
export function checkRepair(
  graph: Graph,
  extras: ReadonlyMap<string, Expr>,
  requires: readonly { readonly expr: Expr }[],
): RepairResult {
  const killedEdges = new Set<number>()
  for (let e = 0; e < graph.edges.length; e++) {
    const edge = graph.edges[e]
    const extra = extras.get(edge.action)
    if (extra === undefined) continue
    const v = evalExpr(extra, graph.nodes[edge.from].state)
    if (typeof v !== 'boolean') throw new Error('le renfort doit être booléen')
    if (!v) killedEdges.add(e)
  }

  // Atteignabilité dans le sous-graphe restant.
  const reached = new Set<number>([0])
  const queue = [0]
  while (queue.length > 0) {
    const at = queue.pop()!
    for (const e of graph.successors[at]) {
      if (killedEdges.has(e)) continue
      const to = graph.edges[e].to
      if (!reached.has(to)) {
        reached.add(to)
        queue.push(to)
      }
    }
  }

  const unreachable = new Set<number>()
  for (let i = 0; i < graph.nodes.length; i++) if (!reached.has(i)) unreachable.add(i)

  let safe = true
  for (const i of reached) if (graph.nodes[i].violating) safe = false

  const requiresOk = requires.map(({ expr }) => {
    for (const i of reached) if (evalExpr(expr, graph.nodes[i].state) === true) return true
    return false
  })

  return { safe, requiresOk, killedEdges, unreachable }
}
