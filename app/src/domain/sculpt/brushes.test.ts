import { describe, expect, it } from 'vitest'
import { SphereGeometry, Vector3 } from 'three'
import { toEditable, refresh } from '@/shared/lib/meshOps'
import { invertMask, sculptDab, strokeContext } from './brushes'

const top = { center: new Vector3(0, 1, 0), normal: new Vector3(0, 1, 0), radius: 0.4, tip: 'suave' as const, angle: 0, strength: 1 }
const maxY = (g: ReturnType<typeof toEditable>) => {
  const pos = g.attributes.position
  let m = -Infinity
  for (let i = 0; i < pos.count; i++) m = Math.max(m, pos.getY(i))
  return m
}

describe('esculpir', () => {
  it('sumar levanta la superficie', () => {
    const g = toEditable(new SphereGeometry(1, 32, 16), { minVertices: 2000 })
    sculptDab(g, 'sumar', top)
    expect(maxY(g)).toBeGreaterThan(1.01)
  })

  it('la máscara protege', () => {
    const g = toEditable(new SphereGeometry(1, 32, 16), { minVertices: 2000 })
    invertMask(g) // todo protegido
    sculptDab(g, 'sumar', top)
    expect(maxY(g)).toBeCloseTo(1, 5)
  })

  it('capa no pasa de su altura aunque se repita', () => {
    const g = toEditable(new SphereGeometry(1, 32, 16), { minVertices: 2000 })
    const ctx = strokeContext(g)
    for (let i = 0; i < 20; i++) { sculptDab(g, 'capa', top, ctx); refresh(g, true, false) }
    expect(maxY(g)).toBeLessThanOrEqual(1 + top.radius * 0.35 + 1e-6)
    expect(maxY(g)).toBeGreaterThan(1.05)
  })
})
