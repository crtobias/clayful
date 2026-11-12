import {
  BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Material, PlaneGeometry, SphereGeometry, TorusGeometry,
} from 'three'
import type { Shape } from './model'

/** Las geometrías y materiales importados viven acá, fuera del estado (que tiene que ser liviano para deshacer). */
const geometries = new Map<string, BufferGeometry>()
const originalMaterials = new Map<string, Material>()

/** Altura desde el piso hasta el centro, para apoyar cada forma en el suelo. */
export const SHAPE_LIFT: Record<Shape, number> = {
  cubo: 0.5, esfera: 0.6, cilindro: 0.5, cono: 0.5, dona: 0.18, plano: 0.001,
}

function makeShape(shape: Shape): BufferGeometry {
  switch (shape) {
    case 'cubo': return new BoxGeometry(1, 1, 1)
    case 'esfera': return new SphereGeometry(0.6, 64, 32)
    case 'cilindro': return new CylinderGeometry(0.5, 0.5, 1, 64)
    case 'cono': return new ConeGeometry(0.5, 1, 64)
    case 'dona': return new TorusGeometry(0.42, 0.18, 32, 96).rotateX(-Math.PI / 2)
    case 'plano': return new PlaneGeometry(2, 2).rotateX(-Math.PI / 2)
  }
}

export function shapeGeometryId(shape: Shape): string {
  const id = `shape:${shape}`
  if (!geometries.has(id)) geometries.set(id, makeShape(shape))
  return id
}

export function registerGeometry(id: string, geometry: BufferGeometry, material?: Material): void {
  geometries.set(id, geometry)
  if (material) originalMaterials.set(id, material)
}

export function getGeometry(id: string): BufferGeometry | undefined {
  return geometries.get(id)
}

export function getOriginalMaterial(id: string): Material | undefined {
  return originalMaterials.get(id)
}
