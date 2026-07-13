# Repository Guidelines

## How To Use These Instructions

This repository is the active product line for `Strelit UI` under `CTHub`.

Read this file before making changes. There are currently no deeper scoped `AGENTS.md` files in subfolders, so this file defines the repository-wide defaults.

## Startup Checklist

1. Work from the repository root: `E:\workspace\project-golden-layout\strelit-ui-kit`
2. Check `git status --short` before editing or committing
3. Confirm Node/npm compatibility before running toolchain commands
4. Prefer existing repo scripts over ad-hoc commands
5. Keep the modernization direction intact unless the user explicitly changes it

## Project Direction

- Product brand: `Strelit UI`
- Parent brand: `CTHub`
- This repo was created from the Golden Layout v2 working tree and re-initialized as a fresh Git repository
- The current focus is modernization first, then deeper product development

## Current Engineering Priorities

1. Continue namespace-to-module modernization in public API and config layers
2. Improve TypeScript typing where legacy compatibility types are still too loose
3. Clean stale docs/comments/TSDoc warnings incrementally
4. Preserve working build/test/demo flows while refactoring
5. Keep the repo aligned with an MIT-core direction while commercial planning remains separate

## Tooling Baseline

- Language: TypeScript
- Test runner: `Vitest`
- Demo app: `Vite`
- Linter: `Oxlint`
- Formatter: `Prettier`
- API surface checks: `api-extractor`
- Docs generation: `TypeDoc`

Do not reintroduce:

- Karma
- Jasmine
- webpack-based demo/test flow
- `@microsoft/api-documenter`

## Build, Test, And Development

Preferred commands:

- `npm run test`
- `npm run lint`
- `npm run build`
- `npm run apitest:build`
- `npm run apitest:serve`
- `npm run doc`

Run the narrowest relevant verification after changes. For non-trivial refactors, prefer at least:

- `npm run test`
- `npm run lint`
- `npm run build`

## Coding Style

- TypeScript strict mode
- 4-space indentation
- single quotes
- semicolons
- ASCII by default
- preserve existing public compatibility unless intentionally changing API

## Refactoring Rules

- Prefer standard ES module exports over `export namespace`
- Introduce named types/interfaces when API shapes become non-trivial
- Avoid broad churn in one pass if a narrower modernization step can be validated safely
- Keep source-facing modernization separate from legal/commercial packaging work unless explicitly requested

## Documentation Rules

- Keep `README.md`, `docs/index.md`, and relevant planning files aligned with actual repo behavior
- If behavior or workflows change, update docs in the same task when practical

## Licensing Direction

- Current repo direction is MIT-derived core
- Commercial licensing text is intentionally deferred
- See `LICENSING-PLAN.md` for planning context

## Git And Commits

- Do not commit unless explicitly asked
- Do not create or switch branches unless explicitly asked
- Do not revert user changes unless explicitly requested

## Useful Local Context Files

- `LICENSING-PLAN.md`
- `INVESTIGATION.md` in the parent workspace
- `MAPPING-V1-TO-V2.md` in the parent workspace
