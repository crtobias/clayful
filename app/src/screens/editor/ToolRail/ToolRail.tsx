import { Icon, type IconName } from '@/assets/icons/Icon'
import type { Shape } from '@/domain/scene/model'
import { SCULPT_BRUSHES, type SculptBrush } from '@/domain/sculpt/brushes'
import { PAINT_TOOLS, type PaintTool } from '@/domain/paint/paint'
import { t } from '@/shared/i18n/es'
import type { Mode, Tool } from '../types'
import styles from './ToolRail.module.scss'

interface Props {
  mode: Mode
  tool: Tool
  brush: SculptBrush
  paintTool: PaintTool
  onTool: (tool: Tool) => void
  onBrush: (brush: SculptBrush) => void
  onPaintTool: (tool: PaintTool) => void
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

export function ToolRail({ mode, tool, brush, paintTool, onTool, onBrush, onPaintTool, onAddShape, onOpen }: Props) {
  if (mode === 'esculpir') {
    return (
      <nav className={styles.rail} aria-label="Pinceles">
        <span className={styles.label}>{t.brush}</span>
        {SCULPT_BRUSHES.map((b) => (
          <button key={b} type="button" className={`${styles.tool} ${brush === b ? styles.active : ''}`} aria-pressed={brush === b} title={t.brushHelp[b]} onClick={() => onBrush(b)}>
            <Icon name={b} size={24} />{t.brushes[b]}
          </button>
        ))}
      </nav>
    )
  }
  if (mode === 'pintar') {
    return (
      <nav className={styles.rail} aria-label="Pintar">
        <span className={styles.label}>{t.modes.pintar}</span>
        {PAINT_TOOLS.map((p) => (
          <button key={p} type="button" className={`${styles.tool} ${paintTool === p ? styles.active : ''}`} aria-pressed={paintTool === p} title={t.paintHelp[p]} onClick={() => onPaintTool(p)}>
            <Icon name={p} size={24} />{t.paintTools[p]}
          </button>
        ))}
      </nav>
    )
  }
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
