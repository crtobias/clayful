import { createBody, makeJelly, setMass, springsFromTriangles, type PhysicsWorld, type SoftBody } from './softbody'
import type { Sdf } from './sdf'

type V3 = [number, number, number]

export interface Sheet {
  positions: Float32Array
  index: Uint32Array
  /** En metros: el patrón de la tela queda del mismo tamaño en cualquier pieza. */
  uv: Float32Array
}

/** Densidad por defecto: celdas por lado de la tela (triángulos = 2·n²). */
export const DEFAULT_DENSITY = 50
export const DENSITY_RANGE: [number, number] = [24, 140]

/**
 * Una tela cuadriculada: `corner` + `u` (un borde) + `v` (el otro). `n` celdas por lado.
 * Un poquito de ruido en altura para que no caiga perfectamente simétrica (si no, no hace pliegues).
 */
export function sheetGrid(n: number, corner: V3, u: V3, v: V3, seed = 1): Sheet {
  const m = n + 1
  const positions = new Float32Array(m * m * 3)
  const uv = new Float32Array(m * m * 2)
  const lu = Math.hypot(...u), lv = Math.hypot(...v)
  const jitter = (Math.min(lu, lv) / n) * 0.15
  let r = seed
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647 - 0.5 }
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const a = i / n, b = j / n, k = j * m + i
      positions[k * 3] = corner[0] + u[0] * a + v[0] * b
      positions[k * 3 + 1] = corner[1] + u[1] * a + v[1] * b + rnd() * jitter
      positions[k * 3 + 2] = corner[2] + u[2] * a + v[2] * b
      uv[k * 2] = a * lu
      uv[k * 2 + 1] = b * lv
    }
  }
  const index = new Uint32Array(n * n * 6)
  let t = 0
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * m + i, b = a + 1, c = a + m, d = c + 1
      // Diagonal alternada: la tela se dobla igual para todos lados.
      if ((i + j) % 2) index.set([a, c, b, b, c, d], t)
      else index.set([a, c, d, a, d, b], t)
      t += 6
    }
  }
  return { positions, index, uv }
}

/** Peso de la tela por m² (kg). */
export const CLOTH_KG_PER_M2 = 0.3
/**
 * Flexibilidades "por kilo" (m/N · kg): se dividen por la masa de cada punto, así la tela se comporta igual
 * con pocos o muchos triángulos, y la caída depende de rigidez × gravedad (más gravedad → dobla más).
 */
export const STRETCH_COMPLIANCE = 1.25e-6
/** Rigidez 0..1 → flexibilidad al doblar: 0 = seda, 1 = cuero (escala logarítmica, 10.000 veces de diferencia). */
export const bendCompliance = (stiffness: number) => 1.25e-3 * 10 ** (1 - 6 * Math.min(1, Math.max(0, stiffness)))

/** Tela con fuerzas reales (XPBD): masa por área y resortes con flexibilidad. */
export function xpbdCloth(positions: Float32Array, index: ArrayLike<number>, stiffness: number, areaM2: number): SoftBody {
  const body = createBody(positions, index, springsFromTriangles(index, 1, 0, { stretch: STRETCH_COMPLIANCE, bend: bendCompliance(stiffness) }))
  setMass(body, CLOTH_KG_PER_M2 * areaM2)
  const inv = body.invMass[0]
  for (let i = 0; i < body.compliance!.length; i++) body.compliance![i] *= inv
  return body
}

export function clothBody(sheet: Sheet, stiffness: number): SoftBody {
  const lu = sheet.uv[sheet.uv.length - 2], lv = sheet.uv[sheet.uv.length - 1]
  const body = xpbdCloth(sheet.positions, sheet.index, stiffness, lu * lv)
  // Distancia entre vecinos de la grilla: la tela no puede quedar más pegada a sí misma que ~70% de eso.
  body.selfRadius = Math.hypot(sheet.positions[3] - sheet.positions[0], sheet.positions[4] - sheet.positions[1], sheet.positions[5] - sheet.positions[2]) * 0.7
  return body
}

/** Gelatina: la malla de la parte, con resortes según la dureza, volumen fijo y memoria de forma. */
export function jellyBody(positions: Float32Array, index: ArrayLike<number>, hardness: number): SoftBody {
  const body = createBody(positions, index, springsFromTriangles(index, 0.15 + hardness * 0.6, 0.05 + hardness * 0.4))
  makeJelly(body, 0.01 + hardness * hardness * 0.25)
  return body
}

export function clothWorld(colliders: Sdf[], thickness: number): PhysicsWorld {
  return { colliders, floor: 0, thickness, friction: 0.55, gravity: 9.8, damping: 0.015 }
}

export function jellyWorld(colliders: Sdf[], thickness: number): PhysicsWorld {
  return { colliders, floor: 0, thickness, friction: 0.4, gravity: 9.8, damping: 0.01 }
}

/**
 * Dónde arranca la tela para tapar algo: un cuadrado horizontal un poco arriba de la pieza,
 * del tamaño justo para llegar al piso por los costados y que sobre un poco.
 */
export function sheetOver(min: V3, max: V3, floor = 0, angle = 0.18, size = 1): { corner: V3; u: V3; v: V3 } {
  const sx = max[0] - min[0], sz = max[2] - min[2]
  const h = Math.max(0.05, max[1] - floor)
  const side = (Math.max(sx, sz) * 1.05 + 2 * h * 0.8) * size
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2
  const y = max[1] + Math.max(0.03, side * 0.01)
  const c = Math.cos(angle), s = Math.sin(angle)
  const u: V3 = [side * c, 0, side * s]
  const v: V3 = [-side * s, 0, side * c]
  return { corner: [cx - u[0] / 2 - v[0] / 2, y, cz - u[2] / 2 - v[2] / 2], u, v }
}
