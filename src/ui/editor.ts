import { autocompletion, completionKeymap, type Completion, type CompletionContext } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { linter } from '@codemirror/lint'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { tags } from '@lezer/highlight'

export interface EditorOpts {
  readonly parent: HTMLElement
  readonly placeholder: string
  /** Complétions contextuelles, réévaluées à chaque déclenchement. */
  completions(): Completion[]
  onChange(text: string): void
  onSubmit(text: string): void
  /** Message d'erreur à souligner, ou null si la saisie est valide. */
  lint(text: string): string | null
}

/** Saisie ASCII réécrite en symboles du DSL à la volée. */
const DIGRAPHS: Record<string, string> = {
  '/\\': '∧', '&&': '∧', '\\/': '∨', '||': '∨',
  '->': '→', '/=': '≠', '!=': '≠', '<=': '≤', '>=': '≥',
}

/** Remplacements ASCII → symboles dans `doc` (balayage gauche-droite, digraphes d'abord). */
function asciiRewrites(doc: string): { from: number; to: number; insert: string }[] {
  const changes: { from: number; to: number; insert: string }[] = []
  let i = 0
  while (i < doc.length) {
    const two = doc.slice(i, i + 2)
    const sym = DIGRAPHS[two]
    if (sym !== undefined) {
      changes.push({ from: i, to: i + 2, insert: sym })
      i += 2
    } else if (doc[i] === '~') {
      changes.push({ from: i, to: i + 1, insert: '¬' })
      i += 1
    } else {
      i += 1
    }
  }
  return changes
}

const dslLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.match(/^"[^"]*"?/)) return 'string'
    if (stream.match(/^[0-9]+/)) return 'number'
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) return 'variableName'
    if (stream.match(/^(\/\\|\\\/|\/=|:=|->|==|<=|>=|&&|\|\|)/)) return 'operator'
    if (stream.match(/^[∧∨¬→≜∈≠≤≥~!#=<>+-]/)) return 'operator'
    if (stream.match(/^[(){},]/)) return 'punctuation'
    stream.next()
    return 'invalid'
  },
})

const dslHighlight = HighlightStyle.define([
  { tag: tags.string, color: '#8fd0a0' },
  { tag: tags.number, color: '#d9a441' },
  { tag: tags.variableName, color: '#6ec8ff' },
  { tag: tags.operator, color: '#a4aeff' },
  { tag: tags.punctuation, color: '#8d99ad' },
  { tag: tags.invalid, color: '#ff3b52' },
])

const theme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#0e1420',
      border: '1px solid #2c3a55',
      borderRadius: '6px',
      fontSize: '13px',
    },
    '&.cm-focused': { outline: 'none', borderColor: '#7a88ff' },
    '.cm-content': {
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      padding: '6px 9px',
      caretColor: '#f2f6ff',
    },
    '.cm-cursor': { borderLeftColor: '#f2f6ff' },
    '.cm-placeholder': { color: '#55607a' },
    '.cm-tooltip': {
      backgroundColor: '#141b2c',
      border: '1px solid #2c3a55',
      color: '#cdd6e4',
      fontFamily: 'ui-monospace, Menlo, monospace',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: '#243049',
      color: '#f2f6ff',
    },
    '.cm-completionDetail': { color: '#55607a', fontStyle: 'normal' },
    '.cm-diagnostic-error': { borderLeft: '3px solid #ff3b52' },
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      textDecoration: 'underline wavy #ff3b52 1px',
    },
  },
  { dark: true },
)

/** Éditeur monoligne CM6 pour les formules du DSL. */
export class FormulaEditor {
  private readonly view: EditorView

  constructor(opts: EditorOpts) {
    this.view = new EditorView({
      parent: opts.parent,
      state: EditorState.create({
        extensions: [
          theme,
          history(),
          dslLanguage,
          syntaxHighlighting(dslHighlight),
          cmPlaceholder(opts.placeholder),
          // Monoligne + réécriture ASCII → symboles (frappe, collage, tout).
          EditorState.transactionFilter.of((tr) => {
            if (tr.newDoc.lines > 1) return []
            if (!tr.docChanged) return tr
            const changes = asciiRewrites(tr.newDoc.toString())
            return changes.length === 0 ? tr : [tr, { changes, sequential: true }]
          }),
          // Entrée = soumettre (avant tout autre binding).
          Prec.highest(
            keymap.of([
              {
                key: 'Enter',
                run: (view) => {
                  opts.onSubmit(view.state.doc.toString().trim())
                  return true
                },
              },
            ]),
          ),
          keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap]),
          autocompletion({
            activateOnTyping: true,
            override: [
              (ctx: CompletionContext) => {
                const word = ctx.matchBefore(/(?:"[A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*)$/)
                if (word === null && !ctx.explicit) return null
                return { from: word?.from ?? ctx.pos, options: opts.completions() }
              },
            ],
          }),
          linter(
            (view) => {
              const text = view.state.doc.toString().trim()
              if (text === '') return []
              const msg = opts.lint(text)
              return msg === null
                ? []
                : [{ from: 0, to: view.state.doc.length, severity: 'error' as const, message: msg }]
            },
            { delay: 200 },
          ),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) opts.onChange(u.state.doc.toString().trim())
          }),
        ],
      }),
    })
  }

  getText(): string {
    return this.view.state.doc.toString().trim()
  }

  setText(text: string): void {
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } })
  }

  focus(): void {
    this.view.focus()
  }
}

/** Complétions standard : opérateurs du DSL (avec leur alias ASCII en détail). */
export const OPERATOR_COMPLETIONS: Completion[] = [
  { label: '∧', detail: '/\\  et', apply: '∧ ', type: 'keyword' },
  { label: '∨', detail: '\\/  ou', apply: '∨ ', type: 'keyword' },
  { label: '¬', detail: '~  non', apply: '¬', type: 'keyword' },
  { label: '≠', detail: '/=  différent', apply: '≠ ', type: 'keyword' },
  { label: '≤', detail: '<=', apply: '≤ ', type: 'keyword' },
  { label: '≥', detail: '>=', apply: '≥ ', type: 'keyword' },
]
