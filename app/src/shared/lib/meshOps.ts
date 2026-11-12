import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

/** Una malla editable: indexada, sin costuras, densa y con color por vértice. */
export interface EditableOptions {
  minVertices?: number
  maxVertices?: number
  /** Color inicial de los vértices (sRGB #rrggbb). Blanco por defecto. */
  color?: string
}

let topoSeq = 0
const neighborsCache = new Map<string, { offsets: Uint32Array; list: Uint32Array }>()

export function isEditable(g: BufferGeometry): boolean {
  return Boolean(g.userData.editable) || (g.index !== null && g.hasAttribute('color') && g.attributes.position.count > 4000)
}

/** Parte cada triángulo en 4 (punto medio de cada lado, compartido entre vecinos). */
export function subdivide(g: BufferGeometry): BufferGeometry {
  const pos = g.attributes.position.array as ArrayLike<number>
  const idx = g.index!.array as ArrayLike<number>
  const col = g.hasAttribute('color') ? (g.attributes.color.array as ArrayLike<number>) : null
  const msk = g.hasAttribute('mask') ? (g.attributes.mask.array as ArrayLike<number>) : null
  const n = g.attributes.position.count
  const verts = Array.from(pos)
  const colors = col ? Array.from(col) : null
  const masks = msk ? Array.from(msk) : null
  const mids = new Map<number, number>()
  const mid = (a: number, b: number) => {
    const key = a < b ? a * n + b : b * n + a
    const hit = mids.get(key)
    if (hit !== undefined) return hit
    const i = verts.length / 3
    for (let k = 0; k < 3; k++) verts.push((verts[a * 3 + k] + verts[b * 3 + k]) / 2)
    if (colors) for (let k = 0; k < 3; k++) colors.push((colors[a * 3 + k] + colors[b * 3 + k]) / 2)
    if (masks) masks.push((masks[a] + masks[b]) / 2)
    mids.set(key, i)
    return i
  }
  const out: number[] = []
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2]
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a)
    out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
  }
  const next = new BufferGeometry()
  next.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3))
  if (colors) next.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  if (masks) next.setAttribute('mask', new BufferAttribute(new Float32Array(masks), 1))
  next.setIndex(new BufferAttribute(new Uint32Array(out), 1))
  return next
}

function finish(g: BufferGeometry): BufferGeometry {
  g.computeVertexNormals()
  g.computeBoundingBox()
  g.computeBoundingSphere()
  g.userData = { editable: true, topo: `t${++topoSeq}` }
  return g
}

/** Convierte cualquier geometría en editable (para esculpir y pintar). */
export function toEditable(src: BufferGeometry, opts: EditableOptions = {}): BufferGeometry {
  const { minVertices = 12000, maxVertices = 45000 } = opts
  let g = new BufferGeometry()
  g.setAttribute('position', src.getAttribute('position').clone())
  if (src.index) g.setIndex(src.index.clone())
  g = mergeVertices(g, 1e-5)
  while (g.attributes.position.count < minVertices) {
    const next = subdivide(g)
    if (next.attributes.position.count > maxVertices) break
    g = next
  }
  const c = new Color(opts.color ?? '#ffffff')
  const colors = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b }
  g.setAttribute('color', new BufferAttribute(colors, 3))
  g.setAttribute('mask', new BufferAttribute(new Float32Array(g.attributes.position.count), 1))
  return finish(g)
}

/** Asegura el atributo de máscara (0 = libre, 1 = protegido). */
export function ensureMask(g: BufferGeometry): void {
  if (!g.hasAttribute('mask')) g.setAttribute('mask', new BufferAttribute(new Float32Array(g.attributes.position.count), 1))
}

/** Más detalle: subdivide una vez (si no se pasa del máximo). */
export function addDetail(src: BufferGeometry, maxVertices = 160000): BufferGeometry | null {
  const next = subdivide(src)
  if (next.attributes.position.count > maxVertices) return null
  return finish(next)
}

/** Copia para un trazo nuevo (lo viejo queda intacto para deshacer). Mantiene la topología. */
export function cloneEditable(src: BufferGeometry): BufferGeometry {
  const g = src.clone()
  g.userData = { ...src.userData, editable: true, topo: src.userData.topo ?? `t${++topoSeq}` }
  return g
}

/** Vecinos de cada vértice (para suavizar). Se calcula una vez por topología. */
export function neighbors(g: BufferGeometry): { offsets: Uint32Array; list: Uint32Array } {
  const key = String(g.userData.topo ?? '')
  const hit = key && neighborsCache.get(key)
  if (hit) return hit
  const n = g.attributes.position.count
  const idx = g.index!.array as ArrayLike<number>
  const sets: Set<number>[] = Array.from({ length: n }, () => new Set<number>())
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2]
    sets[a].add(b).add(c); sets[b].add(a).add(c); sets[c].add(a).add(b)
  }
  const offsets = new Uint32Array(n + 1)
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + sets[i].size
  const list = new Uint32Array(offsets[n])
  for (let i = 0; i < n; i++) { let k = offsets[i]; for (const j of sets[i]) list[k++] = j }
  const res = { offsets, list }
  if (key) neighborsCache.set(key, res)
  return res
}

/** Vértice más cercano a un punto (local). Devuelve su posición y normal. */
export function nearestVertex(g: BufferGeometry, p: Vector3): { point: Vector3; normal: Vector3; index: number } {
  const pos = g.attributes.position
  const nor = g.attributes.normal
  let best = -1, bestD = Infinity
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - p.x, dy = pos.getY(i) - p.y, dz = pos.getZ(i) - p.z
    const d = dx * dx + dy * dy + dz * dz
    if (d < bestD) { bestD = d; best = i }
  }
  return {
    index: best,
    point: new Vector3(pos.getX(best), pos.getY(best), pos.getZ(best)),
    normal: new Vector3(nor.getX(best), nor.getY(best), nor.getZ(best)).normalize(),
  }
}

/** Después de mover vértices: normales, cajas y aviso a la GPU. */
export function refresh(g: BufferGeometry, moved: boolean, painted: boolean, masked = false): void {
  if (masked && g.hasAttribute('mask')) g.attributes.mask.needsUpdate = true
  if (moved) {
    g.attributes.position.needsUpdate = true
    g.computeVertexNormals()
    g.computeBoundingBox()
    g.computeBoundingSphere()
  }
  if (painted) g.attributes.color.needsUpdate = true
}
