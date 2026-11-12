import type { BufferGeometry } from 'three'
import { Vector3 } from 'three'
import { neighbors } from '@/shared/lib/meshOps'

export const SCULPT_BRUSHES = ['sumar', 'quitar', 'aplanar', 'suavizar', 'inflar', 'pellizcar', 'arrastrar', 'cortar'] as const
export type SculptBrush = (typeof SCULPT_BRUSHES)[number]

export const TIPS = ['suave', 'dura', 'cuadrada', 'triangulo', 'linea'] as const
export type Tip = (typeof TIPS)[number]

/** Todo en el espacio local de la parte. */
export interface Dab {
  center: Vector3
  normal: Vector3
  radius: number
  /** 0..1 */
  strength: number
  tip: Tip
  /** Giro de la punta en grados (para las que no son redondas). */
  angle: number
}

/** Base del plano tangente: u, v perpendiculares a la normal, girados `angle` grados. */
export function tangentBasis(normal: Vector3, angle: number): [Vector3, Vector3] {
  const ref = Math.abs(normal.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
  const u = new Vector3().crossVectors(ref, normal).normalize()
  const v = new Vector3().crossVectors(normal, u).normalize()
  const a = (angle * Math.PI) / 180
  const cu = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a))
  const cv = v.clone().multiplyScalar(Math.cos(a)).addScaledVector(u, -Math.sin(a))
  return [cu, cv]
}

const TRI_DIRS = [90, 210, 330].map((d) => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)])

/**
 * Cuánto afecta la punta a un punto (0..1). du, dv: coordenadas en el plano tangente; h: altura sobre él.
 * Es pura para poder dibujar la misma forma en el cursor.
 */
export function tipWeight(tip: Tip, du: number, dv: number, h: number, r: number): number {
  if (Math.abs(h) > r) return 0
  const soft = (x: number) => (x >= 1 ? 0 : (1 - x * x) * (1 - x * x))
  const hard = (x: number) => (x >= 1 ? 0 : x < 0.8 ? 1 : (1 - x) / 0.2)
  switch (tip) {
    case 'suave': return soft(Math.hypot(du, dv, h * 0.5) / r)
    case 'dura': return hard(Math.hypot(du, dv, h * 0.5) / r)
    case 'cuadrada': return hard(Math.max(Math.abs(du), Math.abs(dv)) / r)
    case 'triangulo': return hard(Math.max(...TRI_DIRS.map(([x, y]) => du * x + dv * y)) / (r * 0.5))
    case 'linea': return hard(Math.max(Math.abs(du) / r, Math.abs(dv) / (r * 0.22)))
  }
}

/** Pesos de los vértices alcanzados por una pincelada. */
export function dabWeights(g: BufferGeometry, dab: Dab): { index: number; w: number }[] {
  const pos = g.attributes.position
  const [u, v] = tangentBasis(dab.normal, dab.angle)
  const out: { index: number; w: number }[] = []
  const r = dab.radius
  const c = dab.center
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - c.x, dy = pos.getY(i) - c.y, dz = pos.getZ(i) - c.z
    if (Math.abs(dx) > r * 1.2 || Math.abs(dy) > r * 1.2 || Math.abs(dz) > r * 1.2) continue
    const h = dx * dab.normal.x + dy * dab.normal.y + dz * dab.normal.z
    const du = dx * u.x + dy * u.y + dz * u.z
    const dv = dx * v.x + dy * v.y + dz * v.z
    const w = tipWeight(dab.tip, du, dv, h, r)
    if (w > 0) out.push({ index: i, w })
  }
  return out
}

/** Aplica una pincelada de esculpir. Devuelve cuántos vértices movió. */
export function sculptDab(g: BufferGeometry, brush: Exclude<SculptBrush, 'arrastrar'>, dab: Dab): number {
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const hits = dabWeights(g, brush === 'cortar' ? { ...dab, tip: dab.tip === 'suave' ? 'dura' : dab.tip } : dab)
  if (hits.length === 0) return 0
  const k = dab.strength * dab.radius * 0.25
  const n = dab.normal

  if (brush === 'suavizar') {
    const { offsets, list } = neighbors(g)
    const next = hits.map(({ index, w }) => {
      let x = 0, y = 0, z = 0
      const a = offsets[index], b = offsets[index + 1]
      for (let j = a; j < b; j++) { x += pos.getX(list[j]); y += pos.getY(list[j]); z += pos.getZ(list[j]) }
      const cnt = Math.max(1, b - a)
      const t = Math.min(1, w * dab.strength * 0.8)
      return [index, pos.getX(index) + (x / cnt - pos.getX(index)) * t, pos.getY(index) + (y / cnt - pos.getY(index)) * t, pos.getZ(index) + (z / cnt - pos.getZ(index)) * t]
    })
    for (const [i, x, y, z] of next) pos.setXYZ(i, x, y, z)
    return hits.length
  }

  let plane: Vector3 | null = null
  if (brush === 'aplanar') {
    plane = new Vector3()
    let sw = 0
    for (const { index, w } of hits) { plane.x += pos.getX(index) * w; plane.y += pos.getY(index) * w; plane.z += pos.getZ(index) * w; sw += w }
    plane.divideScalar(sw)
  }

  for (const { index: i, w } of hits) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    switch (brush) {
      case 'sumar': x += n.x * k * w; y += n.y * k * w; z += n.z * k * w; break
      case 'quitar': x -= n.x * k * w; y -= n.y * k * w; z -= n.z * k * w; break
      case 'cortar': x -= n.x * k * w * 2.5; y -= n.y * k * w * 2.5; z -= n.z * k * w * 2.5; break
      case 'inflar': x += nor.getX(i) * k * w; y += nor.getY(i) * k * w; z += nor.getZ(i) * k * w; break
      case 'aplanar': {
        const d = (x - plane!.x) * n.x + (y - plane!.y) * n.y + (z - plane!.z) * n.z
        const t = d * w * dab.strength * 0.6
        x -= n.x * t; y -= n.y * t; z -= n.z * t
        break
      }
      case 'pellizcar': {
        const dx = dab.center.x - x, dy = dab.center.y - y, dz = dab.center.z - z
        const h = dx * n.x + dy * n.y + dz * n.z
        const t = w * dab.strength * 0.18
        x += (dx - n.x * h) * t; y += (dy - n.y * h) * t; z += (dz - n.z * h) * t
        break
      }
    }
    pos.setXYZ(i, x, y, z)
  }
  return hits.length
}

/** Arrastrar: se toman los pesos al empezar y se mueve todo junto. */
export interface Grab {
  hits: { index: number; w: number; x: number; y: number; z: number }[]
}

export function startGrab(g: BufferGeometry, dab: Dab): Grab {
  const pos = g.attributes.position
  return { hits: dabWeights(g, dab).map(({ index, w }) => ({ index, w, x: pos.getX(index), y: pos.getY(index), z: pos.getZ(index) })) }
}

export function moveGrab(g: BufferGeometry, grab: Grab, delta: Vector3): void {
  const pos = g.attributes.position
  for (const h of grab.hits) pos.setXYZ(h.index, h.x + delta.x * h.w, h.y + delta.y * h.w, h.z + delta.z * h.w)
}

/** La misma pincelada del otro lado (espejo en X local). */
export function mirrorDab(dab: Dab): Dab | null {
  if (Math.abs(dab.center.x) < dab.radius * 0.35) return null
  return {
    ...dab,
    center: new Vector3(-dab.center.x, dab.center.y, dab.center.z),
    normal: new Vector3(-dab.normal.x, dab.normal.y, dab.normal.z),
    angle: 180 - dab.angle,
  }
}
