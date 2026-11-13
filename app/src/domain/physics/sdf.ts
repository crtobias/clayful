/**
 * Campo de distancia con signo (SDF) en una grilla de vóxeles, a partir de triángulos en coordenadas de mundo.
 * Es lo que usa la física para saber "cuánto falta para chocar" y "hacia dónde empujar".
 */
export interface Sdf {
  min: [number, number, number]
  cell: number
  nx: number
  ny: number
  nz: number
  /** Distancia en metros: negativa adentro de la malla. */
  data: Float32Array
}

const MAX_CELLS = 128
/** Corrimiento de las columnas de signo (fracción de celda): lejos de aristas y vértices alineados con la grilla. */
const OX = 0.137, OZ = 0.291

/** Distancia² de un punto a un triángulo (Ericson, "closest point on triangle"). */
function distTri2(p: number[], a: number[], b: number[], c: number[]): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
  const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
  const d2 = (q: number[]) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2
  const lerp = (u: number[], v: number[], t: number) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t]
  const d1 = dot(ab, ap), d2v = dot(ac, ap)
  if (d1 <= 0 && d2v <= 0) return d2(a)
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]]
  const d3 = dot(ab, bp), d4 = dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return d2(b)
  const vc = d1 * d4 - d3 * d2v
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return d2(lerp(a, b, d1 / (d1 - d3)))
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]
  const d5 = dot(ab, cp), d6 = dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return d2(c)
  const vb = d5 * d2v - d1 * d6
  if (vb <= 0 && d2v >= 0 && d6 <= 0) return d2(lerp(a, c, d2v / (d2v - d6)))
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return d2(lerp(b, c, (d4 - d3) / (d4 - d3 + (d5 - d6))))
  const denom = 1 / (va + vb + vc)
  const v = vb * denom, w = vc * denom
  return d2([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w])
}

/**
 * Arma el SDF. `cell` = tamaño del vóxel (se agranda si la grilla quedaría muy grande).
 * Mallas cerradas: signo por paridad de cruces en columnas verticales. Mallas abiertas (un plano): solo distancia.
 */
export function buildSdf(pos: ArrayLike<number>, index: ArrayLike<number>, cell: number, margin: number): Sdf {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]) }
  }
  const min: [number, number, number] = [lo[0] - margin, lo[1] - margin, lo[2] - margin]
  const size = [hi[0] - lo[0] + 2 * margin, hi[1] - lo[1] + 2 * margin, hi[2] - lo[2] + 2 * margin]
  cell = Math.max(cell, Math.max(...size) / MAX_CELLS)
  const nx = Math.ceil(size[0] / cell) + 1, ny = Math.ceil(size[1] / cell) + 1, nz = Math.ceil(size[2] / cell) + 1
  const at = (i: number, j: number, k: number) => (k * ny + j) * nx + i
  const data = new Float32Array(nx * ny * nz).fill(1e9)
  const vtx = (v: number) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]

  // 1) Distancia exacta cerca de cada triángulo (banda de 2 vóxeles).
  const band = 2
  const p = [0, 0, 0]
  for (let t = 0; t < index.length; t += 3) {
    const a = vtx(index[t]), b = vtx(index[t + 1]), c = vtx(index[t + 2])
    const r0 = [0, 0, 0], r1 = [0, 0, 0]
    for (let k = 0; k < 3; k++) {
      r0[k] = Math.max(0, Math.floor((Math.min(a[k], b[k], c[k]) - min[k]) / cell) - band)
      r1[k] = Math.min([nx, ny, nz][k] - 1, Math.ceil((Math.max(a[k], b[k], c[k]) - min[k]) / cell) + band)
    }
    for (let k = r0[2]; k <= r1[2]; k++) {
      p[2] = min[2] + k * cell
      for (let j = r0[1]; j <= r1[1]; j++) {
        p[1] = min[1] + j * cell
        for (let i = r0[0]; i <= r1[0]; i++) {
          p[0] = min[0] + i * cell
          const d = distTri2(p, a, b, c)
          const n = at(i, j, k)
          if (d < data[n]) data[n] = d
        }
      }
    }
  }
  for (let n = 0; n < data.length; n++) data[n] = data[n] < 1e9 ? Math.sqrt(data[n]) : 1e9

  // 2) Propagar la distancia al resto (chamfer en dos pasadas).
  const offs: [number, number, number, number][] = []
  for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (dk < 0 || (dk === 0 && (dj < 0 || (dj === 0 && di < 0)))) offs.push([di, dj, dk, Math.hypot(di, dj, dk) * cell])
  }
  const sweep = (dir: 1 | -1) => {
    const ks = dir === 1 ? [0, nz, 1] : [nz - 1, -1, -1]
    const js = dir === 1 ? [0, ny, 1] : [ny - 1, -1, -1]
    const is = dir === 1 ? [0, nx, 1] : [nx - 1, -1, -1]
    for (let k = ks[0]; k !== ks[1]; k += ks[2]) for (let j = js[0]; j !== js[1]; j += js[2]) for (let i = is[0]; i !== is[1]; i += is[2]) {
      const n = at(i, j, k)
      let best = data[n]
      for (const [di, dj, dk, w] of offs) {
        const ii = i + di * dir, jj = j + dj * dir, kk = k + dk * dir
        if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue
        const v = data[at(ii, jj, kk)] + w
        if (v < best) best = v
      }
      data[n] = best
    }
  }
  sweep(1)
  sweep(-1)

  // 3) Signo: cruces de cada columna vertical con la malla.
  const cols: number[][] = Array.from({ length: nx * nz }, () => [])
  for (let t = 0; t < index.length; t += 3) {
    const a = vtx(index[t]), b = vtx(index[t + 1]), c = vtx(index[t + 2])
    // Rango de columnas que caen dentro de la sombra del triángulo (las columnas están corridas OX/OZ de celda).
    const i0 = Math.max(0, Math.ceil((Math.min(a[0], b[0], c[0]) - min[0]) / cell - OX))
    const i1 = Math.min(nx - 1, Math.floor((Math.max(a[0], b[0], c[0]) - min[0]) / cell - OX))
    const k0 = Math.max(0, Math.ceil((Math.min(a[2], b[2], c[2]) - min[2]) / cell - OZ))
    const k1 = Math.min(nz - 1, Math.floor((Math.max(a[2], b[2], c[2]) - min[2]) / cell - OZ))
    const det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])
    if (Math.abs(det) < 1e-12) continue
    for (let k = k0; k <= k1; k++) {
      // Corrimiento de una fracción de celda: si la columna pasa justo por una arista compartida
      // (un meridiano de la esfera), el cruce se cuenta dos veces o ninguna y el signo sale al revés.
      const z = min[2] + (k + OZ) * cell
      for (let i = i0; i <= i1; i++) {
        const x = min[0] + (i + OX) * cell
        const u = ((x - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (z - a[2])) / det
        const v = ((b[0] - a[0]) * (z - a[2]) - (x - a[0]) * (b[2] - a[2])) / det
        if (u < 0 || v < 0 || u + v > 1) continue
        cols[k * nx + i].push(a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v)
      }
    }
  }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const ys = cols[k * nx + i]
    if (ys.length < 2 || ys.length % 2) continue
    ys.sort((x, y) => x - y)
    for (let j = 0; j < ny; j++) {
      const y = min[1] + j * cell
      let below = 0
      while (below < ys.length && ys[below] < y) below++
      if (below % 2) data[at(i, j, k)] = -data[at(i, j, k)]
    }
  }
  return { min, cell, nx, ny, nz, data }
}

/** Distancia interpolada en un punto. Afuera de la grilla devuelve un número grande. */
export function sampleSdf(s: Sdf, x: number, y: number, z: number): number {
  const fx = (x - s.min[0]) / s.cell, fy = (y - s.min[1]) / s.cell, fz = (z - s.min[2]) / s.cell
  if (fx < 0 || fy < 0 || fz < 0 || fx >= s.nx - 1 || fy >= s.ny - 1 || fz >= s.nz - 1) return 1e9
  const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz)
  const tx = fx - i, ty = fy - j, tz = fz - k
  const nx = s.nx, nxy = s.nx * s.ny, d = s.data
  const n = k * nxy + j * nx + i
  const c00 = d[n] + (d[n + 1] - d[n]) * tx
  const c10 = d[n + nx] + (d[n + nx + 1] - d[n + nx]) * tx
  const c01 = d[n + nxy] + (d[n + nxy + 1] - d[n + nxy]) * tx
  const c11 = d[n + nxy + nx] + (d[n + nxy + nx + 1] - d[n + nxy + nx]) * tx
  const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty
  return c0 + (c1 - c0) * tz
}

/** Gradiente (hacia afuera) en `out`. */
export function sdfNormal(s: Sdf, x: number, y: number, z: number, out: Float32Array | number[]): void {
  const h = s.cell * 0.5
  const gx = sampleSdf(s, x + h, y, z) - sampleSdf(s, x - h, y, z)
  const gy = sampleSdf(s, x, y + h, z) - sampleSdf(s, x, y - h, z)
  const gz = sampleSdf(s, x, y, z + h) - sampleSdf(s, x, y, z - h)
  const len = Math.hypot(gx, gy, gz) || 1
  out[0] = gx / len; out[1] = gy / len; out[2] = gz / len
}
