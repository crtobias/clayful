import { useCallback, useEffect, useRef, useState } from 'react'
import { useScene, newId } from '@/domain/scene/store'
import { getOriginalMaterial } from '@/domain/scene/geometry'
import { IMPORT_EXTENSIONS, importFile } from '@/domain/scene/importFile'
import { exportGlb } from '@/domain/scene/exportGlb'
import { describeScene, toolToCommand } from '@/domain/scene/tools'
import type { Part, Shape, Vec3 } from '@/domain/scene/model'
import { buildMaterial } from '@/domain/materials/buildMaterial'
import { useMcpBridge, type ToolHandler } from '@/domain/mcp/useMcpBridge'
import type { MaterialSpec } from '@/shared/config/materials'
import { convertBlend, isDesktop, saveBytes } from '@/shared/lib/desktop'
import { base64ToBuffer, bufferToBase64 } from '@/shared/utils/base64'
import { t } from '@/shared/i18n/es'
import { TopBar } from './TopBar/TopBar'
import { ToolRail } from './ToolRail/ToolRail'
import { Viewport } from './Viewport/Viewport'
import { PartsPanel } from './PartsPanel/PartsPanel'
import { Toast, type ToastMessage } from './Toast/Toast'
import { claudeToast } from './claudeToast'
import { LOOK_VIEWS, type CaptureFn, type LookView, type Tool } from './types'
import styles from './Editor.module.scss'

const materialFor = (part: Part) => buildMaterial(part.material, getOriginalMaterial(part.geometryId))
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Pantalla Modelar. Orquesta escena, materiales y el puente con Claude: todo pasa por los mismos comandos. */
export function Editor() {
  const parts = useScene((s) => s.parts)
  const selectedId = useScene((s) => s.selectedId)
  const canUndo = useScene((s) => s.past.length > 0)
  const canRedo = useScene((s) => s.future.length > 0)
  const [tool, setTool] = useState<Tool>('mover')
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [dragging, setDragging] = useState(false)
  const captureRef = useRef<CaptureFn | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const notify = useCallback((text: string, fromClaude = false) => setToast({ key: Date.now(), text, fromClaude }), [])

  const importBytes = useCallback(async (name: string, data: ArrayBuffer) => {
    const added = await importFile(name, data, { newId, convertBlend: isDesktop ? convertBlend : undefined })
    useScene.getState().run({ type: 'add_parts', parts: added })
    return added
  }, [])

  const importFiles = useCallback(async (files: Iterable<File>) => {
    for (const file of files) {
      try {
        const added = await importBytes(file.name, await file.arrayBuffer())
        notify(t.imported(added.length))
      } catch (err) {
        notify(errorText(err))
      }
    }
  }, [importBytes, notify])

  const exportScene = useCallback(async () => {
    try {
      const bytes = await exportGlb(useScene.getState().parts, materialFor)
      const path = await saveBytes(bytes, 'clayful.glb')
      if (path) notify(t.exported(path))
    } catch (err) {
      notify(errorText(err))
    }
  }, [notify])

  /** Lo que pide Claude por MCP. */
  const handleTool: ToolHandler = useCallback(async (name, args) => {
    const s = useScene.getState()
    switch (name) {
      case 'scene_info':
        return describeScene(s.parts, s.selectedId)
      case 'look': {
        const view = (LOOK_VIEWS as readonly string[]).includes(String(args.view)) ? (args.view as LookView) : 'actual'
        if (!captureRef.current) throw new Error('La vista 3D todavía no está lista.')
        return { image: captureRef.current(view) }
      }
      case 'undo':
      case 'redo': {
        const changed = name === 'undo' ? s.undo() : s.redo()
        if (changed) notify(claudeToast(name, args, s.parts)!, true)
        const after = useScene.getState()
        return { changed, ...describeScene(after.parts, after.selectedId) }
      }
      case 'import_file': {
        const added = await importBytes(String(args.name), base64ToBuffer(String(args.data)))
        notify(`Claude: ${t.imported(added.length).toLowerCase()}`, true)
        return { added: added.map((p) => ({ id: p.id, name: p.name })) }
      }
      case 'export_glb':
        return { data: bufferToBase64(await exportGlb(s.parts, materialFor)) }
      default: {
        const res = s.run(toolToCommand(name, args, s.parts))
        const text = claudeToast(name, args, s.parts)
        if (text) notify(text, true)
        return { created: res.created, ...describeScene(res.parts, res.selectedId) }
      }
    }
  }, [importBytes, notify])

  const bridge = useMcpBridge(handleTool)

  const select = useCallback((id: string | null) => useScene.getState().run({ type: 'select', id }), [])
  const onCaptureReady = useCallback((fn: CaptureFn) => { captureRef.current = fn }, [])

  // Atajos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const s = useScene.getState()
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return }
      if (mod && key === 'y') { e.preventDefault(); s.redo(); return }
      if (mod && key === 'd' && s.selectedId) { e.preventDefault(); s.run({ type: 'duplicate', id: s.selectedId }); return }
      if (mod) return
      if ((key === 'delete' || key === 'backspace') && s.selectedId) { s.run({ type: 'delete', id: s.selectedId }); return }
      if (key === 'escape') { s.run({ type: 'select', id: null }); return }
      const tools: Record<string, Tool> = { q: 'elegir', w: 'mover', e: 'girar', r: 'escalar' }
      if (tools[key]) setTool(tools[key])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Soltar archivos en cualquier lugar de la app.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setDragging(true) } }
    const leave = () => { depth = Math.max(0, depth - 1); if (depth === 0) setDragging(false) }
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (e.dataTransfer?.files.length) void importFiles(Array.from(e.dataTransfer.files))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [importFiles])

  return (
    <div className={styles.editor}>
      <TopBar
        connected={bridge === 'connected'}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => useScene.getState().undo()}
        onRedo={() => useScene.getState().redo()}
        onExport={exportScene}
      />
      <div className={styles.body}>
        <ToolRail
          tool={tool}
          onTool={setTool}
          onAddShape={(shape: Shape) => useScene.getState().run({ type: 'add_shape', shape })}
          onOpen={() => fileInput.current?.click()}
        />
        <div className={styles.stage}>
          <Viewport
            parts={parts}
            selectedId={selectedId}
            tool={tool}
            onSelect={select}
            onTransformStart={() => useScene.getState().checkpoint()}
            onTransformEnd={(id, tr: { position: Vec3; rotation: Vec3; scale: Vec3 }) =>
              useScene.getState().run({ type: 'transform', id, ...tr }, { record: false })}
            onCaptureReady={onCaptureReady}
          />
          <Toast message={toast} />
          {dragging && <div className={styles.drop}>{t.dropHere}</div>}
        </div>
        <PartsPanel
          parts={parts}
          selectedId={selectedId}
          onSelect={select}
          onDuplicate={(id) => useScene.getState().run({ type: 'duplicate', id })}
          onDelete={(id) => useScene.getState().run({ type: 'delete', id })}
          onMaterial={(id, patch: Partial<MaterialSpec>) => useScene.getState().run({ type: 'set_material', id, material: patch })}
        />
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept={IMPORT_EXTENSIONS.map((e) => `.${e}`).join(',')}
        onChange={(e) => {
          if (e.target.files) void importFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
    </div>
  )
}
