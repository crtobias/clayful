import { Color, Vector3, type BufferGeometry } from 'three'

export const PAINT_TOOLS = ['pincel', 'balde', 'goma', 'gotero'] as const
export type PaintTool = (typeof PAINT_TOOLS)[number]

export interface PaintDab {
  center: Vector3
  normal: Vector3
  radius: number
  /** Color sRGB #rrggbb. */
  color: string
  /** 0 = borde duro, 1 = muy suave. */
  softness: number
  /** 0..1 cuánto tapa por pasada. */
  opacity: number
}

/** Pinta los vértices cerca del centro (color por vértice). */
export function paintDab(g: BufferGeometry, dab: PaintDab): number {
  const pos = g.attributes.position
  const col = g.attributes.color
  const nor = g.attributes.normal
  const target = new Color(dab.color)
  const r = dab.radius
  const inner = 1 - Math.max(0.02, dab.softness)
  let count = 0
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - dab.center.x, dy = pos.getY(i) - dab.center.y, dz = pos.getZ(i) - dab.center.z
    const d = Math.hypot(dx, dy, dz) / r
    if (d >= 1) continue
    // No pintar del otro lado de una pared fina.
    if (nor.getX(i) * dab.normal.x + nor.getY(i) * dab.normal.y + nor.getZ(i) * dab.normal.z < -0.2) continue
    const w = (d <= inner ? 1 : 1 - (d - inner) / (1 - inner)) * dab.opacity
    col.setXYZ(i, col.getX(i) + (target.r - col.getX(i)) * w, col.getY(i) + (target.g - col.getY(i)) * w, col.getZ(i) + (target.b - col.getZ(i)) * w)
    count++
  }
  return count
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

export function mirrorPaint(dab: PaintDab): PaintDab | null {
  if (Math.abs(dab.center.x) < dab.radius * 0.35) return null
  return { ...dab, center: new Vector3(-dab.center.x, dab.center.y, dab.center.z), normal: new Vector3(-dab.normal.x, dab.normal.y, dab.normal.z) }
}
