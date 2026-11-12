import { WebSocketServer, WebSocket, type RawData } from 'ws'

/** Orígenes de la app Clayful (Tauri en cada sistema + Vite en desarrollo). */
export const ALLOWED_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:1420',
])

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

/**
 * Servidor WebSocket en localhost al que se conecta la app.
 * El MCP le manda herramientas para ejecutar y espera la respuesta.
 * Solo acepta conexiones de la app (chequea el Origin) para que una web cualquiera no se haga pasar por ella.
 */
export class AppBridge {
  private app: WebSocket | null = null
  private pending = new Map<string, Pending>()
  private seq = 0
  readonly server: WebSocketServer

  constructor(port: number, private timeoutMs = 60_000) {
    this.server = new WebSocketServer({
      host: '127.0.0.1',
      port,
      maxPayload: 512 * 1024 * 1024,
      verifyClient: ({ origin }: { origin?: string }) => origin === undefined || ALLOWED_ORIGINS.has(origin),
    })
    this.server.on('error', (err) => console.error(`[clayful-mcp] WebSocket: ${err.message}`))
    this.server.on('connection', (ws) => {
      this.app?.close()
      this.app = ws
      ws.on('message', (data) => this.onMessage(data))
      ws.on('close', () => { if (this.app === ws) this.app = null })
    })
  }

  get connected(): boolean {
    return this.app?.readyState === WebSocket.OPEN
  }

  call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const app = this.app
    if (!app || app.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Clayful no está abierta. Abrí la app y probá de nuevo.'))
    }
    const id = String(++this.seq)
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Clayful no respondió a ${name}.`))
      }, this.timeoutMs)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      app.send(JSON.stringify({ id, name, args }))
    })
  }

  private onMessage(data: RawData) {
    let msg: { id?: string; ok?: boolean; result?: unknown; error?: string }
    try { msg = JSON.parse(data.toString()) } catch { return }
    const p = msg.id ? this.pending.get(msg.id) : undefined
    if (!p) return
    this.pending.delete(msg.id!)
    clearTimeout(p.timer)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new Error(msg.error ?? 'Error en Clayful.'))
  }

  close(): Promise<void> {
    for (const p of this.pending.values()) clearTimeout(p.timer)
    this.app?.close()
    return new Promise((resolve) => this.server.close(() => resolve()))
  }
}
