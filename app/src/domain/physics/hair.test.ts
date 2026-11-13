import { describe, expect, it } from 'vitest'
import { SphereGeometry, Vector3 } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { DEFAULT_HAIR, clumpHair, combHair, hairTriangles, emptyHair, growHair, hairGeometry, removeHair, settleHair, skinSdf, trimHair } from './hair'

const skin = (() => { const g = mergeVertices(new SphereGeometry(0.2, 48, 24)); g.computeVertexNormals(); return g })()
let seed = 7
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

describe('pelo', () => {
  it('crece en la zona del pincel, parejo y sin pasarse de la densidad', () => {
    const h = growHair(emptyHair(0.001, 0.5), skin, { center: new Vector3(0, 0.2, 0), radius: 0.05 }, { ...DEFAULT_HAIR, density: 4 }, rnd)
    expect(h.n).toBeGreaterThan(20)
    // ~π·5² cm² · 4 hebras/cm² ≈ 314 como máximo (más o menos por el corrimiento)
    expect(h.n).toBeLessThan(500)
    for (let i = 0; i < h.n; i++) expect(h.pts[i * h.S * 3 + 1]).toBeGreaterThan(0.13)
  })

  it('el pelo largo y blando cae; el corto y duro queda parado', () => {
    const side = { center: new Vector3(0.2, 0, 0), radius: 0.06 }
    const largo = settleHair(growHair(emptyHair(0.001, 0.05), skin, side, { ...DEFAULT_HAIR, length: 0.3, stiffness: 0.05 }, rnd), skinSdf(skin), new Vector3(0, -1, 0))
    const corto = settleHair(growHair(emptyHair(0.001, 0.95), skin, side, { ...DEFAULT_HAIR, length: 0.02, stiffness: 0.95 }, rnd), skinSdf(skin), new Vector3(0, -1, 0))
    const drop = (h: typeof largo) => { let d = 0; for (let i = 0; i < h.n; i++) { const o = i * h.S * 3; d += h.pts[o + 1] - h.pts[o + (h.S - 1) * 3 + 1] } return d / h.n }
    expect(drop(largo)).toBeGreaterThan(0.12)
    expect(drop(corto)).toBeLessThan(0.01)
  })

  it('peinar, recortar y borrar', () => {
    const dab = { center: new Vector3(0, 0.2, 0), radius: 0.08 }
    let h = growHair(emptyHair(0.001, 0.5), skin, dab, { ...DEFAULT_HAIR, length: 0.1 }, rnd)
    const tip = (x: typeof h) => x.pts[(x.S - 1) * 3]
    const combed = combHair(h, dab, new Vector3(0.05, 0, 0))
    expect(tip(combed)).toBeGreaterThan(tip(h))
    const trimmed = trimHair(h, dab, 0.5)
    const len = (x: typeof h) => Math.hypot(x.pts[(x.S - 1) * 3] - x.pts[0], x.pts[(x.S - 1) * 3 + 1] - x.pts[1], x.pts[(x.S - 1) * 3 + 2] - x.pts[2])
    expect(len(trimmed)).toBeLessThan(len(h))
    h = removeHair(h, { center: dab.center, radius: 0.1 })
    expect(h.n).toBe(0)
  })

  it('arma la malla: 3 vértices por punto', () => {
    const h = growHair(emptyHair(0.001, 0.5), skin, { center: new Vector3(0, 0.2, 0), radius: 0.04 }, DEFAULT_HAIR, rnd)
    const g = hairGeometry(h)
    expect(g.attributes.position.count).toBe(h.n * h.S * 3)
  })

  it('mechones: bajan los triángulos y se pueden deshacer', () => {
    const h = growHair(emptyHair(0.001, 0.5), skin, null, { ...DEFAULT_HAIR, density: 4 }, rnd)
    const full = hairTriangles(h)
    expect(hairGeometry(h).index!.count / 3).toBe(full)
    const low = clumpHair(h, null, 0.03)
    const tris = hairTriangles(low)
    expect(tris).toBeLessThan(full / 10)
    expect(hairGeometry(low).index!.count / 3).toBe(tris)
    // Solo una zona: el resto sigue en hebras.
    const half = clumpHair(h, { center: new Vector3(0, 0.2, 0), radius: 0.1 }, 0.03)
    expect(hairTriangles(half)).toBeGreaterThan(tris)
    expect(hairTriangles(half)).toBeLessThan(full)
    expect(hairTriangles(clumpHair(low, null, 0))).toBe(full)
    // Borrar y crecer mantienen la marca de cada hebra.
    const less = removeHair(low, { center: new Vector3(0, 0.2, 0), radius: 0.08 })
    expect(less.clump!.length).toBe(less.n)
    const more = growHair(less, skin, null, { ...DEFAULT_HAIR, density: 6 }, rnd)
    expect(more.clump!.length).toBe(more.n)
  })
})
