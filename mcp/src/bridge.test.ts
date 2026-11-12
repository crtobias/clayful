import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { AppBridge } from './bridge.js'

const PORT = 47391
let bridge: AppBridge | null = null

afterEach(async () => { await bridge?.close(); bridge = null })

function connectApp(origin: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin })
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

describe('AppBridge', () => {
  it('manda la herramienta a la app y devuelve su respuesta', async () => {
    bridge = new AppBridge(PORT)
    const app = await connectApp('tauri://localhost')
    app.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      app.send(JSON.stringify({ id: msg.id, ok: true, result: { echo: msg.name, args: msg.args } }))
    })
    await expect(bridge.call('add_shape', { shape: 'cubo' })).resolves.toEqual({ echo: 'add_shape', args: { shape: 'cubo' } })
    app.close()
  })

  it('propaga los errores de la app', async () => {
    bridge = new AppBridge(PORT)
    const app = await connectApp('http://tauri.localhost')
    app.on('message', (raw) => app.send(JSON.stringify({ id: JSON.parse(raw.toString()).id, ok: false, error: 'No encontré "Pelota"' })))
    await expect(bridge.call('set_material', { part: 'Pelota' })).rejects.toThrow('Pelota')
    app.close()
  })

  it('rechaza conexiones de otras páginas web', async () => {
    bridge = new AppBridge(PORT)
    await expect(connectApp('https://evil.example')).rejects.toThrow()
  })

  it('avisa si la app no está abierta', async () => {
    bridge = new AppBridge(PORT)
    await expect(bridge.call('scene_info')).rejects.toThrow('no está abierta')
  })
})
