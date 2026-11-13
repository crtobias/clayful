import { useEffect, useRef, useState } from 'react'

/** Puerto del MCP. Se puede cambiar con ?mcp=47322 (útil para tener dos Clayful o probar). */
const port = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('mcp') ?? '47321' : '47321'
export const MCP_URL = `ws://127.0.0.1:${/^\d+$/.test(port) ? port : '47321'}`
const RETRY_MS = 2500

/** Una sesión de Claude conectada (cada una tiene su pestaña). */
export interface ClaudeSession {
  id: string
  name: string
}

/** Lo que manda el servidor MCP: una herramienta para ejecutar (de qué sesión viene) o la lista de sesiones. */
interface ToolRequest {
  id?: string
  type?: string
  name?: string
  args?: Record<string, unknown>
  session?: ClaudeSession
  sessions?: ClaudeSession[]
}

export type ToolHandler = (name: string, args: Record<string, unknown>, session: ClaudeSession | null) => Promise<unknown>
export type BridgeStatus = 'connected' | 'disconnected'

/**
 * Se conecta al servidor MCP de Clayful (que corre junto a Claude) y ejecuta lo que pide.
 * Se reconecta solo: abrir la app antes o después de Claude da igual.
 */
export function useMcpBridge(handler: ToolHandler, onSessions?: (sessions: ClaudeSession[]) => void, url = MCP_URL): BridgeStatus {
  const [status, setStatus] = useState<BridgeStatus>('disconnected')
  const handlerRef = useRef(handler)
  const sessionsRef = useRef(onSessions)
  useEffect(() => { handlerRef.current = handler; sessionsRef.current = onSessions }, [handler, onSessions])

  useEffect(() => {
    let ws: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let queue: Promise<void> = Promise.resolve()

    const connect = () => {
      ws = new WebSocket(url)
      ws.onopen = () => setStatus('connected')
      ws.onclose = () => {
        setStatus('disconnected')
        sessionsRef.current?.([])
        if (!stopped) timer = setTimeout(connect, RETRY_MS)
      }
      ws.onmessage = (event) => {
        let req: ToolRequest
        try { req = JSON.parse(String(event.data)) } catch { return }
        if (req.type === 'sessions') { sessionsRef.current?.(req.sessions ?? []); return }
        const { id, name } = req
        if (!id || !name) return
        const socket = ws
        // De a una: si dos Claude piden cosas a la vez, cada una corre entera en su pestaña.
        queue = queue.then(async () => {
          try {
            const result = await handlerRef.current(name, req.args ?? {}, req.session ?? null)
            socket?.send(JSON.stringify({ id, ok: true, result }))
          } catch (err) {
            socket?.send(JSON.stringify({ id, ok: false, error: err instanceof Error ? err.message : String(err) }))
          }
        })
      }
    }
    connect()
    return () => {
      stopped = true
      clearTimeout(timer)
      ws?.close()
    }
  }, [url])

  return status
}
