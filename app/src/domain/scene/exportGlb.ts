import { DoubleSide, Mesh, MeshBasicMaterial, SRGBColorSpace, Scene, TextureLoader, type Material } from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { facetedCopy } from '@/shared/lib/meshOps'
import { getGeometry } from './geometry'
import type { Part } from './model'

/** Arma un GLB con todas las partes. El spec de material viaja en extras para volver a abrirlo igual. */
export async function exportGlb(parts: Part[], materialFor: (part: Part) => Material): Promise<ArrayBuffer> {
  const scene = new Scene()
  scene.name = 'Clayful'
  for (const part of parts) {
    const geometry = getGeometry(part.geometryId)
    if (!geometry) continue
    let material: Material
    if (part.image) {
      const map = await new TextureLoader().loadAsync(part.image)
      map.colorSpace = SRGBColorSpace
      material = new MeshBasicMaterial({ map, side: DoubleSide })
    } else {
      material = materialFor(part)
    }
    // Low poly: caras planas de verdad en el archivo (cada triángulo con su normal y un color).
    const mesh = new Mesh(part.lowPoly ? facetedCopy(geometry) : geometry, material)
    mesh.name = part.name
    mesh.position.set(...part.position)
    mesh.rotation.set(...part.rotation)
    mesh.scale.set(...part.scale)
    if (!part.image) mesh.userData = { clayful: { material: part.material, lowPoly: part.lowPoly?.level } }
    scene.add(mesh)
  }
  const result = await new GLTFExporter().parseAsync(scene, { binary: true })
  if (!(result instanceof ArrayBuffer)) throw new Error('No se pudo generar el GLB.')
  return result
}
