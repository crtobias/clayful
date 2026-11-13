import { sampleSdf, sdfNormal, type Sdf } from './sdf'

/**
 * Cuerpo blando por dinámica basada en posiciones (PBD): partículas unidas por resortes.
 * Sirve para tela (una superficie) y gelatina (un volumen que conserva su forma y su volumen).
 */
export interface SoftBody {
  pos: Float32Array
  prev: Float32Array
  vel: Float32Array
  /** 0 = fija. */
  invMass: Float32Array
  /** Resortes: pares de partículas, largo de reposo y rigidez (0..1). */
  ca: Int32Array
  cb: Int32Array
  rest: Float32Array
  stiff: Float32Array
  /** Triángulos de la superficie (para el volumen). */
  tris: Uint32Array
  /** Gelatina: conservar el volumen. */
  volume?: { rest: number; stiffness: number }
  /** Gelatina: volver a la forma original (0 = blanda, 1 = dura). */
  shape?: { rest: Float32Array; stiffness: number }
  /** Normal del último contacto por partícula (0,0,0 = sin contacto). */
  contact: Float32Array
  /** Tela: distancia mínima entre partículas para que no se atraviese a sí misma (0 = sin). */
  selfRadius?: number
  /**
   * XPBD (fuerzas reales): flexibilidad de cada resorte en m/N (0 = rígido) y su multiplicador acumulado.
   * Con esto la rigidez compite contra el peso: más gravedad dobla más.
   */
  compliance?: Float32Array
  lambda?: Float32Array
}

export interface PhysicsWorld {
  colliders: Sdf[]
  /** Altura del piso. */
  floor: number
  /** Separación con lo que toca (el grosor de la tela). */
  thickness: number
  /** Roce: 0 resbala, 1 se pega. */
  friction: number
  gravity: number
  /** Pérdida de velocidad por paso (aire). */
  damping: number
}

export interface Spring { a: number; b: number; stiffness: number; /** XPBD: flexibilidad en m/N. */ compliance?: number }

/** Resortes de una malla de triángulos: aristas (estirar) y "pliegue" entre triángulos vecinos (doblar). */
export function springsFromTriangles(index: ArrayLike<number>, stretch: number, bend: number, compliance?: { stretch: number; bend: number }): Spring[] {
  const edges = new Map<string, { a: number; b: number; opp: number[] }>()
  for (let t = 0; t < index.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = index[t + e], b = index[t + ((e + 1) % 3)], o = index[t + ((e + 2) % 3)]
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      const hit = edges.get(key)
      if (hit) hit.opp.push(o)
      else edges.set(key, { a, b, opp: [o] })
    }
  }
  const out: Spring[] = []
  for (const e of edges.values()) {
    out.push({ a: e.a, b: e.b, stiffness: stretch, compliance: compliance?.stretch })
    if ((bend > 0 || compliance) && e.opp.length === 2) out.push({ a: e.opp[0], b: e.opp[1], stiffness: bend, compliance: compliance?.bend })
  }
  return out
}

export function createBody(positions: Float32Array, index: ArrayLike<number>, springs: Spring[]): SoftBody {
  const n = positions.length / 3
  const ca = new Int32Array(springs.length), cb = new Int32Array(springs.length)
  const rest = new Float32Array(springs.length), stiff = new Float32Array(springs.length)
  springs.forEach((s, i) => {
    ca[i] = s.a; cb[i] = s.b; stiff[i] = s.stiffness
    rest[i] = Math.hypot(
      positions[s.a * 3] - positions[s.b * 3], positions[s.a * 3 + 1] - positions[s.b * 3 + 1], positions[s.a * 3 + 2] - positions[s.b * 3 + 2],
    )
  })
  const xpbd = springs.some((s) => s.compliance !== undefined)
  return {
    pos: positions.slice(), prev: positions.slice(), vel: new Float32Array(n * 3), invMass: new Float32Array(n).fill(1),
    ca, cb, rest, stiff, tris: Uint32Array.from(index), contact: new Float32Array(n * 3),
    ...(xpbd ? { compliance: Float32Array.from(springs, (s) => s.compliance ?? 0), lambda: new Float32Array(springs.length) } : {}),
  }
}

/** Reparte una masa total (kg) entre las partículas: así la física no depende de cuántos triángulos tenga. */
export function setMass(body: SoftBody, kg: number): void {
  const n = body.invMass.length
  body.invMass.fill(n / Math.max(kg, 1e-6))
}

export function meshVolume(pos: Float32Array, tris: Uint32Array): number {
  let v = 0
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
      - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
      + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])
  }
  return v / 6
}

/** Prende la gelatina: conserva volumen y vuelve a su forma con la dureza dada. */
export function makeJelly(body: SoftBody, hardness: number): void {
  body.volume = { rest: meshVolume(body.pos, body.tris), stiffness: 1 }
  const n = body.invMass.length
  const c = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += body.pos[i * 3 + k] / n
  const rest = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) rest[i * 3 + k] = body.pos[i * 3 + k] - c[k]
  body.shape = { rest, stiffness: hardness }
}

const nrm = new Float32Array(3)

function solveSprings(b: SoftBody, scale: number, reverse: boolean) {
  const p = b.pos, w = b.invMass
  const n = b.rest.length
  // Alternar el sentido evita que la tela "camine" para un lado (sesgo de Gauss-Seidel).
  for (let q = 0; q < n; q++) {
    const s = reverse ? n - 1 - q : q
    const i = b.ca[s] * 3, j = b.cb[s] * 3
    const dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2]
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const wi = w[b.ca[s]], wj = w[b.cb[s]]
    if (len < 1e-9 || wi + wj === 0) continue
    const k = Math.min(1, b.stiff[s] * scale)
    const corr = (k * (len - b.rest[s])) / (len * (wi + wj))
    p[i] += dx * corr * wi; p[i + 1] += dy * corr * wi; p[i + 2] += dz * corr * wi
    p[j] -= dx * corr * wj; p[j + 1] -= dy * corr * wj; p[j + 2] -= dz * corr * wj
  }
}

function solveVolume(b: SoftBody) {
  if (!b.volume) return
  const p = b.pos, t = b.tris
  const grad = new Float32Array(p.length)
  for (let f = 0; f < t.length; f += 3) {
    const a = t[f] * 3, bb = t[f + 1] * 3, c = t[f + 2] * 3
    // ∂V/∂pa = (pb × pc) / 6, y rotando para los otros dos.
    grad[a] += (p[bb + 1] * p[c + 2] - p[bb + 2] * p[c + 1]) / 6
    grad[a + 1] += (p[bb + 2] * p[c] - p[bb] * p[c + 2]) / 6
    grad[a + 2] += (p[bb] * p[c + 1] - p[bb + 1] * p[c]) / 6
    grad[bb] += (p[c + 1] * p[a + 2] - p[c + 2] * p[a + 1]) / 6
    grad[bb + 1] += (p[c + 2] * p[a] - p[c] * p[a + 2]) / 6
    grad[bb + 2] += (p[c] * p[a + 1] - p[c + 1] * p[a]) / 6
    grad[c] += (p[a + 1] * p[bb + 2] - p[a + 2] * p[bb + 1]) / 6
    grad[c + 1] += (p[a + 2] * p[bb] - p[a] * p[bb + 2]) / 6
    grad[c + 2] += (p[a] * p[bb + 1] - p[a + 1] * p[bb]) / 6
  }
  const C = meshVolume(p, t) - b.volume.rest
  let sum = 0
  for (let i = 0; i < b.invMass.length; i++) sum += b.invMass[i] * (grad[i * 3] ** 2 + grad[i * 3 + 1] ** 2 + grad[i * 3 + 2] ** 2)
  if (sum < 1e-12) return
  const lambda = (-C / sum) * b.volume.stiffness
  for (let i = 0; i < b.invMass.length; i++) {
    const w = b.invMass[i] * lambda
    p[i * 3] += grad[i * 3] * w; p[i * 3 + 1] += grad[i * 3 + 1] * w; p[i * 3 + 2] += grad[i * 3 + 2] * w
  }
}

/** Vuelve hacia la forma original (solo traslación: la gelatina se aplasta y rebota, no gira). */
function solveShape(b: SoftBody, scale: number) {
  if (!b.shape) return
  const p = b.pos, n = b.invMass.length
  const c = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += p[i * 3 + k] / n
  const k = Math.min(1, b.shape.stiffness * scale)
  for (let i = 0; i < n; i++) {
    if (!b.invMass[i]) continue
    for (let a = 0; a < 3; a++) p[i * 3 + a] += (c[a] + b.shape.rest[i * 3 + a] - p[i * 3 + a]) * k
  }
}

function collide(b: SoftBody, world: PhysicsWorld) {
  const p = b.pos, th = world.thickness
  for (let i = 0; i < b.invMass.length; i++) {
    if (!b.invMass[i]) continue
    const x = i * 3
    if (p[x + 1] < world.floor + th) {
      p[x + 1] = world.floor + th
      b.contact[x] = 0; b.contact[x + 1] = 1; b.contact[x + 2] = 0
    }
    for (const s of world.colliders) {
      const d = sampleSdf(s, p[x], p[x + 1], p[x + 2])
      if (d >= th) continue
      sdfNormal(s, p[x], p[x + 1], p[x + 2], nrm)
      const push = th - d
      p[x] += nrm[0] * push; p[x + 1] += nrm[1] * push; p[x + 2] += nrm[2] * push
      b.contact[x] = nrm[0]; b.contact[x + 1] = nrm[1]; b.contact[x + 2] = nrm[2]
    }
  }
}

/** Que la tela no se atraviese a sí misma: separa partículas más cercanas que `r` (grilla hash). */
function selfCollide(b: SoftBody, r: number) {
  const p = b.pos, n = b.invMass.length
  const size = 2 * n
  const start = new Int32Array(size + 1)
  const entries = new Int32Array(n)
  const keyOf = (x: number, y: number, z: number) =>
    Math.abs((Math.floor(x / r) * 92837111) ^ (Math.floor(y / r) * 689287499) ^ (Math.floor(z / r) * 283923481)) % size
  const keys = new Int32Array(n)
  for (let i = 0; i < n; i++) { keys[i] = keyOf(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); start[keys[i]]++ }
  for (let k = 1; k <= size; k++) start[k] += start[k - 1]
  for (let i = 0; i < n; i++) entries[--start[keys[i]]] = i
  const r2 = r * r
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const k = keyOf(x + dx * r, y + dy * r, z + dz * r)
      for (let e = start[k]; e < start[k + 1]; e++) {
        const j = entries[e]
        if (j <= i) continue
        const ex = p[j * 3] - p[i * 3], ey = p[j * 3 + 1] - p[i * 3 + 1], ez = p[j * 3 + 2] - p[i * 3 + 2]
        const d2 = ex * ex + ey * ey + ez * ez
        if (d2 >= r2 || d2 < 1e-12) continue
        const wi = b.invMass[i], wj = b.invMass[j]
        if (wi + wj === 0) continue
        const d = Math.sqrt(d2)
        const c = (r - d) / (d * (wi + wj))
        p[i * 3] -= ex * c * wi; p[i * 3 + 1] -= ey * c * wi; p[i * 3 + 2] -= ez * c * wi
        p[j * 3] += ex * c * wj; p[j * 3 + 1] += ey * c * wj; p[j * 3 + 2] += ez * c * wj
      }
    }
  }
}

/** Avanza la simulación un paso de `dt` segundos. */
export function step(b: SoftBody, world: PhysicsWorld, dt: number, iterations: number): void {
  const p = b.pos, prev = b.prev, v = b.vel, n = b.invMass.length
  const keep = 1 - world.damping
  for (let i = 0; i < n; i++) {
    if (!b.invMass[i]) continue
    const x = i * 3
    v[x + 1] -= world.gravity * dt
    v[x] *= keep; v[x + 1] *= keep; v[x + 2] *= keep
    prev[x] = p[x]; prev[x + 1] = p[x + 1]; prev[x + 2] = p[x + 2]
    p[x] += v[x] * dt; p[x + 1] += v[x + 1] * dt; p[x + 2] += v[x + 2] * dt
  }
  b.contact.fill(0)
  const scale = 1 / Math.sqrt(iterations)
  for (let it = 0; it < iterations; it++) {
    solveSprings(b, 1, it % 2 === 1)
    solveShape(b, scale * 0.5)
    solveVolume(b)
    if (b.selfRadius && it === iterations - 1) selfCollide(b, b.selfRadius)
    collide(b, world)
  }
  // Roce en lo que está tocando: si se mueve poco de costado, queda quieto (roce estático).
  const stick = world.thickness * 0.5
  for (let i = 0; i < n; i++) {
    const x = i * 3
    const cx = b.contact[x], cy = b.contact[x + 1], cz = b.contact[x + 2]
    if (!(cx || cy || cz)) continue
    const dx = p[x] - prev[x], dy = p[x + 1] - prev[x + 1], dz = p[x + 2] - prev[x + 2]
    const dn = dx * cx + dy * cy + dz * cz
    const tx = dx - cx * dn, ty = dy - cy * dn, tz = dz - cz * dn
    const len = Math.hypot(tx, ty, tz)
    const f = len < stick ? 1 : world.friction
    p[x] -= tx * f; p[x + 1] -= ty * f; p[x + 2] -= tz * f
  }
  // Velocidad nueva.
  for (let i = 0; i < n; i++) {
    const x = i * 3
    let vx = (p[x] - prev[x]) / dt, vy = (p[x + 1] - prev[x + 1]) / dt, vz = (p[x + 2] - prev[x + 2]) / dt
    const cx = b.contact[x], cy = b.contact[x + 1], cz = b.contact[x + 2]
    if (cx || cy || cz) {
      const vn = vx * cx + vy * cy + vz * cz
      const tx = vx - cx * vn, ty = vy - cy * vn, tz = vz - cz * vn
      vx = tx + cx * Math.max(0, vn); vy = ty + cy * Math.max(0, vn); vz = tz + cz * Math.max(0, vn)
    }
    v[x] = vx; v[x + 1] = vy; v[x + 2] = vz
  }
}

/**
 * Alisa la superficie al final (saca el "granulado" de la simulación) sin despegarla de lo que toca.
 * Promedia cada partícula con sus vecinas por aristas y después vuelve a chocar.
 */
export function smooth(b: SoftBody, world: PhysicsWorld, passes = 2, amount = 0.5): void {
  const n = b.invMass.length
  const neighbors: number[][] = Array.from({ length: n }, () => [])
  for (let t = 0; t < b.tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = b.tris[t + e], c = b.tris[t + ((e + 1) % 3)]
      neighbors[a].push(c); neighbors[c].push(a)
    }
  }
  const p = b.pos
  const next = new Float32Array(p.length)
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < n; i++) {
      const nb = neighbors[i]
      for (let k = 0; k < 3; k++) {
        let avg = 0
        for (const j of nb) avg += p[j * 3 + k]
        avg = nb.length ? avg / nb.length : p[i * 3 + k]
        next[i * 3 + k] = p[i * 3 + k] + (avg - p[i * 3 + k]) * amount
      }
    }
    p.set(next)
    collide(b, world)
  }
}

function solveSpringsXpbd(b: SoftBody, dt: number, reverse: boolean) {
  const p = b.pos, w = b.invMass, comp = b.compliance!, lam = b.lambda!
  const n = b.rest.length
  const inv = 1 / (dt * dt)
  for (let q = 0; q < n; q++) {
    const s = reverse ? n - 1 - q : q
    const i = b.ca[s] * 3, j = b.cb[s] * 3
    const dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2]
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const wi = w[b.ca[s]], wj = w[b.cb[s]]
    if (len < 1e-9 || wi + wj === 0) continue
    const alpha = comp[s] * inv
    const dl = (-(len - b.rest[s]) - alpha * lam[s]) / (wi + wj + alpha)
    lam[s] += dl
    const f = dl / len
    p[i] -= dx * f * wi; p[i + 1] -= dy * f * wi; p[i + 2] -= dz * f * wi
    p[j] += dx * f * wj; p[j + 1] += dy * f * wj; p[j + 2] += dz * f * wj
  }
}

/**
 * Un cuadro de XPBD con sub-pasos (Macklin 2019): cada sub-paso integra, resuelve una vez y choca.
 * Las fuerzas son reales: la rigidez (flexibilidad en m/N) compite contra el peso (masa · gravedad).
 */
export function stepXpbd(b: SoftBody, world: PhysicsWorld, dt: number, substeps: number): void {
  const h = dt / substeps
  const p = b.pos, prev = b.prev, v = b.vel, n = b.invMass.length
  const keep = 1 - world.damping / substeps
  const stick = world.thickness * 0.5
  for (let sub = 0; sub < substeps; sub++) {
    for (let i = 0; i < n; i++) {
      if (!b.invMass[i]) continue
      const x = i * 3
      v[x + 1] -= world.gravity * h
      v[x] *= keep; v[x + 1] *= keep; v[x + 2] *= keep
      prev[x] = p[x]; prev[x + 1] = p[x + 1]; prev[x + 2] = p[x + 2]
      p[x] += v[x] * h; p[x + 1] += v[x + 1] * h; p[x + 2] += v[x + 2] * h
    }
    b.lambda!.fill(0)
    b.contact.fill(0)
    solveSpringsXpbd(b, h, sub % 2 === 1)
    solveVolume(b)
    if (b.selfRadius && sub === substeps - 1) selfCollide(b, b.selfRadius)
    collide(b, world)
    for (let i = 0; i < n; i++) {
      const x = i * 3
      const cx = b.contact[x], cy = b.contact[x + 1], cz = b.contact[x + 2]
      if (cx || cy || cz) {
        const dx = p[x] - prev[x], dy = p[x + 1] - prev[x + 1], dz = p[x + 2] - prev[x + 2]
        const dn = dx * cx + dy * cy + dz * cz
        const tx = dx - cx * dn, ty = dy - cy * dn, tz = dz - cz * dn
        const f = Math.hypot(tx, ty, tz) < stick ? 1 : world.friction
        p[x] -= tx * f; p[x + 1] -= ty * f; p[x + 2] -= tz * f
      }
      v[x] = (p[x] - prev[x]) / h; v[x + 1] = (p[x + 1] - prev[x + 1]) / h; v[x + 2] = (p[x + 2] - prev[x + 2]) / h
      if (cx || cy || cz) {
        // Sin rebote: lo que tocó no sale disparado por el empujón del choque.
        const vn = v[x] * cx + v[x + 1] * cy + v[x + 2] * cz
        v[x] -= cx * vn; v[x + 1] -= cy * vn; v[x + 2] -= cz * vn
      }
    }
  }
}
