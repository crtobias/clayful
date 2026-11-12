import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands'
import { describeScene, toolToCommand } from './tools'
import type { SceneState } from './model'

const id = (() => { let n = 0; return () => `t${++n}` })()
const scene: SceneState = applyCommand({ parts: [], selectedId: null }, { type: 'add_shape', shape: 'cubo', name: 'Remera' }, id)

describe('toolToCommand', () => {
  it('encuentra la parte por nombre sin importar mayúsculas', () => {
    const cmd = toolToCommand('set_material', { part: 'remera', fabric: 'jean' }, scene.parts)
    expect(cmd).toEqual({ type: 'set_material', id: scene.parts[0].id, material: { preset: 'tela', fabric: 'jean' } })
  })

  it('la rotación llega en grados y se guarda en radianes (y vuelve en grados)', () => {
    const cmd = toolToCommand('transform', { part: 'Remera', rotation: [0, 90, 0] }, scene.parts)
    const after = applyCommand(scene, cmd, id)
    expect(after.parts[0].rotation[1]).toBeCloseTo(Math.PI / 2)
    expect(describeScene(after.parts, null).parts[0].rotation).toEqual([0, 90, 0])
  })

  it('la escala acepta un solo número', () => {
    const cmd = toolToCommand('transform', { part: 'Remera', scale: 2 }, scene.parts)
    expect(cmd).toMatchObject({ scale: [2, 2, 2] })
  })

  it('rechaza materiales, colores y partes inválidas', () => {
    expect(() => toolToCommand('set_material', { part: 'Remera', preset: 'oro' }, scene.parts)).toThrow('Material inválido')
    expect(() => toolToCommand('set_material', { part: 'Remera', color: 'rojo' }, scene.parts)).toThrow('#rrggbb')
    expect(() => toolToCommand('delete', { part: 'Pelota' }, scene.parts)).toThrow('Remera')
  })
})
