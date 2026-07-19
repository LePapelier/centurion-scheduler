import type { Level, State } from '../core/spec'

export type Value = number | string | boolean

export type Expr =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'str'; readonly value: string }
  | { readonly kind: 'var'; readonly name: string; readonly line: number }
  | { readonly kind: 'not'; readonly arg: Expr }
  | {
      readonly kind: 'bin'
      readonly op: 'and' | 'or' | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' | 'add' | 'sub'
      readonly left: Expr
      readonly right: Expr
      readonly line: number
    }

export interface Assignment {
  readonly name: string
  readonly expr: Expr
  readonly line: number
}

export type LevelMode = 'trace' | 'match' | 'repair'

/** Niveau compilé depuis le DSL : un Level jouable + tout ce qu'il faut afficher. */
export interface CompiledLevel extends Level {
  readonly actionsSrc: readonly {
    readonly name: string
    readonly guardSrc: string
    readonly updateSrc: string
  }[]
  readonly invariantSrc: string
  /** Variables à afficher en étiquette de nœud (directive LABEL). */
  readonly labelVars: readonly string[]
  /** Valeur sémantique d'un état (directive COLOR), pour la coloration du graphe. */
  colorValue?(s: State): number

  readonly mode: LevelMode
  /** MODE match : l'ensemble d'états à caractériser. */
  readonly target?: Expr
  /** MODE repair : conditions d'atteignabilité à préserver (anti-trivialité). */
  readonly requires: readonly { readonly src: string; readonly expr: Expr }[]
  /** MODE repair : actions dont la garde est renforçable. */
  readonly repairables: readonly string[]
  /** Paragraphes du tuto (directive TUTORIAL, répétable). */
  readonly tutorial: readonly string[]
  /** Consigne courte (directive GOAL). */
  readonly goal: string
  /** Domaines déclarés (autocomplétion des valeurs). */
  readonly domains: ReadonlyMap<string, readonly (string | number)[]>
}
