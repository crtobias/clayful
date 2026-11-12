import { DEFAULT_MATERIAL, mergeMaterial } from '@/shared/config/materials'
import { SHAPE_LIFT, shapeGeometryId } from './geometry'
import type { CommandResult, Part, SceneCommand, SceneState, Shape } from './model'

const SHAPE_NAMES: Record<Shape, string> = {
  cubo: 'Cubo', esfera: 'Esfera', cilindro: 'Cilindro', cono: 'Cono', dona: 'Dona', plano: 'Plano',
}

/** "Cubo" → "Cubo 3" si ya hay "Cubo 1" y "Cubo 2". */
export function nextName(parts: Part[], base: string): string {
  const used = new Set(parts.map((p) => p.name))
  let n = 1
  while (used.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

function find(parts: Part[], id: string): Part {
  const part = parts.find((p) => p.id === id)
  if (!part) throw new Error(`No existe la parte ${id}`)
  return part
}

function replace(parts: Part[], id: string, patch: Partial<Part>): Part[] {
  find(parts, id)
  return parts.map((p) => (p.id === id ? { ...p, ...patch } : p))
}

/** Reductor puro: aplica un comando al estado. Lo usan la UI y el MCP por igual. */
export function applyCommand(state: SceneState, cmd: SceneCommand, newId: () => string): CommandResult {
  const { parts, selectedId } = state
  switch (cmd.type) {
    case 'add_shape': {
      const count = parts.length
      const x = ((count % 5) - 2) * 1.4
      const part: Part = {
        id: newId(),
        name: cmd.name ?? nextName(parts, SHAPE_NAMES[cmd.shape]),
        geometryId: shapeGeometryId(cmd.shape),
        position: cmd.position ?? [x, SHAPE_LIFT[cmd.shape], 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        material: cmd.material ? mergeMaterial(DEFAULT_MATERIAL, cmd.material) : { ...DEFAULT_MATERIAL },
      }
      return { parts: [...parts, part], selectedId: part.id, created: [part.id] }
    }
    case 'add_parts': {
      if (cmd.parts.length === 0) return { parts, selectedId, created: [] }
      return { parts: [...parts, ...cmd.parts], selectedId: cmd.parts[0].id, created: cmd.parts.map((p) => p.id) }
    }
    case 'select': {
      if (cmd.id !== null) find(parts, cmd.id)
      return { parts, selectedId: cmd.id, created: [] }
    }
    case 'set_material': {
      const part = find(parts, cmd.id)
      return { parts: replace(parts, cmd.id, { material: mergeMaterial(part.material, cmd.material) }), selectedId, created: [] }
    }
    case 'transform': {
      const patch: Partial<Part> = {}
      if (cmd.position) patch.position = cmd.position
      if (cmd.rotation) patch.rotation = cmd.rotation
      if (cmd.scale) patch.scale = cmd.scale
      return { parts: replace(parts, cmd.id, patch), selectedId, created: [] }
    }
    case 'set_geometry':
      return { parts: replace(parts, cmd.id, { geometryId: cmd.geometryId }), selectedId, created: [] }
    case 'set_low_poly': {
      const part = find(parts, cmd.id)
      const { lowPoly: _old, ...rest } = part
      void _old
      return { parts: parts.map((p) => (p.id === cmd.id ? (cmd.lowPoly ? { ...rest, lowPoly: cmd.lowPoly } : rest) : p)), selectedId, created: [] }
    }
    case 'rename': {
      return { parts: replace(parts, cmd.id, { name: cmd.name.trim() || find(parts, cmd.id).name }), selectedId, created: [] }
    }
    case 'duplicate': {
      const src = find(parts, cmd.id)
      const base = src.name.replace(/\s+\d+$/, '')
      const copy: Part = {
        ...src,
        id: newId(),
        name: nextName(parts, base),
        position: [src.position[0] + 1.2, src.position[1], src.position[2]],
      }
      return { parts: [...parts, copy], selectedId: copy.id, created: [copy.id] }
    }
    case 'delete': {
      find(parts, cmd.id)
      return { parts: parts.filter((p) => p.id !== cmd.id), selectedId: selectedId === cmd.id ? null : selectedId, created: [] }
    }
    case 'clear':
      return { parts: [], selectedId: null, created: [] }
  }
}
