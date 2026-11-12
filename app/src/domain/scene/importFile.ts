import { Box3, Group, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Vector3, type Material } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { DEFAULT_MATERIAL, type MaterialSpec } from '@/shared/config/materials'
import { registerGeometry } from './geometry'
import type { Part } from './model'

export const IMPORT_EXTENSIONS = ['glb', 'gltf', 'obj', 'fbx', 'stl', 'png', 'jpg', 'jpeg', 'webp', 'blend'] as const

interface ImportOptions {
  newId: () => string
  /** Convierte .blend → GLB (lo hace Tauri con Blender). */
  convertBlend?: (name: string, data: ArrayBuffer) => Promise<ArrayBuffer>
}

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
const baseName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Modelo'

/** Lee un archivo y devuelve las partes nuevas (todavía sin agregar a la escena). */
export async function importFile(name: string, data: ArrayBuffer, opts: ImportOptions): Promise<Part[]> {
  const ext = extOf(name)
  switch (ext) {
    case 'glb':
    case 'gltf': {
      const gltf = await new GLTFLoader().parseAsync(data, '')
      return objectToParts(gltf.scene, baseName(name), opts.newId)
    }
    case 'obj':
      return objectToParts(new OBJLoader().parse(new TextDecoder().decode(data)), baseName(name), opts.newId)
    case 'fbx':
      return objectToParts(new FBXLoader().parse(data, ''), baseName(name), opts.newId)
    case 'stl': {
      const geometry = new STLLoader().parse(data)
      const group = new Group().add(new Mesh(geometry, new MeshStandardMaterial({ color: DEFAULT_MATERIAL.color })))
      return objectToParts(group, baseName(name), opts.newId, false)
    }
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
      return [await imagePart(name, data, opts.newId)]
    case 'blend': {
      if (!opts.convertBlend) throw new Error('Para abrir .blend hace falta la app de escritorio con Blender instalado.')
      const glb = await opts.convertBlend(name, data)
      const gltf = await new GLTFLoader().parseAsync(glb, '')
      return objectToParts(gltf.scene, baseName(name), opts.newId)
    }
    default:
      throw new Error(`No sé abrir .${ext}. Probá con GLB, OBJ, FBX, STL, PNG o JPG.`)
  }
}

/**
 * Convierte cada malla en una parte: hornea su transformación de mundo, ajusta la escala
 * si el modelo es enorme o diminuto, lo apoya en el piso y centra cada geometría en su parte.
 */
export function objectToParts(root: Object3D, base: string, newId: () => string, keepOriginal = true): Part[] {
  root.updateMatrixWorld(true)
  const meshes: Mesh[] = []
  root.traverse((o) => { if ((o as Mesh).isMesh) meshes.push(o as Mesh) })
  if (meshes.length === 0) throw new Error('El archivo no tiene mallas.')

  const baked = meshes.map((mesh) => {
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    if (!geometry.attributes.normal) geometry.computeVertexNormals()
    return { mesh, geometry }
  })

  const box = new Box3()
  for (const { geometry } of baked) { geometry.computeBoundingBox(); box.union(geometry.boundingBox!) }
  const size = box.getSize(new Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const k = maxDim > 20 || maxDim < 0.05 ? 2 / maxDim : 1
  const center = box.getCenter(new Vector3())
  const offset = new Vector3(-center.x * k, -box.min.y * k, -center.z * k)

  return baked.map(({ mesh, geometry }, i) => {
    geometry.scale(k, k, k).translate(offset.x, offset.y, offset.z)
    geometry.computeBoundingBox()
    const c = geometry.boundingBox!.getCenter(new Vector3())
    geometry.translate(-c.x, -c.y, -c.z)

    const id = newId()
    const geometryId = `import:${id}`
    const original = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material | undefined
    registerGeometry(geometryId, geometry, keepOriginal ? original : undefined)

    const saved = (mesh.userData?.clayful as { material?: MaterialSpec } | undefined)?.material
    const material: MaterialSpec = saved ?? (keepOriginal && original ? { preset: 'original', color: '#ffffff' } : { ...DEFAULT_MATERIAL })
    const name = mesh.name && !/^(mesh|object|node)?[_\s]?\d*$/i.test(mesh.name) ? mesh.name.replace(/[_-]+/g, ' ') : meshes.length === 1 ? base : `${base} ${i + 1}`
    return { id, name, geometryId, position: [c.x, c.y, c.z], rotation: [0, 0, 0], scale: [1, 1, 1], material }
  })
}

async function imagePart(name: string, data: ArrayBuffer, newId: () => string): Promise<Part> {
  const type = `image/${extOf(name) === 'jpg' ? 'jpeg' : extOf(name)}`
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('No pude leer la imagen.'))
    reader.readAsDataURL(new Blob([data], { type }))
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('La imagen está dañada.'))
    el.src = url
  })
  const aspect = img.width / img.height || 1
  const height = 2
  const id = newId()
  const geometryId = `image:${id}`
  registerGeometry(geometryId, new PlaneGeometry(height * aspect, height))
  return {
    id, name: baseName(name), geometryId, image: url,
    position: [0, height / 2, -1.5], rotation: [0, 0, 0], scale: [1, 1, 1], material: { ...DEFAULT_MATERIAL },
  }
}
