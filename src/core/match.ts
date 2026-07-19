import type { Expr } from '../dsl/ast'
import { evalExpr } from '../dsl/parse'
import type { Graph } from './explore'

/** Indices des nœuds dont l'état satisfait la formule (booléenne exigée). */
export function matchStates(graph: Graph, expr: Expr): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < graph.nodes.length; i++) {
    const v = evalExpr(expr, graph.nodes[i].state)
    if (typeof v !== 'boolean') throw new Error('la formule doit être booléenne')
    if (v) out.add(i)
  }
  return out
}

/** Égalité d'ensembles. */
export function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}
