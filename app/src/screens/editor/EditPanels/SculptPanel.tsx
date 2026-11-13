import type { ReactNode } from 'react'
import { t } from '@/shared/i18n/es'
import type { SculptSettings } from '../types'
import { LENGTH_RANGE, isHairBrush } from '@/domain/physics/hair'
import { SymmetryControl } from './SymmetryControl'
import { TipPicker } from './TipPicker'
import styles from './EditPanels.module.scss'

interface Props {
  partName: string | null
  settings: SculptSettings
  onChange: (patch: Partial<SculptSettings>) => void
  onMoreDetail: () => void
  onMask: (action: 'invertir' | 'borrar') => void
  /** Control de low poly (lo arma el editor). */
  lowPoly: ReactNode
  /** Hebras de pelo de la parte elegida. */
  hairCount: number
  /** Triángulos de la malla del pelo. */
  hairTris: number
  onHairFall: () => void
  /** Todo el pelo en mechones del tamaño del pincel (true) o de vuelta a hebras (false). */
  onClumpAll: (on: boolean) => void
}

// Largo en escala logarítmica: la barra va de pelaje de rata (3 mm) a pelo muy largo (80 cm).
const LOG_MIN = Math.log(LENGTH_RANGE[0]), LOG_MAX = Math.log(LENGTH_RANGE[1])
const toSlider = (len: number) => Math.round(((Math.log(len) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100)
const fromSlider = (v: number) => Math.exp(LOG_MIN + (v / 100) * (LOG_MAX - LOG_MIN))
const lengthLabel = (m: number) => (m < 0.01 ? `${(m * 1000).toFixed(0)} mm` : `${(m * 100).toFixed(m < 0.1 ? 1 : 0)} cm`)

export function SculptPanel({ partName, settings, onChange, onMoreDetail, onMask, lowPoly, hairCount, hairTris, onHairFall, onClumpAll }: Props) {
  const hairMode = isHairBrush(settings.brush)
  const hair = settings.hair
  const setHair = (patch: Partial<typeof hair>) => onChange({ hair: { ...hair, ...patch } })
  const roundTip = settings.tip === 'suave' || settings.tip === 'dura'
  return (
    <aside className={styles.panel} aria-label="Ajustes del pincel">
      <div className={styles.head}>
        <span className={styles.kicker}>{partName ? t.editing(partName) : t.pickToSculpt}</span>
        <span className={styles.big}>{t.brushes[settings.brush]}</span>
        <span className={styles.help}>{t.brushHelp[settings.brush]}</span>
      </div>

      {!hairMode && lowPoly}

      {hairMode && (
        <section className={styles.section}>
          <div className={styles.row}>
            <span className={styles.title}>{t.hair.title}</span>
            <span className={styles.value}>{t.hair.count(hairCount)}</span>
          </div>
          {hairCount > 0 && (
            <div className={styles.row}>
              <span className={styles.help}>{t.hair.gameHint(hairTris)}</span>
              <span className={styles.value}>{t.hair.triangles(hairTris)}</span>
            </div>
          )}
          <div className={styles.row}>
            <label className={styles.title} htmlFor="hair-len">{t.hair.length}</label>
            <span className={styles.value}>{lengthLabel(hair.length)}</span>
          </div>
          <input id="hair-len" className={styles.range} type="range" min={0} max={100} value={toSlider(hair.length)} onChange={(e) => setHair({ length: fromSlider(Number(e.target.value)) })} />
          <div className={styles.row}><span className={styles.help}>{t.hair.short}</span><span className={styles.help}>{t.hair.long}</span></div>
        </section>
      )}
      {hairMode && <Slider id="hair-den" label={t.hair.density} value={Math.round(hair.density)} unit="/cm²" min={1} max={30} onChange={(v) => setHair({ density: v })} />}
      {hairMode && <Slider id="hair-w" label={t.hair.width} value={Math.round(hair.width * 10000) / 10} unit=" mm" min={0.2} max={5} onChange={(v) => setHair({ width: v / 1000 })} />}
      {hairMode && <Slider id="hair-st" label={`${t.hair.stiffness} (${t.hair.soft} ↔ ${t.hair.hard})`} value={Math.round(hair.stiffness * 100)} unit="%" min={0} max={100} onChange={(v) => setHair({ stiffness: v / 100 })} />}
      {hairMode && (
        <section className={styles.section}>
          <div className={styles.row}>
            <label className={styles.title} htmlFor="hair-color">{t.hair.color}</label>
            <input id="hair-color" type="color" value={hair.color} onChange={(e) => setHair({ color: e.target.value })} />
          </div>
          <button type="button" className={styles.button} disabled={!partName || hairCount === 0} onClick={onHairFall}>{t.hair.fall}</button>
          <button type="button" className={styles.button} disabled={!partName || hairCount === 0} onClick={() => onClumpAll(true)}>{t.hair.clumpAll}</button>
          <button type="button" className={styles.button} disabled={!partName || hairCount === 0} onClick={() => onClumpAll(false)}>{t.hair.unclumpAll}</button>
        </section>
      )}

      <Slider id="sc-size" label={t.size} value={Math.round(settings.size * 100)} unit=" cm" min={2} max={60} onChange={(v) => onChange({ size: v / 100 })} />
      {!hairMode && <Slider id="sc-strength" label={t.strength} value={Math.round(settings.strength * 100)} unit="%" min={5} max={100} onChange={(v) => onChange({ strength: v / 100 })} />}

      {settings.brush === 'mascara' && (
        <div className={styles.buttons}>
          <button type="button" className={styles.button} disabled={!partName} onClick={() => onMask('invertir')}>{t.invertMask}</button>
          <button type="button" className={styles.button} disabled={!partName} onClick={() => onMask('borrar')}>{t.clearMask}</button>
        </div>
      )}

      {!hairMode && <TipPicker tip={settings.tip} angle={settings.angle} onChange={(tip) => onChange({ tip })} />}
      {!hairMode && !roundTip && <Slider id="sc-angle" label={t.tipAngle} value={settings.angle} unit="°" min={0} max={180} onChange={(v) => onChange({ angle: v })} />}

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
