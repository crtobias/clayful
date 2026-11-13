import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScene, newId } from '@/domain/scene/store'
import { getGeometry, getOriginalMaterial } from '@/domain/scene/geometry'
import { IMPORT_EXTENSIONS, importFile } from '@/domain/scene/importFile'
import { exportGlb } from '@/domain/scene/exportGlb'
import { beginEdit, lowPolyVersion } from '@/domain/scene/editable'
import { describeScene, resolvePart, toolToCommand } from '@/domain/scene/tools'
import type { LowPolyLevel, Part, Shape, Vec3 } from '@/domain/scene/model'
import { buildMaterial } from '@/domain/materials/buildMaterial'
import { fillColor } from '@/domain/paint/paint'
import { clearMask, invertMask } from '@/domain/sculpt/brushes'
import { useMcpBridge, type ClaudeSession, type ToolHandler } from '@/domain/mcp/useMcpBridge'
import type { MaterialSpec } from '@/shared/config/materials'
import { refresh } from '@/shared/lib/meshOps'
import { convertBlend, isDesktop, saveBytes } from '@/shared/lib/desktop'
import { base64ToBuffer, bufferToBase64 } from '@/shared/utils/base64'
import { t } from '@/shared/i18n/es'
import { TopBar } from './TopBar/TopBar'
import { ToolRail } from './ToolRail/ToolRail'
import { Viewport } from './Viewport/Viewport'
import { isFlying } from './Viewport/flyState'
import { PartsPanel } from './PartsPanel/PartsPanel'
import { SculptPanel } from './EditPanels/SculptPanel'
import { PaintPanel } from './EditPanels/PaintPanel'
import { Toast, type ToastMessage } from './Toast/Toast'
import { TabBar } from './TabBar/TabBar'
import { LibraryPanel } from './LibraryPanel/LibraryPanel'
import { allItems, deleteMine, loadItem, saveMine, type LibraryItem } from '@/domain/library/library'
import { LowPolyControl } from './LowPolyControl/LowPolyControl'
import { claudeToast } from './claudeToast'
import { runCode } from './runCode'
import { dropAllHair, hairDataOf, hairFromTool, hairPartOf, rebuildHair, setHairLowPoly, startHair } from './hairRun'
import { hairTriangles, isHairBrush, LENGTH_RANGE } from '@/domain/physics/hair'
import { Vector3 } from 'three'
import { restoreAutosave, startAutosave, whenRestored } from '@/domain/scene/autosave'
import { isSimulatedCloth, simulate, type SimAction } from './physicsRun'
import { PhysicsControl } from './PhysicsControl/PhysicsControl'
import { DEFAULT_DENSITY } from '@/domain/physics/cloth'
import { FABRIC_STIFFNESS } from '@/shared/config/materials'
import { fillFromTool, gradientFromTool, maskFromTool, paintFromTool, sculptFromTool } from './mcpEdit'
import {
  DEFAULT_PAINT, DEFAULT_SCULPT, LOOK_VIEWS,
  type CaptureFn, type EditHooks, type LookView, type Mode, type PaintSettings, type SculptSettings, type Tool,
} from './types'
import styles from './Editor.module.scss'

const materialFor = (part: Part) =>
  buildMaterial(part.material, getOriginalMaterial(part.geometryId), Boolean(getGeometry(part.geometryId)?.hasAttribute('color')), Boolean(part.lowPoly))
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * Prepara una versión editable de la parte y la deja en la escena con un solo paso de deshacer.
 * La usan los trazos con el mouse y las herramientas del MCP.
 */
function startEdit(partId: string, forPaint: boolean, moreDetail = false) {
  const s = useScene.getState()
  const part = s.parts.find((p) => p.id === partId)
  if (!part || part.image) return null
  const res = beginEdit(part, forPaint, moreDetail)
  s.checkpoint()
  s.run({ type: 'set_geometry', id: partId, geometryId: res.geometryId }, { record: false })
  if (res.lowPoly) s.run({ type: 'set_low_poly', id: partId, lowPoly: res.lowPoly }, { record: false })
  if (res.material) s.run({ type: 'set_material', id: partId, material: res.material }, { record: false })
  return { geometry: res.geometry, regenerate: res.regenerate }
}

/** Prende/cambia/apaga el estilo low poly de una parte (un paso de deshacer). */
function setLowPoly(partId: string, level: LowPolyLevel | null) {
  const s = useScene.getState()
  const part = s.parts.find((p) => p.id === partId)
  if (!part || part.image) return false
  // En el pelo, low poly = mechones (simplificar hebras finas las rompe).
  if (part.hair && hairDataOf(part)) return setHairLowPoly(part.id, level)
  const next = lowPolyVersion(part, level)
  if (!next) return false
  s.checkpoint()
  s.run({ type: 'set_geometry', id: partId, geometryId: next.geometryId }, { record: false })
  s.run({ type: 'set_low_poly', id: partId, lowPoly: next.lowPoly }, { record: false })
  return true
}

/** Pantalla principal. Orquesta escena, materiales, esculpir, pintar y el puente con Claude. */
export function Editor() {
  const parts = useScene((s) => s.parts)
  const selectedId = useScene((s) => s.selectedId)
  const canUndo = useScene((s) => s.past.length > 0)
  const canRedo = useScene((s) => s.future.length > 0)
  const [mode, setMode] = useState<Mode>('modelar')
  const [tool, setTool] = useState<Tool>('mover')
  const [sculpt, setSculpt] = useState<SculptSettings>(DEFAULT_SCULPT)
  const [paint, setPaint] = useState<PaintSettings>(DEFAULT_PAINT)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [dragging, setDragging] = useState(false)
  const [density, setDensity] = useState(DEFAULT_DENSITY)
  /** null = la rigidez del tipo de tela. */
  const [stiffness, setStiffness] = useState<number | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [gravity, setGravity] = useState(1)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([])
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [clothSize, setClothSize] = useState(1)
  const [pinned, setPinned] = useState(false)
  const captureRef = useRef<CaptureFn | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const modeRef = useRef(mode)
  const paintRef = useRef(paint)
  const sculptRef = useRef(sculpt)
  useEffect(() => { modeRef.current = mode; paintRef.current = paint; sculptRef.current = sculpt }, [mode, paint, sculpt])

  // Al elegir una parte con pelo, el panel de pelo toma su color, largo y rigidez (así pintar no cambia el pelo que ya hay).
  useEffect(() => {
    const hp = selectedId ? hairPartOf(useScene.getState().parts, useScene.getState().parts.find((p) => p.id === selectedId)?.hair?.parentId ?? selectedId) : undefined
    const data = hairDataOf(hp)
    if (!hp || !data) return
    setSculpt((p) => ({ ...p, hair: { ...p.hair, color: hp.material.color, stiffness: data.stiffness, width: data.width } }))
  }, [selectedId])

  const notify = useCallback((text: string, fromClaude = false) => setToast({ key: Date.now(), text, fromClaude }), [])
  const selected = parts.find((p) => p.id === selectedId) ?? null
  const selectedHair = selected ? hairDataOf(hairPartOf(parts, selected.hair?.parentId ?? selected.id)) : undefined
  // Pelo con hebras: la barra son los mechones. Pelo viejo (ya malla común) o cualquier otra parte: low poly normal.
  const lowPolyLevel = selected?.hair && selectedHair ? selectedHair.clumpLevel ?? null : selected?.lowPoly?.level ?? null
  const selectedHairTris = useMemo(() => (selectedHair ? hairTriangles(selectedHair) : 0), [selectedHair])

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

  const hooks: EditHooks = useMemo(() => ({
    onStrokeStart: (partId) => startEdit(partId, modeRef.current === 'pintar'),
    onFill: (partId) => {
      const e = startEdit(partId, true)
      if (!e) return
      fillColor(e.geometry, paintRef.current.color)
      refresh(e.geometry, false, true)
      e.regenerate?.()
    },
    onPick: (color) => setPaint((p) => ({ ...p, color, tool: 'pincel' })),
    onHairStart: (partId) => {
      const sc = sculptRef.current
      return isHairBrush(sc.brush) ? startHair(partId, sc.brush, sc.hair, sc.symmetry) : null
    },
  }), [])

  const mask = useCallback((action: 'invertir' | 'borrar') => {
    const id = useScene.getState().selectedId
    const e = id ? startEdit(id, false) : null
    if (!e) return
    if (action === 'invertir') invertMask(e.geometry)
    else clearMask(e.geometry)
    refresh(e.geometry, false, false, true)
    e.regenerate?.()
  }, [])

  const moreDetail = useCallback(() => {
    const id = useScene.getState().selectedId
    if (id && startEdit(id, false, true)) notify(t.moreDetail)
  }, [notify])

  // ── Biblioteca ──
  const refreshLibrary = useCallback(async () => { setLibraryItems(await allItems()) }, [])
  const openLibrary = useCallback(() => { void refreshLibrary(); setLibraryOpen(true) }, [refreshLibrary])
  const addFromLibrary = useCallback(async (item: LibraryItem) => {
    const added = await importBytes(`${item.name}.glb`, await loadItem(item))
    return added
  }, [importBytes])
  const saveSceneToLibrary = useCallback(async (name: string) => {
    const s = useScene.getState()
    if (s.parts.length === 0) throw new Error('La escena está vacía.')
    const glb = await exportGlb(s.parts, materialFor)
    const thumb = captureRef.current?.('actual')
    const item = await saveMine(name || `Escena ${new Date().toLocaleDateString('es')}`, glb, thumb)
    await refreshLibrary()
    return item
  }, [refreshLibrary])

  const runSim = useCallback(async (partId: string, action: SimAction, opts: Parameters<typeof simulate>[2] = {}) => {
    setSimulating(true)
    try {
      return await simulate(partId, action, opts)
    } finally {
      setSimulating(false)
    }
  }, [])

  /** Lo que pide Claude por MCP. */
  const handleTool: ToolHandler = useCallback(async (name, args, session) => {
    await whenRestored()
    // Cada sesión de Claude trabaja en su pestaña: se abre sola y se muestra.
    if (session) {
      const st = useScene.getState()
      if (!st.tabs.some((tab) => tab.id === session.id)) st.openTab(session.id, session.name, true)
      st.switchTab(session.id)
    }
    const s = useScene.getState()
    switch (name) {
      case 'scene_info':
        return describeScene(s.parts, s.selectedId)
      case 'look': {
        const view = (LOOK_VIEWS as readonly string[]).includes(String(args.view)) ? (args.view as LookView) : 'actual'
        // Al abrir la app la vista 3D tarda un momento en montarse: esperar hasta 5 s.
        for (let i = 0; i < 50 && !captureRef.current; i++) await new Promise((r) => setTimeout(r, 100))
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
      case 'sculpt_stroke':
      case 'paint_stroke':
      case 'paint_gradient':
      case 'fill_color':
      case 'mask':
      case 'add_detail': {
        const part = resolvePart(s.parts, args.part)
        const forPaint = name === 'paint_stroke' || name === 'paint_gradient' || name === 'fill_color'
        const edit = startEdit(part.id, forPaint, name === 'add_detail')
        if (!edit) throw new Error('Esa parte no se puede editar.')
        const g = edit.geometry
        const fresh = useScene.getState().parts.find((p) => p.id === part.id)!
        if (name === 'sculpt_stroke') sculptFromTool(g, fresh, args)
        if (name === 'paint_stroke') paintFromTool(g, fresh, args)
        if (name === 'paint_gradient') gradientFromTool(g, fresh, args)
        if (name === 'fill_color') fillFromTool(g, args)
        if (name === 'mask') maskFromTool(g, args)
        edit.regenerate?.()
        const verb = {
          sculpt_stroke: 'esculpió', paint_stroke: 'pintó', paint_gradient: 'le hizo un degradado a', fill_color: 'pintó entera',
          mask: 'cambió la máscara de', add_detail: 'le dio más detalle a',
        }[name]
        notify(`Claude ${verb} ${part.name}`, true)
        return { part: part.name, vertices: g.attributes.position.count }
      }
      case 'library_list': {
        const items = await allItems()
        return items.map(({ id, name, source, author, description, tags }) => ({ id, name, source, author, description, tags }))
      }
      case 'library_add': {
        const item = (await allItems()).find((it) => it.id === args.id || it.name.toLowerCase() === String(args.id ?? '').toLowerCase())
        if (!item) throw new Error('No encontré ese modelo. Usá library_list para ver los ids.')
        const added = await addFromLibrary(item)
        notify(`Claude agregó ${item.name}`, true)
        const after = useScene.getState()
        return { added: added.map((p) => ({ id: p.id, name: p.name })), ...describeScene(after.parts, after.selectedId) }
      }
      case 'library_save': {
        const item = await saveSceneToLibrary(String(args.name ?? ''))
        notify(t.library.saved(item.name), true)
        return { id: item.id, name: item.name }
      }
      case 'hair': {
        const part = resolvePart(s.parts, args.part)
        const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' ? Math.min(hi, Math.max(lo, v)) : d)
        const base = sculptRef.current.hair
        const settings = {
          length: num(args.length, base.length, LENGTH_RANGE[0], LENGTH_RANGE[1]),
          density: num(args.density, base.density, 0.5, 40),
          width: num(args.width, base.width, 0.0002, 0.008),
          stiffness: num(args.stiffness, base.stiffness, 0, 1),
          color: typeof args.color === 'string' && /^#[0-9a-f]{6}$/i.test(args.color) ? args.color : base.color,
        }
        const vec = (v: unknown) => (Array.isArray(v) && v.length === 3 ? new Vector3(...(v as [number, number, number])) : null)
        const pts = Array.isArray(args.points) ? (args.points as unknown[]).map(vec).filter((v): v is Vector3 => Boolean(v)) : null
        const n = hairFromTool(part.id, String(args.action ?? 'crecer'), settings, pts && pts.length ? pts : null, num(args.radius, 0.06, 0.005, 2), vec(args.comb), typeof args.clump === 'number' ? num(args.clump, 0.015, 0, 0.2) : undefined)
        notify(`Claude ${String(args.action ?? 'crecer') === 'crecer' ? 'le hizo crecer pelo a' : 'arregló el pelo de'} ${part.name}`, true)
        const after = useScene.getState()
        const hairData = hairDataOf(hairPartOf(after.parts, part.hair?.parentId ?? part.id))
        return { strands: n, triangles: hairData ? hairTriangles(hairData) : 0, ...describeScene(after.parts, after.selectedId) }
      }
      case 'simulate': {
        const part = resolvePart(s.parts, args.part)
        const action = String(args.action) as SimAction
        if (!['tapar', 'soltar', 'gelatina'].includes(action)) throw new Error('action: tapar, soltar o gelatina.')
        const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
        const out = await runSim(part.id, action, { density: num(args.density), stiffness: num(args.stiffness), hardness: num(args.hardness), gravity: num(args.gravity), size: num(args.size), pin: args.pin === 'arriba' ? 'arriba' : 'ninguno' })
        notify(action === 'gelatina' ? `Claude hizo gelatina ${part.name}` : `Claude ${action === 'tapar' ? 'tapó con tela' : 'soltó'} ${part.name}`, true)
        const after = useScene.getState()
        return { ...out, ...describeScene(after.parts, after.selectedId) }
      }
      case 'run_code': {
        const out = await runCode(String(args.code ?? ''), { startEdit })
        notify('Claude corrió código', true)
        return out
      }
      case 'set_low_poly': {
        const part = resolvePart(s.parts, args.part)
        const levels: Record<string, LowPolyLevel | null> = { apagado: null, muy_bajo: 0.05, bajo: 0.2, medio: 0.4, alto: 0.7 }
        if (typeof args.detail === 'number') levels.custom = Math.min(1, Math.max(0, args.detail))
        const key = typeof args.detail === 'number' && args.level !== 'apagado' ? 'custom' : String(args.level)
        if (!(key in levels)) throw new Error('Pasá detail (0 a 1) o level: apagado, muy_bajo, bajo, medio o alto.')
        setLowPoly(part.id, levels[key])
        notify(`Claude ${levels[key] !== null ? 'hizo low poly' : 'volvió a suave'} ${part.name}`, true)
        const after = useScene.getState()
        return describeScene(after.parts, after.selectedId)
      }
      default: {
        const res = s.run(toolToCommand(name, args, s.parts))
        const text = claudeToast(name, args, s.parts)
        if (text) notify(text, true)
        return { created: res.created, ...describeScene(res.parts, res.selectedId) }
      }
    }
  }, [importBytes, notify, runSim, addFromLibrary, saveSceneToLibrary])

  // Las pestañas se abren cuando una sesión trabaja (handleTool); acá solo se marca quién sigue conectado.
  const onSessions = useCallback((sessions: ClaudeSession[]) => {
    useScene.getState().setLive(sessions.map((ses) => ses.id))
  }, [])

  const bridge = useMcpBridge(handleTool, onSessions)
  const tabs = useScene((s) => s.tabs)
  const activeTab = useScene((s) => s.activeTab)

  const select = useCallback((id: string | null) => useScene.getState().run({ type: 'select', id }), [])
  const onCaptureReady = useCallback((fn: CaptureFn) => { captureRef.current = fn }, [])

  // Guardado automático local: al abrir recupera todo y después guarda solo cada cambio.
  useEffect(() => {
    let stop: (() => void) | undefined
    let alive = true
    void restoreAutosave(rebuildHair).then(() => {
      if (!alive) return
      stop = startAutosave()
      // Al entrar con la escena vacía, se abre la Biblioteca para arrancar desde un modelo.
      if (useScene.getState().parts.length === 0) openLibrary()
    })
    return () => { alive = false; stop?.() }
  }, [openLibrary])

  // Atajos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isFlying()) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const s = useScene.getState()
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return }
      if (mod && key === 'y') { e.preventDefault(); s.redo(); return }
      if (mod && key === 'd' && s.selectedId) { e.preventDefault(); s.run({ type: 'duplicate', id: s.selectedId }); return }
      if (mod) return
      if (key === '1') { setMode('modelar'); return }
      if (key === '2') { setMode('esculpir'); return }
      if (key === '3') { setMode('pintar'); return }
      if (key === '[' || key === ']') {
        const k = key === ']' ? 1.15 : 1 / 1.15
        if (modeRef.current === 'pintar') setPaint((p) => ({ ...p, size: Math.min(0.5, Math.max(0.01, p.size * k)) }))
        else setSculpt((p) => ({ ...p, size: Math.min(0.6, Math.max(0.02, p.size * k)) }))
        return
      }
      if (modeRef.current !== 'modelar') return
      if ((key === 'delete' || key === 'backspace') && s.selectedId) { s.run({ type: 'delete', id: s.selectedId }); return }
      if (key === 'escape') { s.run({ type: 'select', id: null }); return }
      // W A S D Q E son para moverse por la escena (FlyControls): las herramientas van en V G R T.
      const tools: Record<string, Tool> = { v: 'elegir', g: 'mover', r: 'girar', t: 'escalar' }
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
        mode={mode}
        onMode={setMode}
        connected={bridge === 'connected'}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => useScene.getState().undo()}
        onRedo={() => useScene.getState().redo()}
        onExport={exportScene}
      />
      {tabs.length > 1 && (
        <TabBar
          tabs={tabs} active={activeTab}
          onSwitch={(id) => useScene.getState().switchTab(id)}
          onClose={(id) => useScene.getState().closeTab(id)}
          onNew={() => useScene.getState().newScene()}
          onRename={(id, name) => useScene.getState().renameTab(id, name)}
        />
      )}
      <div className={styles.body}>
        <ToolRail
          mode={mode}
          tool={tool}
          brush={sculpt.brush}
          paintTool={paint.tool}
          onTool={setTool}
          onBrush={(brush) => setSculpt((p) => ({ ...p, brush }))}
          onPaintTool={(paintTool) => setPaint((p) => ({ ...p, tool: paintTool }))}
          onAddShape={(shape: Shape) => useScene.getState().run({ type: 'add_shape', shape })}
          onOpen={() => fileInput.current?.click()}
          onLibrary={openLibrary}
        />
        <div className={styles.stage}>
          <Viewport
            parts={parts}
            selectedId={selectedId}
            mode={mode}
            tool={tool}
            sculpt={sculpt}
            paint={paint}
            hooks={hooks}
            onSelect={select}
            onTransformStart={() => useScene.getState().checkpoint()}
            onTransformEnd={(id, tr: { position: Vec3; rotation: Vec3; scale: Vec3 }) => {
              useScene.getState().run({ type: 'transform', id, ...tr }, { record: false })
              // Una tela ya simulada que movés vuelve a caer desde donde la dejaste.
              const moved = useScene.getState().parts.find((p) => p.id === id)
              if (moved && isSimulatedCloth(moved) && !simulating) {
                void runSim(id, 'soltar', { density, gravity, stiffness: stiffness ?? undefined, fromOriginal: false }).catch((e) => notify(errorText(e)))
              }
            }}
            onCaptureReady={onCaptureReady}
          />
          <Toast message={toast} />
          {libraryOpen && (
            <LibraryPanel
              items={libraryItems}
              canSave={parts.length > 0}
              busy={libraryBusy}
              onClose={() => setLibraryOpen(false)}
              onAdd={(item) => {
                setLibraryBusy(true)
                addFromLibrary(item)
                  .then(() => { notify(t.library.added(item.name)); setLibraryOpen(false) })
                  .catch((e) => notify(errorText(e)))
                  .finally(() => setLibraryBusy(false))
              }}
              onSave={(name) => {
                setLibraryBusy(true)
                saveSceneToLibrary(name).then((it) => notify(t.library.saved(it.name))).catch((e) => notify(errorText(e))).finally(() => setLibraryBusy(false))
              }}
              onDelete={(item) => { void deleteMine(item.id).then(refreshLibrary) }}
            />
          )}
          {dragging && <div className={styles.drop}>{t.dropHere}</div>}
        </div>
        {mode === 'esculpir' && (
          <SculptPanel
            partName={selected?.name ?? null}
            settings={sculpt}
            onChange={(patch) => setSculpt((p) => ({ ...p, ...patch }))}
            onMoreDetail={moreDetail}
            onMask={mask}
            lowPoly={<LowPolyControl level={lowPolyLevel} disabled={!selected} onChange={(l) => selected && setLowPoly(selected.id, l)} />}
            hairCount={selectedHair?.n ?? 0}
            hairTris={selectedHairTris}
            onHairFall={() => { if (selected) { const n = dropAllHair(selected.id); if (n) notify(t.hair.count(n)) } }}
            onClumpAll={(on) => { if (selected) hairFromTool(selected.id, 'mechones', sculpt.hair, null, 0, null, on ? sculpt.size * 0.5 : 0) }}
          />
        )}
        {mode === 'pintar' && (
          <PaintPanel partName={selected?.name ?? null} settings={paint} onChange={(patch) => setPaint((p) => ({ ...p, ...patch }))} />
        )}
        {mode === 'modelar' && (
          <PartsPanel
            parts={parts}
            selectedId={selectedId}
            onSelect={select}
            onDuplicate={(id) => useScene.getState().run({ type: 'duplicate', id })}
            onDelete={(id) => useScene.getState().run({ type: 'delete', id })}
            onMaterial={(id, patch: Partial<MaterialSpec>) => useScene.getState().run({ type: 'set_material', id, material: patch })}
            lowPoly={selected && !selected.image ? <LowPolyControl level={lowPolyLevel} onChange={(l) => setLowPoly(selected.id, l)} /> : null}
            physics={selected && !selected.image ? (
              <PhysicsControl
                kind={selected.material.preset === 'gelatina' ? 'gelatina' : 'tela'}
                disabled={selected.material.preset !== 'tela' && selected.material.preset !== 'gelatina'}
                density={density}
                stiffness={stiffness ?? FABRIC_STIFFNESS[selected.material.fabric ?? 'algodon']}
                gravity={gravity}
                onGravity={setGravity}
                size={clothSize}
                onSize={setClothSize}
                pinned={pinned}
                onPinned={setPinned}
                running={simulating}
                onDensity={setDensity}
                onStiffness={setStiffness}
                onCover={() => void runSim(selected.id, 'tapar', { density, gravity, size: clothSize, stiffness: stiffness ?? undefined }).catch((e) => notify(errorText(e)))}
                onDrop={() => void runSim(selected.id, selected.material.preset === 'gelatina' ? 'gelatina' : 'soltar', { density, gravity, pin: pinned ? 'arriba' : 'ninguno', stiffness: stiffness ?? undefined }).catch((e) => notify(errorText(e)))}
              />
            ) : null}
          />
        )}
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
