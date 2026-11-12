import { t } from '@/shared/i18n/es'
import type { SculptSettings } from '../types'
import { SymmetryControl } from './SymmetryControl'
import { TipPicker } from './TipPicker'
import styles from './EditPanels.module.scss'

interface Props {
  partName: string | null
  settings: SculptSettings
  onChange: (patch: Partial<SculptSettings>) => void
  onMoreDetail: () => void
  onMask: (action: 'invertir' | 'borrar') => void
}

export function SculptPanel({ partName, settings, onChange, onMoreDetail, onMask }: Props) {
  const roundTip = settings.tip === 'suave' || settings.tip === 'dura'
  return (
    <aside className={styles.panel} aria-label="Ajustes del pincel">
      <div className={styles.head}>
        <span className={styles.kicker}>{partName ? t.editing(partName) : t.pickToSculpt}</span>
        <span className={styles.big}>{t.brushes[settings.brush]}</span>
        <span className={styles.help}>{t.brushHelp[settings.brush]}</span>
      </div>

      <Slider id="sc-size" label={t.size} value={Math.round(settings.size * 100)} unit=" cm" min={2} max={60} onChange={(v) => onChange({ size: v / 100 })} />
      <Slider id="sc-strength" label={t.strength} value={Math.round(settings.strength * 100)} unit="%" min={5} max={100} onChange={(v) => onChange({ strength: v / 100 })} />

      {settings.brush === 'mascara' && (
        <div className={styles.buttons}>
          <button type="button" className={styles.button} disabled={!partName} onClick={() => onMask('invertir')}>{t.invertMask}</button>
          <button type="button" className={styles.button} disabled={!partName} onClick={() => onMask('borrar')}>{t.clearMask}</button>
        </div>
      )}

      <TipPicker tip={settings.tip} angle={settings.angle} onChange={(tip) => onChange({ tip })} />
      {!roundTip && <Slider id="sc-angle" label={t.tipAngle} value={settings.angle} unit="°" min={0} max={180} onChange={(v) => onChange({ angle: v })} />}

      <SymmetryControl value={settings.symmetry} onChange={(symmetry) => onChange({ symmetry })} />

      <section className={styles.section}>
        <button type="button" className={styles.button} disabled={!partName} onClick={onMoreDetail}>{t.moreDetail}</button>
        <span className={styles.help}>{t.detailHelp}</span>
      </section>
    </aside>
  )
}

export function Slider({ id, label, value, unit, min, max, onChange }: { id: string; label: string; value: number; unit: string; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <section className={styles.section}>
      <div className={styles.row}>
        <label className={styles.title} htmlFor={id}>{label}</label>
        <span className={styles.value}>{value}{unit}</span>
      </div>
      <input id={id} className={styles.range} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </section>
  )
}
