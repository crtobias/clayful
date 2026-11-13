import { Matrix4, Vector3, type BufferGeometry } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { useScene, newId } from '@/domain/scene/store'
import { getGeometry, registerGeometry } from '@/domain/scene/geometry'
import { partMatrix } from '@/domain/scene/editable'
import type { Part } from '@/domain/scene/model'
import type { Sdf } from '@/domain/physics/sdf'
import {
  DEFAULT_HAIR, clumpHair, clumpSizeFor, combHair, emptyHair, growHair, hairGeometry, removeHair, settleHair, skinSdf, strandsIn, trimHair,
  type HairBrush, type HairData, type HairSettings,
} from '@/domain/physics/hair'
import { NO_SYMMETRY, symmetryCopies, transformDelta, type Symmetry } from '@/shared/lib/symmetry'

/** La parte de pelo que lleva una parte (si tiene). */
export const hairPartOf = (parts: Part[], parentId: string) => parts.find((p) => p.hair?.parentId === parentId)
export const hairDataOf = (part: Part | undefined): HairData | undefined =>
  part ? (getGeometry(part.lowPoly?.source ?? part.geometryId)?.userData.hair as HairData | undefined) : undefined

const skins = new WeakMap<BufferGeometry, { skin: BufferGeometry; readonly sdf: Sdf | null }>()

/** La piel: la malla de la parte, indexada y con normales, y su campo de distancia para que el pelo choque. */
function skinOf(parent: Part) {
  const src = getGeometry(parent.lowPoly?.source ?? parent.geometryId)
  if (!src) return null
  let hit = skins.get(src)
  if (!hit) {
    let skin = src
    if (!skin.index) {
      const g = src.clone()
      for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k)
      skin = mergeVertices(g, 1e-5)
    }
    if (!skin.attributes.normal) skin.computeVertexNormals()
    // El campo de distancia tarda en mallas grandes: se arma recién cuando el pelo tiene que caer.
    let sdf: Sdf | null | undefined
    const ready = skin
    hit = { skin, get sdf() { if (sdf === undefined) sdf = skinSdf(ready); return sdf } }
    skins.set(src, hit)
  }
  return hit
}

/** Gravedad en el espacio local de la parte (si está girada, "abajo" es otro). */
const localDown = (parent: Part) => new Vector3(0, -1, 0).transformDirection(new Matrix4().copy(partMatrix(parent)).invert())

/** Deja la malla del pelo en la escena (sin historial: el paso de deshacer se guarda al empezar). */
function show(hairId: string, data: HairData) {
  const g = hairGeometry(data)
  g.userData.hair = data
  g.userData.persist = { kind: 'hair', data }
  const geometryId = `hair:${hairId}:${newId()}`
  registerGeometry(geometryId, g)
  useScene.getState().run({ type: 'set_geometry', id: hairId, geometryId }, { record: false })
}

/** Para el guardado automático: rearma la malla del pelo a partir de sus hebras. */
export function rebuildHair(persist: { kind: string; data: Record<string, unknown> }): BufferGeometry | null {
  if (persist.kind !== 'hair') return null
  const data = persist.data as unknown as HairData
  const g = hairGeometry(data)
  g.userData.hair = data
  g.userData.persist = { kind: 'hair', data }
  return g
}

/** Cuadros de física según el largo: el pelo largo tarda más en caer. */
const framesFor = (data: HairData) => Math.round(40 + Math.min(1, (data.S - 3) / 7) * 60)

function resolveParent(partId: string) {
  const parts = useScene.getState().parts
  const part = parts.find((p) => p.id === partId)
  if (!part || part.image) return null
  return part.hair ? parts.find((p) => p.id === part.hair!.parentId) ?? null : part
}

/**
 * Empieza un trazo de pelo sobre una parte. Devuelve qué hacer en cada pincelada y al soltar.
 * Coordenadas en el espacio local de la piel.
 */
export function startHair(partId: string, brush: HairBrush, settings: HairSettings, symmetry: Symmetry, clumpSize?: number, clumpLevel?: number) {
  const parent = resolveParent(partId)
  if (!parent) return null
  const skin = skinOf(parent)
  if (!skin) return null
  const s = useScene.getState()
  let hairPart = hairPartOf(s.parts, parent.id)
  if (!hairPart) {
    if (brush !== 'pelo') return null
    const id = newId()
    const data = emptyHair(settings.width, settings.stiffness)
    const g = hairGeometry(data)
    g.userData.hair = data
    const geometryId = `hair:${id}:${newId()}`
    registerGeometry(geometryId, g)
    hairPart = {
      id, name: `Pelo de ${parent.name}`, geometryId, position: parent.position, rotation: parent.rotation, scale: parent.scale,
      material: { preset: 'pelo', color: settings.color }, hair: { parentId: parent.id },
    }
    s.run({ type: 'add_parts', parts: [hairPart] })
    s.run({ type: 'select', id: parent.id })
  } else {
    // Pelo que ya es una malla común (sin hebras, de una versión vieja): no se toca, salvo para hacer crecer pelo nuevo.
    if (!hairDataOf(hairPart) && brush !== 'pelo') return null
    s.checkpoint()
    // El low poly genérico (simplificar la malla) no sirve para el pelo: se reemplaza por mechones.
    if (hairPart.lowPoly) {
      s.run({ type: 'set_geometry', id: hairPart.id, geometryId: hairPart.lowPoly.source }, { record: false })
      s.run({ type: 'set_low_poly', id: hairPart.id, lowPoly: null }, { record: false })
    }
    if (brush === 'pelo' && hairPart.material.color !== settings.color) s.run({ type: 'set_material', id: hairPart.id, material: { color: settings.color } }, { record: false })
  }
  const hairId = hairPart.id
  let data: HairData = hairDataOf(hairPart) ?? emptyHair(settings.width, settings.stiffness)
  if (brush === 'pelo') data = { ...data, width: settings.width, stiffness: settings.stiffness }
  const touched: number[] = []
  let frame = 0

  const redraw = () => {
    if (frame) return
    frame = requestAnimationFrame(() => { frame = 0; show(hairId, data) })
  }

  return {
    dab(center: Vector3, normal: Vector3, radius: number, delta: Vector3) {
      for (const c of symmetryCopies(center, normal, symmetry, radius * 0.35)) {
        const d = { center: c.center, radius }
        if (brush === 'pelo') {
          const before = data.n
          data = growHair(data, skin.skin, d, settings)
          for (let i = before; i < data.n; i++) touched.push(i)
        } else if (brush === 'peinar') {
          touched.push(...strandsIn(data, d))
          data = combHair(data, d, transformDelta(delta, c.matrix), 1)
        } else if (brush === 'mechones') {
          data = clumpHair(data, d, clumpSize ?? Math.max(0.003, Math.round(radius * 500) / 1000))
        } else if (brush === 'recortar') {
          touched.push(...strandsIn(data, d))
          data = trimHair(data, d, 0.85)
        } else {
          data = removeHair(data, d)
          touched.length = 0
        }
      }
      redraw()
    },
    end() {
      if (frame) { cancelAnimationFrame(frame); frame = 0 }
      // Al soltar, lo que tocaste cae con la gravedad (como la tela). Peinar deja una caída más corta.
      if (brush === 'mechones') data = { ...data, clumpLevel }
      if (brush !== 'borrar_pelo' && brush !== 'mechones' && touched.length) {
        data = settleHair(data, skin.sdf, localDown(parent), 1, brush === 'peinar' ? 25 : framesFor(data), touched)
      }
      show(hairId, data)
    },
  }
}

/** La barra Low poly en una parte de pelo: todo en mechones (más o menos grandes) o, apagada, de vuelta a hebras. */
export function setHairLowPoly(partId: string, level: number | null) {
  const part = useScene.getState().parts.find((p) => p.id === partId)
  if (!part?.hair) return false
  hairFromTool(part.id, 'mechones', DEFAULT_HAIR, null, 0, null, level === null ? 0 : clumpSizeFor(level), level ?? undefined)
  return true
}

/** "Hacer caer de nuevo": todo el pelo de la parte cae otra vez (después de girarla, por ejemplo). */
export function dropAllHair(partId: string) {
  const parent = resolveParent(partId)
  if (!parent) return 0
  const hairPart = hairPartOf(useScene.getState().parts, parent.id)
  const data = hairDataOf(hairPart)
  const skin = skinOf(parent)
  if (!hairPart || !data || !skin) return 0
  useScene.getState().checkpoint()
  show(hairPart.id, settleHair(data, skin.sdf, localDown(parent), 1, framesFor(data)))
  return data.n
}

/** Para el MCP: crecer pelo en toda la parte o alrededor de puntos (en coordenadas de mundo). */
export function hairFromTool(partId: string, action: string, settings: HairSettings, points: Vector3[] | null, radius: number, comb: Vector3 | null, clump?: number, clumpLevel?: number) {
  const parent = resolveParent(partId)
  if (!parent) throw new Error('Esa parte no puede tener pelo.')
  if (action === 'caer') return dropAllHair(parent.id)
  const brush = ({ crecer: 'pelo', peinar: 'peinar', recortar: 'recortar', mechones: 'mechones', borrar: 'borrar_pelo' } as Record<string, HairBrush>)[action]
  if (!brush) throw new Error('action: crecer, peinar, recortar, mechones, borrar o caer.')
  const inv = new Matrix4().copy(partMatrix(parent)).invert()
  const scale = (Math.abs(parent.scale[0]) + Math.abs(parent.scale[1]) + Math.abs(parent.scale[2])) / 3 || 1
  const handle = startHair(parent.id, brush, settings, NO_SYMMETRY, brush === 'mechones' ? (clump ?? 0.015) / scale : undefined, clumpLevel)
  if (!handle) throw new Error('Para peinar, recortar o borrar, primero hacé crecer pelo.')
  const skin = skinOf(parent)!
  if (!points) {
    // Toda la piel: un pincel enorme centrado en la parte.
    skin.skin.computeBoundingBox()
    const box = skin.skin.boundingBox!
    handle.dab(box.getCenter(new Vector3()), new Vector3(0, 1, 0), box.getSize(new Vector3()).length(), comb ? comb.clone().transformDirection(inv) : new Vector3())
  } else {
    const localDelta = comb ? comb.clone().applyMatrix4(inv).sub(new Vector3().applyMatrix4(inv)) : new Vector3()
    for (const p of points) handle.dab(p.clone().applyMatrix4(inv), new Vector3(0, 1, 0), radius / scale, localDelta)
  }
  handle.end()
  return hairDataOf(hairPartOf(useScene.getState().parts, parent.id))?.n ?? 0
}
