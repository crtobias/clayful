import { Color, DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, SRGBColorSpace, TextureLoader, Vector2, type Material } from 'three'
import type { MaterialSpec } from '@/shared/config/materials'
import { materialParams } from './params'
import { colorTexture, normalTexture } from './textures'

const cache = new Map<string, Material>()

/** Material de three.js para un spec. Se cachea: mismo spec, mismo material. */
export function buildMaterial(spec: MaterialSpec, original?: Material, vertexColors = false): Material {
  if (spec.preset === 'original' && original) return original
  const key = JSON.stringify(spec) + (vertexColors ? ':vc' : '')
  const hit = cache.get(key)
  if (hit) return hit

  const p = materialParams(spec)
  const mat = new MeshPhysicalMaterial({
    color: new Color(p.color),
    roughness: p.roughness,
    metalness: p.metalness,
    transmission: p.transmission ?? 0,
    thickness: p.thickness ?? 0,
    ior: p.ior ?? 1.5,
    sheen: p.sheen ?? 0,
    sheenRoughness: p.sheenRoughness ?? 1,
    sheenColor: new Color(p.sheenColor ?? '#000000'),
    clearcoat: p.clearcoat ?? 0,
    clearcoatRoughness: p.clearcoatRoughness ?? 0,
    vertexColors,
  })
  if (p.pattern === 'wood') {
    mat.map = colorTexture('wood', p.repeat ?? 1)
  } else if (p.pattern) {
    mat.normalMap = normalTexture(p.pattern, p.repeat ?? 8)
    mat.normalScale = new Vector2(p.relief ?? 0.5, p.relief ?? 0.5)
  }
  cache.set(key, mat)
  return mat
}

const imageCache = new Map<string, Material>()

/** Material sin luz para imágenes de referencia. */
export function imageMaterial(url: string): Material {
  const hit = imageCache.get(url)
  if (hit) return hit
  const map = new TextureLoader().load(url)
  map.colorSpace = SRGBColorSpace
  const mat = new MeshBasicMaterial({ map, side: DoubleSide, toneMapped: false })
  imageCache.set(url, mat)
  return mat
}
