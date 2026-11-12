import { useEffect, useRef, useState } from 'react'

export const MCP_URL = 'ws://127.0.0.1:47321'
const RETRY_MS = 2500

/** Lo que manda el servidor MCP: una herramienta para ejecutar. */
interface ToolRequest {
  id: string
  name: string
  args?: Record<string, unknown>
}

export type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>
export type BridgeStatus = 'connected' | 'disconnected'

/**
 * Se conecta al servidor MCP de Clayful (que corre junto a Claude) y ejecuta lo que pide.
 * Se reconecta solo: abrir la app antes o después de Claude da igual.
 */
export function useMcpBridge(handler: ToolHandler, url = MCP_URL): BridgeStatus {
  const [status, setStatus] = useState<BridgeStatus>('disconnected')
  const handlerRef = useRef(handler)
  useEffect(() => { handlerRef.current = handler }, [handler])

  useEffect(() => {
    let ws: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    const connect = () => {
      ws = new WebSocket(url)
      ws.onopen = () => setStatus('connected')
      ws.onclose = () => {
        setStatus('disconnected')
        if (!stopped) timer = setTimeout(connect, RETRY_MS)
      }
      ws.onmessage = async (event) => {
        let req: ToolRequest
        try { req = JSON.parse(String(event.data)) } catch { return }
        if (!req.id || !req.name) return
        try {
          const result = await handlerRef.current(req.name, req.args ?? {})
          ws?.send(JSON.stringify({ id: req.id, ok: true, result }))
        } catch (err) {
          ws?.send(JSON.stringify({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) }))
        }
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
