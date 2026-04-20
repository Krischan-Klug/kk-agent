# kk-agent-desktop

Electron desktop shell for KK-Agent.

Common commands:

```bash
npm run build
npm run dev
npm run dist
```

The packaged app embeds:

- the statically exported frontend from `../kk-agent-frontend/out`
- the bundled backend runtime from `../kk-agent-backend/desktop-dist`

Desktop runtime data is written under Electron `userData`, not the installation directory.

In this workspace the desktop shell sits beside:

- `../kk-agent-backend`
- `../kk-agent-frontend`
- `../kk-agent-contract`

For local development, the root workspace `npm run dev` starts backend, frontend, and Electron in the expected order.
