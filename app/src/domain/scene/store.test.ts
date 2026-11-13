import { beforeEach, describe, expect, it } from 'vitest'
import { MY_TAB, useScene } from './store'

beforeEach(() => useScene.setState({ parts: [], selectedId: null, past: [], future: [] }))

describe('historial', () => {
  it('deshace y rehace', () => {
    const s = useScene.getState()
    s.run({ type: 'add_shape', shape: 'cubo' })
    s.run({ type: 'add_shape', shape: 'esfera' })
    expect(useScene.getState().parts).toHaveLength(2)
    useScene.getState().undo()
    expect(useScene.getState().parts).toHaveLength(1)
    useScene.getState().redo()
    expect(useScene.getState().parts).toHaveLength(2)
  })

  it('elegir una parte no ensucia el historial', () => {
    const { created } = useScene.getState().run({ type: 'add_shape', shape: 'cubo' })
    useScene.getState().run({ type: 'select', id: null })
    useScene.getState().run({ type: 'select', id: created[0] })
    expect(useScene.getState().past).toHaveLength(1)
  })

  it('un arrastre del gizmo es un solo paso de deshacer', () => {
    const { created } = useScene.getState().run({ type: 'add_shape', shape: 'cubo' })
    useScene.getState().checkpoint()
    useScene.getState().run({ type: 'transform', id: created[0], position: [3, 0.5, 0] }, { record: false })
    useScene.getState().undo()
    expect(useScene.getState().parts[0].position[0]).not.toBe(3)
  })
})

describe('pestañas', () => {
  it('cada pestaña tiene su escena y una sesión que vuelve retoma la suya', () => {
    const s = useScene.getState()
    s.openTab('a', 'Proyecto', true)
    s.switchTab('a')
    useScene.getState().run({ type: 'add_shape', shape: 'cubo' })
    useScene.getState().switchTab(MY_TAB)
    expect(useScene.getState().parts.some((p) => p.geometryId === 'shape:cubo' && p.name.startsWith('Cubo'))).toBe(false)
    useScene.getState().setLive([])
    useScene.getState().openTab('b', 'Proyecto', true)
    expect(useScene.getState().tabs.map((t) => t.id)).toEqual([MY_TAB, 'b'])
    useScene.getState().switchTab('b')
    expect(useScene.getState().parts).toHaveLength(1)
  })
})
