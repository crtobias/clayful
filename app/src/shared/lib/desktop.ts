import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

/** ¿Corre dentro de la app de escritorio (Tauri) o en un navegador? */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Pide dónde guardar y escribe los bytes. Devuelve la ruta o null si se canceló. En navegador, descarga. */
export async function saveBytes(bytes: ArrayBuffer, defaultName: string): Promise<string | null> {
  if (!isDesktop) {
    const url = URL.createObjectURL(new Blob([bytes]))
    const a = Object.assign(document.createElement('a'), { href: url, download: defaultName })
    a.click()
    URL.revokeObjectURL(url)
    return defaultName
  }
  const path = await save({ defaultPath: defaultName, filters: [{ name: 'GLB', extensions: ['glb'] }] })
  if (!path) return null
  await invoke('write_file', new Uint8Array(bytes), { headers: { 'x-path': encodeURIComponent(path) } })
  return path
}

/** Convierte un .blend a GLB usando Blender (solo escritorio). */
export async function convertBlend(name: string, data: ArrayBuffer): Promise<ArrayBuffer> {
  const path = await invoke<string>('write_temp', new Uint8Array(data), { headers: { 'x-name': encodeURIComponent(name) } })
  return invoke<ArrayBuffer>('convert_blend', { path })
}
