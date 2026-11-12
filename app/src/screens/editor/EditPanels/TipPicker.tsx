import { TIPS, tipWeight, type Tip } from '@/shared/lib/brushShape'
import { t } from '@/shared/i18n/es'
import styles from './EditPanels.module.scss'

/** Dibujo de la punta con la misma función que usa el pincel: lo que ves es lo que hace. */
function TipPreview({ tip, angle, softness }: { tip: Tip; angle: number; softness?: number }) {
  const N = 16
  const cells = []
  const a = (angle * Math.PI) / 180
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = ((x + 0.5) / N) * 2 - 1, py = ((y + 0.5) / N) * 2 - 1
      const du = px * Math.cos(a) + py * Math.sin(a), dv = -px * Math.sin(a) + py * Math.cos(a)
      const w = tipWeight(tip, du, dv, 0, 1, softness)
      if (w > 0.02) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="currentColor" opacity={w} />)
    }
  }
  return <svg viewBox={`0 0 ${N} ${N}`} width={32} height={32} aria-hidden="true">{cells}</svg>
}

export function TipPicker({ tip, angle, softness, onChange }: { tip: Tip; angle: number; softness?: number; onChange: (tip: Tip) => void }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{t.tip}</h2>
      <div className={styles.tips}>
        {TIPS.map((x) => (
          <button key={x} type="button" className={`${styles.card} ${tip === x ? styles.active : ''}`} aria-pressed={tip === x} onClick={() => onChange(x)}>
            <TipPreview tip={x} angle={angle} softness={softness} />
            {t.tips[x]}
          </button>
        ))}
      </div>
    </section>
  )
}
