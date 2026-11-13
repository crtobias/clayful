import { describe, expect, it } from 'vitest'
import { BoxGeometry, SphereGeometry, BufferGeometry, BufferAttribute } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildSdf, sampleSdf } from './sdf'
import { step, meshVolume } from './softbody'
import { clothBody, clothWorld, jellyBody, jellyWorld, sheetGrid, sheetOver } from './cloth'

function welded(g: BufferGeometry, dy = 0) {
  const p = new BufferGeometry()
  p.setAttribute('position', g.attributes.position.clone())
  p.setIndex(g.index!.clone())
  p.translate(0, dy, 0)
  return mergeVertices(p, 1e-5)
}

describe('sdf', () => {
  it('cubo: adentro negativo, afuera positivo', () => {
    const g = welded(new BoxGeometry(1, 1, 1), 0.5)
    const s = buildSdf(g.attributes.position.array, g.index!.array, 0.03, 0.1)
    expect(sampleSdf(s, 0, 0.5, 0)).toBeLessThan(-0.4)
    expect(sampleSdf(s, 0, 1.1, 0)).toBeGreaterThan(0.05)
    expect(Math.abs(sampleSdf(s, 0.2, 1.0, 0.1))).toBeLessThan(0.03)
  })
})

describe('tela', () => {
  it('tapa un cubo: queda arriba del cubo y llega al piso', () => {
    const g = welded(new BoxGeometry(1, 1, 1), 0.5)
    const s = buildSdf(g.attributes.position.array, g.index!.array, 0.02, 0.06)
    const { corner, u, v } = sheetOver([-0.5, 0, -0.5], [0.5, 1, 0.5])
    const sheet = sheetGrid(50, corner, u, v)
    const body = clothBody(sheet, 0.3)
    const world = clothWorld([s], 0.02)
    for (let i = 0; i < 320; i++) step(body, world, 1 / 60, 10)
    let maxY = -1, minY = 9, cx = 0
    for (let i = 0; i < body.pos.length; i += 3) { maxY = Math.max(maxY, body.pos[i + 1]); minY = Math.min(minY, body.pos[i + 1]); cx += body.pos[i] }
    cx /= body.pos.length / 3
    expect(maxY).toBeGreaterThan(0.98)
    expect(maxY).toBeLessThan(1.1)
    expect(minY).toBeLessThan(0.05)
    expect(Math.abs(cx)).toBeLessThan(0.15)
  })

  it('gelatina conserva el volumen', () => {
    const g = welded(new SphereGeometry(0.5, 24, 12), 0.6)
    const pos = new Float32Array(g.attributes.position.array)
    const body = jellyBody(pos, g.index!.array, 0.4)
    const v0 = meshVolume(body.pos, body.tris)
    for (let i = 0; i < 120; i++) step(body, jellyWorld([], 0.005), 1 / 60, 8)
    const v1 = meshVolume(body.pos, body.tris)
    expect(Math.abs(v1 / v0 - 1)).toBeLessThan(0.1)
    let minY = 9
    for (let i = 1; i < body.pos.length; i += 3) minY = Math.min(minY, body.pos[i])
    expect(minY).toBeGreaterThan(-0.01)
  })
})
void BufferAttribute
