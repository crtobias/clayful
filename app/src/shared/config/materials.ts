/** Presets de material que el usuario ve. 'original' existe solo para modelos importados. */
export const MATERIAL_PRESETS = ['arcilla', 'tela', 'gelatina', 'pelo', 'vidrio', 'metal', 'madera', 'plastico'] as const
export type MaterialPreset = (typeof MATERIAL_PRESETS)[number] | 'original'

export const FABRIC_TYPES = ['algodon', 'jean', 'lana', 'punto', 'seda', 'raso', 'terciopelo', 'arpillera', 'cuero'] as const
export type FabricType = (typeof FABRIC_TYPES)[number]

export interface MaterialSpec {
  preset: MaterialPreset
  /** Color en #rrggbb. */
  color: string
  /** Solo para tela. */
  fabric?: FabricType
  /** El ajuste propio del preset, de 0 a 1 (transparencia del vidrio, brillo del metal…). */
  amount?: number
}

export const PRESET_COLOR: Record<MaterialPreset, string> = {
  arcilla: '#d59e84',
  tela: '#e5484d',
  gelatina: '#e5484d',
  pelo: '#6b4a35',
  vidrio: '#cfe6f5',
  metal: '#c9cdd3',
  madera: '#b9834a',
  plastico: '#2f9e68',
  original: '#ffffff',
}

export const FABRIC_COLOR: Record<FabricType, string> = {
  algodon: '#e5484d',
  jean: '#3b5b8f',
  lana: '#c9a27a',
  punto: '#b5483f',
  seda: '#2f7fc4',
  raso: '#c8102e',
  terciopelo: '#8e1f5f',
  arpillera: '#9a7a4e',
  cuero: '#6b3f24',
}

/** Rigidez de cada tela al doblarse (0 = cae como seda, 1 = dura como cuero). La física la usa por defecto. */
export const FABRIC_STIFFNESS: Record<FabricType, number> = {
  seda: 0.1, raso: 0.15, algodon: 0.35, terciopelo: 0.4, punto: 0.45, lana: 0.5, jean: 0.6, arpillera: 0.7, cuero: 0.85,
}

/** Presets con un ajuste (slider) y su valor por defecto. */
export const PRESET_AMOUNT: Partial<Record<MaterialPreset, number>> = {
  arcilla: 0.2,
  gelatina: 0.4,
  vidrio: 0.85,
  metal: 0.7,
  plastico: 0.5,
}

export const DEFAULT_MATERIAL: MaterialSpec = { preset: 'arcilla', color: PRESET_COLOR.arcilla }

export const SWATCHES = ['#ffffff', '#2a2d33', '#e5484d', '#f59f45', '#f7d046', '#5bbf7a', '#4a72b8', '#9cc9ea', '#8b7cf6', '#f4a7b9', '#8e5b3a', '#d59e84']

/** Mezcla un spec parcial sobre el actual. Si cambia el preset, vuelve a los defaults de ese preset. */
export function mergeMaterial(current: MaterialSpec, patch: Partial<MaterialSpec>): MaterialSpec {
  const preset = patch.preset ?? current.preset
  if (preset !== current.preset) {
    const fabric = preset === 'tela' ? (patch.fabric ?? 'algodon') : undefined
    return {
      preset,
      fabric,
      color: patch.color ?? (fabric ? FABRIC_COLOR[fabric] : PRESET_COLOR[preset]),
      amount: patch.amount ?? PRESET_AMOUNT[preset],
    }
  }
  const next: MaterialSpec = { ...current, ...patch }
  if (patch.fabric && patch.fabric !== current.fabric && !patch.color) next.color = FABRIC_COLOR[patch.fabric]
  return next
}
