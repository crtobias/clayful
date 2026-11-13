// Kit de formas para run_code en Clayful. Pegá este archivo ENTERO al principio del código de run_code.
// Formas como campos de distancia (negativo = adentro) que se funden con smin, y `nets` que las convierte en malla.
// Unidades: metros. Y arriba, piso y = 0, el frente mira a +Z.

/** Unión suave: funde dos formas (k = radio de la unión, ej. 0.05). */
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25 }
/** Resta: saca b de a. */
const sub = (a, b) => Math.max(a, -b)
/** Esfera de radio r en (cx, cy, cz). */
const sphere = (x, y, z, cx, cy, cz, r) => Math.hypot(x - cx, y - cy, z - cz) - r
/** Elipsoide con radios rx, ry, rz (aproximado, bueno para cabezas y cuerpos). */
const ellipsoid = (x, y, z, cx, cy, cz, rx, ry, rz) => { const k0 = Math.hypot((x - cx) / rx, (y - cy) / ry, (z - cz) / rz); const k1 = Math.hypot((x - cx) / rx / rx, (y - cy) / ry / ry, (z - cz) / rz / rz); return k1 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz) }
/** Caja redondeada: medio tamaño bx, by, bz y radio de esquina r. Centrada en el origen (restá el centro antes). */
function roundBox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - bx, qy = Math.abs(y) - by, qz = Math.abs(z) - bz
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r
}
/** Cápsula/cono redondeado en 3D de A a B, radio r1 en A y r2 en B (brazos, piernas, mangas, cuellos). */
function capsule3(x, y, z, ax, ay, az, bx, by, bz, r1, r2) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, px = x - ax, py = y - ay, pz = z - az
  const h = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz)))
  return Math.hypot(px - dx * h, py - dy * h, pz - dz * h) - (r1 + (r2 - r1) * h)
}

/** Cápsula en el plano XY (eje con z = 0), de A a B. Atajo de capsule3 para brazos y mangas de frente. */
const capsule = (x, y, z, ax, ay, bx, by, r1, r2) => capsule3(x, y, z, ax, ay, 0, bx, by, 0, r1, r2)

/**
 * Malla de la superficie (nivel 0) de `field` dentro de la caja [min, max] con celdas de H metros.
 * keep(x, y, z) opcional: devuelve false para sacar triángulos (agujeros de cuello, ruedo, puños).
 * H = 0.01 para piezas de ~1 m; más chico = más detalle y más lento.
 */
function nets(field, [x0, y0, z0], [x1, y1, z1], H, keep) {
  const nx = Math.ceil((x1 - x0) / H) + 1, ny = Math.ceil((y1 - y0) / H) + 1, nz = Math.ceil((z1 - z0) / H) + 1
  const F = new Float32Array(nx * ny * nz), at = (i, j, k) => (k * ny + j) * nx + i
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[at(i, j, k)] = field(x0 + i * H, y0 + j * H, z0 + k * H)
  const vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cid = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i
  const C = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]], E = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]]
  const pos = [], v = new Float32Array(8)
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0
    for (let c = 0; c < 8; c++) { v[c] = F[at(i + C[c][0], j + C[c][1], k + C[c][2])]; if (v[c] < 0) neg++ }
    if (neg === 0 || neg === 8) continue
    let sx = 0, sy = 0, sz = 0, n = 0
    for (const [a, b] of E) { if ((v[a] < 0) === (v[b] < 0)) continue; const t = v[a] / (v[a] - v[b]); sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++ }
    vid[cid(i, j, k)] = pos.length / 3
    pos.push(x0 + (i + sx / n) * H, y0 + (j + sy / n) * H, z0 + (k + sz / n) * H)
  }
  const idx = []
  const tri = (a, b, c) => {
    if (keep) { const cx = (pos[a*3] + pos[b*3] + pos[c*3]) / 3, cy = (pos[a*3+1] + pos[b*3+1] + pos[c*3+1]) / 3, cz = (pos[a*3+2] + pos[b*3+2] + pos[c*3+2]) / 3; if (!keep(cx, cy, cz)) return }
    idx.push(a, b, c)
  }
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) { tri(a, c, b); tri(a, d, c) } else { tri(a, b, c); tri(a, c, d) } }
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const inside = F[at(i, j, k)] < 0
    if (inside !== (F[at(i + 1, j, k)] < 0)) quad(vid[cid(i, j - 1, k - 1)], vid[cid(i, j, k - 1)], vid[cid(i, j, k)], vid[cid(i, j - 1, k)], !inside)
    if (inside !== (F[at(i, j + 1, k)] < 0)) quad(vid[cid(i - 1, j, k - 1)], vid[cid(i - 1, j, k)], vid[cid(i, j, k)], vid[cid(i, j, k - 1)], !inside)
    if (inside !== (F[at(i, j, k + 1)] < 0)) quad(vid[cid(i - 1, j - 1, k)], vid[cid(i, j - 1, k)], vid[cid(i, j, k)], vid[cid(i - 1, j, k)], !inside)
  }
  // Sacar vértices sueltos y reindexar.
  const used = new Int32Array(pos.length / 3).fill(-1), P = []
  const out = idx.map((a) => { if (used[a] < 0) { used[a] = P.length / 3; P.push(pos[a*3], pos[a*3+1], pos[a*3+2]) } return used[a] })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setIndex(out)
  g.computeVertexNormals()
  return g
}
