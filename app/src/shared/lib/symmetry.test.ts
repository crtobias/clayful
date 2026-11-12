import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { NO_SYMMETRY, symmetryCopies } from './symmetry'

const c = new Vector3(0.3, 0.5, 0.2)
const n = new Vector3(0, 0, 1)

describe('symmetryCopies', () => {
  it('sin simetría hay una sola copia', () => {
    expect(symmetryCopies(c, n, NO_SYMMETRY, 0.01)).toHaveLength(1)
  })
  it('espejo X da vuelta la x y la punta', () => {
    const [, m] = symmetryCopies(c, n, { ...NO_SYMMETRY, x: true }, 0.01)
    expect(m.center.toArray()).toEqual([-0.3, 0.5, 0.2])
    expect(m.flipped).toBe(true)
  })
  it('X + Y + Z son 8 copias', () => {
    expect(symmetryCopies(c, n, { ...NO_SYMMETRY, x: true, y: true, z: true }, 0.01)).toHaveLength(8)
  })
  it('radial 4 en Y reparte alrededor del eje', () => {
    const copies = symmetryCopies(new Vector3(1, 0, 0), n, { ...NO_SYMMETRY, radial: 4, axis: 'y' }, 0.01)
    expect(copies).toHaveLength(4)
    expect(copies[1].center.x).toBeCloseTo(0)
    expect(Math.abs(copies[1].center.z)).toBeCloseTo(1)
  })
  it('un punto sobre el eje del espejo no se duplica', () => {
    expect(symmetryCopies(new Vector3(0, 1, 0), n, { ...NO_SYMMETRY, x: true }, 0.05)).toHaveLength(1)
  })
})
