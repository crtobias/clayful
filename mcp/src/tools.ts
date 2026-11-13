import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AppBridge } from './bridge.js'

const PRESETS = ['arcilla', 'tela', 'gelatina', 'vidrio', 'metal', 'madera', 'plastico'] as const
const FABRICS = ['algodon', 'jean', 'lana', 'punto', 'seda', 'raso', 'terciopelo', 'arpillera', 'cuero'] as const
const SHAPES = ['cubo', 'esfera', 'cilindro', 'cono', 'dona', 'plano'] as const
const VIEWS = ['actual', 'frente', 'atras', 'izquierda', 'derecha', 'arriba', 'perspectiva'] as const
const BRUSHES = ['sumar', 'quitar', 'arcilla', 'capa', 'aplanar', 'suavizar', 'inflar', 'pellizcar', 'pliegue', 'arrastrar', 'gancho', 'cortar', 'mascara'] as const
const PAINT_TOOLS = ['pincel', 'aerografo', 'difuminar', 'suavizar'] as const
const BLENDS = ['mezclar', 'multiplicar', 'aclarar', 'oscurecer', 'sumar'] as const
const TIPS = ['suave', 'dura', 'cuadrada', 'triangulo', 'linea'] as const

const vec3 = z.tuple([z.number(), z.number(), z.number()])
const part = z.string().describe('Id o nombre de la parte (ver scene_info).')
const material = {
  preset: z.enum(PRESETS).optional().describe('Material de un clic.'),
  fabric: z.enum(FABRICS).optional().describe('Tipo de tela (implica preset tela).'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Color #rrggbb.'),
  amount: z.number().min(0).max(1).optional().describe('Ajuste propio: transparencia del vidrio, brillo de metal/plástico/arcilla, dureza de la gelatina.'),
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
    sculptBrushes: BRUSHES,
    paintTools: PAINT_TOOLS,
    blends: BLENDS,
    tips: TIPS,
    symmetry: 'symmetry: { x, y, z: espejo por eje, radial: copias alrededor de axis (x|y|z) }. Ejes de la parte, centrados en su origen.',
    note: 'La ropa no es un modo aparte: es una parte con material tela. Esculpir y pintar trabajan en coordenadas de mundo (metros, Y arriba).',
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

  const pts = z.array(vec3).min(1).describe('Puntos [x,y,z] en el mundo, sobre o cerca de la superficie de la parte. Varios = un trazo.')
  const symmetry = z.object({
    x: z.boolean().optional(),
    y: z.boolean().optional(),
    z: z.boolean().optional(),
    radial: z.number().int().min(1).max(16).optional().describe('Copias alrededor del eje (1 = no).'),
    axis: z.enum(['x', 'y', 'z']).optional(),
  }).optional().describe('Simetría en ejes de la parte: espejos combinables + radial.')
  const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)

  server.registerTool('sculpt_stroke', {
    title: 'Esculpir',
    description: 'Pasa un pincel de esculpir por la parte siguiendo los puntos. Cada punto se pega a la superficie más cercana. Mirá antes con scene_info/look para saber dónde está la parte.',
    inputSchema: {
      part,
      brush: z.enum(BRUSHES),
      points: pts,
      size: z.number().min(0.01).max(1).optional().describe('Radio del pincel en metros (default 0.15).'),
      strength: z.number().min(0.01).max(1).optional().describe('Fuerza 0..1 (default 0.5).'),
      tip: z.enum(TIPS).optional(),
      angle: z.number().optional().describe('Giro de la punta en grados.'),
      mirror: z.boolean().optional().describe('Atajo de symmetry.x.'),
      symmetry,
      invert: z.boolean().optional().describe('Al revés (como Alt): sumar↔quitar, borrar máscara, capa hacia abajo.'),
      move: vec3.optional().describe('Para arrastrar y gancho: cuánto mover [dx,dy,dz] en metros.'),
    },
  }, relay('sculpt_stroke'))

  server.registerTool('paint_stroke', {
    title: 'Pintar',
    description: 'Pinta la parte siguiendo los puntos (color por vértice). tool: pincel, aerografo (suave, acumula), difuminar (arrastra color), suavizar (mezcla bordes). erase=true vuelve a blanco.',
    inputSchema: {
      part,
      points: pts,
      tool: z.enum(PAINT_TOOLS).optional(),
      color: color.optional(),
      blend: z.enum(BLENDS).optional(),
      tip: z.enum(TIPS).optional(),
      angle: z.number().optional(),
      size: z.number().min(0.005).max(1).optional().describe('Radio en metros (default 0.08).'),
      strength: z.number().min(0.01).max(1).optional().describe('Opacidad por pasada (default 0.85).'),
      softness: z.number().min(0).max(1).optional().describe('Borde suave 0..1 (punta suave, default 0.4).'),
      mirror: z.boolean().optional(),
      symmetry,
      erase: z.boolean().optional(),
    },
  }, relay('paint_stroke'))

  server.registerTool('paint_gradient', {
    title: 'Degradado',
    description: 'Pinta un degradado sobre toda la parte, de `from` (color) a `to` (color2), en coordenadas del mundo.',
    inputSchema: { part, from: vec3, to: vec3, color, color2: color.optional(), blend: z.enum(BLENDS).optional(), strength: z.number().min(0).max(1).optional() },
  }, relay('paint_gradient'))

  server.registerTool('mask', {
    title: 'Máscara',
    description: 'Invierte o borra la máscara de esculpir de una parte (pintala con sculpt_stroke brush=mascara).',
    inputSchema: { part, action: z.enum(['invertir', 'borrar']) },
  }, relay('mask'))

  server.registerTool('fill_color', {
    title: 'Pintar toda la parte',
    description: 'Balde: pinta toda la parte de un color.',
    inputSchema: { part, color },
  }, relay('fill_color'))

  server.registerTool('add_detail', {
    title: 'Más detalle',
    description: 'Subdivide la malla de la parte (curvas más finas para esculpir o pintar detalles chicos).',
    inputSchema: { part },
  }, relay('add_detail'))

  server.registerTool('set_low_poly', {
    title: 'Low poly',
    description: 'Pone una parte en estilo low poly (caras planas, pocas) o la vuelve suave. Los trazos de esculpir y pintar sobre una parte low poly siguen siendo low poly.',
    inputSchema: {
      part,
      detail: z.number().min(0).max(1).optional().describe('Detalle: 0 = muy facetado, 1 = casi liso. Usalo en vez de level.'),
      level: z.enum(['apagado', 'muy_bajo', 'bajo', 'medio', 'alto']).optional().describe('Atajo; "apagado" vuelve a suave.'),
    },
  }, relay('set_low_poly'))

  server.registerTool('library_list', {
    title: 'Biblioteca: ver modelos',
    description: 'Lista los modelos de la Biblioteca: los que vienen con Clayful (source "clayful", ej. "raton-con-capa": ejemplo de referencia de ropa con física de tela) y los que guardó el usuario (source "mio"). Miralos antes de armar algo parecido.',
    inputSchema: {},
  }, relay('library_list'))

  server.registerTool('library_add', {
    title: 'Biblioteca: agregar a la escena',
    description: 'Agrega un modelo de la Biblioteca a la escena (por id o nombre). Sirve para partir de un ejemplo (por ejemplo, ver cómo está hecha la capa del ratón) o reusar algo del usuario.',
    inputSchema: { id: z.string().describe('Id o nombre (ver library_list).') },
  }, relay('library_add'))

  server.registerTool('library_save', {
    title: 'Biblioteca: guardar la escena',
    description: 'Guarda la escena actual en "Mis modelos" de la Biblioteca del usuario (con miniatura).',
    inputSchema: { name: z.string().describe('Nombre del modelo.') },
  }, relay('library_save'))

  server.registerTool('simulate', {
    title: 'Física: tela y gelatina',
    description: [
      'Física de un clic (como Cloth y Soft Body de Blender). La simulación corre en vivo y termina sola.',
      '- tapar: cae una tela nueva sobre la parte y se pliega sobre todo lo que toca (crea la parte "Tela sobre …" con el material de la parte si es tela).',
      '- soltar: la parte es plana (un plano) y cae como tela.',
      '- gelatina: la parte se aplasta y tiembla; hardness = dureza.',
      'density = celdas por lado (24–140; triángulos = 2·n²; más = pliegues más finos). stiffness 0 = seda, 1 = cuero (por defecto, la del tipo de tela).',
    ].join('\n'),
    inputSchema: {
      part,
      action: z.enum(['tapar', 'soltar', 'gelatina']),
      density: z.number().min(24).max(140).optional(),
      stiffness: z.number().min(0).max(1).optional(),
      hardness: z.number().min(0).max(1).optional(),
      gravity: z.number().min(0).max(3).optional().describe('1 = normal, 0 = flota, 3 = muy pesada.'),
      size: z.number().min(0.3).max(3).optional().describe('Solo tapar: tamaño de la tela (1 = justo para llegar al piso).'),
      pin: z.enum(['arriba', 'ninguno']).optional().describe('Solo soltar: "arriba" deja fijo el borde de arriba (cortinas, banderas, toldos colgados).'),
    },
  }, relay('simulate'))

  server.registerTool('run_code', {
    title: 'Correr código',
    description: [
      'Corre JavaScript dentro de Clayful (como execute_blender_code). Para lo que las otras herramientas no hacen.',
      'Variables: THREE (three.js completo) y clayful:',
      '- clayful.parts: partes actuales. clayful.part(ref): una por id o nombre.',
      '- clayful.add(geometry, { name, position, rotation, scale, preset, fabric, color, amount }): agrega un THREE.BufferGeometry como parte; devuelve el id.',
      '- clayful.edit(ref, g => { ... }, { paint }): edita una copia de la malla (position, normal, color). Un paso de deshacer.',
      '- clayful.geometry(ref): la geometría visible (solo leer).',
      '- clayful.run(cmd): comando de escena: transform {id, position, rotation (radianes), scale}, set_material {id, material}, rename, duplicate, delete, select.',
      '- console.log / clayful.log: vuelven en logs.',
      'Se puede usar await. Lo que hagas con return vuelve en result. Metros, Y arriba, piso y=0. Después mirá con look.',
    ].join('\n'),
    inputSchema: { code: z.string().describe('Cuerpo de una función async de JavaScript.') },
  }, relay('run_code'))

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
