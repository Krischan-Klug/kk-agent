# kk-agent-desktop

The KK-Agent application package. It contains the Electron host and the Next.js renderer in one workspace while keeping their runtime boundaries explicit.

## Structure

```text
kk-agent-desktop/
|-- electron/   Electron main process and preload bridge
|-- src/        Next.js renderer
|-- public/     Renderer static assets
|-- scripts/    Desktop development launcher
`-- out/        Generated static renderer for Electron packaging
```

- `electron/main.ts` starts the backend process and serves the exported renderer through `app://`.
- `electron/preload.ts` exposes the minimal desktop runtime configuration to the sandboxed renderer.
- `src/pages` contains the application routes.
- `src/components`, `src/hooks`, and `src/lib` contain renderer UI and backend integration.

The renderer uses `contextIsolation`, Electron sandboxing, and no Node integration. Shared request and domain types come from `kk-agent-contract`.

## Commands

```bash
npm --workspace kk-agent-desktop run dev:renderer
npm --workspace kk-agent-desktop run build:renderer
npm --workspace kk-agent-desktop run build:desktop
npm --workspace kk-agent-desktop run lint
```

Use the root `npm run dev` command to start backend, renderer, and Electron together. Use `npm run desktop:build` to produce the backend bundle, static renderer, and Electron bundle in dependency order.

## Renderer Routes

- `/chat`: chat, streaming, debug, tasks, and memory
- `/agent`: agent editor
- `/mcp`: external MCP management
- `/skills`: Agent Skills discovery, import, inspection, and managed deletion
- `/settings/appearance`: theme settings
- `/settings/security`: access-scope and approval defaults
- `/settings/provider`: providers, explicit model profiles, and request overrides
- `/settings/tools`: internal tool configuration

Renderer-local state uses React hooks and `localStorage`. Persistent agent state belongs to the backend.
