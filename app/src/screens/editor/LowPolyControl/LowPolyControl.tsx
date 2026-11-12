import type { LowPolyLevel } from '@/domain/scene/model'
import { t } from '@/shared/i18n/es'
import styles from './LowPolyControl.module.scss'

interface Props {
  level: LowPolyLevel | null
  disabled?: boolean
  onChange: (level: LowPolyLevel | null) => void
}

const LEVELS: LowPolyLevel[] = [1, 2, 3]

/** Casillero "Low poly" + nivel. Prenderlo facetea la parte; apagarlo vuelve a la versión lisa. */
export function LowPolyControl({ level, disabled, onChange }: Props) {
  return (
    <section className={styles.box}>
      <label className={styles.toggle}>
        <span className={styles.text}>
          <strong>{t.lowPoly}</strong>
          <span className={styles.help}>{t.lowPolyHelp}</span>
        </span>
        <input type="checkbox" checked={level !== null} disabled={disabled} onChange={(e) => onChange(e.target.checked ? 2 : null)} />
      </label>
      {level !== null && (
        <div className={styles.chips}>
          {LEVELS.map((l) => (
            <button key={l} type="button" className={`${styles.chip} ${level === l ? styles.active : ''}`} aria-pressed={level === l} disabled={disabled} onClick={() => onChange(l)}>
              {t.lowPolyLevels[l]}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
