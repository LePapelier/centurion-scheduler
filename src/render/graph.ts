import * as THREE from 'three'
import type { Graph } from '../core/explore'
import type { SceneCtx } from './scene'

export interface Styles {
  /** Nœud courant (mode trace) — null : pas de halo. */
  readonly current: number | null
  readonly frontier: ReadonlySet<number> // successeurs jouables (mode trace)
  readonly traceEdges: ReadonlySet<number>
  readonly enabledEdges: ReadonlySet<number>
  /** Nœud à faire ressortir (aperçu de la saisie), ou -1. */
  readonly highlight: number
  /** Couleurs imposées par le mode de jeu. */
  readonly overrides?: ReadonlyMap<number, THREE.Color>
  /** Nœuds éteints (prove : états fantômes, jamais atteignables). */
  readonly dimmed?: ReadonlySet<number>
  /** États satisfaisant la formule candidate (la « région », éclaircie). */
  readonly region?: ReadonlySet<number>
  /** Contre-exemples à l'induction : transitions qui s'échappent de la région. */
  readonly ctiEdges?: ReadonlySet<number>
}

const EDGE = {
  base: new THREE.Color(0x252c3d),
  enabled: new THREE.Color(0x8a5a20),
  trace: new THREE.Color(0xd9a441),
  cti: new THREE.Color(0xff3b52),
  selected: new THREE.Color(0xffb04d),
}
const BG = new THREE.Color(0x0b0e14)
const WHITE = new THREE.Color(0xffffff)
const FRONTIER_TINT = new THREE.Color(0xffb04d)

function haloTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.25)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

function labelSprite(text: string, color = '#cdd6e4', k = 0.011): THREE.Sprite {
  const font = '28px ui-monospace, Menlo, monospace'
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const w = Math.ceil(measure.measureText(text).width) + 12
  const h = 38
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  g.font = font
  g.fillStyle = 'rgba(13, 17, 26, 0.65)'
  g.fillRect(0, 0, w, h)
  g.fillStyle = color
  g.textBaseline = 'middle'
  g.fillText(text, 6, h / 2 + 1)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthWrite: false, transparent: true }),
  )
  sprite.scale.set(w * k, h * k, 1)
  return sprite
}

/** Au-delà de ce nombre de nœuds, seuls les états atteignables (et la sélection) gardent leur étiquette. */
const LABEL_DENSITY_LIMIT = 60

/**
 * Vue du graphe : une seule InstancedMesh pour les nœuds, un seul
 * LineSegments pour les arêtes, une étiquette-sprite par nœud révélé.
 * La couleur d'un nœud est SÉMANTIQUE (fournie par le niveau) ; le statut
 * de jeu passe par le halo (courant), la pulsation (frontière) et les
 * arêtes (trace or, transitions activées orange). Brouillard de guerre :
 * échelle nulle et arêtes dégénérées pour le non-révélé.
 */
export class GraphView {
  private readonly graph: Graph
  private readonly target: Float32Array // positions du layout (figées)
  private readonly display: Float32Array // positions affichées (animées à l'éclosion)
  private readonly revealScale: Float32Array // 0 → 1 à l'éclosion
  readonly revealed: boolean[]

  private readonly nodeColors: readonly THREE.Color[]
  private readonly labels: (THREE.Sprite | null)[]
  private readonly labelTexts: readonly string[]

  private readonly nodesMesh: THREE.InstancedMesh
  private readonly edgeGeom: THREE.BufferGeometry
  private readonly edgePos: Float32Array
  private readonly halo: THREE.Sprite
  private readonly ctx: SceneCtx
  private styles: Styles = {
    current: null,
    frontier: new Set(),
    traceEdges: new Set(),
    enabledEdges: new Set(),
    highlight: -1,
  }
  private readonly dummy = new THREE.Object3D()
  private readonly raycaster = new THREE.Raycaster()
  private readonly tmpColor = new THREE.Color()
  /** Nœud sélectionné (inspection) : surligné, flèches sortantes étiquetées. */
  private selected: number | null = null
  private readonly edgeLabels = new Map<number, THREE.Sprite>()

  constructor(
    ctx: SceneCtx,
    graph: Graph,
    positions: Float32Array,
    nodeColors: readonly THREE.Color[],
    labelTexts: readonly string[],
  ) {
    this.ctx = ctx
    this.graph = graph
    this.target = positions
    this.display = positions.slice()
    this.nodeColors = nodeColors
    this.labelTexts = labelTexts
    const n = graph.nodes.length
    this.revealScale = new Float32Array(n)
    this.revealed = new Array(n).fill(false)
    this.labels = new Array(n).fill(null)

    this.nodesMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.32, 2),
      new THREE.MeshLambertMaterial(),
      n,
    )
    this.nodesMesh.frustumCulled = false
    for (let i = 0; i < n; i++) this.nodesMesh.setColorAt(i, nodeColors[i])
    ctx.scene.add(this.nodesMesh)

    this.edgePos = new Float32Array(graph.edges.length * 6)
    this.edgeGeom = new THREE.BufferGeometry()
    this.edgeGeom.setAttribute('position', new THREE.BufferAttribute(this.edgePos, 3))
    this.edgeGeom.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(graph.edges.length * 6), 3),
    )
    const lines = new THREE.LineSegments(
      this.edgeGeom,
      new THREE.LineBasicMaterial({ vertexColors: true }),
    )
    lines.frustumCulled = false
    ctx.scene.add(lines)

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    )
    this.halo.scale.setScalar(2.2)
    ctx.scene.add(this.halo)

    ctx.scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(5, 8, 6)
    ctx.scene.add(sun)

    ctx.onFrame = (t) => this.updateFrame(t)
  }

  nodePosition(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.display[i * 3], this.display[i * 3 + 1], this.display[i * 3 + 2])
  }

  /** Tout révéler d'emblée (modes match et repair — pas de brouillard). */
  revealAll(): void {
    for (let i = 0; i < this.graph.nodes.length; i++) {
      if (this.revealed[i]) continue
      this.revealed[i] = true
      this.revealScale[i] = 1
      if (this.labels[i] === null && this.labelTexts[i] !== '') {
        const sprite = labelSprite(this.labelTexts[i])
        this.labels[i] = sprite
        this.ctx.scene.add(sprite)
      }
    }
  }

  /** Éclosion d'un nœud : apparaît sur son parent puis glisse vers sa place. */
  reveal(i: number, from: number | null): void {
    if (this.revealed[i]) return
    this.revealed[i] = true
    if (this.labels[i] === null && this.labelTexts[i] !== '') {
      const sprite = labelSprite(this.labelTexts[i])
      this.labels[i] = sprite
      this.ctx.scene.add(sprite)
    }
    const origin = from === null ? i : from
    for (let a = 0; a < 3; a++) this.display[i * 3 + a] = this.target[origin * 3 + a]
    this.ctx.addTween({
      dur: 450,
      step: (k) => {
        this.revealScale[i] = k
        for (let a = 0; a < 3; a++) {
          const o = this.target[origin * 3 + a]
          this.display[i * 3 + a] = o + (this.target[i * 3 + a] - o) * k
        }
      },
    })
  }

  /** Sélectionne un nœud : surlignage + étiquettes d'action sur ses flèches sortantes. */
  setSelected(i: number | null): void {
    this.selected = i
    for (const sprite of this.edgeLabels.values()) {
      sprite.removeFromParent()
      const mat = sprite.material as THREE.SpriteMaterial
      mat.map?.dispose()
      mat.dispose()
    }
    this.edgeLabels.clear()
    if (i !== null) {
      for (const e of this.graph.successors[i]) {
        const sprite = labelSprite(this.graph.edges[e].action, '#ffb04d', 0.0095)
        this.edgeLabels.set(e, sprite)
        this.ctx.scene.add(sprite)
      }
    }
    this.applyStyles()
  }

  getSelected(): number | null {
    return this.selected
  }

  setStyles(styles: Styles): void {
    this.styles = styles
    this.applyStyles()
  }

  private applyStyles(): void {
    const styles = this.styles
    for (let i = 0; i < this.graph.nodes.length; i++) {
      this.tmpColor.copy(styles.overrides?.get(i) ?? this.nodeColors[i])
      if (styles.frontier.has(i)) this.tmpColor.lerp(FRONTIER_TINT, 0.45)
      if (i === styles.highlight) this.tmpColor.lerp(WHITE, 0.45)
      if (styles.dimmed?.has(i)) this.tmpColor.lerp(BG, 0.62)
      // La région reste lisible même sur un état fantôme (appliquée après).
      if (styles.region?.has(i)) this.tmpColor.lerp(WHITE, 0.38)
      if (i === this.selected) this.tmpColor.lerp(WHITE, 0.5)
      this.nodesMesh.setColorAt(i, this.tmpColor)
      const label = this.labels[i]
      if (label !== null)
        (label.material as THREE.SpriteMaterial).color.setScalar(styles.dimmed?.has(i) ? 0.35 : 1)
    }
    this.nodesMesh.instanceColor!.needsUpdate = true

    const edgeColors = this.edgeGeom.getAttribute('color') as THREE.BufferAttribute
    for (let e = 0; e < this.graph.edges.length; e++) {
      const outgoing = this.selected !== null && this.graph.edges[e].from === this.selected
      const c = styles.ctiEdges?.has(e)
        ? EDGE.cti
        : outgoing
          ? EDGE.selected
          : styles.traceEdges.has(e)
            ? EDGE.trace
            : styles.enabledEdges.has(e)
              ? EDGE.enabled
              : EDGE.base
      for (const v of [0, 1]) edgeColors.setXYZ(e * 2 + v, c.r, c.g, c.b)
    }
    edgeColors.needsUpdate = true
  }

  /** Raycast → indice de nœud révélé, ou null. */
  pick(ndc: THREE.Vector2): number | null {
    // three fige la sphère englobante au premier raycast ; si celui-ci part
    // avant la première frame (matrices identité), tout pick rate ensuite.
    this.nodesMesh.computeBoundingSphere()
    this.raycaster.setFromCamera(ndc, this.ctx.camera)
    for (const hit of this.raycaster.intersectObject(this.nodesMesh)) {
      const i = hit.instanceId
      if (i !== undefined && this.revealed[i] && this.revealScale[i] > 0.5) return i
    }
    return null
  }


  private updateFrame(time: number): void {
    const { graph, dummy } = this
    // Tout est réécrit chaque frame — trivial à ces tailles de graphe.
    for (let i = 0; i < graph.nodes.length; i++) {
      let s = this.revealed[i] ? this.revealScale[i] : 0
      if (i === this.styles.current) s *= 1.35
      else if (this.styles.frontier.has(i)) s *= 1 + 0.13 * Math.sin(time * 0.005 + i * 1.7)
      if (i === this.styles.highlight) s *= 1.25
      if (this.styles.dimmed?.has(i)) s *= 0.55
      if (i === this.selected) s *= 1.3
      dummy.position.set(this.display[i * 3], this.display[i * 3 + 1], this.display[i * 3 + 2])
      dummy.scale.setScalar(Math.max(s, 1e-4))
      dummy.updateMatrix()
      this.nodesMesh.setMatrixAt(i, dummy.matrix)

      const label = this.labels[i]
      if (label !== null) {
        label.position.set(this.display[i * 3], this.display[i * 3 + 1] - 0.72, this.display[i * 3 + 2])
        const mat = label.material as THREE.SpriteMaterial
        // Gros graphes : on tait les étiquettes des fantômes (l'inspecteur prend le relais).
        const quiet =
          graph.nodes.length > LABEL_DENSITY_LIMIT &&
          this.styles.dimmed?.has(i) === true &&
          i !== this.selected
        mat.opacity = quiet ? 0 : this.revealScale[i]
      }
    }
    this.nodesMesh.instanceMatrix.needsUpdate = true

    for (let e = 0; e < graph.edges.length; e++) {
      const { from, to } = graph.edges[e]
      const visible = this.revealed[from] && this.revealed[to]
      for (let a = 0; a < 3; a++) {
        this.edgePos[e * 6 + a] = this.display[from * 3 + a]
        // Arête cachée : dégénérée sur son origine (invisible, coût nul).
        this.edgePos[e * 6 + 3 + a] = this.display[(visible ? to : from) * 3 + a]
      }
    }
    this.edgeGeom.getAttribute('position').needsUpdate = true

    for (const [e, sprite] of this.edgeLabels) {
      const { from, to } = graph.edges[e]
      sprite.position.set(
        (this.display[from * 3] + this.display[to * 3]) / 2,
        (this.display[from * 3 + 1] + this.display[to * 3 + 1]) / 2 + 0.18,
        (this.display[from * 3 + 2] + this.display[to * 3 + 2]) / 2,
      )
      sprite.visible = this.revealed[from] && this.revealed[to]
    }

    const cur = this.styles.current
    this.halo.visible = cur !== null
    if (cur !== null) {
      this.halo.position.set(
        this.display[cur * 3],
        this.display[cur * 3 + 1],
        this.display[cur * 3 + 2],
      )
      const mat = this.halo.material as THREE.SpriteMaterial
      mat.color.set(this.graph.nodes[cur].violating ? 0xff3b52 : 0x6ec8ff)
      mat.opacity = 0.55 + 0.25 * Math.sin(time * 0.004)
    }
  }
}
