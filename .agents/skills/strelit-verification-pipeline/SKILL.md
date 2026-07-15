---
name: strelit-verification-pipeline
description: Standardized verification workflow for Strelit UI Kit. Use when validating build outputs, running Vitest tests, or updating Microsoft api-extractor public API snapshots.
---

# Strelit UI Kit — Verification Pipeline Skill

When making changes to Strelit UI Kit (`strelit-ui-kit`), use this skill to run appropriate verification checks and ensure clean toolchain compliance.

## 1. Shell & Environment Baseline

- **Shell**: Always execute terminal commands using PowerShell 7 (`pwsh`).
- **Line Endings**: Windows git checkouts must preserve `LF` line endings for repository files (`.gitattributes` enforces `* text=auto eol=lf`).

## 2. Targeted vs. Full Verification

### Targeted Verification (During Iterative Development)

Run narrow checks first to get fast feedback:

```powershell
# Run Vitest test suite
npm run test

# Run Oxlint & code quality checks
npm run lint
```

### Complete Verification Pipeline (`verify:ordered`)

Before finalizing any pull request or commit, run the ordered verification sequence:

```powershell
npm run verify:ordered
```

This runs:

1. Clean previous build artifacts (`dist`, `temp`)
2. Compile TypeScript modules & bundles
3. Run Vitest test runner (41+ tests across layout, tab, popout specs)
4. Execute `api-extractor` public surface validation

## 3. Handling API Extractor Snapshots

If your changes export new public interfaces, classes, or types from `src/ts/index.ts`:

- `api-extractor` compares public exports against `api-extractor.json` and generates `temp/strelit-ui-kit.api.md`.
- If `verify:ordered` fails due to API signature changes, run `npm run apitest:build` or `npx api-extractor run --local --verbose` to refresh the API snapshot report when intentional.
