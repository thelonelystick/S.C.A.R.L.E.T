# S.C.A.R.L.E.T

S.C.A.R.L.E.T is a local-first personal AI desktop assistant. It is being built incrementally as a practical personal operating system for conversations, tasks, budgets, routines, memory, and voice.

## Frontend

The current frontend is a static HTML, CSS, and JavaScript preview served and built with Vite.

- Install dependencies with `npm install`.
- Start the development server with `npm run dev`.
- Create the production build with `npm run build` (output: `dist/`).
- Preview the production build with `npm run preview`.
- Open `/admin` to manage the available chat-mode plugins.

The plugin catalog and profile selection are stored in browser local storage for this preview. The admin page is not authenticated, and its changes do not sync between users or devices; shared administration requires a backend.
