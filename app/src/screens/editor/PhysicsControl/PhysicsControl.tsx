import { DENSITY_RANGE } from '@/domain/physics/cloth'
import { t } from '@/shared/i18n/es'
import styles from './PhysicsControl.module.scss'

export type PhysicsKind = 'tela' | 'gelatina'

interface Props {
  kind: PhysicsKind
  density: number
  stiffness: number
  /** 1 = normal. */
  gravity: number
  /** Tamaño de la tela al tapar (1 = justo). */
  size: number
  /** Borde de arriba fijo (cortinas, banderas). */
  pinned: boolean
  onPinned: (v: boolean) => void
  running: boolean
  /** El material no es tela: se ve apagado y no se puede usar. */
  disabled?: boolean
  onDensity: (n: number) => void
  onStiffness: (s: number) => void
  onGravity: (g: number) => void
  onSize: (s: number) => void
  onCover: () => void
  onDrop: () => void
}

/** Física de un clic: tapar con tela / soltar tela / soltar gelatina, con densidad y rigidez. */
export function PhysicsControl({ kind, density, stiffness, gravity, size, pinned, onPinned, running, disabled = false, onDensity, onStiffness, onGravity, onSize, onCover, onDrop }: Props) {
  const gravityRow = (
    <label className={styles.row}>
      <span className={styles.label}>{t.physics.gravity}<span className={styles.value}>{Math.round(gravity * 100)}%</span></span>
      <input type="range" min={0} max={300} step={10} value={Math.round(gravity * 100)} disabled={running || disabled} onChange={(e) => onGravity(Number(e.target.value) / 100)} />
      <span className={styles.ends}><span>{t.physics.floats}</span><span>{t.physics.heavy}</span></span>
    </label>
  )
  if (kind === 'gelatina') {
    return (
      <section className={styles.box}>
        <span className={styles.text}>
          <strong>{t.physics.jellyTitle}</strong>
          <span className={styles.help}>{t.physics.jellyHelp}</span>
        </span>
        {gravityRow}
        <button type="button" className={styles.primary} disabled={running} onClick={onDrop}>
          {running ? t.physics.running : t.physics.jellyDrop}
        </button>
      </section>
    )
  }
  const off = running || disabled
  return (
    <section className={`${styles.box} ${disabled ? styles.off : ''}`} aria-disabled={disabled}>
      <span className={styles.text}>
        <strong>{t.physics.clothTitle}</strong>
        <span className={styles.help}>{disabled ? t.physics.onlyCloth : t.physics.clothHelp}</span>
      </span>
      <label className={styles.row}>
        <span className={styles.label}>{t.physics.density}<span className={styles.value}>{(2 * density * density).toLocaleString('es')}</span></span>
        <input type="range" min={DENSITY_RANGE[0]} max={DENSITY_RANGE[1]} value={density} disabled={off} onChange={(e) => onDensity(Number(e.target.value))} />
      </label>
      <label className={styles.row}>
        <span className={styles.label}>{t.physics.stiffness}<span className={styles.value}>{Math.round(stiffness * 100)}%</span></span>
        <input type="range" min={0} max={100} value={Math.round(stiffness * 100)} disabled={off} onChange={(e) => onStiffness(Number(e.target.value) / 100)} />
        <span className={styles.ends}><span>{t.physics.soft}</span><span>{t.physics.hard}</span></span>
      </label>
      {gravityRow}
      <label className={styles.check}>
        <input type="checkbox" checked={pinned} disabled={off} onChange={(e) => onPinned(e.target.checked)} />
        <span><strong>{t.physics.pinTop}</strong> · {t.physics.pinTopHelp}</span>
      </label>
      <button type="button" className={styles.primary} disabled={off} onClick={onDrop}>
        {running ? t.physics.running : t.physics.drop}
      </button>
      <div className={styles.divider} />
      <label className={styles.row}>
        <span className={styles.label}>{t.physics.size}<span className={styles.value}>{Math.round(size * 100)}%</span></span>
        <input type="range" min={30} max={300} step={5} value={Math.round(size * 100)} disabled={off} onChange={(e) => onSize(Number(e.target.value) / 100)} />
        <span className={styles.ends}><span>{t.physics.small}</span><span>{t.physics.big}</span></span>
      </label>
      <button type="button" className={styles.secondary} disabled={off} onClick={onCover}>{t.physics.cover}</button>
    </section>
  )
}
