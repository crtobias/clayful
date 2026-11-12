import type { Part } from '@/domain/scene/model'
import type { FabricType, MaterialPreset } from '@/shared/config/materials'
import { t } from '@/shared/i18n/es'

const nameOf = (parts: Part[], ref: unknown) =>
  parts.find((p) => p.id === ref || p.name.toLowerCase() === String(ref).toLowerCase())?.name ?? String(ref)

/** Texto corto para el aviso cuando Claude hace algo. */
export function claudeToast(tool: string, args: Record<string, unknown>, before: Part[]): string | null {
  switch (tool) {
    case 'add_shape':
      return `Claude agregó ${t.shapes[args.shape as keyof typeof t.shapes] ?? 'una forma'}`
    case 'set_material': {
      const preset = (args.preset ?? (args.fabric ? 'tela' : undefined)) as MaterialPreset | undefined
      const fabric = args.fabric ? ` · ${t.fabrics[args.fabric as FabricType]}` : ''
      const what = preset ? `${t.presets[preset]}${fabric}` : 'un cambio de material'
      return `Claude aplicó ${what} a ${nameOf(before, args.part)}`
    }
    case 'transform': return `Claude movió ${nameOf(before, args.part)}`
    case 'rename': return `Claude renombró ${nameOf(before, args.part)}`
    case 'duplicate': return `Claude duplicó ${nameOf(before, args.part)}`
    case 'delete': return `Claude borró ${nameOf(before, args.part)}`
    case 'clear': return 'Claude vació la escena'
    case 'undo': return 'Claude deshizo el último cambio'
    case 'redo': return 'Claude rehizo el cambio'
    default: return null
  }
}
