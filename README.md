# Clayful

Modelador 3D **súper fácil**, open source, que también maneja una IA (Claude) por MCP.

- **Materiales de un clic:** arcilla, tela (algodón, jean, lana, seda, cuero), vidrio, metal, madera, plástico.
- **La ropa es una parte con material Tela:** tocás la remera, elegís Tela → Jean, listo.
- **Arrastrá cualquier archivo:** GLB/GLTF, OBJ, FBX, STL, imágenes de referencia y `.blend` (si tenés Blender).
- **Guarda en GLB**, que abre cualquier motor (Godot, Unity, Blender…).
- **Claude lo maneja:** agrega formas, cambia materiales, mueve cosas y *mira* el resultado.

> Beta 0.1: Modelar. Esculpir y Pintar vienen después.

## Descargar

Instaladores en [Releases](../../releases) (`.dmg`, `.exe`, `.AppImage`).
La app no está firmada todavía: en Mac, la primera vez abrila con **clic derecho → Abrir**.

## Correr desde el código

Necesitás Node 20+ y [Rust](https://rustup.rs).

```bash
npm install
npm run dev
```

## Conectar Claude

1. Compilá el MCP: `npm run build -w mcp`
2. Agregalo a Claude Code:

```bash
claude mcp add clayful -- node /ruta/a/clayful/mcp/dist/index.js
```

3. Abrí Clayful. Arriba a la derecha dice **Claude conectado**.

Herramientas: `scene_info`, `list_materials`, `add_shape`, `set_material`, `transform`, `select`, `rename`, `duplicate`, `delete`, `clear`, `undo`, `redo`, `look`, `import_file`, `export_glb`.

## Atajos

| Tecla | Hace |
|---|---|
| Q / W / E / R | Elegir / Mover / Girar / Escalar |
| ⌘Z / ⇧⌘Z | Deshacer / Rehacer |
| ⌘D | Duplicar |
| Supr | Borrar |
| Esc | Soltar la selección |

## Cómo está hecho

```
app/   Tauri 2 + React + three.js (React Three Fiber)
  src/domain/scene      escena, comandos, historial, importar/exportar
  src/domain/materials  presets de un clic y texturas procedurales
  src/domain/mcp        puente WebSocket con el servidor MCP
  src/screens/editor    la pantalla Modelar
mcp/   servidor MCP (stdio para Claude, WebSocket en 127.0.0.1:47321 para la app)
```

La UI y el MCP usan **los mismos comandos**: todo lo que hace un botón lo puede hacer Claude, y todo se puede deshacer.

## Licencia

MIT
