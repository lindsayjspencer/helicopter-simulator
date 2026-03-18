# Helicopter Simulator

TypeScript rewrite of the multiplayer helicopter simulator using React, Vite, Three.js, Rapier, and Socket.IO.

## Scripts

- `npm run dev` starts the Vite client and the Socket.IO server for local development.
- `npm run build` builds the client bundle and compiles the TypeScript server.
- `npm run start` serves the production bundle from the Node server.
- `npm run test` runs the Vitest suite.

## Deployment

The app is configured for a single Render web service via `render.yaml`. Render should:

- use Node 20+
- run `npm ci && npm run build`
- run `npm run start`
- health check `GET /healthz`
