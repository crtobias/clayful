# Clayful — Claude context

## Source of truth
Catalogado en el vault **IaMind**: `/Users/tobias/Desktop/IaMind`
- Proyecto: `IT/Projects/Clayful/00 Overview — Clayful.md` (overview, stack, decisiones)
- Reglas del vault: `Meta/Conventions.md` y `Meta/Agent-Protocol.md`

## Before multi-agent work
1. Leé `/Users/tobias/Desktop/IaMind/Meta/Agent-Protocol.md`.
2. Abrí o creá el worklog del día: `/Users/tobias/Desktop/IaMind/IT/Projects/Clayful/Worklog/YYYY-MM-DD — Clayful.md`.
3. Reclamá archivos en la tabla de locks antes de editar.

## This repo
- **Stack:** Tauri 2 + React 19 + three.js (R3F + drei) + zustand · MCP en Node/TS (`@modelcontextprotocol/sdk`, `ws`).
- **Run / dev:** `npm run dev` (compila el MCP y abre la app). Solo front en navegador: `npm run dev -w app`.
- **Test:** `npm test` · **Typecheck:** `npm run typecheck` · **Lint de capas:** `npm run lint`
- **Build:** `npm run build` (instaladores en `app/src-tauri/target/release/bundle`).
- **Always-know:**
  - Screaming Architecture: `app/src/{screens,domain,shared,assets}`. Dos `domain/` no se importan entre sí (lo frena el linter); la screen orquesta.
  - **Paridad UI ↔ MCP:** todo cambio pasa por `domain/scene/commands.ts` (reductor puro) vía `useScene().run`. Herramienta nueva del MCP = `mcp/src/tools.ts` + caso en `domain/scene/tools.ts` o `screens/editor/Editor.tsx`.
  - El MCP nunca escribe en stdout (es del protocolo): logs por stderr.
  - El WebSocket solo acepta orígenes de la app (`ALLOWED_ORIGINS` en `mcp/src/bridge.ts`).
  - Textos de UI en `shared/i18n/es.ts` (inglés: sumar `en.ts` con la misma forma).
  - Nada de servicios pagos ni cosas que el usuario tenga que instalar aparte.
