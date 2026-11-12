import { BufferGeometry, Color, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { MaterialSpec } from '@/shared/config/materials'
import { addDetail, cloneEditable, clusterDecimate, isEditable, lowPolyCell, toEditable } from '@/shared/lib/meshOps'
import { getGeometry, getOriginalMaterial, registerGeometry } from './geometry'
import type { LowPoly, LowPolyLevel, Part } from './model'

let seq = 0

export interface EditStart {
  /** Lo que se ve (para low poly, la versión facetada). */
  geometryId: string
  /** Lo que se edita: la malla lisa. */
  geometry: BufferGeometry
  /** Cambio de material que hay que aplicar junto (al pintar, el color pasa a los vértices). */
  material?: Partial<MaterialSpec>
  /** Si la parte es low poly: su nueva fuente lisa y cómo rehacer la versión facetada. */
  lowPoly?: LowPoly
  regenerate?: () => BufferGeometry
}

/**
 * Prepara una versión nueva y editable de una parte. La anterior queda intacta para deshacer.
 * Si la parte es low poly, se edita la malla lisa y la facetada se rehace en vivo.
 */
export function beginEdit(part: Part, forPaint: boolean, more = false): EditStart {
  const srcId = part.lowPoly?.source ?? part.geometryId
  const src = getGeometry(srcId)
  if (!src) throw new Error(`La parte ${part.name} no tiene geometría.`)
  let geometry = isEditable(src) ? cloneEditable(src) : toEditable(src)
  if (more) geometry = addDetail(geometry) ?? geometry
  const id = `edit:${part.id}:${++seq}`
  registerGeometry(id, geometry, getOriginalMaterial(part.geometryId))

  let material: Partial<MaterialSpec> | undefined
  const original = part.material.preset === 'original'
  if (forPaint && (original || part.material.color.toLowerCase() !== '#ffffff')) {
    // El color del material se "hornea" en los vértices y el material queda blanco: así se pinta con colores reales.
    const tint = new Color(original ? '#ffffff' : part.material.color)
    const col = geometry.attributes.color
    for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * tint.r, col.getY(i) * tint.g, col.getZ(i) * tint.b)
    col.needsUpdate = true
    material = original ? { preset: 'arcilla', color: '#ffffff' } : { color: '#ffffff' }
  }

  if (!part.lowPoly) return { geometryId: id, geometry, material }

  const level = part.lowPoly.level
  const cell = lowPolyCell(geometry, level)
  const displayId = `lowpoly:${part.id}:${seq}`
  const work = geometry
  let current: BufferGeometry | null = null
  const regenerate = () => {
    const next = clusterDecimate(work, cell)
    current?.dispose()
    current = next
    registerGeometry(displayId, next, getOriginalMaterial(part.geometryId))
    return next
  }
  regenerate()
  return { geometryId: displayId, geometry: work, material, lowPoly: { level, source: id }, regenerate }
}

/** Versión low poly de una parte (o null para volver a lisa). Devuelve qué geometría mostrar. */
export function lowPolyVersion(part: Part, level: LowPolyLevel | null): { geometryId: string; lowPoly: LowPoly | null } | null {
  if (level === null) return part.lowPoly ? { geometryId: part.lowPoly.source, lowPoly: null } : null
  let sourceId = part.lowPoly?.source ?? part.geometryId
  let source = getGeometry(sourceId)
  if (!source) throw new Error(`La parte ${part.name} no tiene geometría.`)
  if (!isEditable(source)) {
    source = toEditable(source)
    sourceId = `edit:${part.id}:${++seq}`
    registerGeometry(sourceId, source, getOriginalMaterial(part.geometryId))
  }
  const displayId = `lowpoly:${part.id}:${++seq}`
  registerGeometry(displayId, clusterDecimate(source, lowPolyCell(source, level)), getOriginalMaterial(part.geometryId))
  return { geometryId: displayId, lowPoly: { level, source: sourceId } }
}

/** Matriz mundo de una parte (para trabajar sin el objeto 3D, por ejemplo desde el MCP). */
export function partMatrix(part: Part): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...part.position),
    new Quaternion().setFromEuler(new Euler(...part.rotation)),
    new Vector3(...part.scale),
  )
}

export const meanScale = (part: Part) => (Math.abs(part.scale[0]) + Math.abs(part.scale[1]) + Math.abs(part.scale[2])) / 3 || 1
