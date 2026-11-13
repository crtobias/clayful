import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, Vector3 } from 'three'

import { flyState } from './flyState'

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e'])
const SPEED = 3
const LOOK = 0.0035

type Orbit = { enabled: boolean; target: Vector3; update: () => void }

/**
 * Moverse como en Godot: W/A/S/D avanzan y van a los costados, Q/E bajan y suben, Shift = rápido.
 * Con el botón derecho apretado además se mira con el mouse; al soltar, la órbita sigue desde ahí.
 */
export function FlyControls() {
  const { camera, gl, controls } = useThree()
  const keys = useRef(new Set<string>())
  const fast = useRef(false)
  const focus = useRef(5)

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
    const kd = (e: KeyboardEvent) => key(e, true)
    const ku = (e: KeyboardEvent) => key(e, false)
    const menu = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('contextmenu', menu)
    // En captura: llega antes que los atajos del editor.
    window.addEventListener('keydown', kd, true)
    window.addEventListener('keyup', ku, true)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('contextmenu', menu)
      window.removeEventListener('keydown', kd, true)
      window.removeEventListener('keyup', ku, true)
    }
  }, [camera, gl, controls])

  const dir = useRef(new Vector3())
  useFrame((_, dt) => {
    if (keys.current.size === 0) return
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
