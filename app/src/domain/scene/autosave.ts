import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, Scene } from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { localGet, localSet } from '@/shared/lib/localStore'
import type { MaterialSpec } from '@/shared/config/materials'
import { getGeometry, registerGeometry } from './geometry'
import { lowPolyVersion } from './editable'
import { MY_TAB, newId, useScene, type SceneTab } from './store'
import type { LowPolyLevel, Part, Vec3 } from './model'

const KEY = 'autosave:v1'
const DELAY_MS = 1200

interface Saved {
  activeTab: string
  tabs: { id: string; name: string }[]
  /** Un GLB por pestaña. */
  scenes: Record<string, ArrayBuffer>
}

interface PartExtras {
  clayful: { id: string; name?: string; material: MaterialSpec; lowPoly?: LowPolyLevel; image?: string; hair?: Part['hair']; persist?: unknown }
}

/**
 * Datos que no son malla (el pelo: sus hebras) viajan en `geometry.userData.persist = { kind, data }`
 * y se vuelven a armar al abrir con `rebuild`. Los arreglos tipados se pasan a listas para el JSON.
 */
export type Rebuild = (persist: { kind: string; data: Record<string, unknown> }) => BufferGeometry | null
const pack = (v: unknown): unknown => (ArrayBuffer.isView(v) ? { __f32: Array.from(v as Float32Array) } : v)
const unpack = (v: unknown): unknown => (v && typeof v === 'object' && '__f32' in v ? Float32Array.from((v as { __f32: number[] }).__f32) : v)
const mapValues = (o: Record<string, unknown>, f: (v: unknown) => unknown) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]))

/** GLB con las partes tal cual (geometría lisa si es low poly: el facetado se rehace al abrir). */
async function sceneToGlb(parts: Part[]): Promise<ArrayBuffer> {
  const scene = new Scene()
  const mat = new MeshStandardMaterial()
  for (const part of parts) {
    let geometry = getGeometry(part.lowPoly?.source ?? part.geometryId)
    if (!geometry) continue
    const persist = geometry.userData.persist as { kind: string; data: Record<string, unknown> } | undefined
    // Lo que se rearma al abrir (pelo) no necesita su malla: va un triángulo de muestra y los datos.
    if (persist) {
      geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
    }
    const mesh = new Mesh(geometry, mat)
    mesh.name = part.name
    mesh.position.set(...part.position)
    mesh.rotation.set(...part.rotation)
    mesh.scale.set(...part.scale)
    const extras: PartExtras = {
      clayful: {
        id: part.id, name: part.name, material: part.material, lowPoly: part.lowPoly?.level, image: part.image, hair: part.hair,
        persist: persist ? { kind: persist.kind, data: mapValues(persist.data, pack) } : undefined,
      },
    }
    mesh.userData = extras
    scene.add(mesh)
  }
  const out = await new GLTFExporter().parseAsync(scene, { binary: true })
  return out as ArrayBuffer
}

async function glbToParts(data: ArrayBuffer, rebuild?: Rebuild): Promise<Part[]> {
  const gltf = await new GLTFLoader().parseAsync(data, '')
  const parts: Part[] = []
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh
    const extras = (mesh.userData as Partial<PartExtras>).clayful
    if (!mesh.isMesh || !extras) return
    let g = mesh.geometry as BufferGeometry
    const persist = extras.persist as { kind: string; data: Record<string, unknown> } | undefined
    if (persist && rebuild) g = rebuild({ kind: persist.kind, data: mapValues(persist.data, unpack) }) ?? g
    // El atributo propio de la máscara vuelve como "_mask".
    if (g.hasAttribute('_mask')) { g.setAttribute('mask', g.getAttribute('_mask') as BufferAttribute); g.deleteAttribute('_mask') }
    if (g.hasAttribute('color')) g.userData = { editable: true, topo: `restored:${newId()}` }
    const id = extras.id || newId()
    const geometryId = `saved:${id}:${newId()}`
    registerGeometry(geometryId, g)
    let part: Part = {
      id, name: extras.name ?? (mesh.name || 'Parte'), geometryId,
      position: mesh.position.toArray() as Vec3,
      rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
      scale: mesh.scale.toArray() as Vec3,
      material: extras.material,
      ...(extras.image ? { image: extras.image } : {}),
      ...(extras.hair ? { hair: extras.hair } : {}),
    }
    if (extras.lowPoly) {
      const lp = lowPolyVersion(part, extras.lowPoly)
      if (lp) part = { ...part, geometryId: lp.geometryId, lowPoly: lp.lowPoly ?? undefined }
    }
    parts.push(part)
  })
  return parts
}

let restored: Promise<void> | null = null

/** Recupera lo último guardado (todas las pestañas). Se llama una vez al abrir. */
export function restoreAutosave(rebuild?: Rebuild): Promise<void> {
  restored ??= (async () => {
    try {
      const saved = await localGet<Saved>(KEY)
      if (!saved) return
      const tabs: SceneTab[] = [{ id: MY_TAB, name: 'Mi escena', live: false }]
      for (const t of saved.tabs) if (t.id !== MY_TAB) tabs.push({ id: t.id, name: t.name, live: false })
      const scenes: Record<string, Part[]> = {}
      for (const t of tabs) scenes[t.id] = saved.scenes[t.id] ? await glbToParts(saved.scenes[t.id], rebuild) : []
      const active = tabs.some((t) => t.id === saved.activeTab) ? saved.activeTab : MY_TAB
      const others = Object.fromEntries(
        tabs.filter((t) => t.id !== active).map((t) => [t.id, { parts: scenes[t.id], selectedId: null, past: [], future: [] }]),
      )
      useScene.setState({ tabs, activeTab: active, saved: others, parts: scenes[active], selectedId: null, past: [], future: [] })
    } catch (err) {
      console.error('[clayful] no se pudo recuperar lo guardado', err)
    }
  })()
  return restored
}

/** Espera a que termine la recuperación (antes de que Claude toque la escena). */
export const whenRestored = () => restored ?? Promise.resolve()

async function saveNow() {
  const s = useScene.getState()
  const scenes: Record<string, ArrayBuffer> = {}
  for (const tab of s.tabs) {
    const parts = tab.id === s.activeTab ? s.parts : s.saved[tab.id]?.parts ?? []
    if (parts.length) scenes[tab.id] = await sceneToGlb(parts)
  }
  const data: Saved = { activeTab: s.activeTab, tabs: s.tabs.map(({ id, name }) => ({ id, name })), scenes }
  await localSet(KEY, data)
}

/**
 * Guarda solo cada vez que cambia algo (un ratito después, para no guardar en cada pincelada).
 * Devuelve la función para dejar de escuchar.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let saving = false
  let again = false
  const run = async () => {
    if (saving) { again = true; return }
    saving = true
    try { await saveNow() } catch (err) { console.error('[clayful] no se pudo guardar', err) }
    saving = false
    if (again) { again = false; void run() }
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void run(), DELAY_MS)
  }
  const unsub = useScene.subscribe((s, prev) => {
    if (s.parts === prev.parts && s.tabs === prev.tabs && s.activeTab === prev.activeTab) return
    schedule()
  })
  // Esculpir y pintar cambian la malla sin cambiar las partes: guardar al soltar el mouse.
  window.addEventListener('pointerup', schedule)
  return () => { clearTimeout(timer); unsub(); window.removeEventListener('pointerup', schedule) }
}
