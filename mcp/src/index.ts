#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { AppBridge } from './bridge.js'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { registerTools } from './tools.js'

const INSTRUCTIONS = [
  'Clayful es un modelador 3D (metros, Y arriba, piso y=0, frente +Z). Usá scene_info para ver qué hay, cambiá cosas con las herramientas y mirá el resultado con look después de cada cambio.',
  'REGLA DE TELAS: ropa, cortinas, banderas, manteles, capas, sábanas, almohadones, bolsas y todo lo que sea de tela se hace SIEMPRE con set_material preset "tela" (+ fabric) y la física de simulate, nunca con pliegues a mano o pinceles:',
  '- ropa puesta: el cuerpo/maniquí como parte propia + la prenda de una sola capa abierta, 2–3 cm más grande, y simulate action "soltar".',
  '- cortinas y banderas: un plano vertical con tela y simulate "soltar" con pin "arriba".',
  '- manteles o telas sobre algo: simulate "tapar" (size = tamaño).',
  'Biblioteca: library_list muestra modelos de ejemplo de Clayful (ej. "raton-con-capa", referencia de ropa con física) y los del usuario; library_add los agrega a la escena.',
  'Formas a medida en una sola malla: run_code con formas implícitas fundidas (la skill clayful-image-to-3d y el prompt imagen_a_3d traen el kit y el método por fases).',
].join('\n')

// stdout es del protocolo MCP: los logs van siempre por stderr.
const port = Number(process.env.CLAYFUL_PORT ?? 47321)
const bridge = new AppBridge(port)

const server = new McpServer(
  { name: 'clayful', version: '0.1.0' },
  { instructions: INSTRUCTIONS },
)
registerTools(server, bridge)

// La skill "de imagen a 3D" viaja con el MCP: como prompt (/imagen_a_3d) y como herramienta para leer el kit de formas.
const SKILL_DIR = new URL('../../skills/clayful-image-to-3d/', import.meta.url)
const readSkill = (file: string) => {
  try { return readFileSync(new URL(file, SKILL_DIR), 'utf8') } catch { return '' }
}
server.registerPrompt('imagen_a_3d', {
  title: 'De imagen a 3D en Clayful',
  description: 'Método por fases para armar un modelo desde una referencia (las telas siempre con la física de Clayful).',
  argsSchema: { pedido: z.string().optional().describe('Qué querés armar (o "la imagen que pegué").') },
}, ({ pedido }) => ({
  messages: [{
    role: 'user',
    content: { type: 'text', text: `${readSkill('SKILL.md')}\n\n## Kit de formas (pegalo al principio de run_code)\n\n\`\`\`js\n${readSkill('assets/sdf-kit.js')}\n\`\`\`\n\nPedido: ${pedido ?? 'lo que muestra la referencia'}` },
  }],
}))
server.registerTool('shape_kit', {
  title: 'Kit de formas para run_code',
  description: 'Devuelve el código del kit de formas (smin, esferas, cápsulas, cajas redondeadas y nets para hacer UNA malla) y ejemplos de maniquí y remera. Pegá el kit al principio del código de run_code.',
  inputSchema: {},
}, async () => ({
  content: [{ type: 'text' as const, text: [readSkill('assets/sdf-kit.js'), '// ---- ejemplo-maniqui.js ----', readSkill('assets/ejemplo-maniqui.js'), '// ---- ejemplo-remera.js ----', readSkill('assets/ejemplo-remera.js')].join('\n') || 'No encontré el kit (skills/clayful-image-to-3d/assets).' }],
}))
await server.connect(new StdioServerTransport())
console.error(`[clayful-mcp] listo, esperando la app en ws://127.0.0.1:${port}`)
