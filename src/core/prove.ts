import type { Expr } from '../dsl/ast'
import { evalExpr } from '../dsl/parse'
import type { FullSpace } from './fullspace'

export interface CandidateReport {
  /** L'état initial satisfait-il la candidate ? */
  readonly initOk: boolean
  /** Contre-exemples à l'induction : arêtes s ⊨ briques ∧ P avec s' ⊭ P. */
  readonly ctis: readonly number[]
  /** États satisfaisant la candidate (la « région » affichée). */
  readonly region: ReadonlySet<number>
  /** initOk ∧ aucune CTI : la candidate devient une brique. */
  readonly ok: boolean
}

function holds(expr: Expr, s: Parameters<typeof evalExpr>[1]): boolean {
  const v = evalExpr(expr, s)
  if (typeof v !== 'boolean') throw new Error('la formule doit être booléenne')
  return v
}

/**
 * Induction relative : P est prouvable si Init ⊨ P et si, pour tout état s
 * de l'espace COMPLET tel que s ⊨ ⋀briques ∧ P, chaque transition s → s'
 * donne s' ⊨ P. Les briques acquises renforcent l'hypothèse d'induction.
 */
export function checkCandidate(
  space: FullSpace,
  bricks: readonly Expr[],
  candidate: Expr,
): CandidateReport {
  const { graph, init } = space
  const region = new Set<number>()
  const assumed: boolean[] = new Array(graph.nodes.length)
  for (let i = 0; i < graph.nodes.length; i++) {
    const inRegion = holds(candidate, graph.nodes[i].state)
    if (inRegion) region.add(i)
    assumed[i] = inRegion && bricks.every((b) => holds(b, graph.nodes[i].state))
  }

  const ctis: number[] = []
  for (let e = 0; e < graph.edges.length; e++) {
    const { from, to } = graph.edges[e]
    if (assumed[from] && !region.has(to)) ctis.push(e)
  }

  const initOk = region.has(init)
  return { initOk, ctis, region, ok: initOk && ctis.length === 0 }
}

/** ⋀briques ⇒ objectif, sur l'espace complet (victoire du niveau). */
export function impliesGoal(space: FullSpace, bricks: readonly Expr[], goal: Expr): boolean {
  if (bricks.length === 0) return false
  for (const node of space.graph.nodes) {
    if (bricks.every((b) => holds(b, node.state)) && !holds(goal, node.state)) return false
  }
  return true
}

/**
 * Dépendances réelles d'une preuve : retire gloutonnement chaque brique dont
 * l'absence ne casse pas l'induction. Donne l'arbre de preuve honnête.
 */
export function usedBricks(
  space: FullSpace,
  bricks: readonly Expr[],
  candidate: Expr,
): boolean[] {
  const kept = bricks.map(() => true)
  for (let i = 0; i < bricks.length; i++) {
    kept[i] = false
    const subset = bricks.filter((_, j) => kept[j])
    if (!checkCandidate(space, subset, candidate).ok) kept[i] = true
  }
  return kept
}
