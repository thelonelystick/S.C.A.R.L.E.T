# SCARLET

SCARLET is a local-first personal AI desktop assistant. It is being built incrementally as a practical personal operating system for conversations, tasks, budgets, routines, memory, and voice.

## Current status

The initial desktop foundation is complete:

- Electron window with `contextIsolation`, sandboxing, disabled `nodeIntegration`, and a narrow preload bridge
- React + TypeScript renderer powered by Vite
- Tailwind CSS integration with a premium dark-first SCARLET shell
- Desktop tray abstraction and minimize-to-tray bridge
- Workspace scripts for development, typechecking, building, and previewing
- Functional local task, budget, routine, memory, and settings views
- Local interactions for creating, completing, deleting, toggling, and reviewing workspace items
- Google sign-in through Supabase Auth
- Persistent workspace state in Supabase Postgres with per-user row-level security
- Local browser storage fallback when Supabase credentials are not configured

The product UI provides the dashboard, interactive chat shell, and core workspace views. AI providers, voice providers, and agent tools remain intentionally deferred rather than represented as fake functionality.

## Stack

- Electron
- React 19
- TypeScript in strict mode
- Vite
- Tailwind CSS
- pnpm workspaces
- Supabase Auth and Postgres

SQLite, Drizzle ORM, Zustand, Zod, AI provider abstractions, and voice providers remain future options.

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

## Render deployment

For a Render web service, use `pnpm install --frozen-lockfile && pnpm build` as the build command and `pnpm start` as the start command. The start script serves the built renderer on `0.0.0.0` and uses Render's `PORT` environment variable.

Electron may require approving native dependency build scripts in environments that use pnpm's build approval policy. Run `pnpm approve-builds` and approve Electron if the desktop binary is unavailable.

## Supabase configuration

1. Create a Supabase project and copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase Project Settings > API.
3. In Supabase Authentication > Providers, enable Google and add the Google OAuth client ID and client secret there.
4. Add `http://localhost:5173` to Supabase Authentication > URL Configuration > Redirect URLs for development. Add the production renderer URL before deployment.
5. Run `supabase/schema.sql` in the Supabase SQL Editor. It creates the per-user workspace table and RLS policies.

The `VITE_SUPABASE_ANON_KEY` is a browser-safe public key. Never put a Google client secret, Supabase service-role key, or other private API key in `.env` variables prefixed with `VITE_` or in renderer code. When Supabase is not configured, the app uses `localStorage` so the UI remains usable; durable cross-device sync requires the two Supabase values above.

## Roadmap

1. Project setup and secure desktop shell
2. UI foundation
3. Task, budget, and routine CRUD
5. Replaceable AI provider, agent context, and tool registry
6. Explicit memory storage and search
7. Speech-to-text and text-to-speech provider abstractions
8. Notifications, shortcuts, and deeper desktop integration