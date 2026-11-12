import { Icon, type IconName } from '@/assets/icons/Icon'
import { t } from '@/shared/i18n/es'
import type { Mode } from '../types'
import styles from './TopBar.module.scss'

interface Props {
  mode: Mode
  onMode: (mode: Mode) => void
  connected: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onExport: () => void
}

const MODES: { id: Mode; icon: IconName; key: string }[] = [
  { id: 'modelar', icon: 'cube', key: '1' },
  { id: 'esculpir', icon: 'hand', key: '2' },
  { id: 'pintar', icon: 'brush', key: '3' },
]

export function TopBar({ mode, onMode, connected, canUndo, canRedo, onUndo, onRedo, onExport }: Props) {
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3c4.4 0 8 2.6 8 7.6 0 5.6-3.6 10.4-8.6 10.4C6.6 21 4 17.2 4 12.6 4 7.2 7.6 3 12 3z" fill="var(--accent)" />
          <circle cx="9.5" cy="11" r="1.3" fill="#fff" />
          <circle cx="14.5" cy="11" r="1.3" fill="#fff" />
        </svg>
        <span className={styles.name}>Clayful</span>
      </div>

      <nav className={styles.tabs} aria-label="Modo">
        {MODES.map((m) => (
          <button key={m.id} type="button" className={`${styles.tab} ${mode === m.id ? styles.current : ''}`} aria-current={mode === m.id ? 'page' : undefined} title={`${t.modes[m.id]} (${m.key})`} onClick={() => onMode(m.id)}>
            <Icon name={m.icon} />
            {t.modes[m.id]}
          </button>
        ))}
      </nav>

      <div className={styles.actions}>
        <span className={`${styles.status} ${connected ? styles.on : ''}`} role="status">
          <span className={styles.dot} />
          {connected ? t.mcpOn : t.mcpOff}
        </span>
        <button type="button" className={styles.icon} aria-label={t.undo} title={`${t.undo} (⌘Z)`} disabled={!canUndo} onClick={onUndo}><Icon name="undo" /></button>
        <button type="button" className={styles.icon} aria-label={t.redo} title={`${t.redo} (⇧⌘Z)`} disabled={!canRedo} onClick={onRedo}><Icon name="redo" /></button>
        <button type="button" className={styles.export} onClick={onExport}><Icon name="download" size={18} />{t.exportGlb}</button>
      </div>
    </header>
  )
}
