import { BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { buildSdf, type Sdf } from './sdf'
import { createBody, setMass, stepXpbd, type PhysicsWorld, type Spring } from './softbody'

/**
 * Pelo: cada hebra es una cadena de S puntos con la raíz pegada a la piel.
 * Todo está en el espacio local de la parte que lo lleva (el pelo la sigue si se mueve).
 */
export interface HairData {
  /** Cantidad de hebras. */
  n: number
  /** Puntos por hebra (raíz incluida). */
  S: number
  /** Posiciones: n·S·3. */
  pts: Float32Array
  /** Normal de la piel en cada raíz: n·3. */
  normals: Float32Array
  /** Radio de la hebra en la raíz (metros). */
  width: number
  /** 0 = cae como pelo largo y suave, 1 = parado como pelaje corto. */
  stiffness: number
  /**
   * Mechones (low poly): por hebra, el tamaño del mechón en el que va (metros); 0 = hebra suelta.
   * Las hebras vecinas con el mismo tamaño se dibujan juntas como una sola punta facetada.
   */
  clump?: Float32Array
  /** Nivel de la barra Low poly (0 = mechones grandes, 1 = chicos) si todo el pelo está en mechones. */
  clumpLevel?: number
}

/** Tamaño de mechón para un nivel de la barra Low poly (detalle 0..1). */
export const clumpSizeFor = (level: number) => 0.004 + 0.05 * (1 - Math.min(1, Math.max(0, level))) ** 2

export const HAIR_BRUSHES = ['pelo', 'peinar', 'recortar', 'mechones', 'borrar_pelo'] as const
export type HairBrush = (typeof HAIR_BRUSHES)[number]
export const isHairBrush = (b: string): b is HairBrush => (HAIR_BRUSHES as readonly string[]).includes(b)

export interface HairSettings {
  /** Largo de las hebras nuevas (metros). */
  length: number
  /** Hebras por cm². */
  density: number
  /** Grosor (radio en la raíz, metros). */
  width: number
  stiffness: number
  color: string
}

export const DEFAULT_HAIR: HairSettings = { length: 0.04, density: 3, width: 0.0012, stiffness: 0.6, color: '#8c8c94' }
export const LENGTH_RANGE: [number, number] = [0.003, 0.8]
export const MAX_STRANDS = 60000

export const emptyHair = (width: number, stiffness: number, S = 6): HairData =>
  ({ n: 0, S, pts: new Float32Array(0), normals: new Float32Array(0), width, stiffness })

/** Puntos por hebra según el largo: pelo corto, pocos; pelo largo, más (para que se doble). */
export const segmentsFor = (length: number) => Math.max(3, Math.min(10, Math.round(length / 0.04) + 3))

export interface Dab { center: Vector3; radius: number }

/**
 * Agrega hebras en la zona del pincel. Los candidatos salen de los vértices de la piel (con su normal),
 * con un poco de corrimiento, y no se pone una raíz demasiado cerca de otra (densidad pareja).
 */
export function growHair(h: HairData, skin: BufferGeometry, dab: Dab | null, s: HairSettings, rnd: () => number = Math.random): HairData {
  const pos = skin.attributes.position, nor = skin.attributes.normal
  const index = skin.index!.array as ArrayLike<number>
  const spacing = 0.01 / Math.sqrt(Math.max(0.05, s.density))
  const S = h.n ? h.S : segmentsFor(s.length)
  // Raíces existentes en una grilla hash para no amontonar.
  const cell = spacing
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`
  const taken = new Set<string>()
  for (let i = 0; i < h.n; i++) taken.add(key(h.pts[i * S * 3], h.pts[i * S * 3 + 1], h.pts[i * S * 3 + 2]))
  // Triángulos de la zona, con su área: las raíces se reparten sobre la superficie según la densidad.
  const A = new Vector3(), B = new Vector3(), C = new Vector3(), e1 = new Vector3(), e2 = new Vector3()
  const tris: number[] = [], cum: number[] = []
  let total = 0
  for (let t = 0; t < index.length; t += 3) {
    A.fromBufferAttribute(pos, index[t]); B.fromBufferAttribute(pos, index[t + 1]); C.fromBufferAttribute(pos, index[t + 2])
    if (dab) {
      const cx = (A.x + B.x + C.x) / 3 - dab.center.x, cy = (A.y + B.y + C.y) / 3 - dab.center.y, cz = (A.z + B.z + C.z) / 3 - dab.center.z
      if (cx * cx + cy * cy + cz * cz > dab.radius * dab.radius) continue
    }
    const area = e1.subVectors(B, A).cross(e2.subVectors(C, A)).length() / 2
    if (area <= 0) continue
    total += area
    tris.push(t)
    cum.push(total)
  }
  const roots: number[] = [], normals: number[] = []
  const want = Math.min(MAX_STRANDS - h.n, Math.ceil(total * 1e4 * s.density))
  const tries = Math.min(want * 3, 300000)
  const p = new Vector3(), n = new Vector3(), na = new Vector3(), nb = new Vector3(), nc = new Vector3()
  for (let k = 0; k < tries && roots.length / 3 < want; k++) {
    // Triángulo al azar según su área (búsqueda binaria en el acumulado).
    const r = rnd() * total
    let lo = 0, hi = cum.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid }
    const t = tris[lo]
    let u = rnd(), v = rnd()
    if (u + v > 1) { u = 1 - u; v = 1 - v }
    A.fromBufferAttribute(pos, index[t]); B.fromBufferAttribute(pos, index[t + 1]); C.fromBufferAttribute(pos, index[t + 2])
    p.copy(A).addScaledVector(e1.subVectors(B, A), u).addScaledVector(e2.subVectors(C, A), v)
    if (dab && p.distanceToSquared(dab.center) > dab.radius * dab.radius) continue
    const kk = key(p.x, p.y, p.z)
    if (taken.has(kk)) continue
    taken.add(kk)
    na.fromBufferAttribute(nor, index[t]); nb.fromBufferAttribute(nor, index[t + 1]); nc.fromBufferAttribute(nor, index[t + 2])
    n.copy(na).multiplyScalar(1 - u - v).addScaledVector(nb, u).addScaledVector(nc, v).normalize()
    roots.push(p.x, p.y, p.z)
    normals.push(n.x, n.y, n.z)
  }
  const m = roots.length / 3
  if (!m) return h
  const pts = new Float32Array((h.n + m) * S * 3)
  pts.set(h.pts)
  const outN = new Float32Array((h.n + m) * 3)
  outN.set(h.normals)
  for (let j = 0; j < m; j++) {
    const len = s.length * (0.85 + rnd() * 0.3)
    const seg = len / (S - 1)
    // Un poquito de inclinación al azar: se ve más natural.
    const nx = normals[j * 3] + (rnd() - 0.5) * 0.25, ny = normals[j * 3 + 1] + (rnd() - 0.5) * 0.25, nz = normals[j * 3 + 2] + (rnd() - 0.5) * 0.25
    const l = Math.hypot(nx, ny, nz) || 1
    const o = (h.n + j) * S * 3
    for (let q = 0; q < S; q++) {
      pts[o + q * 3] = roots[j * 3] + (nx / l) * seg * q
      pts[o + q * 3 + 1] = roots[j * 3 + 1] + (ny / l) * seg * q
      pts[o + q * 3 + 2] = roots[j * 3 + 2] + (nz / l) * seg * q
    }
    outN.set([normals[j * 3], normals[j * 3 + 1], normals[j * 3 + 2]], (h.n + j) * 3)
  }
  let clump = h.clump
  if (clump) { clump = new Float32Array(h.n + m); clump.set(h.clump!) }
  return { ...h, n: h.n + m, S, pts, normals: outN, clump }
}

const inDab = (h: HairData, i: number, dab: Dab) => {
  const o = i * h.S * 3
  return (h.pts[o] - dab.center.x) ** 2 + (h.pts[o + 1] - dab.center.y) ** 2 + (h.pts[o + 2] - dab.center.z) ** 2 <= dab.radius ** 2
}

const falloff = (h: HairData, i: number, dab: Dab) => {
  const o = i * h.S * 3
  const d = Math.hypot(h.pts[o] - dab.center.x, h.pts[o + 1] - dab.center.y, h.pts[o + 2] - dab.center.z) / dab.radius
  return Math.max(0, 1 - d * d)
}

/** Hebras cuya raíz cae dentro del pincel. */
export function strandsIn(h: HairData, dab: Dab): number[] {
  const out: number[] = []
  for (let i = 0; i < h.n; i++) if (inDab(h, i, dab)) out.push(i)
  return out
}

export function removeHair(h: HairData, dab: Dab): HairData {
  const keep: number[] = []
  for (let i = 0; i < h.n; i++) if (!inDab(h, i, dab)) keep.push(i)
  if (keep.length === h.n) return h
  const pts = new Float32Array(keep.length * h.S * 3), normals = new Float32Array(keep.length * 3)
  const clump = h.clump ? new Float32Array(keep.length) : undefined
  keep.forEach((i, j) => {
    pts.set(h.pts.subarray(i * h.S * 3, (i + 1) * h.S * 3), j * h.S * 3)
    normals.set(h.normals.subarray(i * 3, i * 3 + 3), j * 3)
    if (clump) clump[j] = h.clump![i]
  })
  return { ...h, n: keep.length, pts, normals, clump }
}

/** Largo de cada tramo de una hebra. */
function segLengths(h: HairData, i: number): number[] {
  const o = i * h.S * 3, out: number[] = []
  for (let q = 1; q < h.S; q++) {
    const a = o + (q - 1) * 3, b = o + q * 3
    out.push(Math.hypot(h.pts[b] - h.pts[a], h.pts[b + 1] - h.pts[a + 1], h.pts[b + 2] - h.pts[a + 2]))
  }
  return out
}

/** Vuelve a poner cada tramo a su largo, desde la raíz hacia la punta. */
function fixLengths(h: HairData, i: number, lens: number[]) {
  const o = i * h.S * 3
  for (let q = 1; q < h.S; q++) {
    const a = o + (q - 1) * 3, b = o + q * 3
    const dx = h.pts[b] - h.pts[a], dy = h.pts[b + 1] - h.pts[a + 1], dz = h.pts[b + 2] - h.pts[a + 2]
    const l = Math.hypot(dx, dy, dz) || 1
    const k = lens[q - 1] / l
    h.pts[b] = h.pts[a] + dx * k; h.pts[b + 1] = h.pts[a + 1] + dy * k; h.pts[b + 2] = h.pts[a + 2] + dz * k
  }
}

/** Peinar: lleva las hebras hacia donde va el pincel (más en la punta que en la raíz). */
export function combHair(h: HairData, dab: Dab, delta: Vector3, strength = 1): HairData {
  const pts = h.pts.slice()
  const out = { ...h, pts }
  for (let i = 0; i < h.n; i++) {
    const f = falloff(h, i, dab) * strength
    if (!f) continue
    const lens = segLengths(h, i)
    const o = i * h.S * 3
    for (let q = 1; q < h.S; q++) {
      const w = f * (q / (h.S - 1))
      pts[o + q * 3] += delta.x * w; pts[o + q * 3 + 1] += delta.y * w; pts[o + q * 3 + 2] += delta.z * w
    }
    fixLengths(out, i, lens)
  }
  return out
}

/** Recortar: acorta las hebras de la zona (factor < 1). */
export function trimHair(h: HairData, dab: Dab, factor: number): HairData {
  const pts = h.pts.slice()
  const out = { ...h, pts }
  for (let i = 0; i < h.n; i++) {
    const f = falloff(h, i, dab)
    if (!f) continue
    const k = 1 - (1 - factor) * f
    fixLengths(out, i, segLengths(h, i).map((l) => Math.max(0.0005, l * k)))
  }
  return out
}

/**
 * Mechones: las hebras de la zona pasan a dibujarse juntas en mechones low poly de tamaño `size`.
 * Sin `dab`, todo el pelo. `size` 0 las vuelve a soltar.
 */
export function clumpHair(h: HairData, dab: Dab | null, size: number): HairData {
  const clump = h.clump ? h.clump.slice() : new Float32Array(h.n)
  for (let i = 0; i < h.n; i++) if (!dab || inDab(h, i, dab)) clump[i] = size
  return { ...h, clump }
}

/**
 * Física: las hebras caen con la gravedad y chocan con la piel.
 * La raíz y el punto siguiente quedan fijos (la hebra sale de la piel en su dirección); el resto cuelga.
 * `down` es la dirección de la gravedad en el espacio local de la parte.
 */
export function settleHair(h: HairData, skin: Sdf | null, down: Vector3, gravity = 1, frames = 90, only?: number[]): HairData {
  if (!h.n) return h
  // Solo algunas hebras (las que tocó el pincel): se simulan aparte y se vuelven a poner en su lugar.
  if (only) {
    const ids = [...new Set(only)].filter((i) => i >= 0 && i < h.n)
    if (!ids.length) return h
    const sub: HairData = { ...h, n: ids.length, pts: new Float32Array(ids.length * h.S * 3), normals: new Float32Array(ids.length * 3) }
    ids.forEach((i, j) => sub.pts.set(h.pts.subarray(i * h.S * 3, (i + 1) * h.S * 3), j * h.S * 3))
    const done = settleHair(sub, skin, down, gravity, frames)
    const pts = h.pts.slice()
    ids.forEach((i, j) => pts.set(done.pts.subarray(j * h.S * 3, (j + 1) * h.S * 3), i * h.S * 3))
    return { ...h, pts }
  }
  const springs: Spring[] = []
  // Rigidez → flexibilidad al doblar (escala logarítmica). Pelo corto y duro casi no se mueve.
  const bend = 2e-4 * 10 ** (2 - 5 * h.stiffness)
  for (let i = 0; i < h.n; i++) {
    const o = i * h.S
    for (let q = 1; q < h.S; q++) springs.push({ a: o + q - 1, b: o + q, stiffness: 1, compliance: 1e-8 })
    for (let q = 2; q < h.S; q++) springs.push({ a: o + q - 2, b: o + q, stiffness: 0, compliance: bend })
  }
  const body = createBody(h.pts, [], springs)
  setMass(body, h.n * h.S * 1e-5)
  const inv = body.invMass[0]
  for (let k = 0; k < body.compliance!.length; k++) body.compliance![k] *= inv
  for (let i = 0; i < h.n; i++) { body.invMass[i * h.S] = 0; body.invMass[i * h.S + 1] = 0 }
  const world: PhysicsWorld = {
    colliders: skin ? [skin] : [], floor: -1e9, thickness: Math.max(0.0015, h.width * 1.5), friction: 0.3,
    gravity: 9.8 * gravity, damping: 0.08, down: [down.x, down.y, down.z],
  }
  for (let f = 0; f < frames; f++) stepXpbd(body, world, 1 / 60, 4)
  return { ...h, pts: body.pos }
}

/** Piel como obstáculo para el pelo. */
export function skinSdf(skin: BufferGeometry): Sdf | null {
  if (!skin.index) return null
  skin.computeBoundingBox()
  const size = skin.boundingBox!.getSize(new Vector3())
  const cell = Math.max(0.004, Math.max(size.x, size.y, size.z) / 90)
  return buildSdf(skin.attributes.position.array as ArrayLike<number>, skin.index.array as ArrayLike<number>, cell, cell * 4)
}

/** Marco perpendicular a la hebra en un punto (para armar el tubo o el mechón). */
function frame(tan: Vector3, a: Vector3, b: Vector3) {
  const ref = Math.abs(tan.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
  a.crossVectors(tan, ref).normalize()
  b.crossVectors(tan, a)
}

/** Lados del mechón y cuántos anillos lleva a lo largo (pocos: es low poly). */
const CLUMP_SIDES = 4
const CLUMP_RINGS = 4

/**
 * Malla del pelo: cada hebra suelta es un tubito de 3 lados que se afina hacia la punta.
 * Las hebras en mechones se juntan: un mechón es una punta facetada de 4 lados que sigue la hebra promedio.
 */
export function hairGeometry(h: HairData): BufferGeometry {
  const { n, S, pts } = h
  const loose: number[] = []
  const groups = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const size = h.clump?.[i] ?? 0
    if (!size) { loose.push(i); continue }
    const o = i * S * 3
    const key = `${size}:${Math.floor(pts[o] / size)},${Math.floor(pts[o + 1] / size)},${Math.floor(pts[o + 2] / size)}`
    const g = groups.get(key)
    if (g) g.push(i)
    else groups.set(key, [i])
  }
  const rings = Math.min(S, CLUMP_RINGS)
  const nLoose = loose.length * S * 3
  const clumpVerts = groups.size * (rings - 1) * CLUMP_SIDES * 6
  const pos = new Float32Array((nLoose + clumpVerts) * 3)
  const idx = new Uint32Array(loose.length * (S - 1) * 3 * 6 + clumpVerts)
  const tan = new Vector3(), a = new Vector3(), b = new Vector3()
  let w = 0

  // Hebras sueltas.
  loose.forEach((i, li) => {
    const o = i * S * 3
    for (let q = 0; q < S; q++) {
      const c = o + q * 3
      const prev = q > 0 ? c - 3 : c, next = q < S - 1 ? c + 3 : c
      tan.set(pts[next] - pts[prev], pts[next + 1] - pts[prev + 1], pts[next + 2] - pts[prev + 2]).normalize()
      frame(tan, a, b)
      const r = h.width * (1 - 0.85 * (q / (S - 1)))
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2
        const v = ((li * S + q) * 3 + k) * 3
        pos[v] = pts[c] + (a.x * Math.cos(ang) + b.x * Math.sin(ang)) * r
        pos[v + 1] = pts[c + 1] + (a.y * Math.cos(ang) + b.y * Math.sin(ang)) * r
        pos[v + 2] = pts[c + 2] + (a.z * Math.cos(ang) + b.z * Math.sin(ang)) * r
      }
    }
    for (let q = 0; q < S - 1; q++) {
      for (let k = 0; k < 3; k++) {
        const r0 = (li * S + q) * 3, r1 = r0 + 3
        const k1 = (k + 1) % 3
        idx.set([r0 + k, r1 + k, r0 + k1, r0 + k1, r1 + k, r1 + k1], w)
        w += 6
      }
    }
  })

  // Mechones: vértices propios por triángulo (caras planas, se ve facetado).
  let v = nLoose
  const center: Vector3[] = Array.from({ length: rings }, () => new Vector3())
  const ring: Vector3[][] = Array.from({ length: rings }, () => Array.from({ length: CLUMP_SIDES }, () => new Vector3()))
  for (const members of groups.values()) {
    for (let r = 0; r < rings; r++) {
      const q = Math.round((r / (rings - 1)) * (S - 1))
      center[r].set(0, 0, 0)
      for (const i of members) {
        const c = (i * S + q) * 3
        center[r].x += pts[c]; center[r].y += pts[c + 1]; center[r].z += pts[c + 2]
      }
      center[r].divideScalar(members.length)
    }
    // Ancho en la raíz: lo que ocupan las raíces del grupo.
    let spread = 0
    for (const i of members) {
      const c = i * S * 3
      spread = Math.max(spread, Math.hypot(pts[c] - center[0].x, pts[c + 1] - center[0].y, pts[c + 2] - center[0].z))
    }
    const r0 = Math.max(spread + h.width, h.width * 2.5)
    for (let r = 0; r < rings; r++) {
      const prev = center[Math.max(0, r - 1)], next = center[Math.min(rings - 1, r + 1)]
      tan.subVectors(next, prev)
      if (tan.lengthSq() < 1e-14) tan.set(0, 1, 0)
      tan.normalize()
      frame(tan, a, b)
      const rad = r0 * (1 - r / (rings - 1)) ** 0.8
      for (let k = 0; k < CLUMP_SIDES; k++) {
        const ang = (k / CLUMP_SIDES) * Math.PI * 2 + Math.PI / 4
        ring[r][k].copy(center[r]).addScaledVector(a, Math.cos(ang) * rad).addScaledVector(b, Math.sin(ang) * rad)
      }
    }
    const put = (p: Vector3) => { pos[v * 3] = p.x; pos[v * 3 + 1] = p.y; pos[v * 3 + 2] = p.z; idx[w++] = v++ }
    for (let r = 0; r < rings - 1; r++) {
      for (let k = 0; k < CLUMP_SIDES; k++) {
        const k1 = (k + 1) % CLUMP_SIDES
        put(ring[r][k]); put(ring[r + 1][k]); put(ring[r][k1])
        put(ring[r][k1]); put(ring[r + 1][k]); put(ring[r + 1][k1])
      }
    }
  }

  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setIndex(new BufferAttribute(idx, 1))
  g.computeVertexNormals()
  return g
}

/** Triángulos que tiene la malla del pelo (para saber si entra en un juego). */
export const hairTriangles = (h: HairData) => {
  let loose = 0
  const groups = new Set<string>()
  for (let i = 0; i < h.n; i++) {
    const size = h.clump?.[i] ?? 0
    if (!size) { loose++; continue }
    const o = i * h.S * 3
    groups.add(`${size}:${Math.floor(h.pts[o] / size)},${Math.floor(h.pts[o + 1] / size)},${Math.floor(h.pts[o + 2] / size)}`)
  }
  return loose * (h.S - 1) * 6 + groups.size * (Math.min(h.S, CLUMP_RINGS) - 1) * CLUMP_SIDES * 2
}
