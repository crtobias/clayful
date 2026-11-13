import { localGet, localSet } from '@/shared/lib/localStore'

/** Un modelo de la biblioteca: los que vienen con Clayful o los que guarda el usuario. */
export interface LibraryItem {
  id: string
  name: string
  source: 'clayful' | 'mio'
  author?: string
  description?: string
  tags?: string[]
  /** URL de la miniatura (archivo de la app o data URL). */
  thumb?: string
  /** Solo los de Clayful: archivo GLB dentro de /library. */
  file?: string
  createdAt?: number
}

const MINE = 'library:mine'
const glbKey = (id: string) => `library:glb:${id}`

/** Los modelos que vienen con la app (public/library/index.json). */
export async function clayfulItems(): Promise<LibraryItem[]> {
  try {
    const res = await fetch('/library/index.json')
    if (!res.ok) return []
    const list = (await res.json()) as Omit<LibraryItem, 'source'>[]
    return list.map((it) => ({ ...it, source: 'clayful', thumb: it.thumb ? `/library/${it.thumb}` : undefined }))
  } catch {
    return []
  }
}

/** Los modelos que guardó el usuario (en esta compu). */
export async function myItems(): Promise<LibraryItem[]> {
  return (await localGet<LibraryItem[]>(MINE)) ?? []
}

export async function allItems(): Promise<LibraryItem[]> {
  return [...(await clayfulItems()), ...(await myItems())]
}

/** El GLB de un modelo. */
export async function loadItem(item: LibraryItem): Promise<ArrayBuffer> {
  if (item.source === 'clayful') {
    const res = await fetch(`/library/${item.file}`)
    if (!res.ok) throw new Error(`No pude abrir ${item.name}.`)
    return res.arrayBuffer()
  }
  const glb = await localGet<ArrayBuffer>(glbKey(item.id))
  if (!glb) throw new Error(`No encontré ${item.name} en tu biblioteca.`)
  return glb
}

/** Guarda la escena en "Mis modelos". */
export async function saveMine(name: string, glb: ArrayBuffer, thumb?: string): Promise<LibraryItem> {
  const item: LibraryItem = { id: `m${Date.now().toString(36)}`, name: name.trim() || 'Mi modelo', source: 'mio', author: 'yo', thumb, createdAt: Date.now() }
  await localSet(glbKey(item.id), glb)
  await localSet(MINE, [item, ...(await myItems())])
  return item
}

export async function deleteMine(id: string): Promise<void> {
  await localSet(MINE, (await myItems()).filter((it) => it.id !== id))
  await localSet(glbKey(id), null)
}
