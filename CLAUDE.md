# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm test              # run all tests
pnpm test -- src/sync  # run tests for a specific module
pnpm typecheck         # type check (tsc --noEmit)
pnpm build             # build all modules to dist/
```

Run scripts with `pnpm tsx scripts/<name>.ts`.

## Architecture

Three independent modules under `src/`, each with its own build output, barrel export, and test suite:

- **onelap/** — Onelap (顽鹿) API client. Two-step auth (login → token exchange), MD5 signature, Bearer token. Downloads FIT files via base64-encoded URL path.
- **strava/** — Strava API client + OAuth. Auto-refreshes access tokens (6hr expiry) via refresh token. Uploads FIT files as multipart FormData.
- **sync/** — Bridge module. `syncOnelapToStrava()` fetches activities from both, deduplicates by start time (5-min window), downloads FIT from Onelap, uploads to Strava. Onelap times are UTC+8, Strava times are UTC.

Each module is exported as a subpath: `sync-everything/onelap`, `sync-everything/strava`, `sync-everything/sync`.

## Conventions

- ESM throughout (`"type": "module"`). Imports use `.js` extensions and `node:` prefix for builtins.
- `import type` for type-only imports.
- Tests live in `__tests__/` subdirectories colocated with source, named `*.test.ts`.
- Zero runtime dependencies beyond `dotenv`. Uses native `fetch`, `crypto`, `fs`, `http`.
- tsdown builds each module separately (array config in `tsdown.config.ts`). Adding a module requires a new entry there + a new export in `package.json`.
