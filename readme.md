# Baryon

Baryon is a music visualizer that makes sound visible using its proprietary 3D cymatics simulation engine. It is currently in early development.

## Repository Structure

This is a pnpm monorepo with three apps and three shared packages:

```
apps/
  web/        — Web visualizer (React + Three.js), deployed to Vercel
  desktop/    — Native desktop app (Tauri v2)
  marketing/  — Marketing site
packages/
  visualizer/ — Core visualization engine (Three.js, GPGPU, audio)
  ui/         — Shared UI utilities
  config/     — Shared Vite configuration
```

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [pnpm](https://pnpm.io) — `npm install -g pnpm`
- For the desktop app: [Rust](https://rustup.rs) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Setup

Install all dependencies from the repo root:

```bash
pnpm install
```

## Running the Apps

### Web visualizer

```bash
pnpm dev
```

Opens at `http://localhost:5173`. Use this for general development.

> **Note:** Microphone input and the Essentia.js audio worklet require `SharedArrayBuffer`, which needs HTTPS or localhost. The standard `pnpm dev` command works on localhost. If you need to test on another device on your local network, run:
> ```bash
> cd apps/web && pnpm dev:https
> ```

### Desktop app (Tauri)

Requires Rust and the Tauri CLI. From the repo root:

```bash
pnpm dev:desktop
```

Or from the app directory:

```bash
cd apps/desktop
pnpm dev
```

### Marketing site

```bash
cd apps/marketing
pnpm dev
```

## Building

```bash
pnpm build          # Build all apps
pnpm build:web      # Build the web app only
```

Build output is in `apps/<name>/dist/`.

## Linting

```bash
cd apps/web && pnpm lint
```

## Contributing

Please read our [Contributing Guidelines](.github/CONTRIBUTING.md) before submitting any changes.
