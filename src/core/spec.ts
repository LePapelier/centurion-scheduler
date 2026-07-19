/** Un état du système : valuation des variables. Immuable par convention. */
export type State = Readonly<Record<string, string | number>>

/** Une action gardée du mini-DSL (esprit TLA+ : Guard ∧ Update). */
export interface Action {
  readonly name: string
  guard(s: State): boolean
  update(s: State): State
}

export interface Level {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly init: State
  readonly actions: readonly Action[]
  /** true = l'état satisfait l'invariant. */
  invariant(s: State): boolean
}

/**
 * Clé canonique d'un état : JSON à clés triées.
 * Déterministe partout — c'est ce qui rend un futur 1v1 synchronisable
 * par simple échange de `{levelId, moves}`.
 */
export function stateKey(s: State): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(s).sort(([a], [b]) => (a < b ? -1 : 1))),
  )
}
