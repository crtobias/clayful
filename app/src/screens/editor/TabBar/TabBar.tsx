import type { SceneTab } from '@/domain/scene/store'
import { t } from '@/shared/i18n/es'
import styles from './TabBar.module.scss'

interface Props {
  tabs: SceneTab[]
  active: string
  onSwitch: (id: string) => void
  onClose: (id: string) => void
}

/** Pestañas: tu escena y una por cada sesión de Claude. La de Claude se abre sola cuando trabaja. */
export function TabBar({ tabs, active, onSwitch, onClose }: Props) {
  return (
    <nav className={styles.bar} aria-label={t.tabs.label}>
      {tabs.map((tab, i) => (
        <div key={tab.id} className={`${styles.tab} ${tab.id === active ? styles.active : ''}`}>
          <button type="button" className={styles.name} aria-pressed={tab.id === active} onClick={() => onSwitch(tab.id)}>
            {i > 0 && <span className={`${styles.dot} ${tab.live ? styles.live : ''}`} title={tab.live ? t.tabs.live : t.tabs.gone} aria-hidden="true" />}
            {i > 0 ? `${t.claude} · ${tab.name}` : tab.name}
          </button>
          {i > 0 && (
            <button type="button" className={styles.close} aria-label={t.tabs.close(tab.name)} onClick={() => onClose(tab.id)}>×</button>
          )}
        </div>
      ))}
    </nav>
  )
}
