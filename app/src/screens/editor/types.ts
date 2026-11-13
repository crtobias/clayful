import type { BufferGeometry, Vector3 } from 'three'
import type { SculptBrush } from '@/domain/sculpt/brushes'
import { DEFAULT_HAIR, type HairBrush, type HairSettings } from '@/domain/physics/hair'
import type { BlendMode, PaintTool } from '@/domain/paint/paint'
import type { Tip } from '@/shared/lib/brushShape'
import { NO_SYMMETRY, type Symmetry } from '@/shared/lib/symmetry'

export type Mode = 'modelar' | 'esculpir' | 'pintar'
export type Tool = 'elegir' | 'mover' | 'girar' | 'escalar'

export interface SculptSettings {
  brush: SculptBrush | HairBrush
  hair: HairSettings
  tip: Tip
  /** Radio en metros (mundo). */
  size: number
  strength: number
  angle: number
  symmetry: Symmetry
}

export interface PaintSettings {
  tool: PaintTool
  color: string
  /** Segundo color (degradado). */
  color2: string
  tip: Tip
  angle: number
  size: number
  softness: number
  strength: number
  blend: BlendMode
  symmetry: Symmetry
  /** Plantilla: imagen (data URL) que se pinta a través del pincel. */
  stencil: string | null
}

export const DEFAULT_SCULPT: SculptSettings = {
  brush: 'sumar', hair: DEFAULT_HAIR, tip: 'suave', size: 0.15, strength: 0.5, angle: 0, symmetry: { ...NO_SYMMETRY, x: true },
}
export const DEFAULT_PAINT: PaintSettings = {
  tool: 'pincel', color: '#4a72b8', color2: '#ffffff', tip: 'suave', angle: 0, size: 0.08, softness: 0.4, strength: 0.8,
  blend: 'mezclar', symmetry: NO_SYMMETRY, stencil: null,
}

/** Lo que la vista 3D le pide al editor para editar mallas (así el historial queda en un solo lugar). */
export interface EditHooks {
  /**
   * Prepara una versión editable de la parte. `geometry` es la malla que se edita;
   * si la parte es low poly, `regenerate` rehace la versión facetada que se ve.
   */
  onStrokeStart: (partId: string) => { geometry: BufferGeometry; regenerate?: () => BufferGeometry } | null
  onFill: (partId: string) => void
  onPick: (color: string) => void
  /**
   * Pinceles de pelo: arranca un trazo sobre la parte (la piel). Cada pincelada va en el espacio local de la piel.
   * `delta` = cuánto se movió el pincel desde la pincelada anterior (para peinar).
   */
  onHairStart: (partId: string) => { dab: (center: Vector3, normal: Vector3, radius: number, delta: Vector3) => void; end: () => void } | null
}

export const LOOK_VIEWS = ['actual', 'frente', 'atras', 'izquierda', 'derecha', 'arriba', 'perspectiva'] as const
export type LookView = (typeof LOOK_VIEWS)[number]

/** Saca una foto de la vista 3D (JPEG en data URL). */
export type CaptureFn = (view: LookView) => string
