import type { Axis, Symmetry } from '@/shared/lib/symmetry'
import { t } from '@/shared/i18n/es'
import styles from './EditPanels.module.scss'

const RADIAL = [1, 3, 4, 6, 8]

/** Simetría como en Blender: X, Y, Z combinables + radial alrededor de un eje. */
export function SymmetryControl({ value, onChange }: { value: Symmetry; onChange: (s: Symmetry) => void }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{t.symmetry}</h2>
      <span className={styles.help}>{t.symmetryHelp}</span>
      <div className={styles.chips}>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <button key={axis} type="button" className={`${styles.chip} ${value[axis] ? styles.active : ''}`} aria-pressed={value[axis]} onClick={() => onChange({ ...value, [axis]: !value[axis] })}>
            {axis.toUpperCase()}
          </button>
        ))}
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{t.radial}</span>
        <div className={styles.chips}>
          {RADIAL.map((n) => (
            <button key={n} type="button" className={`${styles.chip} ${value.radial === n ? styles.active : ''}`} aria-pressed={value.radial === n} onClick={() => onChange({ ...value, radial: n })}>
              {n === 1 ? t.radialOff : n}
            </button>
          ))}
        </div>
      </div>
      {value.radial > 1 && (
        <div className={styles.row}>
          <span className={styles.label}>{t.radialAxis}</span>
          <div className={styles.chips}>
            {(['x', 'y', 'z'] as Axis[]).map((axis) => (
              <button key={axis} type="button" className={`${styles.chip} ${value.axis === axis ? styles.active : ''}`} aria-pressed={value.axis === axis} onClick={() => onChange({ ...value, axis })}>
                {axis.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
