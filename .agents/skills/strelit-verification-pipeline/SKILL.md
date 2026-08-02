---
name: strelit-verification-pipeline
description: Standardized verification workflow for Strelit UI Kit. Use when validating build outputs, running Vitest tests, or updating Microsoft api-extractor public API snapshots.
---

# Strelit UI Kit — Verification Pipeline Skill

When making changes to Strelit UI Kit (`strelit-ui-kit`), use this skill to run appropriate verification checks and ensure clean toolchain compliance.

## 1. Shell & Environment Baseline

- **Shell**: Always execute terminal commands using PowerShell 7 (`pwsh`).
- **Line Endings**: Windows git checkouts must preserve `LF` line endings for repository files (`.gitattributes` enforces `* text=auto eol=lf`).

## 2. Risk-Based PR Verification

Before finalizing a change, run:

```powershell
npm run verify:pr
```

This classifies changed files against the PR base and runs the checks required
by `AGENTS.md`. Do not downgrade the computed risk to avoid verification.

Verification does not replace the independent quality review required for
high-risk changes. Apply `docs/contributing/ai-change-quality-rubric.md` and
record its evidence separately.

Use `--base <ref>` when the intended base cannot be detected. Use
`--classify-only` only to inspect the planned checks, not as completion evidence.

## 3. Targeted vs. Full Verification

### Targeted Verification (During Iterative Development)

Run narrow checks first to get fast feedback:

```powershell
# Run Vitest test suite
npm run test

# Run Oxlint & code quality checks
npm run lint
```

### Complete High-Risk Pipeline (`verify:ordered`)

High-risk changes run the ordered verification sequence:

```powershell
npm run verify:ordered
```

This runs typecheck, build and API validation, tests, compatibility audit, lint,
and formatting in order. `verify:pr` also runs the API demo build for high-risk
changes.

## 4. Handling API Extractor Snapshots

If your changes export new public interfaces, classes, or types from `src/ts/index.ts`:

- `api-extractor` compares public exports against the tracked `etc/strelit-ui-kit.api.md` report.
- If an API signature change is intentional, run `npm run build:types` followed by `npm run api:report`, review the report diff, and commit it with the source change.
- `npm run build` and `npm run verify:ordered` use production API Extractor mode and fail when the tracked report is stale.
