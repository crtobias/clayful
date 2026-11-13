import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppBridge, type Session } from './bridge.js'

const PORT = 47391
const tokenDir = mkdtempSync(join(tmpdir(), 'clayful-test-'))
const make = (session?: Session) => new AppBridge(PORT, { tokenDir, session })
let bridge: AppBridge | null = null

afterEach(async () => { await bridge?.close(); bridge = null })

function connectApp(origin: string, onMessage?: (raw: Buffer, ws: WebSocket) => void): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin })
    if (onMessage) ws.on('message', (raw: Buffer) => onMessage(raw, ws))
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

describe('AppBridge', () => {
  it('manda la herramienta a la app y devuelve su respuesta', async () => {
    bridge = make()
    await bridge.ready
    const app = await connectApp('tauri://localhost')
    app.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      app.send(JSON.stringify({ id: msg.id, ok: true, result: { echo: msg.name, args: msg.args } }))
    })
    await expect(bridge.call('add_shape', { shape: 'cubo' })).resolves.toEqual({ echo: 'add_shape', args: { shape: 'cubo' } })
    app.close()
  })

  it('propaga los errores de la app', async () => {
    bridge = make()
    await bridge.ready
    const app = await connectApp('http://tauri.localhost')
    app.on('message', (raw) => app.send(JSON.stringify({ id: JSON.parse(raw.toString()).id, ok: false, error: 'No encontré "Pelota"' })))
    await expect(bridge.call('set_material', { part: 'Pelota' })).rejects.toThrow('Pelota')
    app.close()
  })

  it('varias sesiones: la segunda se une al hub y la app ve de quién es cada llamada', async () => {
    const hub = make({ id: 'a', name: 'Uno' })
    await hub.ready
    bridge = make({ id: 'b', name: 'Dos' })
    try {
      await bridge.ready
      expect(hub.role).toBe('hub')
      expect(bridge.role).toBe('peer')
      const sessions: unknown[] = []
      const app = await connectApp('tauri://localhost', (raw, ws) => {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'sessions') { sessions.push(msg.sessions); return }
        ws.send(JSON.stringify({ id: msg.id, ok: true, result: `${msg.name} de ${msg.session.name}` }))
      })
      await expect(bridge.call('scene_info')).resolves.toBe('scene_info de Dos')
      await expect(hub.call('look')).resolves.toBe('look de Uno')
      expect(sessions.at(-1)).toEqual([{ id: 'a', name: 'Uno' }, { id: 'b', name: 'Dos' }])
      app.close()
    } finally {
      await hub.close()
    }
  })

  it('si el hub se cierra, otra sesión toma su lugar', async () => {
    const hub = make({ id: 'a', name: 'Uno' })
    await hub.ready
    bridge = make({ id: 'b', name: 'Dos' })
    await bridge.ready
    await hub.close()
    for (let i = 0; i < 40 && bridge.role !== 'hub'; i++) await new Promise((r) => setTimeout(r, 50))
    expect(bridge.role).toBe('hub')
    const app = await connectApp('tauri://localhost')
    app.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id) app.send(JSON.stringify({ id: msg.id, ok: true, result: 'ok' }))
    })
    await expect(bridge.call('scene_info')).resolves.toBe('ok')
    app.close()
  })

  it('un peer sin la llave no entra', async () => {
    bridge = make()
    await bridge.ready
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { headers: { 'x-clayful-peer': 'mal' } })
    await expect(new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject) })).rejects.toThrow()
  })

  it('rechaza conexiones de otras páginas web', async () => {
    bridge = make()
    await bridge.ready
    await expect(connectApp('https://evil.example')).rejects.toThrow()
  })

  it('avisa si la app no está abierta', async () => {
    bridge = make()
    await expect(bridge.call('scene_info')).rejects.toThrow('no está abierta')
  })
})
