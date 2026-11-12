import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { MaterialSpec } from '@/shared/config/materials'
import { addDetail, cloneEditable, isEditable, toEditable } from '@/shared/lib/meshOps'
import { getGeometry, getOriginalMaterial, registerGeometry } from './geometry'
import type { Part } from './model'

let seq = 0

export interface EditStart {
  geometryId: string
  geometry: ReturnType<typeof toEditable>
  /** Cambio de material que hay que aplicar junto (al pintar, el color pasa a los vértices). */
  material?: Partial<MaterialSpec>
}

/**
 * Prepara una versión nueva y editable de la geometría de una parte.
 * La anterior queda intacta en el registro, así deshacer vuelve a ella.
 */
export function beginEdit(part: Part, forPaint: boolean, more = false): EditStart {
  const src = getGeometry(part.geometryId)
  if (!src) throw new Error(`La parte ${part.name} no tiene geometría.`)
  let geometry = isEditable(src) ? cloneEditable(src) : toEditable(src)
  if (more) geometry = addDetail(geometry) ?? geometry
  const geometryId = `edit:${part.id}:${++seq}`
  registerGeometry(geometryId, geometry, getOriginalMaterial(part.geometryId))

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
  return { geometryId, geometry, material }
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
