import type { BufferGeometry } from 'three'
import type { SculptBrush, Tip } from '@/domain/sculpt/brushes'
import type { PaintTool } from '@/domain/paint/paint'

export type Mode = 'modelar' | 'esculpir' | 'pintar'
export type Tool = 'elegir' | 'mover' | 'girar' | 'escalar'

export interface SculptSettings {
  brush: SculptBrush
  tip: Tip
  /** Radio en metros (mundo). */
  size: number
  strength: number
  angle: number
  mirror: boolean
}

export interface PaintSettings {
  tool: PaintTool
  color: string
  size: number
  softness: number
  mirror: boolean
}

export const DEFAULT_SCULPT: SculptSettings = { brush: 'sumar', tip: 'suave', size: 0.15, strength: 0.5, angle: 0, mirror: true }
export const DEFAULT_PAINT: PaintSettings = { tool: 'pincel', color: '#4a72b8', size: 0.08, softness: 0.4, mirror: false }

/** Lo que la vista 3D le pide al editor para editar mallas (así el historial queda en un solo lugar). */
export interface EditHooks {
  /** Prepara una versión editable de la parte y la devuelve. */
  onStrokeStart: (partId: string) => BufferGeometry | null
  onFill: (partId: string) => void
  onPick: (color: string) => void
}

export const LOOK_VIEWS = ['actual', 'frente', 'atras', 'izquierda', 'derecha', 'arriba', 'perspectiva'] as const
export type LookView = (typeof LOOK_VIEWS)[number]

/** Saca una foto de la vista 3D (JPEG en data URL). */
export type CaptureFn = (view: LookView) => string
