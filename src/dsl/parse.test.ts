import { describe, expect, it } from 'vitest'
import { compileLevel } from './parse'

const MINI = `
LEVEL test
NAME Test
VARIABLES
  x ∈ {0, 1, 2} = 0
  y = 2
ACTION incr ≜ x < 2 → x := x + 1
ACTION swap ≜ x = 1 → x := y ∧ y := x
INVARIANT x + y < 7
`

describe('compileLevel', () => {
  const level = compileLevel(MINI)

  it('init, gardes et updates', () => {
    expect(level.init).toEqual({ x: 0, y: 2 })
    expect(level.actions[0].guard({ x: 0, y: 2 })).toBe(true)
    expect(level.actions[0].guard({ x: 2, y: 2 })).toBe(false)
    expect(level.actions[0].update({ x: 0, y: 2 })).toEqual({ x: 1, y: 2 })
  })

  it('affectations simultanées (sémantique TLA)', () => {
    expect(level.actions[1].update({ x: 1, y: 2 })).toEqual({ x: 2, y: 1 })
  })

  it('invariant', () => {
    expect(level.invariant({ x: 1, y: 2 })).toBe(true)
    expect(level.invariant({ x: 2, y: 5 })).toBe(false)
  })

  it('sources conservées pour l’affichage', () => {
    expect(level.actionsSrc[0]).toEqual({ name: 'incr', guardSrc: 'x < 2', updateSrc: 'x := x + 1' })
    expect(level.invariantSrc).toBe('x + y < 7')
  })

  it('aliases ASCII', () => {
    const ascii = compileLevel(`
LEVEL a
VARIABLES
  p = 0
ACTION t == p = 0 /\\ ~(p /= 0) -> p := 1
INVARIANT ~(p = 2)
`)
    expect(ascii.actions[0].guard({ p: 0 })).toBe(true)
    expect(ascii.actions[0].update({ p: 0 })).toEqual({ p: 1 })
  })

  it('violation de domaine détectée à l’update', () => {
    const bad = compileLevel(`
LEVEL b
VARIABLES
  x ∈ {0, 1} = 0
ACTION t ≜ x < 5 → x := x + 1
INVARIANT x ≥ 0
`)
    const s1 = bad.actions[0].update({ x: 0 })
    expect(s1).toEqual({ x: 1 })
    expect(() => bad.actions[0].update(s1)).toThrow(/hors de son domaine/)
  })

  it('erreurs de parse localisées', () => {
    expect(() => compileLevel('LEVEL x\nVARIABLES\n  a = 0\nACTION t ≜ a = → a := 1\nINVARIANT a = 0')).toThrow(/ligne 4/)
    expect(() => compileLevel('LEVEL x\nINVARIANT y = 0')).toThrow(/ACTION/)
  })

  it('garde non booléenne rejetée à l’évaluation', () => {
    const l = compileLevel(`
LEVEL c
VARIABLES
  x = 1
ACTION t ≜ x + 1 → x := 0
INVARIANT x = x
`)
    expect(() => l.actions[0].guard({ x: 1 })).toThrow(/booléen/)
  })
})
