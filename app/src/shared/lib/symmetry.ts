import { Matrix4, Vector3 } from 'three'

export type Axis = 'x' | 'y' | 'z'

/** Simetría como en Blender: espejo en cualquier combinación de ejes + copias alrededor de un eje. */
export interface Symmetry {
  x: boolean
  y: boolean
  z: boolean
  /** Cantidad de copias radiales (1 = apagada). */
  radial: number
  axis: Axis
}

export const NO_SYMMETRY: Symmetry = { x: false, y: false, z: false, radial: 1, axis: 'y' }

const AXIS = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) }

/**
 * Las transformaciones (lineales, alrededor del origen de la parte) que generan cada copia del trazo.
 * La primera es siempre la identidad. Espejo X+Y+Z y radial 8 = hasta 64 copias.
 */
export function symmetryTransforms(sym: Symmetry): Matrix4[] {
  let list = [new Matrix4()]
  const n = Math.max(1, Math.min(16, Math.round(sym.radial)))
  if (n > 1) {
    const rot = Array.from({ length: n }, (_, k) => new Matrix4().makeRotationAxis(AXIS[sym.axis], (2 * Math.PI * k) / n))
    list = rot
  }
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!sym[axis]) continue
    const flip = new Matrix4().makeScale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, axis === 'z' ? -1 : 1)
    list = list.flatMap((m) => [m, flip.clone().multiply(m)])
  }
  return list
}

export interface SymCopy {
  center: Vector3
  normal: Vector3
  /** Para transformar desplazamientos (arrastrar, gancho). */
  matrix: Matrix4
  /** El espejo da vuelta la punta. */
  flipped: boolean
}

/** Copias de una pincelada. Descarta las que caen casi en el mismo lugar que otra (sobre el eje). */
export function symmetryCopies(center: Vector3, normal: Vector3, sym: Symmetry, minDist: number): SymCopy[] {
  const out: SymCopy[] = []
  for (const m of symmetryTransforms(sym)) {
    const c = center.clone().applyMatrix4(m)
    if (out.some((o) => o.center.distanceTo(c) < minDist)) continue
    out.push({ center: c, normal: normal.clone().transformDirection(m), matrix: m, flipped: m.determinant() < 0 })
  }
  return out
}

/** Desplazamiento transformado por una copia (sin la parte de traslación, que no hay). */
export const transformDelta = (delta: Vector3, m: Matrix4) => delta.clone().applyMatrix4(m)
