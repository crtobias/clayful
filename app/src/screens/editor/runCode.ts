import * as THREE from 'three'
import { useScene, newId } from '@/domain/scene/store'
import { getGeometry, registerGeometry } from '@/domain/scene/geometry'
import { describeScene, materialFromArgs, resolvePart } from '@/domain/scene/tools'
import type { SceneCommand, Part, Vec3 } from '@/domain/scene/model'
import { DEFAULT_MATERIAL, mergeMaterial } from '@/shared/config/materials'
import { refresh } from '@/shared/lib/meshOps'

type Edit = { geometry: THREE.BufferGeometry; regenerate?: () => void } | null

interface Deps {
  /** Prepara una copia editable de la parte (un paso de deshacer). */
  startEdit: (partId: string, forPaint: boolean) => Edit
}

interface AddOptions {
  name?: string
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3 | number
  preset?: string
  fabric?: string
  color?: string
  amount?: number
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>

/** Lo que devuelve el código tiene que viajar como JSON: si no se puede (o es enorme), va como texto. */
function toJson(v: unknown): unknown {
  if (v === undefined) return null
  try {
    const text = JSON.stringify(v)
    if (text === undefined) return String(v)
    return text.length > 20_000 ? `${text.slice(0, 20_000)}… (cortado)` : JSON.parse(text)
  } catch {
    return String(v)
  }
}

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

/**
 * Corre JavaScript que manda Claude (como execute_blender_code en Blender).
 * El código recibe `THREE` y `clayful`, puede usar `await` y lo que devuelve vuelve a Claude.
 */
export async function runCode(code: string, deps: Deps) {
  const logs: string[] = []
  const store = () => useScene.getState()

  const clayful = {
    /** Partes actuales (solo lectura). */
    get parts(): Part[] { return store().parts },
    /** Aplica un comando de escena (con deshacer). Ej: { type: 'transform', id, position: [0, 1, 0] }. */
    run: (cmd: SceneCommand) => store().run(cmd),
    /** Busca una parte por id o nombre. */
    part: (ref: string) => resolvePart(store().parts, ref),
    /** La geometría visible de una parte (no la modifiques: usá edit). */
    geometry: (ref: string) => getGeometry(resolvePart(store().parts, ref).geometryId) ?? null,
    /** Agrega una malla nueva como parte. Devuelve su id. */
    add(geometry: THREE.BufferGeometry, opts: AddOptions = {}) {
      if (!(geometry instanceof THREE.BufferGeometry)) throw new Error('add() espera un THREE.BufferGeometry.')
      if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals()
      const id = newId()
      const geometryId = `code:${id}`
      registerGeometry(geometryId, geometry)
      const s = opts.scale
      const part: Part = {
        id,
        name: opts.name ?? 'Código',
        geometryId,
        position: opts.position ?? [0, 0, 0],
        rotation: opts.rotation ?? [0, 0, 0],
        scale: typeof s === 'number' ? [s, s, s] : s ?? [1, 1, 1],
        material: mergeMaterial(DEFAULT_MATERIAL, materialFromArgs(opts as Record<string, unknown>)),
      }
      store().run({ type: 'add_parts', parts: [part] })
      return id
    },
    /** Edita la malla de una parte: fn recibe una copia editable (con atributo color). */
    async edit(ref: string, fn: (g: THREE.BufferGeometry) => unknown, opts: { paint?: boolean } = {}) {
      const part = resolvePart(store().parts, ref)
      const e = deps.startEdit(part.id, Boolean(opts.paint))
      if (!e) throw new Error('Esa parte no se puede editar.')
      const out = await fn(e.geometry)
      refresh(e.geometry, true, true, true)
      e.regenerate?.()
      return out
    },
    /** Escribe en la respuesta para Claude. */
    log: (...args: unknown[]) => { logs.push(args.map(show).join(' ')) },
  }

  const fn = new AsyncFunction('THREE', 'clayful', 'console', `"use strict";\n${code}`)
  const console = { log: clayful.log, info: clayful.log, warn: clayful.log, error: clayful.log }
  const result = await fn(THREE, clayful, console)
  const s = store()
  return { result: toJson(result), logs, scene: describeScene(s.parts, s.selectedId) }
}
