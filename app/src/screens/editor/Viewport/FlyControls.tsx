import { useEffect, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Box3, Euler, Sphere, Vector3, type Mesh, type PerspectiveCamera } from 'three'

import { flyState } from './flyState'

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e'])
const SPEED = 3
const LOOK = 0.0035

type Orbit = { enabled: boolean; target: Vector3; update: () => void }

const CENTER_EVENT = 'clayful:center'
/** Para el botón "Centrar" (fuera del Canvas). */
export const requestCenter = () => window.dispatchEvent(new Event(CENTER_EVENT))

interface Props {
  meshes: MutableRefObject<Map<string, Mesh>>
  selectedId: string | null
}

/**
 * Moverse como en Godot: W/A/S/D avanzan y van a los costados, Q/E bajan y suben, Shift = rápido.
 * Con el botón derecho apretado además se mira con el mouse; al soltar, la órbita sigue desde ahí.
 * La rueda avanza y retrocede (no hace zoom: no se traba al llegar al centro). F centra en lo elegido.
 */
export function FlyControls({ meshes, selectedId }: Props) {
  const { camera, gl, controls } = useThree()
  const keys = useRef(new Set<string>())
  const fast = useRef(false)
  const focus = useRef(5)
  const selection = useRef(selectedId)
  selection.current = selectedId
  /** Viaje suave al centrar: desde dónde, hacia dónde y cuánto falta. */
  const glide = useRef<{ from: Vector3; to: Vector3; fromT: Vector3; toT: Vector3; t: number } | null>(null)

  useEffect(() => {
    const el = gl.domElement
    const orbit = () => controls as unknown as Orbit | null
    const euler = new Euler(0, 0, 0, 'YXZ')

    const down = (e: PointerEvent) => {
      if (e.button !== 2) return
      e.preventDefault()
      flyState.flying = true
      const o = orbit()
      if (o) { focus.current = camera.position.distanceTo(o.target) || 5; o.enabled = false }
      try { el.setPointerCapture(e.pointerId) } catch { /* puntero sintético */ }
    }
    const move = (e: PointerEvent) => {
      if (!flyState.flying) return
      euler.setFromQuaternion(camera.quaternion)
      euler.y -= e.movementX * LOOK
      euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, euler.x - e.movementY * LOOK))
      camera.quaternion.setFromEuler(euler)
    }
    const up = (e: PointerEvent) => {
      if (e.button !== 2 || !flyState.flying) return
      flyState.flying = false
      const o = orbit()
      if (o) {
        const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
        o.target.copy(camera.position).addScaledVector(forward, focus.current)
        o.enabled = true
        o.update()
      }
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    const key = (e: KeyboardEvent, on: boolean) => {
      fast.current = e.shiftKey
      const k = e.key.toLowerCase()
      if (!MOVE_KEYS.has(k) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()
      if (on) keys.current.add(k)
      else keys.current.delete(k)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const o = orbit()
      const dist = o ? camera.position.distanceTo(o.target) : 5
      // Paso proporcional a lo lejos que mirás: igual de cómodo con un ratón de 60 cm que con una casa.
      const lines = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
      const step = Math.max(-0.5, Math.min(0.5, -lines * 0.0015)) * Math.max(0.2, dist) * (e.shiftKey ? 3 : 1)
      const d = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(step)
      camera.position.add(d)
      if (o) { o.target.add(d); o.update() }
      glide.current = null
    }
    const center = () => {
      const box = new Box3()
      const list = selection.current && meshes.current.get(selection.current) ? [meshes.current.get(selection.current)!] : [...meshes.current.values()]
      for (const m of list) box.expandByObject(m)
      const sphere = box.isEmpty() ? new Sphere(new Vector3(0, 0.5, 0), 1) : box.getBoundingSphere(new Sphere())
      const fov = ((camera as PerspectiveCamera).fov ?? 40) * Math.PI / 180
      const dist = Math.max(0.3, sphere.radius) / Math.sin(fov / 2) * 1.15
      const back = new Vector3(0, 0, 1).applyQuaternion(camera.quaternion)
      const o = orbit()
      glide.current = {
        from: camera.position.clone(), to: sphere.center.clone().addScaledVector(back, dist),
        fromT: o ? o.target.clone() : sphere.center.clone(), toT: sphere.center.clone(), t: 0,
      }
    }
    const kd = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !flyState.flying
        && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); center(); return }
      key(e, true)
    }
    const ku = (e: KeyboardEvent) => key(e, false)
    const menu = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('contextmenu', menu)
    el.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener(CENTER_EVENT, center)
    // En captura: llega antes que los atajos del editor.
    window.addEventListener('keydown', kd, true)
    window.addEventListener('keyup', ku, true)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('contextmenu', menu)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener(CENTER_EVENT, center)
      window.removeEventListener('keydown', kd, true)
      window.removeEventListener('keyup', ku, true)
    }
  }, [camera, gl, controls, meshes])

  const dir = useRef(new Vector3())
  useFrame((_, dt) => {
    const g = glide.current
    if (g) {
      g.t = Math.min(1, g.t + dt / 0.35)
      const e = 1 - (1 - g.t) ** 3
      camera.position.lerpVectors(g.from, g.to, e)
      const o = controls as unknown as Orbit | null
      if (o) { o.target.lerpVectors(g.fromT, g.toT, e); o.update() }
      if (g.t >= 1) glide.current = null
    }
    if (keys.current.size === 0) return
    glide.current = null
    const k = keys.current
    const d = dir.current.set((k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0), (k.has('e') ? 1 : 0) - (k.has('q') ? 1 : 0), (k.has('s') ? 1 : 0) - (k.has('w') ? 1 : 0))
    if (d.lengthSq() === 0) return
    // Adelante/costados según hacia dónde mirás; arriba/abajo siempre vertical.
    const up = d.y
    d.y = 0
    d.normalize().applyQuaternion(camera.quaternion)
    d.y += up
    d.multiplyScalar(SPEED * (fast.current ? 3 : 1) * Math.min(dt, 0.05))
    camera.position.add(d)
    // Sin el botón derecho, el punto de órbita viaja con la cámara (caminar por la escena).
    const o = controls as unknown as Orbit | null
    if (!flyState.flying && o) { o.target.add(d); o.update() }
  })
  return null
}
