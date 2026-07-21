import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { hex, particleColors } from './palette'

/** Fond de particules pastel (identité portfolio) : statique, un seul Points. */
function makeStarfield(count = 420): THREE.Points {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  let seed = 1337
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < count; i++) {
    // Coquille sphérique lointaine, hors de la zone de jeu.
    const r = 45 + rand() * 70
    const theta = rand() * Math.PI * 2
    const z = rand() * 2 - 1
    const s = Math.sqrt(1 - z * z)
    positions[i * 3] = r * s * Math.cos(theta)
    positions[i * 3 + 1] = r * z
    positions[i * 3 + 2] = r * s * Math.sin(theta)
    const [cr, cg, cb] = particleColors[Math.floor(rand() * particleColors.length)]
    colors[i * 3] = cr
    colors[i * 3 + 1] = cg
    colors[i * 3 + 2] = cb
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const points = new THREE.Points(
    geom,
    new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      fog: false,
    }),
  )
  points.frustumCulled = false
  return points
}

export interface Tween {
  readonly dur: number
  step(k: number): void // k ∈ [0,1], easing déjà appliqué
  done?(): void
}

/**
 * Contexte three.js minimal : caméra orbitale, pixelRatio plafonné,
 * pas d'ombres ni de post-processing. La boucle rAF ne fait que rendre
 * une scène instanciée triviale — le layout, lui, est figé.
 */
export class SceneCtx {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly controls: OrbitControls
  onFrame?: (time: number) => void

  private tweens: { t0: number; tween: Tween }[] = []

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(hex.background)
    this.scene.fog = new THREE.FogExp2(hex.fog, 0.009) // indice de profondeur bon marché
    this.scene.add(makeStarfield())

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      500,
    )
    this.camera.position.set(0, 5, 22)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08

    window.addEventListener('resize', () => {
      const w = container.clientWidth
      const h = container.clientHeight
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(w, h)
    })

    this.renderer.setAnimationLoop((time) => this.frame(time))
  }

  addTween(tween: Tween): void {
    this.tweens.push({ t0: performance.now(), tween })
  }

  /** Impulsion caméra brève (un pas est joué). */
  punch(): void {
    const start = this.camera.position.clone()
    this.addTween({
      dur: 160,
      step: (k) => {
        this.camera.position.lerpVectors(start, this.controls.target, 0.03 * Math.sin(k * Math.PI))
      },
    })
  }

  /** Secousse courte de la cible caméra (violation). */
  shake(amplitude = 0.35): void {
    const base = this.controls.target.clone()
    this.addTween({
      dur: 320,
      step: (k) => {
        const a = amplitude * (1 - k)
        this.controls.target.set(
          base.x + (Math.random() - 0.5) * a,
          base.y + (Math.random() - 0.5) * a,
          base.z + (Math.random() - 0.5) * a,
        )
      },
      done: () => this.controls.target.copy(base),
    })
  }

  /** Cadre la caméra sur un graphe de rayon donné. */
  frameRadius(radius: number): void {
    const d = Math.max(radius * 1.85 + 5, 12)
    this.camera.position.set(0, radius * 0.32, d)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  /** Arrêt propre (changement de niveau). */
  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private frame(time: number): void {
    const now = performance.now()
    this.tweens = this.tweens.filter(({ t0, tween }) => {
      const k = Math.min((now - t0) / tween.dur, 1)
      tween.step(1 - (1 - k) ** 3) // ease-out cubique
      if (k >= 1) tween.done?.()
      return k < 1
    })
    this.controls.update()
    this.onFrame?.(time)
    this.renderer.render(this.scene, this.camera)
  }
}
