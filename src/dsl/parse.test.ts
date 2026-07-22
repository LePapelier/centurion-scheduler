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

  it('actions paramétrées : expansion en instances plates', () => {
    const level = compileLevel(`
LEVEL p
MODE trace
VARIABLES
  pc[i ∈ {0, 1}] ∈ {"idle", "crit"} = "idle"
  flag[i ∈ {0, 1}] ∈ {0, 1} = 0
ACTION enter(i ∈ {0, 1}) ≜ pc[i] = "idle" ∧ flag[1-i] = 0 → pc[i] := "crit" ∧ flag[i] := 1
INVARIANT ¬(pc0 = "crit" ∧ pc1 = "crit")
`)
    expect(Object.keys(level.init).sort()).toEqual(['flag0', 'flag1', 'pc0', 'pc1'])
    expect(level.actions.map((a) => a.name)).toEqual(['enter0', 'enter1'])
    // enter0 : garde pc0="idle" ∧ flag1=0 ; enter1 : pc1="idle" ∧ flag0=0.
    expect(level.actions[0].guard({ pc0: 'idle', pc1: 'idle', flag0: 0, flag1: 0 })).toBe(true)
    expect(level.actions[0].guard({ pc0: 'idle', pc1: 'idle', flag0: 0, flag1: 1 })).toBe(false)
    expect(level.actions[1].guard({ pc0: 'idle', pc1: 'idle', flag0: 1, flag1: 0 })).toBe(false)
  })

  it('index modulo : franchir(i) touche s[(i+1)%3]', () => {
    const level = compileLevel(`
LEVEL tri
MODE trace
VARIABLES
  s[i ∈ {0, 1, 2}] ∈ {0, 1} = 0
ACTION franchir(i ∈ {0, 1, 2}) ≜ s[(i+1)%3] = 0 → s[(i+1)%3] := 1
INVARIANT s0 + s1 + s2 < 3
`)
    expect(level.actions.map((a) => a.name)).toEqual(['franchir0', 'franchir1', 'franchir2'])
    // franchir2 doit poser s0 (car (2+1)%3 = 0).
    expect(level.actions[2].update({ s0: 0, s1: 0, s2: 0 })).toEqual({ s0: 1, s1: 0, s2: 0 })
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
