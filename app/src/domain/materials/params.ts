import { PRESET_AMOUNT, type MaterialSpec } from '@/shared/config/materials'

export type Pattern = 'weave' | 'twill' | 'knit' | 'grain' | 'wood'

/** Parámetros físicos de un material. Puro: se testea sin navegador. */
export interface MaterialParams {
  color: string
  roughness: number
  metalness: number
  transmission?: number
  thickness?: number
  ior?: number
  sheen?: number
  sheenRoughness?: number
  sheenColor?: string
  clearcoat?: number
  clearcoatRoughness?: number
  pattern?: Pattern
  /** Cuántas veces se repite el patrón sobre la pieza. */
  repeat?: number
  /** Fuerza del relieve del patrón. */
  relief?: number
}

const amountOf = (spec: MaterialSpec) => spec.amount ?? PRESET_AMOUNT[spec.preset] ?? 0.5

export function materialParams(spec: MaterialSpec): MaterialParams {
  const color = spec.color
  const a = amountOf(spec)
  switch (spec.preset) {
    case 'arcilla':
      return { color, roughness: 0.95 - a * 0.5, metalness: 0, sheen: 0.25, sheenRoughness: 0.9, sheenColor: '#ffffff' }
    case 'vidrio':
      return { color, roughness: 0.04, metalness: 0, transmission: a, thickness: 0.6, ior: 1.5 }
    case 'metal':
      return { color, roughness: 0.6 - a * 0.55, metalness: 1 }
    case 'madera':
      return { color, roughness: 0.7, metalness: 0, pattern: 'wood', repeat: 1, clearcoat: 0.1 }
    case 'plastico':
      return { color, roughness: 0.6 - a * 0.5, metalness: 0, clearcoat: 0.2 + a * 0.6, clearcoatRoughness: 0.2 }
    case 'tela':
      switch (spec.fabric ?? 'algodon') {
        case 'algodon':
          return { color, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.8, sheenColor: '#ffffff', pattern: 'weave', repeat: 10, relief: 0.5 }
        case 'jean':
          return { color, roughness: 0.95, metalness: 0, sheen: 0.6, sheenRoughness: 0.5, sheenColor: '#c7d4ea', pattern: 'twill', repeat: 12, relief: 0.8 }
        case 'lana':
          return { color, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 1, sheenColor: '#ffffff', pattern: 'knit', repeat: 6, relief: 1.2 }
        case 'seda':
          return { color, roughness: 0.35, metalness: 0, sheen: 1, sheenRoughness: 0.25, sheenColor: '#ffffff', pattern: 'weave', repeat: 30, relief: 0.15 }
        case 'cuero':
          return { color, roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.45, pattern: 'grain', repeat: 3, relief: 0.6 }
      }
      break
    case 'original':
      return { color, roughness: 0.8, metalness: 0 }
  }
  return { color, roughness: 0.8, metalness: 0 }
}
