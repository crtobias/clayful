import { describe, expect, it } from 'vitest'
import { SphereGeometry } from 'three'
import { clusterDecimate, facetedCopy, lowPolyCell, toEditable } from './meshOps'

describe('low poly', () => {
  const dense = toEditable(new SphereGeometry(1, 32, 16), { minVertices: 8000 })

  it('baja muchísimo la cantidad de vértices y más en "muy bajo"', () => {
    const muyBajo = clusterDecimate(dense, lowPolyCell(dense, 1))
    const medio = clusterDecimate(dense, lowPolyCell(dense, 3))
    expect(medio.attributes.position.count).toBeLessThan(dense.attributes.position.count / 10)
    expect(muyBajo.attributes.position.count).toBeLessThan(medio.attributes.position.count)
    expect(muyBajo.index!.count).toBeGreaterThan(0)
  })

  it('mantiene el tamaño de la pieza', () => {
    const lp = clusterDecimate(dense, lowPolyCell(dense, 2))
    lp.computeBoundingBox()
    expect(lp.boundingBox!.max.y).toBeGreaterThan(0.7)
    expect(lp.boundingBox!.min.y).toBeLessThan(-0.7)
  })

  it('para exportar, cada triángulo tiene un solo color', () => {
    const lp = facetedCopy(clusterDecimate(dense, lowPolyCell(dense, 2)))
    expect(lp.index).toBeNull()
    const col = lp.attributes.color
    expect(col.getX(0)).toBeCloseTo(col.getX(1))
    expect(col.getX(1)).toBeCloseTo(col.getX(2))
  })
})
