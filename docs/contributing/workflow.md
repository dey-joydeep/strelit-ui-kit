# Contributor Workflow

This repository uses a lightweight contributor workflow for non-trivial tasks.

## Default Flow

1. Read `AGENTS.md`
2. Read current planning and migration documents if present
3. Inspect the relevant code, tests, docs, and build surfaces
4. Produce a short implementation plan for non-trivial work
5. Implement in the smallest safe slice
6. Update docs when behavior or workflow changes
7. Run the narrowest meaningful validation commands

## Preferred Validation Set

For substantial changes, prefer:

```bash
npm run test
npm run lint
npm run build
```

Add when relevant:

```bash
npm run apitest:build
npm run doc
npm run bench
```

## Priority Questions For This Repo

When planning or reviewing, ask:

1. Does this preserve the documented Strelit contract?
2. Does it preserve the current modern stack?
3. Does it keep API/documentation/build outputs coherent?
4. Is the diff narrow enough to validate confidently?

## Current Main Tracks

1. Namespace-to-module modernization
2. Typing/API quality improvements
3. Docs/TSDoc cleanup
4. Rebrand cleanup in safe repo-facing surfaces
5. Review of remaining jQuery-era compatibility seams
