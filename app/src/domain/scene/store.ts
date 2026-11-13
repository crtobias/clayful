import { create } from 'zustand'
import { applyCommand } from './commands'
import type { CommandResult, Part, SceneCommand } from './model'

const HISTORY_LIMIT = 100

/** Una pestaña: la escena del usuario o la de una sesión de Claude. */
export interface SceneTab {
  id: string
  name: string
  /** Sesión de Claude conectada ahora. */
  live: boolean
}

interface Snapshot {
  parts: Part[]
  selectedId: string | null
  past: Part[][]
  future: Part[][]
}

export const MY_TAB = 'mia'
/** Escenas del usuario (no de Claude): "Mi escena" y las que crea con +. */
export const isMyTab = (id: string) => id === MY_TAB || id.startsWith(`${MY_TAB}-`)

interface SceneStore {
  tabs: SceneTab[]
  activeTab: string
  /** Escenas de las pestañas que no se están viendo. */
  saved: Record<string, Snapshot>
  /** Abre (o actualiza) una pestaña sin cambiarse a ella. */
  openTab: (id: string, name: string, live: boolean) => void
  switchTab: (id: string) => void
  closeTab: (id: string) => void
  /** Escena nueva del usuario, vacía; se cambia a ella. */
  newScene: () => string
  renameTab: (id: string, name: string) => void
  /** Marca qué sesiones de Claude siguen conectadas. */
  setLive: (ids: string[]) => void
  parts: Part[]
  selectedId: string | null
  past: Part[][]
  future: Part[][]
  /** Aplica un comando. Por defecto guarda historial si cambió algo (salvo 'select'). */
  run: (cmd: SceneCommand, opts?: { record?: boolean }) => CommandResult
  /** Guarda el estado actual en el historial (antes de arrastrar con el gizmo). */
  checkpoint: () => void
  undo: () => boolean
  redo: () => boolean
}

export const newId = (): string => Math.random().toString(36).slice(2, 10)

const keepSelection = (parts: Part[], id: string | null) => (id && parts.some((p) => p.id === id) ? id : null)

const EMPTY: Snapshot = { parts: [], selectedId: null, past: [], future: [] }

export const useScene = create<SceneStore>((set, get) => ({
  tabs: [{ id: MY_TAB, name: 'Mi escena', live: false }],
  activeTab: MY_TAB,
  saved: {},
  openTab: (id, name, live) => set((s) => {
    const hit = s.tabs.find((t) => t.id === id)
    if (hit) return { tabs: s.tabs.map((t) => (t.id === id ? { ...t, name, live } : t)) }
    // La misma sesión que volvió (reinicio de Claude): retoma su pestaña desconectada con su escena.
    const old = s.tabs.find((t) => !isMyTab(t.id) && !t.live && t.name === name)
    if (old) {
      const saved = { ...s.saved }
      if (saved[old.id]) { saved[id] = saved[old.id]; delete saved[old.id] }
      return {
        tabs: s.tabs.map((t) => (t === old ? { id, name, live } : t)),
        saved,
        activeTab: s.activeTab === old.id ? id : s.activeTab,
      }
    }
    return { tabs: [...s.tabs, { id, name, live }] }
  }),
  switchTab: (id) => {
    const s = get()
    if (id === s.activeTab || !s.tabs.some((t) => t.id === id)) return
    const current: Snapshot = { parts: s.parts, selectedId: s.selectedId, past: s.past, future: s.future }
    const next = s.saved[id] ?? EMPTY
    const saved = { ...s.saved, [s.activeTab]: current }
    delete saved[id]
    set({ ...next, saved, activeTab: id })
  },
  closeTab: (id) => {
    const s = get()
    if (id === MY_TAB) return
    if (id === s.activeTab) s.switchTab(MY_TAB)
    const after = get()
    const saved = { ...after.saved }
    delete saved[id]
    set({ tabs: after.tabs.filter((t) => t.id !== id), saved })
  },
  newScene: () => {
    const s = get()
    const used = new Set(s.tabs.map((t) => t.name))
    let n = 2
    while (used.has(`Escena ${n}`)) n++
    const id = `${MY_TAB}-${newId()}`
    set({ tabs: [...s.tabs, { id, name: `Escena ${n}`, live: false }] })
    get().switchTab(id)
    return id
  },
  renameTab: (id, name) => {
    const clean = name.trim().slice(0, 40)
    if (clean) set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, name: clean } : t)) }))
  },
  setLive: (ids) => set((s) => ({ tabs: s.tabs.map((t) => (isMyTab(t.id) ? t : { ...t, live: ids.includes(t.id) })) })),
  parts: [],
  selectedId: null,
  past: [],
  future: [],
  run: (cmd, opts = {}) => {
    const s = get()
    const res = applyCommand({ parts: s.parts, selectedId: s.selectedId }, cmd, newId)
    const record = (opts.record ?? cmd.type !== 'select') && res.parts !== s.parts
    set({
      parts: res.parts,
      selectedId: res.selectedId,
      ...(record ? { past: [...s.past, s.parts].slice(-HISTORY_LIMIT), future: [] } : {}),
    })
    return res
  },
  checkpoint: () => set((s) => ({ past: [...s.past, s.parts].slice(-HISTORY_LIMIT), future: [] })),
  undo: () => {
    const s = get()
    const prev = s.past.at(-1)
    if (!prev) return false
    set({ parts: prev, past: s.past.slice(0, -1), future: [s.parts, ...s.future], selectedId: keepSelection(prev, s.selectedId) })
    return true
  },
  redo: () => {
    const s = get()
    const next = s.future[0]
    if (!next) return false
    set({ parts: next, past: [...s.past, s.parts], future: s.future.slice(1), selectedId: keepSelection(next, s.selectedId) })
    return true
  },
}))
