import { Box3, BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { useScene, newId } from '@/domain/scene/store'
import { getGeometry, registerGeometry } from '@/domain/scene/geometry'
import { partMatrix } from '@/domain/scene/editable'
import type { Part, Vec3 } from '@/domain/scene/model'
import { buildSdf, type Sdf } from '@/domain/physics/sdf'
import { meshVolume, smooth, step, stepXpbd, type PhysicsWorld, type SoftBody } from '@/domain/physics/softbody'
import { DEFAULT_DENSITY, DENSITY_RANGE, clothBody, xpbdCloth, clothWorld, jellyBody, jellyWorld, sheetGrid, sheetOver } from '@/domain/physics/cloth'
import { FABRIC_COLOR, FABRIC_STIFFNESS, type MaterialSpec } from '@/shared/config/materials'
import { boxUV, clusterDecimate, subdivide } from '@/shared/lib/meshOps'

export type SimAction = 'tapar' | 'soltar' | 'gelatina'

export interface SimOptions {
  /** Celdas por lado de la tela (triángulos = 2·n²). */
  density?: number
  /** Rigidez de la tela 0..1 (si no, la del tipo de tela). */
  stiffness?: number
  /** Dureza de la gelatina 0..1 (si no, la del material). */
  hardness?: number
  /** Gravedad: 1 = normal, 0 = flota, 3 = cae muy pesada. */
  gravity?: number
  /**
   * true (el botón Soltar): arranca de la forma que tenía antes de la primera simulación,
   * así se pueden comparar valores. false: sigue desde como está (por ejemplo, después de levantarla).
   */
  fromOriginal?: boolean
  /** Tapar: tamaño de la tela (1 = justo para llegar al piso; 0,5 = la mitad; 2 = el doble). */
  size?: number
  /** 'arriba': el borde de arriba queda fijo (cortinas, banderas, carteles colgados). */
  pin?: 'arriba' | 'ninguno'
}

/** Deja quietas (masa infinita) las partículas del borde de arriba. */
function pinTop(body: SoftBody) {
  let top = -Infinity, bottom = Infinity
  for (let i = 1; i < body.pos.length; i += 3) { top = Math.max(top, body.pos[i]); bottom = Math.min(bottom, body.pos[i]) }
  const tol = Math.max(0.004, (top - bottom) * 0.015)
  for (let i = 0; i < body.invMass.length; i++) if (body.pos[i * 3 + 1] >= top - tol) body.invMass[i] = 0
}

/** Cómo era cada parte antes de simularla por primera vez (geometría y lugar). */
const originals = new Map<string, Part>()

/** La parte ya es una tela simulada: si se mueve, vuelve a caer. */
export const isSimulatedCloth = (part: Part) => part.material.preset === 'tela' && part.geometryId.startsWith('sim:')

let running = false
export const isSimulating = () => running

/** Geometría en coordenadas de mundo, soldada (sin costuras de UV) e indexada. */
function worldMesh(part: Part): BufferGeometry | null {
  const src = getGeometry(part.geometryId)
  if (!src || part.image) return null
  const g = new BufferGeometry()
  g.setAttribute('position', src.attributes.position.clone())
  if (src.index) g.setIndex(src.index.clone())
  g.applyMatrix4(partMatrix(part))
  const welded = mergeVertices(g, 1e-5)
  if (!welded.index) {
    const n = welded.attributes.position.count
    welded.setIndex(Array.from({ length: n }, (_, i) => i))
  }
  return welded
}

const extentOf = (g: BufferGeometry) => {
  g.computeBoundingBox()
  const s = g.boundingBox!.getSize(new Vector3())
  return Math.max(s.x, s.y, s.z) || 1
}

/** Una parte como obstáculo: su SDF (simplificada si es muy densa). */
function collider(part: Part): Sdf | null {
  let g = worldMesh(part)
  if (!g) return null
  // Fina: una remera ajustada queda a 2–3 cm del cuerpo, la grilla tiene que ser más chica que eso.
  const cell = Math.min(0.06, Math.max(0.006, extentOf(g) / 100))
  if (g.index!.count / 3 > 30000) g = clusterDecimate(g, cell * 0.6)
  return buildSdf(g.attributes.position.array as Float32Array, g.index!.array as ArrayLike<number>, cell, cell * 3)
}

/**
 * Cede el turno al navegador (para que dibuje) y sigue. Con MessageChannel y no con setTimeout:
 * los timers se frenan mucho cuando la ventana está en segundo plano.
 */
function yieldThen(fn: () => void) {
  const ch = new MessageChannel()
  ch.port1.onmessage = () => { ch.port1.close(); fn() }
  ch.port2.postMessage(0)
}

/**
 * Corre la simulación de a pedacitos (se ve caer en vivo) y avisa cuando termina.
 * Cada pedacito calcula ~40 ms; si la ventana está en segundo plano (el sistema frena los timers), calcula más por vez.
 */
function animate(body: SoftBody, world: PhysicsWorld, geometry: BufferGeometry, steps: number, _perTick: number, iterations: number, smoothPasses = 0) {
  const attr = geometry.attributes.position as BufferAttribute
  return new Promise<void>((resolve) => {
    let done = 0
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      const budget = now - last > 150 ? 400 : 40
      const start = performance.now()
      while (done < steps && performance.now() - start < budget) {
        // Tela: XPBD con sub-pasos (fuerzas reales). Gelatina: PBD con iteraciones.
        if (body.compliance) stepXpbd(body, world, 1 / 60, iterations)
        else step(body, world, 1 / 60, iterations)
        done++
      }
      last = performance.now()
      if (done >= steps && smoothPasses) smooth(body, world, smoothPasses)
      ;(attr.array as Float32Array).set(body.pos)
      attr.needsUpdate = true
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
      if (done >= steps) resolve()
      else yieldThen(tick)
    }
    tick()
  })
}

/** Deja la geometría centrada en su caja y la parte en ese lugar (sin girar ni escalar). Versión nueva: la caja de selección se recalcula. */
function settle(partId: string, geometry: BufferGeometry) {
  const g = geometry.clone()
  g.computeBoundingBox()
  const c = g.boundingBox!.getCenter(new Vector3())
  g.translate(-c.x, -c.y, -c.z)
  g.computeVertexNormals()
  g.computeBoundingBox()
  g.computeBoundingSphere()
  const geometryId = `sim:${partId}:${newId()}`
  registerGeometry(geometryId, g)
  const s = useScene.getState()
  s.run({ type: 'set_geometry', id: partId, geometryId }, { record: false })
  s.run({ type: 'transform', id: partId, position: [c.x, c.y, c.z], rotation: [0, 0, 0], scale: [1, 1, 1] }, { record: false })
}

function isFlatGeometry(g: BufferGeometry): boolean {
  g.computeBoundingBox()
  const s = g.boundingBox!.getSize(new Vector3())
  const sorted = [s.x, s.y, s.z].sort((a, b) => a - b)
  return sorted[2] > 0 && sorted[0] < sorted[2] * 0.01
}

/** La parte es una lámina (un plano): se puede soltar como tela. */
export function isFlat(part: Part): boolean {
  const g = getGeometry(part.geometryId)
  return Boolean(g && !part.image && isFlatGeometry(g))
}

const clothMaterial = (m: MaterialSpec): MaterialSpec =>
  m.preset === 'tela' ? m : { preset: 'tela', fabric: 'algodon', color: FABRIC_COLOR.algodon }

const clampDensity = (n: number | undefined) => Math.round(Math.min(DENSITY_RANGE[1], Math.max(DENSITY_RANGE[0], n ?? DEFAULT_DENSITY)))

function sheetGeometry(positions: Float32Array, index: Uint32Array, uv: Float32Array) {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(positions.slice(), 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(new BufferAttribute(index, 1))
  g.computeVertexNormals()
  return g
}

/** Reemplaza la geometría de una parte por una nueva en mundo (un paso de deshacer). */
function replaceGeometry(part: Part, g: BufferGeometry) {
  const s = useScene.getState()
  const geometryId = `sim:${part.id}:${newId()}`
  registerGeometry(geometryId, g)
  s.checkpoint()
  s.run({ type: 'set_geometry', id: part.id, geometryId }, { record: false })
  if (part.lowPoly) s.run({ type: 'set_low_poly', id: part.id, lowPoly: null }, { record: false })
  s.run({ type: 'transform', id: part.id, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, { record: false })
}

function surfaceArea(g: BufferGeometry): number {
  const p = g.attributes.position, idx = g.index!.array
  const a = new Vector3(), b = new Vector3(), c = new Vector3()
  let area = 0
  for (let t = 0; t < idx.length; t += 3) {
    a.fromBufferAttribute(p, idx[t]); b.fromBufferAttribute(p, idx[t + 1]); c.fromBufferAttribute(p, idx[t + 2])
    area += b.sub(a).cross(c.sub(a)).length() / 2
  }
  return area
}

/** Cualquier malla como tela: se ajusta a la densidad pedida (subdivide o simplifica) y queda solo posición + índice. */
function clothMesh(part: Part, density: number): BufferGeometry {
  let g = worldMesh(part)!
  const target = density * density
  while (g.attributes.position.count < target * 0.5) {
    const next = subdivide(g)
    if (next.attributes.position.count > target * 2.5) break
    g = next
  }
  if (g.attributes.position.count > target * 1.8) g = clusterDecimate(g, Math.sqrt(surfaceArea(g) / target))
  const out = new BufferGeometry()
  out.setAttribute('position', new BufferAttribute(new Float32Array(g.attributes.position.array), 3))
  out.setIndex(new BufferAttribute(new Uint32Array(g.index!.array), 1))
  out.computeVertexNormals()
  boxUV(out)
  return out
}

/** Malla cerrada: cada arista la comparten exactamente dos triángulos (tiene adentro). */
function isClosed(index: ArrayLike<number>): boolean {
  const count = new Map<number, number>()
  for (let t = 0; t < index.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = index[t + e], b = index[t + ((e + 1) % 3)]
      const key = a < b ? a * 4194304 + b : b * 4194304 + a
      count.set(key, (count.get(key) ?? 0) + 1)
    }
  }
  for (const c of count.values()) if (c !== 2) return false
  return count.size > 0
}

function averageEdge(pos: ArrayLike<number>, index: ArrayLike<number>): number {
  let sum = 0
  const n = Math.min(index.length, 3000)
  for (let t = 0; t < n; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3
    sum += Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2])
  }
  return sum / (n / 3) || 0.02
}

/**
 * Física de un clic sobre una parte:
 * - tapar: cae una tela nueva encima y se pliega sobre todo lo que toca.
 * - soltar: la parte (plana) es la tela y cae.
 * - gelatina: la parte se aplasta y tiembla según su dureza.
 */
export async function simulate(partId: string, action: SimAction, opts: SimOptions = {}) {
  if (running) throw new Error('Ya hay una simulación andando.')
  const parts = useScene.getState().parts
  const current = parts.find((p) => p.id === partId)
  if (!current || current.image) throw new Error('Esa parte no se puede simular.')
  if (action !== 'tapar' && !originals.has(partId)) originals.set(partId, current)
  const original = originals.get(partId)
  // Arrancar de la forma original (con su nombre y material de ahora).
  const part: Part = action !== 'tapar' && (opts.fromOriginal ?? true) && original && getGeometry(original.geometryId)
    ? { ...current, geometryId: original.geometryId, position: original.position, rotation: original.rotation, scale: original.scale, lowPoly: original.lowPoly }
    : current
  running = true
  try {
    if (action === 'gelatina') {
      let g = worldMesh(part)!
      if (g.attributes.position.count > 2500) g = clusterDecimate(g, extentOf(g) / 26)
      const others = parts.filter((p) => p.id !== part.id).map(collider).filter((s): s is Sdf => Boolean(s))
      const hardness = opts.hardness ?? part.material.amount ?? 0.4
      const gravity = opts.gravity ?? 1
      const positions = new Float32Array(g.attributes.position.array)
      const index = g.index!.array as ArrayLike<number>
      const body = jellyBody(positions, index, hardness)
      // Un empujón para abajo: se aplasta y rebota.
      for (let i = 0; i < body.vel.length; i += 3) body.vel[i + 1] = -2.5
      const shown = new BufferGeometry()
      shown.setAttribute('position', new BufferAttribute(positions.slice(), 3))
      shown.setIndex(Array.from(index))
      shown.computeVertexNormals()
      replaceGeometry(part, shown)
      await animate(body, { ...jellyWorld(others, 0.005), gravity: 9.8 * gravity }, shown, 150, 2, 8)
      settle(part.id, shown)
      return { part: part.name, vertices: positions.length / 3 }
    }

    const n = clampDensity(opts.density)
    const g9 = 9.8 * (opts.gravity ?? 1)
    const material = clothMaterial(part.material)
    const stiffness = Math.min(1, Math.max(0, opts.stiffness ?? FABRIC_STIFFNESS[material.fabric ?? 'algodon']))
    let sheet
    let target: string
    if (action === 'soltar') {
      if (part.material.preset !== 'tela') throw new Error('Soltar es solo para partes con material Tela. Poné Tela primero (set_material preset tela).')
      const src = getGeometry(part.geometryId)
      if (!src) throw new Error('Esa parte no tiene malla.')
      if (!isFlatGeometry(src)) {
        // Cualquier forma: su propia malla se vuelve tela, cae con la gravedad y se pliega.
        const shown = clothMesh(part, n)
        const pos = new Float32Array(shown.attributes.position.array)
        const index = shown.index!.array as ArrayLike<number>
        const body = xpbdCloth(pos, index, stiffness, surfaceArea(shown))
        if (opts.pin === 'arriba') pinTop(body)
        body.selfRadius = averageEdge(pos, index) * 0.6
        // Cerrada (dona, esfera): le queda un poco de aire adentro, como un almohadón; si no, se desinfla del todo.
        if (isClosed(index)) body.volume = { rest: Math.abs(meshVolume(pos, body.tris)) * 0.55 * Math.sign(meshVolume(pos, body.tris) || 1), stiffness: 0.12 }
        const others = parts.filter((p) => p.id !== part.id).map(collider).filter((s): s is Sdf => Boolean(s))
        replaceGeometry(part, shown)
        if (part.material.preset !== 'tela') useScene.getState().run({ type: 'set_material', id: part.id, material }, { record: false })
        await animate(body, { ...clothWorld(others, Math.max(0.006, averageEdge(pos, index) * 0.35)), gravity: g9 }, shown, 300, 6, 16, 2)
        settle(part.id, shown)
        const after = useScene.getState().parts.find((p) => p.id === part.id)!
        return { part: after.name, id: after.id, triangles: index.length / 3 }
      }
      src.computeBoundingBox()
      const b = src.boundingBox!
      const size = b.getSize(new Vector3())
      const flatAxis = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2
      const ax = [0, 1, 2].filter((k) => k !== flatAxis)
      const m = partMatrix(part)
      const lo = b.min.clone(), mid = b.getCenter(new Vector3())
      lo.setComponent(flatAxis, mid.getComponent(flatAxis))
      const toWorld = (v: Vector3) => v.clone().applyMatrix4(m)
      const c0 = toWorld(lo)
      const e1 = lo.clone(); e1.setComponent(ax[0], b.max.getComponent(ax[0]))
      const e2 = lo.clone(); e2.setComponent(ax[1], b.max.getComponent(ax[1]))
      const u = toWorld(e1).sub(c0), v = toWorld(e2).sub(c0)
      sheet = sheetGrid(n, c0.toArray() as Vec3, u.toArray() as Vec3, v.toArray() as Vec3)
      const others = parts.filter((p) => p.id !== part.id).map(collider).filter((s): s is Sdf => Boolean(s))
      const shown = sheetGeometry(sheet.positions, sheet.index, sheet.uv)
      replaceGeometry(part, shown)
      if (part.material.preset !== 'tela') useScene.getState().run({ type: 'set_material', id: part.id, material }, { record: false })
      const cellSize = Math.hypot(...u.toArray()) / n
      const body = clothBody(sheet, stiffness)
      if (opts.pin === 'arriba') pinTop(body)
      await animate(body, { ...clothWorld(others, Math.max(0.008, cellSize * 0.4)), gravity: g9 }, shown, 300, 6, 16, 2)
      settle(part.id, shown)
      target = part.id
    } else {
      const g = worldMesh(part)!
      g.computeBoundingBox()
      const b = new Box3().copy(g.boundingBox!)
      const { corner, u, v } = sheetOver(b.min.toArray() as Vec3, b.max.toArray() as Vec3, 0, 0.18, Math.min(3, Math.max(0.3, opts.size ?? 1)))
      sheet = sheetGrid(n, corner, u, v)
      const colliders = parts.map(collider).filter((s): s is Sdf => Boolean(s))
      const shown = sheetGeometry(sheet.positions, sheet.index, sheet.uv)
      const id = newId()
      const geometryId = `sim:${id}`
      registerGeometry(geometryId, shown)
      useScene.getState().run({
        type: 'add_parts',
        parts: [{ id, name: `Tela sobre ${part.name}`, geometryId, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], material }],
      })
      const cellSize = Math.hypot(...u) / n
      await animate(clothBody(sheet, stiffness), { ...clothWorld(colliders, Math.max(0.008, cellSize * 0.4)), gravity: g9 }, shown, 300, 6, 16, 2)
      settle(id, shown)
      target = id
    }
    const after = useScene.getState().parts.find((p) => p.id === target)!
    return { part: after.name, id: after.id, triangles: 2 * n * n }
  } finally {
    running = false
  }
}
