import type { MaterialSpec } from '@/shared/config/materials'

export type Vec3 = [number, number, number]

export const SHAPES = ['cubo', 'esfera', 'cilindro', 'cono', 'dona', 'plano'] as const
export type Shape = (typeof SHAPES)[number]

/** Una malla de la escena. La geometría vive en el registro (geometry.ts), no en el estado. */
/** 1 = muy bajo, 2 = bajo, 3 = medio. */
/** Detalle del low poly: 0 = muy facetado, 1 = casi liso. */
export type LowPolyLevel = number

export interface LowPoly {
  level: LowPolyLevel
  /** Geometría lisa (densa) de la que sale la low poly. Esculpir y pintar trabajan sobre esta. */
  source: string
}

export interface Part {
  id: string
  name: string
  geometryId: string
  position: Vec3
  /** Euler XYZ en radianes. */
  rotation: Vec3
  scale: Vec3
  material: MaterialSpec
  /** Imagen de referencia (data URL). Si está, la parte es un plano con la imagen. */
  image?: string
  /** Estilo low poly: la geometría visible es una versión facetada de `source`. */
  lowPoly?: LowPoly
  /** Pelo: esta parte son las hebras de otra parte (la sigue cuando se mueve). Las hebras viven en geometry.userData.hair. */
  hair?: { parentId: string }
}

export interface SceneState {
  parts: Part[]
  selectedId: string | null
}

export type SceneCommand =
  | { type: 'add_shape'; shape: Shape; name?: string; position?: Vec3; material?: Partial<MaterialSpec> }
  | { type: 'add_parts'; parts: Part[] }
  | { type: 'select'; id: string | null }
  | { type: 'set_material'; id: string; material: Partial<MaterialSpec> }
  | { type: 'transform'; id: string; position?: Vec3; rotation?: Vec3; scale?: Vec3 }
  | { type: 'set_geometry'; id: string; geometryId: string }
  | { type: 'set_low_poly'; id: string; lowPoly: LowPoly | null }
  | { type: 'rename'; id: string; name: string }
  | { type: 'duplicate'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'clear' }

export interface CommandResult extends SceneState {
  /** Ids de las partes creadas por el comando. */
  created: string[]
}
