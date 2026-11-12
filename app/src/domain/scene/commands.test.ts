import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands'
import type { SceneState } from './model'

let n = 0
const id = () => `p${++n}`
const empty: SceneState = { parts: [], selectedId: null }

describe('applyCommand', () => {
  it('agrega formas con nombres numerados y las elige', () => {
    const a = applyCommand(empty, { type: 'add_shape', shape: 'cubo' }, id)
    const b = applyCommand(a, { type: 'add_shape', shape: 'cubo' }, id)
    expect(b.parts.map((p) => p.name)).toEqual(['Cubo 1', 'Cubo 2'])
    expect(b.selectedId).toBe(b.parts[1].id)
    expect(b.parts[0].position[1]).toBe(0.5)
  })

  it('pasar a tela pone algodón y su color por defecto', () => {
    const a = applyCommand(empty, { type: 'add_shape', shape: 'esfera' }, id)
    const b = applyCommand(a, { type: 'set_material', id: a.parts[0].id, material: { preset: 'tela' } }, id)
    expect(b.parts[0].material).toMatchObject({ preset: 'tela', fabric: 'algodon', color: '#e5484d' })
  })

  it('cambiar el tipo de tela cambia el color si no se pidió otro', () => {
    const a = applyCommand(empty, { type: 'add_shape', shape: 'esfera', material: { preset: 'tela' } }, id)
    const b = applyCommand(a, { type: 'set_material', id: a.parts[0].id, material: { fabric: 'jean' } }, id)
    expect(b.parts[0].material).toMatchObject({ fabric: 'jean', color: '#3b5b8f' })
  })

  it('respeta el color pedido al cambiar de material', () => {
    const a = applyCommand(empty, { type: 'add_shape', shape: 'cubo' }, id)
    const b = applyCommand(a, { type: 'set_material', id: a.parts[0].id, material: { preset: 'metal', color: '#ffd700' } }, id)
    expect(b.parts[0].material).toMatchObject({ preset: 'metal', color: '#ffd700' })
  })

  it('duplicar copia al lado con nombre nuevo', () => {
    const a = applyCommand(empty, { type: 'add_shape', shape: 'cubo' }, id)
    const b = applyCommand(a, { type: 'duplicate', id: a.parts[0].id }, id)
    expect(b.parts[1].name).toBe('Cubo 2')
    expect(b.parts[1].position[0]).toBeCloseTo(a.parts[0].position[0] + 1.2)
  })

  it('borrar la parte elegida limpia la selección', () => {
    const a = applyCommand(empty, { type: 'add_shape', shape: 'cubo' }, id)
    const b = applyCommand(a, { type: 'delete', id: a.parts[0].id }, id)
    expect(b.parts).toHaveLength(0)
    expect(b.selectedId).toBeNull()
  })

  it('falla con una parte que no existe', () => {
    expect(() => applyCommand(empty, { type: 'delete', id: 'nada' }, id)).toThrow()
  })
})
