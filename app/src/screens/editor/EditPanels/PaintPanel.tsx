import { useRef } from 'react'
import { BLEND_MODES } from '@/domain/paint/paint'
import { SWATCHES } from '@/shared/config/materials'
import { Icon } from '@/assets/icons/Icon'
import { t } from '@/shared/i18n/es'
import type { PaintSettings } from '../types'
import { Slider } from './SculptPanel'
import { SymmetryControl } from './SymmetryControl'
import { TipPicker } from './TipPicker'
import styles from './EditPanels.module.scss'

interface Props {
  partName: string | null
  settings: PaintSettings
  onChange: (patch: Partial<PaintSettings>) => void
}

export function PaintPanel({ partName, settings: s, onChange }: Props) {
  const file = useRef<HTMLInputElement>(null)
  const usesTip = ['pincel', 'aerografo', 'difuminar', 'suavizar', 'goma'].includes(s.tool)
  const usesColor = !['difuminar', 'suavizar', 'goma'].includes(s.tool)
  const usesBlend = ['pincel', 'aerografo', 'degradado'].includes(s.tool)
  const pickColor = (color: string) => onChange({ color, tool: s.tool === 'gotero' ? 'pincel' : s.tool })

  return (
    <aside className={styles.panel} aria-label="Ajustes de pintura">
      <div className={styles.head}>
        <span className={styles.kicker}>{partName ? t.editing(partName) : t.pickToPaint}</span>
        <span className={styles.big}>{t.paintTools[s.tool]}</span>
        <span className={styles.help}>{t.paintHelp[s.tool]}</span>
      </div>

      {usesColor && (
        <section className={styles.section}>
          <div className={styles.current}>
            <label className={styles.colorWell} title={t.color1}>
              <span className={styles.currentSwatch} style={{ background: s.color }} />
              <input type="color" aria-label={t.color1} value={s.color} onChange={(e) => onChange({ color: e.target.value })} />
            </label>
            <button type="button" className={styles.iconButton} aria-label={t.swapColors} title={t.swapColors} onClick={() => onChange({ color: s.color2, color2: s.color })}>
              <Icon name="swap" size={16} />
            </button>
            <label className={styles.colorWell} title={t.color2}>
              <span className={`${styles.currentSwatch} ${styles.small}`} style={{ background: s.color2 }} />
              <input type="color" aria-label={t.color2} value={s.color2} onChange={(e) => onChange({ color2: e.target.value })} />
            </label>
          </div>
          <div className={styles.swatches}>
            {SWATCHES.map((color) => (
              <button key={color} type="button" className={`${styles.swatch} ${s.color === color ? styles.swatchActive : ''}`} style={{ background: color }} aria-label={color} aria-pressed={s.color === color} onClick={() => pickColor(color)} />
            ))}
          </div>
        </section>
      )}

      <Slider id="pt-size" label={t.size} value={Math.round(s.size * 100)} unit=" cm" min={1} max={50} onChange={(v) => onChange({ size: v / 100 })} />
      <Slider id="pt-strength" label={t.strength} value={Math.round(s.strength * 100)} unit="%" min={5} max={100} onChange={(v) => onChange({ strength: v / 100 })} />

      {usesBlend && (
        <section className={styles.section}>
          <h2 className={styles.title}>{t.blend}</h2>
          <div className={styles.chips}>
            {BLEND_MODES.map((b) => (
              <button key={b} type="button" className={`${styles.chip} ${s.blend === b ? styles.active : ''}`} aria-pressed={s.blend === b} onClick={() => onChange({ blend: b })}>{t.blends[b]}</button>
            ))}
          </div>
        </section>
      )}

      {usesTip && (
        <>
          <TipPicker tip={s.tip} angle={s.angle} softness={s.softness} onChange={(tip) => onChange({ tip })} />
          {s.tip === 'suave'
            ? <Slider id="pt-soft" label={t.softness} value={Math.round(s.softness * 100)} unit="%" min={0} max={100} onChange={(v) => onChange({ softness: v / 100 })} />
            : s.tip !== 'dura' && <Slider id="pt-angle" label={t.tipAngle} value={s.angle} unit="°" min={0} max={180} onChange={(v) => onChange({ angle: v })} />}
          <SymmetryControl value={s.symmetry} onChange={(symmetry) => onChange({ symmetry })} />
        </>
      )}

      {(s.tool === 'pincel' || s.tool === 'aerografo') && (
        <section className={styles.section}>
          <h2 className={styles.title}>{t.stencil}</h2>
          <span className={styles.help}>{t.stencilHelp}</span>
          <div className={styles.buttons}>
            <button type="button" className={styles.button} onClick={() => file.current?.click()}><Icon name="image" size={16} /> {t.stencilPick}</button>
            {s.stencil && <button type="button" className={styles.button} onClick={() => onChange({ stencil: null })}>{t.stencilRemove}</button>}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const reader = new FileReader()
              reader.onload = () => onChange({ stencil: reader.result as string })
              reader.readAsDataURL(f)
              e.target.value = ''
            }}
          />
        </section>
      )}
    </aside>
  )
}
