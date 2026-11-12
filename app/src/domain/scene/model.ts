import type { MaterialSpec } from '@/shared/config/materials'

export type Vec3 = [number, number, number]

export const SHAPES = ['cubo', 'esfera', 'cilindro', 'cono', 'dona', 'plano'] as const
export type Shape = (typeof SHAPES)[number]

/** Una malla de la escena. La geometría vive en el registro (geometry.ts), no en el estado. */
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
  | { type: 'rename'; id: string; name: string }
  | { type: 'duplicate'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'clear' }

export interface CommandResult extends SceneState {
  /** Ids de las partes creadas por el comando. */
  created: string[]
}
