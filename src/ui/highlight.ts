/**
 * Coloration par token du DSL pour l'affichage HTML (spec, briques,
 * inspecteur…) — mêmes couleurs que l'éditeur CodeMirror :
 * variables bleues, valeurs vertes/jaunes, symboles lavande.
 */

const TOKEN_RE =
  /("[^"]*")|(\d+)|([A-Za-z_][A-Za-z0-9_]*)|(:=|=>|->|==|<=|>=|\/\\|\\\/|\/=|&&|\|\||[∧∨¬⇒→≜∈≠≤≥=<>+\-#~!])|([(){},])/g

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function hl(src: string): string {
  let out = ''
  let last = 0
  for (const m of src.matchAll(TOKEN_RE)) {
    out += escapeHtml(src.slice(last, m.index))
    last = m.index + m[0].length
    const esc = escapeHtml(m[0])
    if (m[1] !== undefined) out += `<span class="hl-str">${esc}</span>`
    else if (m[2] !== undefined) out += `<span class="hl-num">${esc}</span>`
    else if (m[3] !== undefined) out += `<span class="hl-var">${esc}</span>`
    else if (m[4] !== undefined) out += `<span class="hl-op">${esc}</span>`
    else out += `<span class="hl-punct">${esc}</span>`
  }
  return out + escapeHtml(src.slice(last))
}

/** Une valeur seule (inspecteur, variables live). */
export function hlValue(v: string | number): string {
  return typeof v === 'number'
    ? `<span class="hl-num">${v}</span>`
    : `<span class="hl-str">${escapeHtml(JSON.stringify(v))}</span>`
}
