import { describe, expect, it } from 'vitest'
import { parseExpr } from '../dsl/parse'
import { levels } from '../levels'
import { explore } from './explore'
import { buildFullSpace } from './fullspace'
import { checkCandidate, impliesGoal, usedBricks } from './prove'

const byId = (id: string) => levels.find((l) => l.id === id)!

describe('campagne', () => {
  it('8 niveaux, prouvables ou violables selon le mode', () => {
    expect(levels.length).toBe(8)
    for (const l of levels) {
      if (l.mode === 'trace') expect(explore(l).par).toBeGreaterThan(0)
      else expect(explore(l).nodes.some((n) => n.violating)).toBe(false) // sûr : rien à violer
    }
  })

  it('les LEMMA donnés tiennent sur tous les états atteignables', () => {
    for (const l of levels.filter((l) => l.mode === 'prove')) {
      const space = buildFullSpace(l)
      for (const lemma of l.lemmas)
        expect(checkCandidate(space, [], lemma.expr).ok).toBe(true)
    }
  })
})

describe('fullspace', () => {
  it('énumère le produit des domaines et marque les atteignables', () => {
    const space = buildFullSpace(byId('p1-fusible-sur'))
    expect(space.graph.nodes.length).toBe(4) // charge ∈ {0,1,2,3}
    expect(space.reachable.size).toBe(3) // 3 inatteignable
    expect(space.graph.nodes[space.init].state).toEqual({ charge: 0 })
  })

  it('mutex corrigé : 36 états, fantômes inclus', () => {
    const space = buildFullSpace(byId('p2-mutex-corrige'))
    expect(space.graph.nodes.length).toBe(36)
    expect(space.reachable.size).toBeLessThan(36)
  })
})

describe('checkCandidate (fusible sûr)', () => {
  const space = buildFullSpace(byId('p1-fusible-sur'))

  it('charge ≤ 1 : init ok mais CTI par load', () => {
    const r = checkCandidate(space, [], parseExpr('charge ≤ 1'))
    expect(r.initOk).toBe(true)
    expect(r.ctis.length).toBeGreaterThan(0)
    expect(space.graph.edges[r.ctis[0]].action).toBe('load')
    expect(r.ok).toBe(false)
  })

  it('charge ≤ 2 : inductive, et implique l’objectif', () => {
    const r = checkCandidate(space, [], parseExpr('charge ≤ 2'))
    expect(r.ok).toBe(true)
    expect(impliesGoal(space, [parseExpr('charge ≤ 2')], parseExpr('charge < 3'))).toBe(true)
  })

  it('sans brique, rien n’implique l’objectif', () => {
    expect(impliesGoal(space, [], parseExpr('charge < 3'))).toBe(false)
  })
})

describe('checkCandidate (mutex corrigé)', () => {
  const level = byId('p2-mutex-corrige')
  const space = buildFullSpace(level)
  const goal = parseExpr(level.invariantSrc)
  const A0 = parseExpr('pc0 = "crit" ⇒ flag0 = 1')
  const A1 = parseExpr('pc1 = "crit" ⇒ flag1 = 1')

  it('l’invariant n’est PAS inductif seul (états fantômes)', () => {
    const r = checkCandidate(space, [], goal)
    expect(r.initOk).toBe(true)
    expect(r.ctis.length).toBeGreaterThan(0)
  })

  it('avec la brique donnée (A0), les CTI restants passent tous par enter0', () => {
    const givens = level.lemmas.map((l) => l.expr)
    expect(givens.length).toBe(1)
    const r = checkCandidate(space, givens, goal)
    expect(r.ctis.length).toBeGreaterThan(0)
    for (const e of r.ctis) expect(space.graph.edges[e].action).toBe('enter0')
  })

  it('A0 et A1 sont inductives seules', () => {
    expect(checkCandidate(space, [], A0).ok).toBe(true)
    expect(checkCandidate(space, [], A1).ok).toBe(true)
  })

  it('l’invariant est inductif relativement à A0 ∧ A1, et l’arbre de preuve est honnête', () => {
    const r = checkCandidate(space, [A0, A1], goal)
    expect(r.ok).toBe(true)
    expect(usedBricks(space, [A0, A1], goal)).toEqual([true, true])
    expect(impliesGoal(space, [A0, A1], goal)).toBe(false) // il faut prouver l'invariant lui-même
    expect(impliesGoal(space, [A0, A1, goal], goal)).toBe(true)
  })
})

describe('alias de briques', () => {
  const level = byId('p3-peterson')
  const space = buildFullSpace(level)

  it('les LEMMA sont nommés et substituables', async () => {
    const { substituteAliases } = await import('../dsl/parse')
    expect(level.lemmas.map((l) => l.name)).toEqual(['F0', 'F1'])
    const aliases = new Map(level.lemmas.map((l) => [l.name, l.expr]))
    // « F0 ∧ F1 » ≡ conjonction des deux lemmes, via alias.
    const combo = substituteAliases(parseExpr('F0 ∧ F1'), aliases)
    const direct = checkCandidate(space, [], combo)
    expect(direct.ok).toBe(
      checkCandidate(space, [], parseExpr('(pc0 ≠ "idle" ⇒ flag0 = 1) ∧ (pc1 ≠ "idle" ⇒ flag1 = 1)')).ok,
    )
  })

  it('nom de lemme en collision avec une variable rejeté', async () => {
    const { compileLevel } = await import('../dsl/parse')
    expect(() =>
      compileLevel('LEVEL x\nMODE prove\nVARIABLES\n  a ∈ {0, 1} = 0\nACTION t ≜ a = 0 → a := 1\nINVARIANT a ≥ 0\nLEMMA a ≜ a = 0'),
    ).toThrow(/nom déjà pris/)
  })
})

describe('checkCandidate (Peterson)', () => {
  const level = byId('p3-peterson')
  const space = buildFullSpace(level)
  const goal = parseExpr(level.invariantSrc)
  const givens = level.lemmas.map((l) => l.expr) // A0, A1 donnés
  const T0 = parseExpr('pc0 = "crit" ∧ pc1 = "wait" ⇒ turn = 0')
  const T1 = parseExpr('pc1 = "crit" ∧ pc0 = "wait" ⇒ turn = 1')

  it('128 états ; les lemmes donnés sont inductifs seuls', () => {
    expect(space.graph.nodes.length).toBe(128)
    for (const g of givens) expect(checkCandidate(space, [], g).ok).toBe(true)
  })

  it('l’invariant n’est pas inductif même avec les lemmes donnés', () => {
    expect(checkCandidate(space, givens, goal).ok).toBe(false)
  })

  it('T0/T1 se prouvent avec les lemmes donnés, puis l’invariant tombe', () => {
    expect(checkCandidate(space, givens, T0).ok).toBe(true)
    expect(checkCandidate(space, givens, T1).ok).toBe(true)
    const r = checkCandidate(space, [...givens, T0, T1], goal)
    expect(r.ok).toBe(true)
    expect(impliesGoal(space, [...givens, T0, T1, goal], goal)).toBe(true)
  })
})
