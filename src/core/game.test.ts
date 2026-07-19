import { describe, expect, it } from 'vitest'
import { levels } from '../levels'
import { explore } from './explore'
import { currentNode, isVictory, newGame, play, undo } from './game'

const mutex = levels[0]

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

describe('game (mutex)', () => {
  it('la trace optimale mène à la violation', () => {
    const game = playNames(['check0', 'check1', 'enter0', 'enter1'])
    expect(isVictory(game, graph)).toBe(true)
    expect(game.moves.length).toBe(graph.par)
  })

  it('l’ordonnancement honnête ne viole pas', () => {
    const game = playNames(['check0', 'enter0', 'exit0', 'check1', 'enter1'])
    expect(isVictory(game, graph)).toBe(false)
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
