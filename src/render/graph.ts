import * as THREE from 'three'
import type { Graph } from '../core/explore'
import type { SceneCtx } from './scene'

export interface Styles {
  readonly current: number
  readonly frontier: ReadonlySet<number> // successeurs cliquables
  readonly onTrace: ReadonlySet<number>
  readonly traceEdges: ReadonlySet<number>
  readonly enabledEdges: ReadonlySet<number>
}

const NODE = {
  base: new THREE.Color(0x4a5670),
  onTrace: new THREE.Color(0x9a7428), // or éteint — bien distinct de la frontière
  current: new THREE.Color(0xf2f6ff),
  frontier: new THREE.Color(0xff8c26), // orange vif pulsant = cliquable
  violating: new THREE.Color(0xff3b52),
}
const EDGE = {
  base: new THREE.Color(0x252c3d),
  enabled: new THREE.Color(0x8a5a20),
  trace: new THREE.Color(0xd9a441),
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

/**
 * Vue du graphe : une seule InstancedMesh pour les nœuds, un seul
 * LineSegments pour les arêtes. Brouillard de guerre : les nœuds non
 * révélés ont une échelle nulle, les arêtes non révélées sont dégénérées.
 * Les positions cibles viennent du layout figé ; seules les éclosions
 * (position parent → cible, échelle 0 → 1) sont animées.
 */
export class GraphView {
  private readonly graph: Graph
  private readonly target: Float32Array // positions du layout (figées)
  private readonly display: Float32Array // positions affichées (animées à l'éclosion)
  private readonly revealScale: Float32Array // 0 → 1 à l'éclosion
  readonly revealed: boolean[]

  private readonly nodesMesh: THREE.InstancedMesh
  private readonly edgeGeom: THREE.BufferGeometry
  private readonly edgePos: Float32Array
  private readonly halo: THREE.Sprite
  private readonly ctx: SceneCtx
  private styles: Styles = {
    current: 0,
    frontier: new Set(),
    onTrace: new Set(),
    traceEdges: new Set(),
    enabledEdges: new Set(),
  }
  private readonly dummy = new THREE.Object3D()
  private readonly raycaster = new THREE.Raycaster()

  constructor(ctx: SceneCtx, graph: Graph, positions: Float32Array) {
    this.ctx = ctx
    this.graph = graph
    this.target = positions
    this.display = positions.slice()
    const n = graph.nodes.length
    this.revealScale = new Float32Array(n)
    this.revealed = new Array(n).fill(false)

    this.nodesMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.32, 2),
      new THREE.MeshLambertMaterial(),
      n,
    )
    this.nodesMesh.frustumCulled = false
    for (let i = 0; i < n; i++) this.nodesMesh.setColorAt(i, NODE.base)
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

  /** Éclosion d'un nœud : apparaît sur son parent puis glisse vers sa place. */
  reveal(i: number, from: number | null): void {
    if (this.revealed[i]) return
    this.revealed[i] = true
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

  setStyles(styles: Styles): void {
    this.styles = styles
    const color = new THREE.Color()
    for (let i = 0; i < this.graph.nodes.length; i++) {
      if (this.graph.nodes[i].violating && this.revealed[i]) color.copy(NODE.violating)
      else if (i === styles.current) color.copy(NODE.current)
      else if (styles.frontier.has(i)) color.copy(NODE.frontier)
      else if (styles.onTrace.has(i)) color.copy(NODE.onTrace)
      else color.copy(NODE.base)
      this.nodesMesh.setColorAt(i, color)
    }
    this.nodesMesh.instanceColor!.needsUpdate = true

    const edgeColors = this.edgeGeom.getAttribute('color') as THREE.BufferAttribute
    for (let e = 0; e < this.graph.edges.length; e++) {
      const c = styles.traceEdges.has(e)
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
    this.raycaster.setFromCamera(ndc, this.ctx.camera)
    for (const hit of this.raycaster.intersectObject(this.nodesMesh)) {
      const i = hit.instanceId
      if (i !== undefined && this.revealed[i] && this.revealScale[i] > 0.5) return i
    }
    return null
  }

  private updateFrame(time: number): void {
    const { graph, dummy } = this
    // Matrices d'instances : tout est réécrit chaque frame — trivial à ces tailles.
    for (let i = 0; i < graph.nodes.length; i++) {
      let s = this.revealed[i] ? this.revealScale[i] : 0
      if (i === this.styles.current) s *= 1.35
      else if (this.styles.frontier.has(i)) s *= 1 + 0.13 * Math.sin(time * 0.005 + i * 1.7)
      dummy.position.set(this.display[i * 3], this.display[i * 3 + 1], this.display[i * 3 + 2])
      dummy.scale.setScalar(Math.max(s, 1e-4))
      dummy.updateMatrix()
      this.nodesMesh.setMatrixAt(i, dummy.matrix)
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

    const cur = this.styles.current
    this.halo.position.set(
      this.display[cur * 3],
      this.display[cur * 3 + 1],
      this.display[cur * 3 + 2],
    )
    const mat = this.halo.material as THREE.SpriteMaterial
    const violating = this.graph.nodes[cur].violating
    mat.color.set(violating ? 0xff3b52 : 0x6ec8ff)
    mat.opacity = 0.55 + 0.25 * Math.sin(time * 0.004)
  }
}
