import { Icon, type IconName } from '@/assets/icons/Icon'
import type { Shape } from '@/domain/scene/model'
import { t } from '@/shared/i18n/es'
import type { Tool } from '../types'
import styles from './ToolRail.module.scss'

interface Props {
  tool: Tool
  onTool: (tool: Tool) => void
  onAddShape: (shape: Shape) => void
  onOpen: () => void
}

const SHAPE_BUTTONS: { shape: Shape; icon: IconName }[] = [
  { shape: 'cubo', icon: 'cube' },
  { shape: 'esfera', icon: 'sphere' },
  { shape: 'cilindro', icon: 'cylinder' },
  { shape: 'cono', icon: 'cone' },
  { shape: 'dona', icon: 'torus' },
  { shape: 'plano', icon: 'plane' },
]

const TOOL_BUTTONS: { tool: Tool; icon: IconName; key: string }[] = [
  { tool: 'elegir', icon: 'pointer', key: 'Q' },
  { tool: 'mover', icon: 'move', key: 'W' },
  { tool: 'girar', icon: 'rotate', key: 'E' },
  { tool: 'escalar', icon: 'scale', key: 'R' },
]

export function ToolRail({ tool, onTool, onAddShape, onOpen }: Props) {
  return (
    <nav className={styles.rail} aria-label="Herramientas">
      <span className={styles.label}>{t.add}</span>
      <button type="button" className={styles.tool} onClick={onOpen}><Icon name="open" size={24} />{t.open}</button>
      {SHAPE_BUTTONS.map(({ shape, icon }) => (
        <button key={shape} type="button" className={styles.tool} onClick={() => onAddShape(shape)}>
          <Icon name={icon} size={24} />{t.shapes[shape]}
        </button>
      ))}
      <div className={styles.divider} />
      <span className={styles.label}>{t.edit}</span>
      {TOOL_BUTTONS.map((b) => (
        <button key={b.tool} type="button" className={`${styles.tool} ${tool === b.tool ? styles.active : ''}`} aria-pressed={tool === b.tool} title={`${t.tools[b.tool]} (${b.key})`} onClick={() => onTool(b.tool)}>
          <Icon name={b.icon} size={24} />{t.tools[b.tool]}
        </button>
      ))}
    </nav>
  )
}
