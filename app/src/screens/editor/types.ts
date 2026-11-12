export type Tool = 'elegir' | 'mover' | 'girar' | 'escalar'

export const LOOK_VIEWS = ['actual', 'frente', 'atras', 'izquierda', 'derecha', 'arriba', 'perspectiva'] as const
export type LookView = (typeof LOOK_VIEWS)[number]

/** Saca una foto de la vista 3D (JPEG en data URL). */
export type CaptureFn = (view: LookView) => string
