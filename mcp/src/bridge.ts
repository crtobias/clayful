import { WebSocketServer, WebSocket, type RawData } from 'ws'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { IncomingMessage } from 'node:http'

/** Orígenes de la app Clayful (Tauri en cada sistema + Vite en desarrollo). */
export const ALLOWED_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:1420',
])

/** Cabecera con la que otra sesión de Claude se une al hub. */
const PEER_HEADER = 'x-clayful-peer'

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

export interface Session {
  id: string
  name: string
}

interface Options {
  timeoutMs?: number
  /** Dónde se guarda la llave del hub (tests). */
  tokenDir?: string
  session?: Session
}

/**
 * Puente entre Claude y la ventana de Clayful, para varias sesiones de Claude a la vez.
 *
 * La primera sesión que arranca es el **hub**: escucha en localhost y la app se conecta a ella.
 * Las demás son **peers**: se conectan al hub (con una llave guardada en ~/.clayful) y él les reenvía todo.
 * Cada llamada va con el id de su sesión: la app abre una pestaña por sesión.
 * Si el hub se cierra, otra sesión toma su lugar sola.
 */
export class AppBridge {
  readonly session: Session
  role: 'starting' | 'hub' | 'peer' = 'starting'
  private timeoutMs: number
  private tokenDir: string
  private closed = false
  private retry: NodeJS.Timeout | null = null
  private seq = 0
  private pending = new Map<string, Pending>()
  // hub
  private server: WebSocketServer | null = null
  private app: WebSocket | null = null
  private peers = new Map<WebSocket, Session>()
  /** Llamadas de peers en vuelo: id hacia la app → a quién devolverle la respuesta. */
  private routes = new Map<string, { peer: WebSocket; id: string }>()
  private token = ''
  // peer
  private hub: WebSocket | null = null
  private oldHub = false
  /** Se resuelve cuando esta sesión ya es hub o está unida a uno. */
  readonly ready: Promise<void>
  private onReady!: () => void

  constructor(private port: number, opts: Options = {}) {
    this.timeoutMs = opts.timeoutMs ?? 60_000
    this.tokenDir = opts.tokenDir ?? join(homedir(), '.clayful')
    this.session = opts.session ?? { id: `s${process.pid}`, name: basename(process.cwd()) || 'Claude' }
    this.ready = new Promise((resolve) => { this.onReady = resolve })
    this.start()
  }

  private get tokenFile() {
    return join(this.tokenDir, `hub-${this.port}.key`)
  }

  /** Intenta ser hub; si el puerto está tomado, se une como peer. */
  private start() {
    if (this.closed) return
    this.role = 'starting'
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: this.port,
      maxPayload: 512 * 1024 * 1024,
      verifyClient: ({ origin, req }: { origin?: string; req: IncomingMessage }) =>
        (origin !== undefined && ALLOWED_ORIGINS.has(origin)) || (origin === undefined && (!req.headers[PEER_HEADER] || req.headers[PEER_HEADER] === this.token)),
    })
    server.on('listening', () => {
      this.server = server
      this.role = 'hub'
      this.token = randomBytes(24).toString('hex')
      mkdirSync(this.tokenDir, { recursive: true, mode: 0o700 })
      writeFileSync(this.tokenFile, this.token, { mode: 0o600 })
      console.error(`[clayful-mcp] hub en ws://127.0.0.1:${this.port} (${this.session.name})`)
      this.onReady()
    })
    server.on('error', (err: NodeJS.ErrnoException) => {
      server.close()
      if (err.code === 'EADDRINUSE') this.joinHub()
      else console.error(`[clayful-mcp] WebSocket: ${err.message}`)
    })
    server.on('connection', (ws, req) => {
      if (req.headers[PEER_HEADER]) this.acceptPeer(ws)
      else this.acceptApp(ws)
    })
  }

  // ───────────── hub ─────────────

  private acceptApp(ws: WebSocket) {
    // Una sola ventana a la vez: si ya hay una, la nueva espera (si no, se pisan).
    if (this.app?.readyState === WebSocket.OPEN) { ws.close(4000, 'Ya hay otra ventana de Clayful conectada'); return }
    this.app = ws
    ws.on('message', (data) => this.fromApp(data))
    ws.on('close', () => { if (this.app === ws) this.app = null })
    this.sendSessions()
  }

  private acceptPeer(ws: WebSocket) {
    ws.on('message', (data) => {
      let msg: { type?: string; id?: string; name?: string; args?: Record<string, unknown>; session?: Session }
      try { msg = JSON.parse(data.toString()) } catch { return }
      if (msg.type === 'hello' && msg.session) {
        this.peers.set(ws, msg.session)
        ws.send(JSON.stringify({ type: 'welcome' }))
        this.sendSessions()
        return
      }
      const session = this.peers.get(ws)
      if (!session || !msg.id || !msg.name) return
      const app = this.app
      if (!app || app.readyState !== WebSocket.OPEN) {
        ws.send(JSON.stringify({ id: msg.id, ok: false, error: 'Clayful no está abierta. Abrí la app y probá de nuevo.' }))
        return
      }
      const id = `p${++this.seq}`
      this.routes.set(id, { peer: ws, id: msg.id })
      app.send(JSON.stringify({ id, name: msg.name, args: msg.args ?? {}, session }))
    })
    ws.on('close', () => {
      this.peers.delete(ws)
      for (const [id, r] of this.routes) if (r.peer === ws) this.routes.delete(id)
      this.sendSessions()
    })
  }

  /** Le cuenta a la app qué sesiones de Claude están conectadas (una pestaña por sesión). */
  private sendSessions() {
    if (this.app?.readyState !== WebSocket.OPEN) return
    this.app.send(JSON.stringify({ type: 'sessions', sessions: [this.session, ...this.peers.values()] }))
  }

  private fromApp(data: RawData) {
    let msg: { id?: string; ok?: boolean; result?: unknown; error?: string }
    try { msg = JSON.parse(data.toString()) } catch { return }
    if (!msg.id) return
    const route = this.routes.get(msg.id)
    if (route) {
      this.routes.delete(msg.id)
      if (route.peer.readyState === WebSocket.OPEN) route.peer.send(JSON.stringify({ ...msg, id: route.id }))
      return
    }
    this.settle(msg)
  }

  // ───────────── peer ─────────────

  private joinHub() {
    if (this.closed) return
    let token = ''
    try { token = readFileSync(this.tokenFile, 'utf8').trim() } catch { /* hub viejo, sin llave */ }
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}`, { headers: { [PEER_HEADER]: token || 'none' } })
    let welcomed = false
    const giveUp = setTimeout(() => { if (!welcomed) ws.close() }, 1500)
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', session: this.session })))
    ws.on('message', (data) => {
      let msg: { type?: string; id?: string; ok?: boolean; result?: unknown; error?: string; name?: string }
      try { msg = JSON.parse(data.toString()) } catch { return }
      if (msg.type === 'welcome') {
        welcomed = true
        clearTimeout(giveUp)
        this.hub = ws
        this.role = 'peer'
        this.oldHub = false
        console.error(`[clayful-mcp] unido al hub de Clayful como "${this.session.name}"`)
        this.onReady()
        return
      }
      if (welcomed) this.settle(msg)
    })
    ws.on('error', () => { /* lo maneja close */ })
    ws.on('close', () => {
      clearTimeout(giveUp)
      if (this.hub === ws) this.hub = null
      if (!welcomed) this.oldHub = true
      for (const [id, p] of this.pending) { clearTimeout(p.timer); p.reject(new Error('Se cortó la conexión con Clayful. Probá de nuevo.')); this.pending.delete(id) }
      if (this.closed) return
      // El hub se fue (o es de una versión vieja): reintentar ser hub o unirse otra vez.
      this.role = 'starting'
      this.retry = setTimeout(() => this.start(), welcomed ? 150 + Math.random() * 600 : 3000)
    })
  }

  // ───────────── las dos ─────────────

  get connected(): boolean {
    if (this.role === 'peer') return this.hub?.readyState === WebSocket.OPEN
    return this.app?.readyState === WebSocket.OPEN
  }

  call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const target = this.role === 'peer' ? this.hub : this.app
    if (!target || target.readyState !== WebSocket.OPEN) {
      const why = this.oldHub
        ? 'Otra sesión de Claude tiene Clayful con una versión vieja del MCP. Reiniciá esa sesión (o cerrala) y probá de nuevo.'
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
      const msg = this.role === 'peer' ? { id, name, args } : { id, name, args, session: this.session }
      target.send(JSON.stringify(msg))
    })
  }

  private settle(msg: { id?: string; ok?: boolean; result?: unknown; error?: string }) {
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
    this.hub?.close()
    for (const ws of this.peers.keys()) ws.close()
    const server = this.server
    return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()))
  }
}
