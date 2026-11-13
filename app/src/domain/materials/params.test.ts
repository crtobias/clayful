import { describe, expect, it } from 'vitest'
import { materialParams } from './params'

describe('materialParams', () => {
  it('vidrio: la transparencia es el ajuste', () => {
    expect(materialParams({ preset: 'vidrio', color: '#ffffff', amount: 0.6 }).transmission).toBe(0.6)
  })
  it('metal: totalmente metálico', () => {
    expect(materialParams({ preset: 'metal', color: '#cccccc' }).metalness).toBe(1)
  })
  it('tela: cada tipo tiene su trama', () => {
    expect(materialParams({ preset: 'tela', color: '#3b5b8f', fabric: 'jean' }).pattern).toBe('twill')
    expect(materialParams({ preset: 'tela', color: '#c9a27a', fabric: 'punto' }).pattern).toBe('knit')
    expect(materialParams({ preset: 'tela', color: '#9a7a4e', fabric: 'arpillera' }).pattern).toBe('burlap')
    expect(materialParams({ preset: 'tela', color: '#e5484d' }).pattern).toBe('weave')
  })
  it('tela: tiene brillo de terciopelo (sheen)', () => {
    expect(materialParams({ preset: 'tela', color: '#e5484d', fabric: 'algodon' }).sheen).toBeGreaterThan(0)
  })
})
