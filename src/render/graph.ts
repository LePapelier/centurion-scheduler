import * as THREE from 'three'
import type { Graph } from '../core/explore'
import { color, edgeLabelColor, labelColor } from './palette'
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

const NODE_RADIUS = 0.32
const ARROW_LEN = 0.16
const EDGE_INSET = 0.4 // marge entre la ligne et le centre d'un nœud
const UP = new THREE.Vector3(0, 1, 0)

/** Au-delà de ce nombre de nœuds, seuls les états atteignables (et la sélection) gardent leur étiquette. */
const LABEL_DENSITY_LIMIT = 30

function ringTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineWidth = 7
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2)
  g.stroke()
  return new THREE.CanvasTexture(canvas)
}

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

/** Étiquette texte : blanc sur fond nu avec ombre portée (lisible sans cartouche). */
function labelSprite(text: string, fill = labelColor, k = 0.0095): THREE.Sprite {
  const font = '600 30px ui-monospace, Menlo, monospace'
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const pad = 10
  const w = Math.ceil(measure.measureText(text).width) + pad * 2
  const h = 44
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  g.font = font
  g.textBaseline = 'middle'
  g.shadowColor = 'rgba(2, 4, 10, 0.95)'
  g.shadowBlur = 7
  g.fillStyle = fill
  g.fillText(text, pad, h / 2 + 1)
  g.shadowBlur = 0
  g.fillText(text, pad, h / 2 + 1)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthWrite: false, transparent: true }),
  )
  sprite.scale.set(w * k, h * k, 1)
  return sprite
}

/**
 * Vue du graphe, identité visuelle du portfolio : anneaux émissifs
 * billboardés (une InstancedMesh), arêtes gris-bleu fléchées (LineSegments
 * + cônes instanciés, en retrait des nœuds), étiquettes blanches au-dessus.
 * Aucune lumière : matériaux basic, tout est réécrit chaque frame — trivial
 * à ces tailles. Brouillard de guerre : échelle nulle pour le non-révélé.
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
  private readonly glowMesh: THREE.InstancedMesh
  private readonly arrowsMesh: THREE.InstancedMesh
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
  private selected: number | null = null
  private readonly edgeLabels = new Map<number, THREE.Sprite>()
  /** Flash par nœud : timestamp (ms) de départ, possiblement futur (sweep). */
  private readonly flashT: Float32Array
  /** Pulses circulant sur les arêtes CTI. */
  private ctiList: number[] = []
  private readonly ctiMovers: THREE.Sprite[] = []
  private readonly softTexture = haloTexture()
  private readonly dummy = new THREE.Object3D()
  private readonly raycaster = new THREE.Raycaster()
  private readonly tmpColor = new THREE.Color()
  private readonly tmpA = new THREE.Vector3()
  private readonly tmpB = new THREE.Vector3()
  private readonly tmpDir = new THREE.Vector3()

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
    this.flashT = new Float32Array(n).fill(-1e9)

    // Sphères néon : couleur pleine non éclairée + lueur additive billboardée.
    this.nodesMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(NODE_RADIUS, 2),
      new THREE.MeshBasicMaterial(),
      n,
    )
    this.nodesMesh.frustumCulled = false
    for (let i = 0; i < n; i++) this.nodesMesh.setColorAt(i, nodeColors[i])
    ctx.scene.add(this.nodesMesh)

    this.glowMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: haloTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      n,
    )
    this.glowMesh.frustumCulled = false
    this.glowMesh.renderOrder = 1
    for (let i = 0; i < n; i++) this.glowMesh.setColorAt(i, nodeColors[i])
    ctx.scene.add(this.glowMesh)

    this.edgePos = new Float32Array(graph.edges.length * 6)
    this.edgeGeom = new THREE.BufferGeometry()
    this.edgeGeom.setAttribute('position', new THREE.BufferAttribute(this.edgePos, 3))
    this.edgeGeom.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(graph.edges.length * 6), 3),
    )
    const lines = new THREE.LineSegments(
      this.edgeGeom,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }),
    )
    lines.frustumCulled = false
    ctx.scene.add(lines)

    // Pointes de flèches : la direction des transitions se lit d'un coup d'œil.
    this.arrowsMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.05, ARROW_LEN, 8),
      new THREE.MeshBasicMaterial(),
      graph.edges.length,
    )
    this.arrowsMesh.frustumCulled = false
    ctx.scene.add(this.arrowsMesh)

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

    ctx.onFrame = (t) => this.updateFrame(t)
  }

  nodePosition(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.display[i * 3], this.display[i * 3 + 1], this.display[i * 3 + 2])
  }

  /** Tout révéler d'emblée (mode prove — pas de brouillard). */
  revealAll(): void {
    for (let i = 0; i < this.graph.nodes.length; i++) {
      if (this.revealed[i]) continue
      this.revealed[i] = true
      this.revealScale[i] = 1
      this.ensureLabel(i)
    }
  }

  /** Révélation en cascade depuis un nœud d'origine (entrée d'un niveau prove). */
  revealCascade(origin: number): void {
    const ox = this.target[origin * 3]
    const oy = this.target[origin * 3 + 1]
    const oz = this.target[origin * 3 + 2]
    let maxDist = 1e-6
    const dists = new Float32Array(this.graph.nodes.length)
    for (let i = 0; i < this.graph.nodes.length; i++) {
      dists[i] = Math.hypot(
        this.target[i * 3] - ox,
        this.target[i * 3 + 1] - oy,
        this.target[i * 3 + 2] - oz,
      )
      maxDist = Math.max(maxDist, dists[i])
    }
    for (let i = 0; i < this.graph.nodes.length; i++) {
      this.revealed[i] = true
      this.ensureLabel(i)
      const delay = 60 + (dists[i] / maxDist) * 850
      window.setTimeout(() => {
        this.ctx.addTween({ dur: 380, step: (k) => (this.revealScale[i] = k) })
      }, delay)
    }
  }

  /** Éclosion d'un nœud : apparaît sur son parent puis glisse vers sa place. */
  reveal(i: number, from: number | null): void {
    if (this.revealed[i]) return
    this.revealed[i] = true
    this.ensureLabel(i)
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

  private ensureLabel(i: number): void {
    if (this.labels[i] === null && this.labelTexts[i] !== '') {
      const sprite = labelSprite(this.labelTexts[i])
      this.labels[i] = sprite
      this.ctx.scene.add(sprite)
    }
  }

  /** Flash bref d'un nœud (pas joué, arrivée). */
  flashNode(i: number): void {
    this.flashT[i] = performance.now()
  }

  /** Balayage : les nœuds de l'ensemble flashent en s'éloignant de l'origine. */
  sweep(nodes: Iterable<number>, origin: number): void {
    const now = performance.now()
    const ox = this.display[origin * 3]
    const oy = this.display[origin * 3 + 1]
    const oz = this.display[origin * 3 + 2]
    let maxDist = 1e-6
    const list = [...nodes]
    const dists = list.map((i) =>
      Math.hypot(this.display[i * 3] - ox, this.display[i * 3 + 1] - oy, this.display[i * 3 + 2] - oz),
    )
    for (const d of dists) maxDist = Math.max(maxDist, d)
    list.forEach((i, k) => (this.flashT[i] = now + (dists[k] / maxDist) * 450))
  }

  /** Lumière voyageant le long d'une arête (pas joué). */
  travelEdge(e: number, tint: THREE.Color = color.edgeAccent): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.softTexture,
        color: tint,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    )
    sprite.scale.setScalar(0.75)
    this.ctx.scene.add(sprite)
    const { from, to } = this.graph.edges[e]
    this.ctx.addTween({
      dur: 280,
      step: (k) => {
        sprite.position.set(
          this.display[from * 3] + (this.display[to * 3] - this.display[from * 3]) * k,
          this.display[from * 3 + 1] + (this.display[to * 3 + 1] - this.display[from * 3 + 1]) * k,
          this.display[from * 3 + 2] + (this.display[to * 3 + 2] - this.display[from * 3 + 2]) * k,
        )
      },
      done: () => {
        sprite.removeFromParent()
        sprite.material.dispose()
      },
    })
  }

  /** Onde de choc (violation atteinte). */
  shockwave(i: number, tint: THREE.Color = color.violating): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: ringTexture(),
        color: tint,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    )
    sprite.position.set(this.display[i * 3], this.display[i * 3 + 1], this.display[i * 3 + 2])
    this.ctx.scene.add(sprite)
    this.ctx.addTween({
      dur: 600,
      step: (k) => {
        sprite.scale.setScalar(0.5 + k * 7)
        sprite.material.opacity = 0.9 * (1 - k)
      },
      done: () => {
        sprite.removeFromParent()
        sprite.material.map?.dispose()
        sprite.material.dispose()
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
        const sprite = labelSprite(this.graph.edges[e].action, edgeLabelColor, 0.009)
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
    // Pool de pulses circulant sur les arêtes CTI (plafonné).
    this.ctiList = [...(styles.ctiEdges ?? [])].slice(0, 24)
    while (this.ctiMovers.length < this.ctiList.length) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.softTexture,
          color: color.edgeCti,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      )
      sprite.scale.setScalar(0.55)
      this.ctx.scene.add(sprite)
      this.ctiMovers.push(sprite)
    }
    this.ctiMovers.forEach((s, k) => (s.visible = k < this.ctiList.length))
    this.applyStyles()
  }

  private applyStyles(): void {
    const styles = this.styles
    for (let i = 0; i < this.graph.nodes.length; i++) {
      this.tmpColor.copy(styles.overrides?.get(i) ?? this.nodeColors[i])
      if (styles.frontier.has(i)) this.tmpColor.lerp(color.frontier, 0.55)
      if (i === styles.highlight) this.tmpColor.lerp(color.selected, 0.45)
      if (styles.dimmed?.has(i)) this.tmpColor.lerp(color.background, 0.62)
      // La région reste lisible même sur un état fantôme (appliquée après).
      if (styles.region?.has(i)) this.tmpColor.lerp(color.region, 0.45)
      if (i === this.selected) this.tmpColor.lerp(color.selected, 0.5)
      this.nodesMesh.setColorAt(i, this.tmpColor)
      this.glowMesh.setColorAt(i, this.tmpColor)
      const label = this.labels[i]
      if (label !== null)
        (label.material as THREE.SpriteMaterial).color.setScalar(styles.dimmed?.has(i) ? 0.4 : 1)
    }
    this.nodesMesh.instanceColor!.needsUpdate = true
    this.glowMesh.instanceColor!.needsUpdate = true

    const edgeColors = this.edgeGeom.getAttribute('color') as THREE.BufferAttribute
    for (let e = 0; e < this.graph.edges.length; e++) {
      const c = this.edgeColor(e)
      for (const v of [0, 1]) edgeColors.setXYZ(e * 2 + v, c.r, c.g, c.b)
      this.arrowsMesh.setColorAt(e, c)
    }
    edgeColors.needsUpdate = true
    this.arrowsMesh.instanceColor!.needsUpdate = true
  }

  private edgeColor(e: number): THREE.Color {
    const s = this.styles
    if (s.ctiEdges?.has(e)) return color.edgeCti
    if (s.traceEdges.has(e)) return color.edgeAccent
    if (this.selected !== null && this.graph.edges[e].from === this.selected) return color.edgeAccent
    if (s.enabledEdges.has(e)) return this.tmpColor.copy(color.edgeAccent).multiplyScalar(0.55)
    return this.tmpColor.copy(color.edgeBase).multiplyScalar(0.22)
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
    const camera = this.ctx.camera
    // Décalage des étiquettes : au-dessus du nœud, dans le plan caméra.
    const labelUp = this.tmpA.copy(UP).applyQuaternion(camera.quaternion).multiplyScalar(0.58)

    for (let i = 0; i < graph.nodes.length; i++) {
      let s = this.revealed[i] ? this.revealScale[i] : 0
      if (i === this.styles.current) s *= 1.35
      else if (this.styles.frontier.has(i)) s *= 1 + 0.13 * Math.sin(time * 0.005 + i * 1.7)
      if (i === this.styles.highlight) s *= 1.25
      if (this.styles.dimmed?.has(i)) s *= 0.55
      if (i === this.selected) s *= 1.3
      const flashDt = time - this.flashT[i]
      if (flashDt > 0 && flashDt < 350) s *= 1 + 0.5 * (1 - flashDt / 350)
      dummy.position.set(this.display[i * 3], this.display[i * 3 + 1], this.display[i * 3 + 2])
      dummy.quaternion.identity()
      dummy.scale.setScalar(Math.max(s, 1e-4))
      dummy.updateMatrix()
      this.nodesMesh.setMatrixAt(i, dummy.matrix)

      // Lueur néon : plan billboardé, ~2.6× la sphère.
      dummy.quaternion.copy(camera.quaternion)
      dummy.scale.setScalar(Math.max(s * NODE_RADIUS * 2.6 * 2, 1e-4))
      dummy.updateMatrix()
      this.glowMesh.setMatrixAt(i, dummy.matrix)

      const label = this.labels[i]
      if (label !== null) {
        label.position.set(
          this.display[i * 3] + labelUp.x,
          this.display[i * 3 + 1] + labelUp.y,
          this.display[i * 3 + 2] + labelUp.z,
        )
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
    this.glowMesh.instanceMatrix.needsUpdate = true

    // Arêtes en retrait des nœuds + pointe de flèche orientée vers la cible.
    for (let e = 0; e < graph.edges.length; e++) {
      const { from, to } = graph.edges[e]
      const visible = this.revealed[from] && this.revealed[to] && from !== to
      this.tmpA.set(this.display[from * 3], this.display[from * 3 + 1], this.display[from * 3 + 2])
      this.tmpB.set(this.display[to * 3], this.display[to * 3 + 1], this.display[to * 3 + 2])
      this.tmpDir.subVectors(this.tmpB, this.tmpA)
      const len = this.tmpDir.length()
      if (!visible || len < EDGE_INSET * 2.2) {
        // Arête cachée ou dégénérée : ligne réduite à un point, cône escamoté.
        for (let a = 0; a < 3; a++) {
          this.edgePos[e * 6 + a] = this.tmpA.getComponent(a)
          this.edgePos[e * 6 + 3 + a] = this.tmpA.getComponent(a)
        }
        dummy.position.copy(this.tmpA)
        dummy.scale.setScalar(1e-4)
        dummy.updateMatrix()
        this.arrowsMesh.setMatrixAt(e, dummy.matrix)
        continue
      }
      this.tmpDir.divideScalar(len)
      const start = this.tmpA.addScaledVector(this.tmpDir, EDGE_INSET)
      const end = this.tmpB.addScaledVector(this.tmpDir, -(EDGE_INSET + ARROW_LEN))
      for (let a = 0; a < 3; a++) {
        this.edgePos[e * 6 + a] = start.getComponent(a)
        this.edgePos[e * 6 + 3 + a] = end.getComponent(a)
      }
      dummy.position.copy(end).addScaledVector(this.tmpDir, ARROW_LEN / 2)
      dummy.quaternion.setFromUnitVectors(UP, this.tmpDir)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      this.arrowsMesh.setMatrixAt(e, dummy.matrix)

      const sprite = this.edgeLabels.get(e)
      if (sprite !== undefined) {
        sprite.position.lerpVectors(start, end, 0.5)
        sprite.position.y += 0.16
        sprite.visible = true
      }
    }
    this.edgeGeom.getAttribute('position').needsUpdate = true
    this.arrowsMesh.instanceMatrix.needsUpdate = true

    // Pulsation des CTI : l'œil est attiré vers l'erreur d'induction.
    const cti = this.styles.ctiEdges
    if (cti !== undefined && cti.size > 0) {
      const k = 0.6 + 0.4 * Math.sin(time * 0.006)
      const edgeColors = this.edgeGeom.getAttribute('color') as THREE.BufferAttribute
      for (const e of cti) {
        this.tmpColor.copy(color.edgeCti).multiplyScalar(k)
        for (const v of [0, 1])
          edgeColors.setXYZ(e * 2 + v, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b)
        this.arrowsMesh.setColorAt(e, this.tmpColor)
      }
      edgeColors.needsUpdate = true
      this.arrowsMesh.instanceColor!.needsUpdate = true
    }

    // Pulses des fuites : petites lumières roses circulant sur les arêtes CTI.
    this.ctiMovers.forEach((sprite, k) => {
      if (k >= this.ctiList.length) return
      const { from, to } = graph.edges[this.ctiList[k]]
      const t = (time * 0.0012 + k * 0.37) % 1
      sprite.position.set(
        this.display[from * 3] + (this.display[to * 3] - this.display[from * 3]) * t,
        this.display[from * 3 + 1] + (this.display[to * 3 + 1] - this.display[from * 3 + 1]) * t,
        this.display[from * 3 + 2] + (this.display[to * 3 + 2] - this.display[from * 3 + 2]) * t,
      )
    })

    const cur = this.styles.current
    this.halo.visible = cur !== null
    if (cur !== null) {
      this.halo.position.set(
        this.display[cur * 3],
        this.display[cur * 3 + 1],
        this.display[cur * 3 + 2],
      )
      const mat = this.halo.material as THREE.SpriteMaterial
      mat.color.copy(this.graph.nodes[cur].violating ? color.haloViolating : color.haloCurrent)
      mat.opacity = 0.55 + 0.25 * Math.sin(time * 0.004)
    }
  }
}
