import { Vector3, type BufferGeometry } from 'three'
import { clearMask, invertMask, moveGrab, sculptDab, snakeDab, startGrab, strokeContext, SCULPT_BRUSHES, type SculptBrush } from '@/domain/sculpt/brushes'
import { BLEND_MODES, blurDab, fillColor, gradientFill, paintDab, smearDab, type BlendMode } from '@/domain/paint/paint'
import { meanScale, partMatrix } from '@/domain/scene/editable'
import type { Part } from '@/domain/scene/model'
import { nearestVertex, refresh } from '@/shared/lib/meshOps'
import { TIPS, type Tip } from '@/shared/lib/brushShape'
import { symmetryCopies, transformDelta, type Axis, type Symmetry } from '@/shared/lib/symmetry'

type Args = Record<string, unknown>
type RGB = [number, number, number]

const isVec = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')
const num = (v: unknown, def: number, min: number, max: number) => (typeof v === 'number' ? Math.min(max, Math.max(min, v)) : def)
const color = (v: unknown) => {
  if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error('El color va como #rrggbb.')
  return v.toLowerCase()
}
const tipOf = (v: unknown): Tip => ((TIPS as readonly unknown[]).includes(v) ? (v as Tip) : 'suave')

/** Simetría desde los argumentos: `mirror: true` (= X) o `symmetry: { x, y, z, radial, axis }`. */
export function symmetryOf(args: Args): Symmetry {
  const s = (args.symmetry ?? {}) as Record<string, unknown>
  return {
    x: Boolean(s.x ?? args.mirror),
    y: Boolean(s.y),
    z: Boolean(s.z),
    radial: num(s.radial, 1, 1, 16),
    axis: (['x', 'y', 'z'].includes(String(s.axis)) ? s.axis : 'y') as Axis,
  }
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
export function sculptFromTool(g: BufferGeometry, part: Part, args: Args): void {
  if (!(SCULPT_BRUSHES as readonly unknown[]).includes(args.brush)) throw new Error(`Pincel inválido. Opciones: ${SCULPT_BRUSHES.join(', ')}.`)
  const brush = args.brush as SculptBrush
  const tip = tipOf(args.tip)
  const angle = num(args.angle, 0, 0, 360)
  const strength = num(args.strength, 0.5, 0.01, 1)
  const sym = symmetryOf(args)
  const inv = partMatrix(part).invert()
  const radius = num(args.size, 0.15, 0.01, 1) / meanScale(part)
  const local = points(args).map((p) => p.applyMatrix4(inv))

  if (brush === 'arrastrar' || brush === 'gancho') {
    if (!isVec(args.move)) throw new Error(`${brush} necesita move: [dx, dy, dz] en metros.`)
    const start = nearestVertex(g, local[0])
    const world0 = local[0].clone().applyMatrix4(partMatrix(part))
    const delta = world0.clone().add(new Vector3(...args.move)).applyMatrix4(inv).sub(local[0])
    const copies = symmetryCopies(start.point, start.normal, sym, radius * 0.35)
    if (brush === 'arrastrar') {
      for (const c of copies) moveGrab(g, startGrab(g, { center: c.center, normal: c.normal, radius, tip, angle }), transformDelta(delta, c.matrix))
    } else {
      // Gancho: en pasos chicos, moviendo el centro con la punta.
      const steps = Math.max(1, Math.ceil(delta.length() / (radius * 0.2)))
      const step = delta.clone().divideScalar(steps)
      const centers = copies.map((c) => c.center.clone())
      for (let i = 0; i < steps; i++) {
        copies.forEach((c, k) => {
          const d = transformDelta(step, c.matrix)
          snakeDab(g, { center: centers[k], normal: c.normal, radius, tip, angle }, d, strength)
          centers[k].add(d)
        })
      }
    }
    refresh(g, true, false)
    return
  }

  const ctx = brush === 'capa' ? strokeContext(g) : undefined
  for (const p of resample(local, radius * 0.3)) {
    const v = nearestVertex(g, p)
    for (const c of symmetryCopies(v.point, v.normal, sym, radius * 0.35)) {
      sculptDab(g, brush, { center: c.center, normal: c.normal, radius, tip, angle: c.flipped ? 180 - angle : angle, strength, invert: Boolean(args.invert) }, ctx)
    }
    refresh(g, brush !== 'mascara', false, brush === 'mascara')
  }
}

/** Trazo de pintura que pide Claude. */
export function paintFromTool(g: BufferGeometry, part: Part, args: Args): void {
  const tool = String(args.tool ?? 'pincel')
  if (!['pincel', 'aerografo', 'difuminar', 'suavizar'].includes(tool)) throw new Error('tool: pincel, aerografo, difuminar o suavizar.')
  const erase = Boolean(args.erase)
  const c = erase ? '#ffffff' : tool === 'difuminar' || tool === 'suavizar' ? '#ffffff' : color(args.color)
  const blend = ((BLEND_MODES as readonly unknown[]).includes(args.blend) ? args.blend : 'mezclar') as BlendMode
  const tip = tipOf(args.tip)
  const angle = num(args.angle, 0, 0, 360)
  const strength = num(args.strength, 0.85, 0.01, 1)
  const softness = num(args.softness, 0.4, 0, 1)
  const sym = symmetryOf(args)
  const inv = partMatrix(part).invert()
  const radius = num(args.size, 0.08, 0.005, 1) / meanScale(part)
  const carry: (RGB | null)[] = []
  for (const p of resample(points(args).map((x) => x.applyMatrix4(inv)), radius * 0.3)) {
    const v = nearestVertex(g, p)
    symmetryCopies(v.point, v.normal, sym, radius * 0.35).forEach((cp, k) => {
      const shape = { center: cp.center, normal: cp.normal, radius, tip, angle: cp.flipped ? 180 - angle : angle, softness }
      if (tool === 'difuminar') carry[k] = smearDab(g, shape, carry[k] ?? null, strength)
      else if (tool === 'suavizar') blurDab(g, shape, strength)
      else paintDab(g, { ...shape, color: c, blend: erase ? 'mezclar' : blend, opacity: tool === 'aerografo' ? strength * 0.3 : strength })
    })
  }
  refresh(g, false, true)
}

/** Degradado entre dos puntos del mundo. */
export function gradientFromTool(g: BufferGeometry, part: Part, args: Args): void {
  if (!isVec(args.from) || !isVec(args.to)) throw new Error('from y to: [x, y, z] en el mundo.')
  const inv = partMatrix(part).invert()
  const blend = ((BLEND_MODES as readonly unknown[]).includes(args.blend) ? args.blend : 'mezclar') as BlendMode
  const base = Float32Array.from(g.attributes.color.array as ArrayLike<number>)
  gradientFill(g, base, new Vector3(...args.from).applyMatrix4(inv), new Vector3(...args.to).applyMatrix4(inv), color(args.color), color(args.color2 ?? '#ffffff'), blend, num(args.strength, 1, 0, 1))
  refresh(g, false, true)
}

export function fillFromTool(g: BufferGeometry, args: Args): void {
  fillColor(g, color(args.color))
  refresh(g, false, true)
}

export function maskFromTool(g: BufferGeometry, args: Args): void {
  if (args.action === 'invertir') invertMask(g)
  else if (args.action === 'borrar') clearMask(g)
  else throw new Error('action: invertir o borrar.')
  refresh(g, false, false, true)
}

