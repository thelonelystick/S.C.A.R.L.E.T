# SCARLET

SCARLET is a local-first personal AI desktop assistant. It is being built incrementally as a practical personal operating system for conversations, tasks, budgets, routines, memory, and voice.

## Phase 2 status

The initial desktop foundation is complete:

- Electron window with `contextIsolation`, sandboxing, disabled `nodeIntegration`, and a narrow preload bridge
- React + TypeScript renderer powered by Vite
- Tailwind CSS integration with a premium dark-first SCARLET shell
- Desktop tray abstraction and minimize-to-tray bridge
- Workspace scripts for development, typechecking, building, and previewing
- Functional local task, budget, routine, memory, and settings views
- Local interactions for creating, completing, deleting, toggling, and reviewing workspace items

The product UI currently provides the dashboard, interactive local chat shell, and the core workspace views. These interactions are renderer-local until the SQLite/Drizzle persistence phase. AI providers, voice providers, and agent tools remain intentionally deferred rather than represented as fake functionality.

## Stack

- Electron
- React 19
- TypeScript in strict mode
- Vite
- Tailwind CSS
- pnpm workspaces

SQLite, Drizzle ORM, Zustand, Zod, AI provider abstractions, and voice providers will be added in their respective phases.

## Structure

- `apps/desktop/electron`: privileged Electron main process, preload bridge, window, and tray
- `apps/web`: React renderer and interface
- `packages`: reserved for shared types, database, and agent packages
- `data`: local application data location reserved for future database files

## Development

```bash
pnpm install
pnpm dev
```

The renderer is served at `http://localhost:5173` during development while Electron loads it in the desktop window.

Useful checks:

```bash
pnpm typecheck
pnpm build
```

Electron may require approving native dependency build scripts in environments that use pnpm's build approval policy. Run `pnpm approve-builds` and approve Electron if the desktop binary is unavailable.

## Configuration

Copy `.env.example` to `.env` when provider configuration is introduced. Secrets belong only in the Electron/main process and must never be placed in renderer code.

## Roadmap

1. Project setup and secure desktop shell
2. UI foundation
3. SQLite and Drizzle persistence
4. Task, budget, and routine CRUD
5. Replaceable AI provider, agent context, and tool registry
6. Explicit memory storage and search
7. Speech-to-text and text-to-speech provider abstractions
8. Notifications, shortcuts, and deeper desktop integration