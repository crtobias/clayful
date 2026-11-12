import { FABRIC_TYPES, MATERIAL_PRESETS, PRESET_AMOUNT, SWATCHES, type MaterialPreset, type MaterialSpec } from '@/shared/config/materials'
import { t } from '@/shared/i18n/es'
import { Icon } from '@/assets/icons/Icon'
import styles from './MaterialPanel.module.scss'

interface Props {
  partName: string
  spec: MaterialSpec
  /** Muestra la opción "Original" (solo para modelos importados con su propio material). */
  allowOriginal: boolean
  onChange: (patch: Partial<MaterialSpec>) => void
}

/** Materiales de un clic + ajuste propio + color. Solo props: no sabe nada de la escena. */
export function MaterialPanel({ partName, spec, allowOriginal, onChange }: Props) {
  const presets: MaterialPreset[] = allowOriginal ? ['original', ...MATERIAL_PRESETS] : [...MATERIAL_PRESETS]
  const amountLabel = t.amount[spec.preset]
  const amount = spec.amount ?? PRESET_AMOUNT[spec.preset] ?? 0.5

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <div className={styles.heading}>
          <h2 className={styles.title}>{t.materialOf(partName)}</h2>
          <span className={styles.note}>{t.oneClick}</span>
        </div>
        <div className={styles.grid}>
          {presets.map((preset) => {
            const active = spec.preset === preset
            return (
              <button key={preset} type="button" className={`${styles.card} ${active ? styles.active : ''}`} aria-pressed={active} onClick={() => onChange({ preset })}>
                <span className={`${styles.ball} ${styles[preset]}`} aria-hidden="true" />
                {t.presets[preset]}
                {active && <span className={styles.check} aria-hidden="true"><Icon name="check" size={12} strokeWidth={3} /></span>}
              </button>
            )
          })}
        </div>
      </section>

      {spec.preset === 'tela' && (
        <section className={styles.section}>
          <h2 className={styles.title}>{t.fabricType}</h2>
          <div className={styles.chips}>
            {FABRIC_TYPES.map((fabric) => {
              const active = (spec.fabric ?? 'algodon') === fabric
              return (
                <button key={fabric} type="button" className={`${styles.chip} ${active ? styles.active : ''}`} aria-pressed={active} onClick={() => onChange({ fabric })}>
                  {t.fabrics[fabric]}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {amountLabel && (
        <section className={styles.section}>
          <div className={styles.heading}>
            <label className={styles.title} htmlFor="material-amount">{amountLabel}</label>
            <span className={styles.value}>{Math.round(amount * 100)}%</span>
          </div>
          <input id="material-amount" className={styles.range} type="range" min={0} max={100} value={Math.round(amount * 100)} onChange={(e) => onChange({ amount: Number(e.target.value) / 100 })} />
        </section>
      )}

      {spec.preset !== 'original' && (
        <section className={styles.section}>
          <h2 className={styles.title}>{t.color}</h2>
          <div className={styles.swatches}>
            {SWATCHES.map((color) => {
              const active = spec.color.toLowerCase() === color
              return (
                <button key={color} type="button" className={`${styles.swatch} ${active ? styles.swatchActive : ''}`} style={{ background: color }} aria-label={color} aria-pressed={active} onClick={() => onChange({ color })} />
              )
            })}
            <label className={styles.custom} title={t.otherColor}>
              <Icon name="plus" size={16} />
              <input type="color" aria-label={t.otherColor} value={spec.color} onChange={(e) => onChange({ color: e.target.value })} />
            </label>
          </div>
        </section>
      )}
    </div>
  )
}
