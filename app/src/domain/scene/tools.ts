import { FABRIC_TYPES, MATERIAL_PRESETS, type MaterialSpec } from '@/shared/config/materials'
import { SHAPES, type Part, type SceneCommand, type Shape, type Vec3 } from './model'

type Args = Record<string, unknown>
const DEG = Math.PI / 180

/** Busca una parte por id o por nombre (sin mayúsculas). */
export function resolvePart(parts: Part[], ref: unknown): Part {
  if (typeof ref !== 'string' || !ref.trim()) throw new Error('Falta la parte (id o nombre).')
  const byId = parts.find((p) => p.id === ref)
  if (byId) return byId
  const byName = parts.find((p) => p.name.toLowerCase() === ref.trim().toLowerCase())
  if (byName) return byName
  const names = parts.map((p) => p.name).join(', ') || 'ninguna'
  throw new Error(`No encontré "${ref}". Partes: ${names}.`)
}

function vec3(value: unknown, field: string): Vec3 | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') return [value, value, value]
  if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number')) return value as Vec3
  throw new Error(`${field} tiene que ser un número o [x, y, z].`)
}

export function materialFromArgs(args: Args): Partial<MaterialSpec> {
  const m: Partial<MaterialSpec> = {}
  if (args.preset !== undefined) {
    if (!(MATERIAL_PRESETS as readonly unknown[]).includes(args.preset)) {
      throw new Error(`Material inválido. Opciones: ${MATERIAL_PRESETS.join(', ')}.`)
    }
    m.preset = args.preset as MaterialSpec['preset']
  }
  if (args.fabric !== undefined) {
    if (!(FABRIC_TYPES as readonly unknown[]).includes(args.fabric)) {
      throw new Error(`Tela inválida. Opciones: ${FABRIC_TYPES.join(', ')}.`)
    }
    m.fabric = args.fabric as MaterialSpec['fabric']
    if (!m.preset) m.preset = 'tela'
  }
  if (args.color !== undefined) {
    if (typeof args.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(args.color)) throw new Error('El color va como #rrggbb.')
    m.color = args.color.toLowerCase()
  }
  if (args.amount !== undefined) {
    if (typeof args.amount !== 'number' || args.amount < 0 || args.amount > 1) throw new Error('amount va de 0 a 1.')
    m.amount = args.amount
  }
  return m
}

/** Traduce una herramienta del MCP a un comando de escena. */
export function toolToCommand(name: string, args: Args, parts: Part[]): SceneCommand {
  switch (name) {
    case 'add_shape': {
      if (!(SHAPES as readonly unknown[]).includes(args.shape)) throw new Error(`Forma inválida. Opciones: ${SHAPES.join(', ')}.`)
      return {
        type: 'add_shape',
        shape: args.shape as Shape,
        name: typeof args.name === 'string' ? args.name : undefined,
        position: vec3(args.position, 'position'),
        material: materialFromArgs(args),
      }
    }
    case 'set_material':
      return { type: 'set_material', id: resolvePart(parts, args.part).id, material: materialFromArgs(args) }
    case 'transform': {
      const rotation = vec3(args.rotation, 'rotation')
      return {
        type: 'transform',
        id: resolvePart(parts, args.part).id,
        position: vec3(args.position, 'position'),
        rotation: rotation && [rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG],
        scale: vec3(args.scale, 'scale'),
      }
    }
    case 'select':
      return { type: 'select', id: args.part ? resolvePart(parts, args.part).id : null }
    case 'rename':
      return { type: 'rename', id: resolvePart(parts, args.part).id, name: String(args.name ?? '') }
    case 'duplicate':
      return { type: 'duplicate', id: resolvePart(parts, args.part).id }
    case 'delete':
      return { type: 'delete', id: resolvePart(parts, args.part).id }
    case 'clear':
      return { type: 'clear' }
    default:
      throw new Error(`Herramienta desconocida: ${name}`)
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** Resumen de la escena para Claude. Rotación en grados. */
export function describeScene(parts: Part[], selectedId: string | null) {
  return {
    selected: parts.find((p) => p.id === selectedId)?.name ?? null,
    parts: parts.map((p) => ({
      id: p.id,
      name: p.name,
      material: p.image ? 'imagen' : p.material,
      position: p.position.map(round),
      rotation: p.rotation.map((r) => round(r / DEG)),
      scale: p.scale.map(round),
    })),
  }
}
