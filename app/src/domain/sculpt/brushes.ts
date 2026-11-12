import { Vector3, type BufferGeometry } from 'three'
import { neighbors, ensureMask } from '@/shared/lib/meshOps'
import { shapeWeights, type BrushShape } from '@/shared/lib/brushShape'

export const SCULPT_BRUSHES = [
  'sumar', 'quitar', 'arcilla', 'capa', 'aplanar', 'suavizar', 'inflar', 'pellizcar', 'pliegue', 'arrastrar', 'gancho', 'cortar', 'mascara',
] as const
export type SculptBrush = (typeof SCULPT_BRUSHES)[number]

/** Pinceles que se aplican de a pinceladas (arrastrar y gancho mueven con el mouse). */
export type DabBrush = Exclude<SculptBrush, 'arrastrar' | 'gancho'>

export interface Dab extends BrushShape {
  /** 0..1 */
  strength: number
  /** Alt: hace lo contrario (quitar en vez de sumar, borrar máscara…). */
  invert?: boolean
}

/** Estado de un trazo (para Capa: recuerda cómo estaba la superficie al empezar). */
export interface StrokeContext {
  orig: Float32Array
  origNormal: Float32Array
  layer: Float32Array
}

export function strokeContext(g: BufferGeometry): StrokeContext {
  return {
    orig: Float32Array.from(g.attributes.position.array as ArrayLike<number>),
    origNormal: Float32Array.from(g.attributes.normal.array as ArrayLike<number>),
    layer: new Float32Array(g.attributes.position.count),
  }
}

/** Aplica una pincelada de esculpir. Devuelve cuántos vértices tocó. */
export function sculptDab(g: BufferGeometry, brush: DabBrush, dab: Dab, ctx?: StrokeContext): number {
  if (brush === 'mascara') return maskDab(g, dab)
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const shape = brush === 'cortar' && dab.tip === 'suave' ? { ...dab, tip: 'dura' as const } : dab
  const hits = shapeWeights(g, shape, { mask: true })
  if (hits.length === 0) return 0
  const sign = dab.invert ? -1 : 1
  const k = dab.strength * dab.radius * 0.25 * sign
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

  if (brush === 'capa') {
    if (!ctx) return 0
    // Sube (o baja con Alt) hasta una altura fija respecto de cómo estaba al empezar el trazo: queda una "capa" pareja.
    const height = dab.radius * 0.35 * dab.strength * sign
    for (const { index: i, w } of hits) {
      const target = height
      const cur = ctx.layer[i]
      const next = Math.abs(target) > Math.abs(cur) ? cur + (target - cur) * Math.min(1, w * 0.6) : cur
      ctx.layer[i] = next
      const j = i * 3
      pos.setXYZ(i, ctx.orig[j] + ctx.origNormal[j] * next, ctx.orig[j + 1] + ctx.origNormal[j + 1] * next, ctx.orig[j + 2] + ctx.origNormal[j + 2] * next)
    }
    return hits.length
  }

  // Plano promedio debajo del pincel (aplanar y arcilla).
  const plane = new Vector3()
  if (brush === 'aplanar' || brush === 'arcilla') {
    let sw = 0
    for (const { index, w } of hits) { plane.x += pos.getX(index) * w; plane.y += pos.getY(index) * w; plane.z += pos.getZ(index) * w; sw += w }
    plane.divideScalar(sw)
    if (brush === 'arcilla') plane.addScaledVector(n, Math.abs(k) * 0.6 * sign)
  }

  for (const { index: i, w } of hits) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    switch (brush) {
      case 'sumar': x += n.x * k * w; y += n.y * k * w; z += n.z * k * w; break
      case 'quitar': x -= n.x * k * w; y -= n.y * k * w; z -= n.z * k * w; break
      case 'cortar': x -= n.x * k * w * 2.5; y -= n.y * k * w * 2.5; z -= n.z * k * w * 2.5; break
      case 'inflar': x += nor.getX(i) * k * w; y += nor.getY(i) * k * w; z += nor.getZ(i) * k * w; break
      case 'aplanar': {
        const d = (x - plane.x) * n.x + (y - plane.y) * n.y + (z - plane.z) * n.z
        const t = d * w * dab.strength * 0.6
        x -= n.x * t; y -= n.y * t; z -= n.z * t
        break
      }
      case 'arcilla': {
        // Rellena hasta el plano (que está un poco arriba): tiras de arcilla planas.
        const d = (plane.x - x) * n.x + (plane.y - y) * n.y + (plane.z - z) * n.z
        if (sign > 0 ? d > 0 : d < 0) { const t = d * w * dab.strength * 0.7; x += n.x * t; y += n.y * t; z += n.z * t }
        break
      }
      case 'pellizcar':
      case 'pliegue': {
        const dx = dab.center.x - x, dy = dab.center.y - y, dz = dab.center.z - z
        const h = dx * n.x + dy * n.y + dz * n.z
        const t = w * dab.strength * (brush === 'pliegue' ? 0.3 : 0.18)
        x += (dx - n.x * h) * t; y += (dy - n.y * h) * t; z += (dz - n.z * h) * t
        if (brush === 'pliegue') { x -= n.x * k * w * 0.8; y -= n.y * k * w * 0.8; z -= n.z * k * w * 0.8 }
        break
      }
    }
    pos.setXYZ(i, x, y, z)
  }
  return hits.length
}

/** Máscara: protege zonas (los demás pinceles no las tocan). Alt borra. */
function maskDab(g: BufferGeometry, dab: Dab): number {
  ensureMask(g)
  const mask = g.attributes.mask
  const hits = shapeWeights(g, dab)
  for (const { index, w } of hits) {
    const v = mask.getX(index) + (dab.invert ? -1 : 1) * w * Math.max(0.2, dab.strength)
    mask.setX(index, Math.min(1, Math.max(0, v)))
  }
  return hits.length
}

export function invertMask(g: BufferGeometry): void {
  ensureMask(g)
  const m = g.attributes.mask
  for (let i = 0; i < m.count; i++) m.setX(i, 1 - m.getX(i))
}

export function clearMask(g: BufferGeometry): void {
  ensureMask(g)
  ;(g.attributes.mask.array as Float32Array).fill(0)
}

/** Arrastrar: se toman los pesos al empezar y se mueve todo junto. */
export interface Grab {
  hits: { index: number; w: number; x: number; y: number; z: number }[]
}

export function startGrab(g: BufferGeometry, shape: BrushShape): Grab {
  const pos = g.attributes.position
  return { hits: shapeWeights(g, shape, { mask: true }).map(({ index, w }) => ({ index, w, x: pos.getX(index), y: pos.getY(index), z: pos.getZ(index) })) }
}

export function moveGrab(g: BufferGeometry, grab: Grab, delta: Vector3): void {
  const pos = g.attributes.position
  for (const h of grab.hits) pos.setXYZ(h.index, h.x + delta.x * h.w, h.y + delta.y * h.w, h.z + delta.z * h.w)
}

/** Gancho: arrastra lo que está bajo el pincel en cada paso (estira como una serpiente). */
export function snakeDab(g: BufferGeometry, shape: BrushShape, delta: Vector3, strength: number): void {
  const pos = g.attributes.position
  for (const { index: i, w } of shapeWeights(g, shape, { mask: true })) {
    const t = w * Math.max(0.3, strength)
    pos.setXYZ(i, pos.getX(i) + delta.x * t, pos.getY(i) + delta.y * t, pos.getZ(i) + delta.z * t)
  }
}
