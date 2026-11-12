import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AppBridge } from './bridge.js'

const PRESETS = ['arcilla', 'tela', 'vidrio', 'metal', 'madera', 'plastico'] as const
const FABRICS = ['algodon', 'jean', 'lana', 'seda', 'cuero'] as const
const SHAPES = ['cubo', 'esfera', 'cilindro', 'cono', 'dona', 'plano'] as const
const VIEWS = ['actual', 'frente', 'atras', 'izquierda', 'derecha', 'arriba', 'perspectiva'] as const

const vec3 = z.tuple([z.number(), z.number(), z.number()])
const part = z.string().describe('Id o nombre de la parte (ver scene_info).')
const material = {
  preset: z.enum(PRESETS).optional().describe('Material de un clic.'),
  fabric: z.enum(FABRICS).optional().describe('Tipo de tela (implica preset tela).'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Color #rrggbb.'),
  amount: z.number().min(0).max(1).optional().describe('Ajuste propio: transparencia del vidrio, brillo de metal/plástico/arcilla.'),
}

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })

const expand = (p: string) => resolve(p.startsWith('~') ? homedir() + p.slice(1) : p)

/** Registra las herramientas. Cada una es una llamada a la app (misma lógica que los botones). */
export function registerTools(server: McpServer, bridge: AppBridge) {
  const relay = (name: string) => async (args: Record<string, unknown>) => text(await bridge.call(name, args))

  server.registerTool('scene_info', {
    title: 'Ver la escena',
    description: 'Lista las partes de la escena con su material, posición, rotación (grados) y escala, y cuál está elegida.',
    inputSchema: {},
  }, relay('scene_info'))

  server.registerTool('list_materials', {
    title: 'Materiales disponibles',
    description: 'Los presets de material, tipos de tela y formas que entiende Clayful.',
    inputSchema: {},
  }, async () => text({
    presets: PRESETS,
    fabrics: FABRICS,
    shapes: SHAPES,
    amount: { vidrio: 'transparencia', metal: 'brillo', plastico: 'brillo', arcilla: 'brillo' },
    note: 'La ropa no es un modo aparte: es una parte con material tela.',
  }))

  server.registerTool('add_shape', {
    title: 'Agregar forma',
    description: 'Agrega una forma básica. Queda apoyada en el piso y elegida.',
    inputSchema: { shape: z.enum(SHAPES), name: z.string().optional(), position: vec3.optional(), ...material },
  }, relay('add_shape'))

  server.registerTool('set_material', {
    title: 'Cambiar material',
    description: 'Le da a una parte un material de un clic (tela, vidrio, metal…), su color y su ajuste. Para ropa: preset tela + fabric.',
    inputSchema: { part, ...material },
  }, relay('set_material'))

  server.registerTool('transform', {
    title: 'Mover, girar o escalar',
    description: 'Cambia posición [x,y,z], rotación [x,y,z] en grados y/o escala (número o [x,y,z]). Y es arriba; el piso es y=0.',
    inputSchema: { part, position: vec3.optional(), rotation: vec3.optional(), scale: z.union([z.number(), vec3]).optional() },
  }, relay('transform'))

  server.registerTool('select', {
    title: 'Elegir parte',
    description: 'Elige una parte (o ninguna si no se pasa).',
    inputSchema: { part: part.optional() },
  }, relay('select'))

  server.registerTool('rename', { title: 'Renombrar', description: 'Cambia el nombre de una parte.', inputSchema: { part, name: z.string() } }, relay('rename'))
  server.registerTool('duplicate', { title: 'Duplicar', description: 'Duplica una parte al lado.', inputSchema: { part } }, relay('duplicate'))
  server.registerTool('delete', { title: 'Borrar', description: 'Borra una parte (se puede deshacer).', inputSchema: { part } }, relay('delete'))
  server.registerTool('clear', { title: 'Vaciar escena', description: 'Borra todo (se puede deshacer).', inputSchema: {} }, relay('clear'))
  server.registerTool('undo', { title: 'Deshacer', description: 'Deshace el último cambio.', inputSchema: {} }, relay('undo'))
  server.registerTool('redo', { title: 'Rehacer', description: 'Rehace lo deshecho.', inputSchema: {} }, relay('redo'))

  server.registerTool('look', {
    title: 'Mirar la escena',
    description: 'Devuelve una imagen de la vista 3D. Usala después de cada cambio para ver el resultado.',
    inputSchema: { view: z.enum(VIEWS).optional().describe('Desde dónde mirar. "actual" = lo que ve el usuario.') },
  }, async (args) => {
    const { image } = await bridge.call<{ image: string }>('look', args)
    const [, mimeType, data] = /^data:(.+?);base64,(.*)$/.exec(image) ?? []
    if (!data) throw new Error('La captura vino vacía.')
    return { content: [{ type: 'image' as const, data, mimeType }] }
  })

  server.registerTool('import_file', {
    title: 'Importar archivo',
    description: 'Agrega a la escena un GLB/GLTF, OBJ, FBX, STL, imagen (PNG/JPG, como referencia) o .blend (necesita Blender).',
    inputSchema: { path: z.string().describe('Ruta del archivo en esta compu.') },
  }, async ({ path }) => {
    const file = expand(path)
    const data = (await readFile(file)).toString('base64')
    return text(await bridge.call('import_file', { name: basename(file), data }))
  })

  server.registerTool('export_glb', {
    title: 'Exportar GLB',
    description: 'Guarda toda la escena como GLB en la ruta indicada (con materiales).',
    inputSchema: { path: z.string().describe('Ruta destino, termina en .glb.') },
  }, async ({ path }) => {
    const file = expand(path)
    const { data } = await bridge.call<{ data: string }>('export_glb')
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, Buffer.from(data, 'base64'))
    return text({ saved: file })
  })
}
