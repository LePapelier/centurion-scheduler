import { describe, expect, it } from 'vitest'
import { compileLevel } from '../dsl/parse'
import { explore } from './explore'
import { currentNode, isVictory, newGame, play, undo } from './game'

// Fixture autonome (le réducteur ne dépend d'aucun niveau de la campagne).
// Deux processus « test puis set » — l'exclusion casse en 4 coups entrelacés.
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

const graph = explore(mutex)

/** Joue une suite d'actions par leurs noms. */
function playNames(names: string[]) {
  let game = newGame(mutex.id)
  for (const name of names) {
    const at = currentNode(game, graph)
    const edge = graph.successors[at].find((e) => graph.edges[e].action === name)
    if (edge === undefined) throw new Error(`action ${name} non activée`)
    game = play(game, graph, edge)
  }
  return game
}

describe('game (réducteur)', () => {
  it('la trace optimale mène à la violation', () => {
    const game = playNames(['check0', 'check1', 'enter0', 'enter1'])
    expect(isVictory(game, graph)).toBe(true)
    expect(game.moves.length).toBe(graph.par)
  })

  it('l’ordonnancement honnête ne viole pas', () => {
    const game = playNames(['check0', 'enter0'])
    expect(isVictory(game, graph)).toBe(false)
    // le drapeau levé bloque l'autre processus
    const at = currentNode(game, graph)
    expect(graph.successors[at].map((e) => graph.edges[e].action)).not.toContain('check1')
  })

  it('undo remonte d’un coup', () => {
    const game = playNames(['check0', 'check1'])
    expect(currentNode(undo(game), graph)).toBe(currentNode(playNames(['check0']), graph))
    expect(currentNode(undo(undo(undo(game))), graph)).toBe(0)
  })

  it('rejet des coups illégaux', () => {
    const game = newGame(mutex.id)
    const notFromInit = graph.edges.findIndex((e) => e.from !== 0)
    expect(() => play(game, graph, notFromInit)).toThrow()
    expect(() => play(game, graph, 9999)).toThrow()
  })

  it('le journal est sérialisable et rejouable (base 1v1)', () => {
    const game = playNames(['check0', 'check1', 'enter0'])
    const wire = JSON.parse(JSON.stringify(game))
    expect(currentNode(wire, graph)).toBe(currentNode(game, graph))
  })
})
