import { describe, expect, it } from 'vitest'
import { BoxGeometry, Vector3 } from 'three'
import { toEditable } from '@/shared/lib/meshOps'
import { blendColor, gradientFill, paintDab } from './paint'

describe('pintar', () => {
  it('las mezclas hacen lo que dicen', () => {
    expect(blendColor('multiplicar', [0.5, 1, 1], [0.5, 0.5, 0])).toEqual([0.25, 0.5, 0])
    expect(blendColor('aclarar', [0.2, 0.8, 0], [0.5, 0.5, 0.5])).toEqual([0.5, 0.8, 0.5])
    expect(blendColor('oscurecer', [0.2, 0.8, 0], [0.5, 0.5, 0.5])).toEqual([0.2, 0.5, 0])
  })

  it('el pincel pinta solo cerca del centro', () => {
    const g = toEditable(new BoxGeometry(1, 1, 1), { minVertices: 2000 })
    paintDab(g, { center: new Vector3(0, 0.5, 0), normal: new Vector3(0, 1, 0), radius: 0.2, tip: 'dura', angle: 0, color: '#ff0000', opacity: 1, blend: 'mezclar' })
    const col = g.attributes.color
    const pos = g.attributes.position
    let painted = 0, far = 0
    for (let i = 0; i < col.count; i++) {
      const red = col.getX(i) > 0.9 && col.getY(i) < 0.1
      if (red) painted++
      if (red && pos.getY(i) < 0) far++
    }
    expect(painted).toBeGreaterThan(0)
    expect(far).toBe(0)
  })

  it('el degradado va de un color al otro', () => {
    const g = toEditable(new BoxGeometry(1, 1, 1), { minVertices: 500 })
    const base = Float32Array.from(g.attributes.color.array as ArrayLike<number>)
    gradientFill(g, base, new Vector3(0, -0.5, 0), new Vector3(0, 0.5, 0), '#000000', '#ffffff', 'mezclar', 1)
    const pos = g.attributes.position, col = g.attributes.color
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) === -0.5) expect(col.getX(i)).toBeCloseTo(0)
      if (pos.getY(i) === 0.5) expect(col.getX(i)).toBeCloseTo(1)
    }
  })
})
