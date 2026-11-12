#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { AppBridge } from './bridge.js'
import { registerTools } from './tools.js'

// stdout es del protocolo MCP: los logs van siempre por stderr.
const port = Number(process.env.CLAYFUL_PORT ?? 47321)
const bridge = new AppBridge(port)

const server = new McpServer(
  { name: 'clayful', version: '0.1.0' },
  { instructions: 'Clayful es un modelador 3D. Usá scene_info para ver qué hay, cambiá cosas con las herramientas y mirá el resultado con look. La ropa es una parte con material tela.' },
)
registerTools(server, bridge)
await server.connect(new StdioServerTransport())
console.error(`[clayful-mcp] listo, esperando la app en ws://127.0.0.1:${port}`)
