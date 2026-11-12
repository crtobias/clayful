import { SWATCHES } from '@/shared/config/materials'
import { Icon } from '@/assets/icons/Icon'
import { t } from '@/shared/i18n/es'
import type { PaintSettings } from '../types'
import { Slider } from './SculptPanel'
import styles from './EditPanels.module.scss'

interface Props {
  partName: string | null
  settings: PaintSettings
  onChange: (patch: Partial<PaintSettings>) => void
}

export function PaintPanel({ partName, settings, onChange }: Props) {
  return (
    <aside className={styles.panel} aria-label="Ajustes de pintura">
      <div className={styles.head}>
        <span className={styles.kicker}>{partName ? t.editing(partName) : t.pickToPaint}</span>
        <span className={styles.big}>{t.paintTools[settings.tool]}</span>
        <span className={styles.help}>{t.paintHelp[settings.tool]}</span>
      </div>

      <section className={styles.section}>
        <div className={styles.current}>
          <span className={styles.currentSwatch} style={{ background: settings.color }} aria-hidden="true" />
          <span className={styles.help}>{t.currentColor}</span>
        </div>
        <div className={styles.swatches}>
          {SWATCHES.map((color) => (
            <button key={color} type="button" className={`${styles.swatch} ${settings.color === color ? styles.swatchActive : ''}`} style={{ background: color }} aria-label={color} aria-pressed={settings.color === color} onClick={() => onChange({ color, tool: settings.tool === 'gotero' ? 'pincel' : settings.tool })} />
          ))}
          <label className={styles.custom} title={t.otherColor}>
            <Icon name="plus" size={16} />
            <input type="color" aria-label={t.otherColor} value={settings.color} onChange={(e) => onChange({ color: e.target.value })} />
          </label>
        </div>
      </section>

      <Slider id="pt-size" label={t.size} value={Math.round(settings.size * 100)} unit=" cm" min={1} max={50} onChange={(v) => onChange({ size: v / 100 })} />
      <Slider id="pt-soft" label={t.softness} value={Math.round(settings.softness * 100)} unit="%" min={0} max={100} onChange={(v) => onChange({ softness: v / 100 })} />

      <label className={styles.toggle}>
        <span className={styles.toggleText}><strong>{t.mirror}</strong><span className={styles.help}>{t.mirrorHelp}</span></span>
        <input type="checkbox" checked={settings.mirror} onChange={(e) => onChange({ mirror: e.target.checked })} />
      </label>
    </aside>
  )
}
