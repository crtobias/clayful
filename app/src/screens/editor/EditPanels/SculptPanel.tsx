import { TIPS, tipWeight, type Tip } from '@/domain/sculpt/brushes'
import { t } from '@/shared/i18n/es'
import type { SculptSettings } from '../types'
import styles from './EditPanels.module.scss'

interface Props {
  partName: string | null
  settings: SculptSettings
  onChange: (patch: Partial<SculptSettings>) => void
  onMoreDetail: () => void
}

/** Dibujo de la punta con la misma función que usa el pincel: lo que ves es lo que hace. */
function TipPreview({ tip, angle }: { tip: Tip; angle: number }) {
  const N = 16
  const cells = []
  const a = (angle * Math.PI) / 180
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = ((x + 0.5) / N) * 2 - 1, py = ((y + 0.5) / N) * 2 - 1
      const du = px * Math.cos(a) + py * Math.sin(a), dv = -px * Math.sin(a) + py * Math.cos(a)
      const w = tipWeight(tip, du, dv, 0, 1)
      if (w > 0.02) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="currentColor" opacity={w} />)
    }
  }
  return <svg viewBox={`0 0 ${N} ${N}`} width={32} height={32} aria-hidden="true">{cells}</svg>
}

export function SculptPanel({ partName, settings, onChange, onMoreDetail }: Props) {
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

      <section className={styles.section}>
        <h2 className={styles.title}>{t.tip}</h2>
        <div className={styles.tips}>
          {TIPS.map((tip) => (
            <button key={tip} type="button" className={`${styles.card} ${settings.tip === tip ? styles.active : ''}`} aria-pressed={settings.tip === tip} onClick={() => onChange({ tip })}>
              <TipPreview tip={tip} angle={settings.angle} />
              {t.tips[tip]}
            </button>
          ))}
        </div>
      </section>

      {!roundTip && <Slider id="sc-angle" label={t.tipAngle} value={settings.angle} unit="°" min={0} max={180} onChange={(v) => onChange({ angle: v })} />}

      <label className={styles.toggle}>
        <span className={styles.toggleText}><strong>{t.mirror}</strong><span className={styles.help}>{t.mirrorHelp}</span></span>
        <input type="checkbox" checked={settings.mirror} onChange={(e) => onChange({ mirror: e.target.checked })} />
      </label>

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
