import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

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

    this.scene.background = new THREE.Color(0x0b0e14)
    this.scene.fog = new THREE.FogExp2(0x0b0e14, 0.011) // indice de profondeur bon marché

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
