import { Color, Vector3, type BufferGeometry } from 'three'
import { neighbors } from '@/shared/lib/meshOps'
import { shapeWeights, type BrushShape } from '@/shared/lib/brushShape'

export const PAINT_TOOLS = ['pincel', 'aerografo', 'difuminar', 'suavizar', 'degradado', 'balde', 'goma', 'gotero'] as const
export type PaintTool = (typeof PAINT_TOOLS)[number]

export const BLEND_MODES = ['mezclar', 'multiplicar', 'aclarar', 'oscurecer', 'sumar'] as const
export type BlendMode = (typeof BLEND_MODES)[number]

type RGB = [number, number, number]

export interface PaintDab extends BrushShape {
  /** Color sRGB #rrggbb. */
  color: string
  /** 0..1 cuánto tapa por pasada. */
  opacity: number
  blend: BlendMode
  /** Plantilla: color de cada vértice según una imagen (devuelve null si cae afuera). */
  sample?: (x: number, y: number, z: number) => RGB | null
}

/** Mezcla de colores (todo en espacio lineal). */
export function blendColor(mode: BlendMode, base: RGB, top: RGB): RGB {
  switch (mode) {
    case 'mezclar': return top
    case 'multiplicar': return [base[0] * top[0], base[1] * top[1], base[2] * top[2]]
    case 'aclarar': return [Math.max(base[0], top[0]), Math.max(base[1], top[1]), Math.max(base[2], top[2])]
    case 'oscurecer': return [Math.min(base[0], top[0]), Math.min(base[1], top[1]), Math.min(base[2], top[2])]
    case 'sumar': return [Math.min(1, base[0] + top[0]), Math.min(1, base[1] + top[1]), Math.min(1, base[2] + top[2])]
  }
}

const toRGB = (hex: string): RGB => { const c = new Color(hex); return [c.r, c.g, c.b] }

/** Pinta los vértices bajo el pincel (color por vértice). */
export function paintDab(g: BufferGeometry, dab: PaintDab): number {
  const pos = g.attributes.position
  const col = g.attributes.color
  const target = toRGB(dab.color)
  const hits = shapeWeights(g, dab, { facing: true })
  for (const { index: i, w } of hits) {
    const base: RGB = [col.getX(i), col.getY(i), col.getZ(i)]
    const src = dab.sample ? dab.sample(pos.getX(i), pos.getY(i), pos.getZ(i)) : target
    if (!src) continue
    const out = blendColor(dab.blend, base, src)
    const t = w * dab.opacity
    col.setXYZ(i, base[0] + (out[0] - base[0]) * t, base[1] + (out[1] - base[1]) * t, base[2] + (out[2] - base[2]) * t)
  }
  return hits.length
}

/** Color promedio bajo el pincel. */
export function averageColor(g: BufferGeometry, shape: BrushShape): RGB | null {
  const col = g.attributes.color
  const hits = shapeWeights(g, shape, { facing: true })
  if (hits.length === 0) return null
  let r = 0, gg = 0, b = 0, sw = 0
  for (const { index, w } of hits) { r += col.getX(index) * w; gg += col.getY(index) * w; b += col.getZ(index) * w; sw += w }
  return [r / sw, gg / sw, b / sw]
}

/** Difuminar: arrastra el color que traía el pincel. Devuelve el color que sigue arrastrando. */
export function smearDab(g: BufferGeometry, shape: BrushShape, carry: RGB | null, strength: number): RGB | null {
  const here = averageColor(g, shape)
  if (!carry) return here
  const col = g.attributes.color
  for (const { index: i, w } of shapeWeights(g, shape, { facing: true })) {
    const t = w * strength * 0.7
    col.setXYZ(i, col.getX(i) + (carry[0] - col.getX(i)) * t, col.getY(i) + (carry[1] - col.getY(i)) * t, col.getZ(i) + (carry[2] - col.getZ(i)) * t)
  }
  return here ? [carry[0] * 0.6 + here[0] * 0.4, carry[1] * 0.6 + here[1] * 0.4, carry[2] * 0.6 + here[2] * 0.4] : carry
}

/** Suavizar color: promedia con los vecinos (borra bordes duros). */
export function blurDab(g: BufferGeometry, shape: BrushShape, strength: number): void {
  const col = g.attributes.color
  const { offsets, list } = neighbors(g)
  const updates = shapeWeights(g, shape, { facing: true }).map(({ index, w }) => {
    let r = 0, gg = 0, b = 0
    const a = offsets[index], e = offsets[index + 1]
    for (let j = a; j < e; j++) { r += col.getX(list[j]); gg += col.getY(list[j]); b += col.getZ(list[j]) }
    const n = Math.max(1, e - a)
    const t = Math.min(1, w * strength)
    return [index, col.getX(index) + (r / n - col.getX(index)) * t, col.getY(index) + (gg / n - col.getY(index)) * t, col.getZ(index) + (b / n - col.getZ(index)) * t]
  })
  for (const [i, r, gg, b] of updates) col.setXYZ(i, r, gg, b)
}

/**
 * Degradado de `from` a `to` (puntos locales) entre dos colores, sobre los colores que había al empezar (`base`).
 * Se recalcula entero en cada movimiento, como en Blender.
 */
export function gradientFill(g: BufferGeometry, base: Float32Array, from: Vector3, to: Vector3, c1: string, c2: string, blend: BlendMode, opacity: number): void {
  const pos = g.attributes.position
  const col = g.attributes.color
  const a = toRGB(c1), b = toRGB(c2)
  const dir = to.clone().sub(from)
  const len2 = dir.lengthSq() || 1e-9
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, ((pos.getX(i) - from.x) * dir.x + (pos.getY(i) - from.y) * dir.y + (pos.getZ(i) - from.z) * dir.z) / len2))
    const top: RGB = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
    const j = i * 3
    const baseC: RGB = [base[j], base[j + 1], base[j + 2]]
    const out = blendColor(blend, baseC, top)
    col.setXYZ(i, baseC[0] + (out[0] - baseC[0]) * opacity, baseC[1] + (out[1] - baseC[1]) * opacity, baseC[2] + (out[2] - baseC[2]) * opacity)
  }
}

/** Balde: toda la parte de un color. */
export function fillColor(g: BufferGeometry, color: string): void {
  const c = new Color(color)
  const col = g.attributes.color
  for (let i = 0; i < col.count; i++) col.setXYZ(i, c.r, c.g, c.b)
}

/** Gotero: el color del vértice más cercano, como #rrggbb. */
export function pickColor(g: BufferGeometry, point: Vector3): string {
  const pos = g.attributes.position
  let best = 0, bestD = Infinity
  for (let i = 0; i < pos.count; i++) {
    const d = (pos.getX(i) - point.x) ** 2 + (pos.getY(i) - point.y) ** 2 + (pos.getZ(i) - point.z) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  const col = g.attributes.color
  return `#${new Color(col.getX(best), col.getY(best), col.getZ(best)).getHexString()}`
}
