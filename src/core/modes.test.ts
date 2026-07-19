import { describe, expect, it } from 'vitest'
import { parseExpr } from '../dsl/parse'
import { levels } from '../levels'
import { explore } from './explore'
import { matchStates, sameSet } from './match'
import { checkRepair } from './repair'

describe('campagne', () => {
  it('les 8 niveaux compilent et portent leurs métadonnées', () => {
    expect(levels.length).toBe(8)
    for (const l of levels) {
      expect(l.tutorial.length + (l.goal === '' ? 0 : 1)).toBeGreaterThan(0)
      if (l.mode === 'match') expect(l.target).toBeDefined()
      if (l.mode === 'repair') {
        expect(l.repairables.length).toBeGreaterThan(0)
        expect(l.requires.length).toBeGreaterThan(0)
      }
    }
  })

  it('tous les graphes restent petits (grille-pain)', () => {
    for (const l of levels) expect(explore(l).nodes.length).toBeLessThan(200)
  })

  it('les niveaux trace sont violables', () => {
    for (const l of levels.filter((l) => l.mode === 'trace'))
      expect(explore(l).par).toBeGreaterThan(0)
  })
})

describe('mode match', () => {
  const level = levels.find((l) => l.id === 'm1-egalite')!
  const graph = explore(level)
  const target = matchStates(graph, level.target!)

  it('la solution attendue matche exactement', () => {
    expect(sameSet(matchStates(graph, parseExpr('n = 3')), target)).toBe(true)
  })

  it('une formule fausse ne matche pas', () => {
    expect(sameSet(matchStates(graph, parseExpr('n = 2')), target)).toBe(false)
    expect(sameSet(matchStates(graph, parseExpr('n ≥ 3')), target)).toBe(true) // équivalente : ok
  })

  it('l’envers du mutex : ∨ plus courte que ¬', () => {
    const m3 = levels.find((l) => l.id === 'm3-negation')!
    const g3 = explore(m3)
    const t3 = matchStates(g3, m3.target!)
    expect(sameSet(matchStates(g3, parseExpr('pc0 ≠ "crit" ∨ pc1 ≠ "crit"')), t3)).toBe(true)
  })
})

describe('mode repair', () => {
  const level = levels.find((l) => l.id === 'r1-mutex')!
  const graph = explore(level)

  it('sans renfort : violable, REQUIRE satisfaits', () => {
    const r = checkRepair(graph, new Map(), level.requires)
    expect(r.safe).toBe(false)
    expect(r.requiresOk).toEqual([true, true])
  })

  it('la réparation canonique rend sûr sans bloquer les REQUIRE', () => {
    const r = checkRepair(
      graph,
      new Map([
        ['enter0', parseExpr('flag1 = 0')],
        ['enter1', parseExpr('flag0 = 0')],
      ]),
      level.requires,
    )
    expect(r.safe).toBe(true)
    expect(r.requiresOk).toEqual([true, true])
    expect(r.killedEdges.size).toBeGreaterThan(0)
  })

  it('la garde triviale est rejetée par REQUIRE', () => {
    const r = checkRepair(
      graph,
      new Map([
        ['enter0', parseExpr('1 = 2')],
        ['enter1', parseExpr('1 = 2')],
      ]),
      level.requires,
    )
    expect(r.safe).toBe(true)
    expect(r.requiresOk).toEqual([false, false])
  })

  it('philosophes : garder chaque prise sous ¬(les deux autres à gauche) brise le cercle', () => {
    const l8 = levels.find((l) => l.id === 'r2-philosophes')!
    const g8 = explore(l8)
    const r = checkRepair(
      g8,
      new Map([
        ['takeL0', parseExpr('¬(p1 = "left" ∧ p2 = "left")')],
        ['takeL1', parseExpr('¬(p0 = "left" ∧ p2 = "left")')],
        ['takeL2', parseExpr('¬(p0 = "left" ∧ p1 = "left")')],
      ]),
      l8.requires,
    )
    expect(r.safe).toBe(true)
    expect(r.requiresOk).toEqual([true, true, true])
  })

  it('philosophes : un seul renfort ne suffit pas', () => {
    const l8 = levels.find((l) => l.id === 'r2-philosophes')!
    const g8 = explore(l8)
    const r = checkRepair(
      g8,
      new Map([['takeL0', parseExpr('¬(p1 = "left" ∧ p2 = "left")')]]),
      l8.requires,
    )
    expect(r.safe).toBe(false)
  })
})
