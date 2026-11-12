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
  private server: WebSocketServer | null = null
  private retry: NodeJS.Timeout | null = null
  private closed = false
  /** Se resuelve cuando el servidor está escuchando. */
  readonly ready: Promise<void>

  constructor(private port: number, private timeoutMs = 60_000) {
    this.ready = new Promise((resolve) => this.listen(resolve))
  }

  /** Escucha en el puerto. Si otro Claude ya lo tiene, reintenta cada 3 s hasta que se libere. */
  private listen(onReady: () => void) {
    if (this.closed) return
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: this.port,
      maxPayload: 512 * 1024 * 1024,
      verifyClient: ({ origin }: { origin?: string }) => origin === undefined || ALLOWED_ORIGINS.has(origin),
    })
    server.on('listening', () => { this.server = server; onReady() })
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        this.busy = true
        console.error(`[clayful-mcp] el puerto ${this.port} está en uso (otra sesión de Claude). Reintento en 3 s.`)
        server.close()
        this.retry = setTimeout(() => this.listen(onReady), 3000)
        return
      }
      console.error(`[clayful-mcp] WebSocket: ${err.message}`)
    })
    server.on('connection', (ws) => {
      // Una sola ventana a la vez: si ya hay una conectada, la nueva espera (si no, se pisan y se desconectan entre sí).
      if (this.connected) { ws.close(4000, 'Ya hay otra ventana de Clayful conectada'); return }
      this.busy = false
      this.app = ws
      ws.on('message', (data) => this.onMessage(data))
      ws.on('close', () => { if (this.app === ws) this.app = null })
    })
  }

  private busy = false

  get connected(): boolean {
    return this.app?.readyState === WebSocket.OPEN
  }

  call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const app = this.app
    if (!app || app.readyState !== WebSocket.OPEN) {
      const why = this.busy
        ? 'Otra sesión de Claude ya está conectada a Clayful. Cerrala o usá esa.'
        : 'Clayful no está abierta. Abrí la app y probá de nuevo.'
      return Promise.reject(new Error(why))
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
    this.closed = true
    if (this.retry) clearTimeout(this.retry)
    for (const p of this.pending.values()) clearTimeout(p.timer)
    this.app?.close()
    const server = this.server
    return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()))
  }
}
