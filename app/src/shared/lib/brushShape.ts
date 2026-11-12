import { Vector3, type BufferGeometry } from 'three'

/** Formas de punta, compartidas por esculpir y pintar. */
export const TIPS = ['suave', 'dura', 'cuadrada', 'triangulo', 'linea'] as const
export type Tip = (typeof TIPS)[number]

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
 * Pura: la usa el pincel y también el dibujo del cursor (lo que ves es lo que hace).
 * `softness` (0..1) cambia la caída de la punta suave.
 */
export function tipWeight(tip: Tip, du: number, dv: number, h: number, r: number, softness?: number): number {
  if (Math.abs(h) > r) return 0
  const soft = (x: number) => {
    if (x >= 1) return 0
    if (softness === undefined) return (1 - x * x) * (1 - x * x)
    const inner = 1 - Math.max(0.02, softness)
    return x <= inner ? 1 : 1 - (x - inner) / (1 - inner)
  }
  const hard = (x: number) => (x >= 1 ? 0 : x < 0.8 ? 1 : (1 - x) / 0.2)
  switch (tip) {
    case 'suave': return soft(Math.hypot(du, dv, h * 0.5) / r)
    case 'dura': return hard(Math.hypot(du, dv, h * 0.5) / r)
    case 'cuadrada': return hard(Math.max(Math.abs(du), Math.abs(dv)) / r)
    case 'triangulo': return hard(Math.max(...TRI_DIRS.map(([x, y]) => du * x + dv * y)) / (r * 0.5))
    case 'linea': return hard(Math.max(Math.abs(du) / r, Math.abs(dv) / (r * 0.22)))
  }
}

/** Una pincelada: dónde, hacia dónde mira la superficie y qué forma tiene. Todo en espacio local. */
export interface BrushShape {
  center: Vector3
  normal: Vector3
  radius: number
  tip: Tip
  angle: number
  softness?: number
}

/**
 * Pesos de los vértices alcanzados. `facing` saltea los que miran para el otro lado (paredes finas);
 * `mask` (0..1 por vértice) protege zonas.
 */
export function shapeWeights(g: BufferGeometry, s: BrushShape, opts: { facing?: boolean; mask?: boolean } = {}): { index: number; w: number }[] {
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const mask = opts.mask && g.hasAttribute('mask') ? g.attributes.mask : null
  const [u, v] = tangentBasis(s.normal, s.angle)
  const out: { index: number; w: number }[] = []
  const r = s.radius
  const c = s.center
  const n = s.normal
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - c.x, dy = pos.getY(i) - c.y, dz = pos.getZ(i) - c.z
    if (Math.abs(dx) > r * 1.2 || Math.abs(dy) > r * 1.2 || Math.abs(dz) > r * 1.2) continue
    if (opts.facing && nor.getX(i) * n.x + nor.getY(i) * n.y + nor.getZ(i) * n.z < -0.2) continue
    const h = dx * n.x + dy * n.y + dz * n.z
    const du = dx * u.x + dy * u.y + dz * u.z
    const dv = dx * v.x + dy * v.y + dz * v.z
    let w = tipWeight(s.tip, du, dv, h, r, s.softness)
    if (mask) w *= 1 - mask.getX(i)
    if (w > 0) out.push({ index: i, w })
  }
  return out
}
