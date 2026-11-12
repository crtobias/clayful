import { create } from 'zustand'
import { applyCommand } from './commands'
import type { CommandResult, Part, SceneCommand } from './model'

const HISTORY_LIMIT = 100

interface SceneStore {
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

export const useScene = create<SceneStore>((set, get) => ({
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
