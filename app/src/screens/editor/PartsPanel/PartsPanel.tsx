import type { ReactNode } from 'react'
import { Icon } from '@/assets/icons/Icon'
import { MaterialPanel } from '@/domain/materials/MaterialPanel/MaterialPanel'
import type { Part } from '@/domain/scene/model'
import type { MaterialSpec } from '@/shared/config/materials'
import { t } from '@/shared/i18n/es'
import styles from './PartsPanel.module.scss'

interface Props {
  parts: Part[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onMaterial: (id: string, patch: Partial<MaterialSpec>) => void
  /** Control de low poly de la parte elegida. */
  lowPoly: ReactNode
}

function materialLabel(part: Part): string {
  if (part.image) return 'Imagen'
  const m = part.material
  const base = m.preset === 'tela' && m.fabric ? `${t.presets.tela} · ${t.fabrics[m.fabric]}` : t.presets[m.preset]
  return part.lowPoly ? `${base} · ${t.lowPoly}` : base
}

export function PartsPanel({ parts, selectedId, onSelect, onDuplicate, onDelete, onMaterial, lowPoly }: Props) {
  const selected = parts.find((p) => p.id === selectedId)
  return (
    <aside className={styles.panel} aria-label="Propiedades">
      <section className={styles.section}>
        <h2 className={styles.title}>{t.parts}</h2>
        {parts.length === 0 ? (
          <p className={styles.muted}>{t.noParts}</p>
        ) : (
          <ul className={styles.list}>
            {parts.map((p) => (
              <li key={p.id}>
                <button type="button" className={`${styles.row} ${p.id === selectedId ? styles.rowActive : ''}`} aria-pressed={p.id === selectedId} onClick={() => onSelect(p.id)}>
                  <span className={styles.swatch} style={{ background: p.image ? '#9aa0aa' : p.material.color }} aria-hidden="true" />
                  <span className={styles.name}>{p.name}</span>
                  <span className={styles.meta}>{materialLabel(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected ? (
        <>
          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={() => onDuplicate(selected.id)}><Icon name="copy" size={16} />{t.duplicate}</button>
            <button type="button" className={`${styles.action} ${styles.danger}`} onClick={() => onDelete(selected.id)}><Icon name="trash" size={16} />{t.delete}</button>
          </div>
          {lowPoly}
          {!selected.image && (
            <MaterialPanel
              partName={selected.name}
              spec={selected.material}
              allowOriginal={selected.geometryId.startsWith('import:')}
              onChange={(patch) => onMaterial(selected.id, patch)}
            />
          )}
        </>
      ) : (
        parts.length > 0 && <p className={styles.muted}>{t.pickPart}</p>
      )}
    </aside>
  )
}
