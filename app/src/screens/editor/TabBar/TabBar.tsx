import { useState } from 'react'
import { isMyTab, MY_TAB, type SceneTab } from '@/domain/scene/store'
import { t } from '@/shared/i18n/es'
import styles from './TabBar.module.scss'

interface Props {
  tabs: SceneTab[]
  active: string
  onSwitch: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  onRename: (id: string, name: string) => void
}

/**
 * Pestañas: tus escenas ("Mi escena" y las que creás con +) y una por cada sesión de Claude.
 * La de Claude se abre sola cuando trabaja. Doble clic en una tuya para cambiarle el nombre.
 * Cerrar una tuya la borra: pide un segundo clic en "Borrar".
 */
export function TabBar({ tabs, active, onSwitch, onClose, onNew, onRename }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  return (
    <nav className={styles.bar} aria-label={t.tabs.label}>
      {tabs.map((tab) => {
        const mine = isMyTab(tab.id)
        return (
          <div key={tab.id} className={`${styles.tab} ${tab.id === active ? styles.active : ''}`}>
            {editing === tab.id ? (
              <input
                className={styles.input} defaultValue={tab.name} autoFocus aria-label={t.tabs.rename}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => { onRename(tab.id, e.target.value); setEditing(null) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditing(null)
                  e.stopPropagation()
                }}
              />
            ) : (
              <button
                type="button" className={styles.name} aria-pressed={tab.id === active} title={mine ? t.tabs.rename : undefined}
                onClick={() => { setConfirming(null); onSwitch(tab.id) }} onDoubleClick={() => mine && setEditing(tab.id)}
              >
                {!mine && <span className={`${styles.dot} ${tab.live ? styles.live : ''}`} title={tab.live ? t.tabs.live : t.tabs.gone} aria-hidden="true" />}
                {mine ? tab.name : `${t.claude} · ${tab.name}`}
              </button>
            )}
            {tab.id !== MY_TAB && (confirming === tab.id ? (
              <button type="button" className={styles.danger} title={t.tabs.confirmCloseHelp(tab.name)} onClick={() => { setConfirming(null); onClose(tab.id) }} onBlur={() => setConfirming(null)} autoFocus>
                {t.tabs.confirmClose}
              </button>
            ) : (
              <button type="button" className={styles.close} aria-label={t.tabs.close(tab.name)} onClick={() => (mine ? setConfirming(tab.id) : onClose(tab.id))}>×</button>
            ))}
          </div>
        )
      })}
      <button type="button" className={styles.add} aria-label={t.tabs.add} title={t.tabs.add} onClick={onNew}>+</button>
    </nav>
  )
}
