import { Vector3, type BufferGeometry } from 'three'
import { mirrorDab, moveGrab, sculptDab, startGrab, SCULPT_BRUSHES, TIPS, type SculptBrush, type Tip } from '@/domain/sculpt/brushes'
import { fillColor, mirrorPaint, paintDab } from '@/domain/paint/paint'
import { meanScale, partMatrix } from '@/domain/scene/editable'
import type { Part } from '@/domain/scene/model'
import { nearestVertex, refresh } from '@/shared/lib/meshOps'

type Args = Record<string, unknown>

const isVec = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')
const num = (v: unknown, def: number, min: number, max: number) => (typeof v === 'number' ? Math.min(max, Math.max(min, v)) : def)
const color = (v: unknown) => {
  if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error('El color va como #rrggbb.')
  return v.toLowerCase()
}

function points(args: Args): Vector3[] {
  const raw = args.points
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(isVec)) throw new Error('points: lista de [x, y, z] en el mundo, sobre o cerca de la superficie.')
  return raw.map((p) => new Vector3(...p))
}

/** Puntos intermedios para que el trazo sea continuo. */
function resample(pts: Vector3[], spacing: number): Vector3[] {
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const steps = Math.max(1, Math.ceil(pts[i].distanceTo(pts[i - 1]) / spacing))
    for (let s = 1; s <= steps; s++) out.push(pts[i - 1].clone().lerp(pts[i], s / steps))
  }
  return out
}

/** Trazo de esculpir que pide Claude. Los puntos se pegan al vértice más cercano de la superficie. */
export function sculptFromTool(g: BufferGeometry, part: Part, args: Args): number {
  if (!(SCULPT_BRUSHES as readonly unknown[]).includes(args.brush)) throw new Error(`Pincel inválido. Opciones: ${SCULPT_BRUSHES.join(', ')}.`)
  const brush = args.brush as SculptBrush
  const tip = ((TIPS as readonly unknown[]).includes(args.tip) ? args.tip : 'suave') as Tip
  const size = num(args.size, 0.15, 0.01, 1)
  const strength = num(args.strength, 0.5, 0.01, 1)
  const inv = partMatrix(part).invert()
  const radius = size / meanScale(part)
  const local = points(args).map((p) => p.applyMatrix4(inv))

  if (brush === 'arrastrar') {
    if (!isVec(args.move)) throw new Error('arrastrar necesita move: [dx, dy, dz] en metros.')
    const start = nearestVertex(g, local[0])
    const grab = startGrab(g, { center: start.point, normal: start.normal, radius, strength: 1, tip, angle: 0 })
    const world0 = local[0].clone().applyMatrix4(partMatrix(part))
    const target = world0.clone().add(new Vector3(...args.move)).applyMatrix4(inv)
    moveGrab(g, grab, target.sub(local[0]))
  } else {
    for (const p of resample(local, radius * 0.3)) {
      const v = nearestVertex(g, p)
      const dab = { center: v.point, normal: v.normal, radius, strength, tip, angle: num(args.angle, 0, 0, 360) }
      sculptDab(g, brush, dab)
      const m = args.mirror ? mirrorDab(dab) : null
      if (m) sculptDab(g, brush, m)
      refresh(g, true, false)
    }
  }
  refresh(g, true, false)
  return local.length
}

/** Trazo de pintura que pide Claude. */
export function paintFromTool(g: BufferGeometry, part: Part, args: Args): number {
  const c = args.erase ? '#ffffff' : color(args.color)
  const size = num(args.size, 0.08, 0.005, 1)
  const inv = partMatrix(part).invert()
  const radius = size / meanScale(part)
  const local = points(args).map((p) => p.applyMatrix4(inv))
  for (const p of resample(local, radius * 0.3)) {
    const v = nearestVertex(g, p)
    const dab = { center: v.point, normal: v.normal, radius, color: c, softness: num(args.softness, 0.4, 0, 1), opacity: 0.85 }
    paintDab(g, dab)
    const m = args.mirror ? mirrorPaint(dab) : null
    if (m) paintDab(g, m)
  }
  refresh(g, false, true)
  return local.length
}

export function fillFromTool(g: BufferGeometry, args: Args): void {
  fillColor(g, color(args.color))
  refresh(g, false, true)
}
