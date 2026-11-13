import { useEffect, useState } from 'react'
import type { LowPolyLevel } from '@/domain/scene/model'
import { t } from '@/shared/i18n/es'
import styles from './LowPolyControl.module.scss'

interface Props {
  /** Detalle 0..1 (null = apagado). */
  level: LowPolyLevel | null
  disabled?: boolean
  onChange: (level: LowPolyLevel | null) => void
}

const DEFAULT_DETAIL = 0.3

/**
 * Casillero "Low poly" + barra de detalle (de muy facetado a casi liso).
 * La barra se aplica al soltarla: así un arrastre es un solo paso de deshacer.
 */
export function LowPolyControl({ level, disabled, onChange }: Props) {
  const [draft, setDraft] = useState(level ?? DEFAULT_DETAIL)
  useEffect(() => { if (level !== null) setDraft(level) }, [level])
  const commit = () => { if (level !== null && Math.abs(draft - level) > 0.001) onChange(draft) }
  return (
    <section className={styles.box}>
      <label className={styles.toggle}>
        <span className={styles.text}>
          <strong>{t.lowPoly}</strong>
          <span className={styles.help}>{t.lowPolyHelp}</span>
        </span>
        <input type="checkbox" checked={level !== null} disabled={disabled} onChange={(e) => onChange(e.target.checked ? draft : null)} />
      </label>
      {level !== null && (
        <label className={styles.row}>
          <span className={styles.label}>{t.lowPolyDetail}<span className={styles.value}>{Math.round(draft * 100)}%</span></span>
          <input
            type="range" min={0} max={100} value={Math.round(draft * 100)} disabled={disabled}
            onChange={(e) => setDraft(Number(e.target.value) / 100)}
            onPointerUp={commit} onKeyUp={commit} onBlur={commit}
          />
          <span className={styles.ends}><span>{t.lowPolyLess}</span><span>{t.lowPolyMore}</span></span>
        </label>
      )}
    </section>
  )
}
