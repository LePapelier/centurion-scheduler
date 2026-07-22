import { describe, expect, it } from 'vitest'
import { compileLevel } from '../dsl/parse'
import { explore } from './explore'
import { stateKey } from './spec'

// Fixture autonome : mutex « test puis set » à 2 processus.
const mutex = compileLevel(`
LEVEL fixture-mutex
MODE trace
VARIABLES
  pc0 ∈ {"idle", "ready", "crit"} = "idle"
  pc1 ∈ {"idle", "ready", "crit"} = "idle"
  flag0 ∈ {0, 1} = 0
  flag1 ∈ {0, 1} = 0
ACTION check0 ≜ pc0 = "idle" ∧ flag1 = 0 → pc0 := "ready"
ACTION enter0 ≜ pc0 = "ready" → pc0 := "crit" ∧ flag0 := 1
ACTION check1 ≜ pc1 = "idle" ∧ flag0 = 0 → pc1 := "ready"
ACTION enter1 ≜ pc1 = "ready" → pc1 := "crit" ∧ flag1 := 1
INVARIANT ¬(pc0 = "crit" ∧ pc1 = "crit")
`)

describe('explore(mutex)', () => {
  const graph = explore(mutex)

  it('trouve un état violant', () => {
    expect(graph.nodes.some((n) => n.violating)).toBe(true)
  })

  it('par = 4 (check0, check1, enter0, enter1)', () => {
    expect(graph.par).toBe(4)
  })

  it('espace d’états attendu : 9 états, flag_i ≡ (pc_i = crit)', () => {
    expect(graph.nodes.length).toBe(9)
    for (const n of graph.nodes) {
      expect(n.state.flag0).toBe(n.state.pc0 === 'crit' ? 1 : 0)
      expect(n.state.flag1).toBe(n.state.pc1 === 'crit' ? 1 : 0)
    }
  })

  it('les arêtes partent toutes d’états non violants et respectent les gardes', () => {
    for (const e of graph.edges) {
      expect(graph.nodes[e.from].violating).toBe(false)
      const action = mutex.actions.find((a) => a.name === e.action)!
      expect(action.guard(graph.nodes[e.from].state)).toBe(true)
      expect(stateKey(action.update(graph.nodes[e.from].state))).toBe(graph.nodes[e.to].key)
    }
  })

  it('est déterministe (deux explorations identiques)', () => {
    const again = explore(mutex)
    expect(again.nodes.map((n) => n.key)).toEqual(graph.nodes.map((n) => n.key))
    expect(again.edges).toEqual(graph.edges)
  })
})
