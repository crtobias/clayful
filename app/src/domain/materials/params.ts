import { PRESET_AMOUNT, type MaterialSpec } from '@/shared/config/materials'

export type Pattern = 'weave' | 'twill' | 'knit' | 'grain' | 'wood' | 'burlap' | 'fuzz'

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
  /** Variación de color del patrón (0 = nada): los hilos se ven más claros y más oscuros. */
  tint?: number
  /** Brillo estirado en una dirección (raso, seda). */
  anisotropy?: number
  /** Gelatina: color que toma la luz al atravesarla. */
  attenuationColor?: string
  attenuationDistance?: number
  /** Se ve de los dos lados (las telas sueltas). */
  doubleSided?: boolean
}

/** Mezcla dos colores #rrggbb (t = 0 → a, 1 → b). */
function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')
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
    case 'gelatina':
      return {
        color: mix(color, '#ffffff', 0.35), roughness: 0.06, metalness: 0, transmission: 0.85, thickness: 0.8, ior: 1.35,
        attenuationColor: color, attenuationDistance: 0.35, clearcoat: 1, clearcoatRoughness: 0.05,
      }
    case 'tela': {
      const base = { metalness: 0, doubleSided: true }
      switch (spec.fabric ?? 'algodon') {
        case 'algodon':
          return { ...base, color, roughness: 0.95, sheen: 0.35, sheenRoughness: 0.7, sheenColor: mix(color, '#ffffff', 0.3), pattern: 'weave', repeat: 40, relief: 0.6, tint: 0.12 }
        case 'jean':
          return { ...base, color, roughness: 0.9, sheen: 0.4, sheenRoughness: 0.6, sheenColor: '#c7d4ea', pattern: 'twill', repeat: 22, relief: 0.7, tint: 0.35 }
        case 'lana':
          return { ...base, color, roughness: 1, sheen: 0.45, sheenRoughness: 0.9, sheenColor: mix(color, '#ffffff', 0.25), pattern: 'fuzz', repeat: 10, relief: 0.5, tint: 0.12 }
        case 'punto':
          return { ...base, color, roughness: 1, sheen: 0.8, sheenRoughness: 0.9, sheenColor: mix(color, '#ffffff', 0.5), pattern: 'knit', repeat: 4, relief: 1.6, tint: 0.35 }
        case 'seda':
          return { ...base, color, roughness: 0.3, sheen: 1, sheenRoughness: 0.3, sheenColor: mix(color, '#ffffff', 0.7), clearcoat: 0.3, clearcoatRoughness: 0.35 }
        case 'raso':
          return { ...base, color, roughness: 0.22, sheen: 1, sheenRoughness: 0.2, sheenColor: mix(color, '#ffffff', 0.8), clearcoat: 0.7, clearcoatRoughness: 0.18 }
        case 'terciopelo':
          return { ...base, color: mix(color, '#000000', 0.35), roughness: 1, sheen: 1, sheenRoughness: 0.35, sheenColor: mix(color, '#ffffff', 0.45), pattern: 'fuzz', repeat: 14, relief: 0.15 }
        case 'arpillera':
          return { ...base, color, roughness: 1, sheen: 0.3, sheenRoughness: 1, sheenColor: '#ffffff', pattern: 'burlap', repeat: 9, relief: 1.6, tint: 0.55 }
        case 'cuero':
          return { ...base, color, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.45, pattern: 'grain', repeat: 3, relief: 0.6 }
      }
      break
    }
    case 'original':
      return { color, roughness: 0.8, metalness: 0 }
  }
  return { color, roughness: 0.8, metalness: 0 }
}
