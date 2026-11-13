import { useState } from 'react'
import type { LibraryItem } from '@/domain/library/library'
import { t } from '@/shared/i18n/es'
import { Icon } from '@/assets/icons/Icon'
import styles from './LibraryPanel.module.scss'

interface Props {
  items: LibraryItem[]
  canSave: boolean
  busy: boolean
  onAdd: (item: LibraryItem) => void
  onSave: (name: string) => void
  onDelete: (item: LibraryItem) => void
  onClose: () => void
}

/** Biblioteca: modelos de Clayful y los míos. Tocar uno lo agrega a la escena. */
export function LibraryPanel({ items, canSave, busy, onAdd, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState('')
  const sections: [string, LibraryItem[]][] = [
    [t.library.clayful, items.filter((it) => it.source === 'clayful')],
    [t.library.mine, items.filter((it) => it.source === 'mio')],
  ]
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <section className={styles.panel} role="dialog" aria-label={t.library.title} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2>{t.library.title}</h2>
          <button type="button" className={styles.close} aria-label={t.library.close} onClick={onClose}>×</button>
        </header>
        {sections.map(([title, list]) => (
          <div key={title} className={styles.section}>
            <h3>{title}</h3>
            {list.length === 0 ? (
              <p className={styles.empty}>{t.library.emptyMine}</p>
            ) : (
              <div className={styles.grid}>
                {list.map((it) => (
                  <div key={it.id} className={styles.card}>
                    <button type="button" className={styles.thumbBtn} disabled={busy} onClick={() => onAdd(it)} title={it.description ?? it.name}>
                      {it.thumb ? <img src={it.thumb} alt="" /> : <span className={styles.noThumb}><Icon name="cube" size={28} /></span>}
                      <span className={styles.name}>{it.name}</span>
                      {it.author && <span className={styles.author}>{t.library.by(it.author)}</span>}
                    </button>
                    {it.source === 'mio' && (
                      <button type="button" className={styles.delete} aria-label={t.library.remove(it.name)} onClick={() => onDelete(it)}><Icon name="trash" size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <footer className={styles.footer}>
          <input value={name} placeholder={t.library.namePlaceholder} onChange={(e) => setName(e.target.value)} disabled={!canSave || busy} />
          <button type="button" className={styles.save} disabled={!canSave || busy} onClick={() => { onSave(name); setName('') }}>{t.library.save}</button>
        </footer>
      </section>
    </div>
  )
}
