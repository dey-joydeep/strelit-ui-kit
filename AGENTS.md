# Repository Guidelines

## How To Use These Instructions

This repository is the active product line for `Strelit UI` under `CTHub`.

Read this file before making changes. It defines the repository-wide defaults;
deeper `AGENTS.md` files, such as `scripts/AGENTS.md`, add scoped requirements.

## Startup Checklist

1. Work from the repository root: `E:\workspace\project-golden-layout\strelit-ui-kit`
2. Check `git status --short` before editing or committing
3. Confirm Node/npm compatibility before running toolchain commands
4. Prefer existing repo scripts over ad-hoc commands
5. Read `docs/architecture/product-evolution-policy.md` and apply its active phase
6. Keep the modernization direction intact unless the user explicitly changes it

## Mandatory Change Discipline

These rules apply to human- and AI-authored changes. A change is not complete
merely because it compiles or satisfies the reported example.

Before editing, the implementer MUST:

1. Identify the requested behavior and the current behavior
2. State the invariants that must remain true
3. Inspect the relevant implementation, tests, and adjacent call paths
4. Identify likely boundary, failure, compatibility, and lifecycle cases
5. Keep unrelated cleanup out of the change

During implementation, the implementer MUST:

- Make the smallest coherent change at the abstraction responsible for the behavior
- Add or update tests for observable behavior
- Preserve the active supported Strelit contract defined by
  `docs/architecture/product-evolution-policy.md` unless the task intentionally
  changes a scoped contract
- Treat ambiguity conservatively; preserve or diagnose uncertain input rather than guessing
- Avoid suppressing diagnostics, skipping tests, weakening assertions, or adding broad fallbacks to make verification pass
- Re-read the complete diff before declaring the work finished
- Perform a distinct adversarial self-review after implementation
- For high-risk changes, obtain an independent review using `docs/contributing/ai-change-quality-rubric.md`

The independent reviewer MUST be a human or a separate agent context that did
not implement the change. The reviewer MUST inspect the complete diff and report
findings before editing code. A same-context role change does not qualify. Give
the reviewer the behavioral contract, diff, tests, and repository policy, not
the implementer's intended conclusion.

Every independent-review finding MUST have an explicit disposition. Critical
and High findings block completion. After fixes, the implementer MUST rerun the
affected checks and the reviewer MUST confirm that blocking findings are closed.
If an independent reviewer is unavailable, report the limitation and leave the
high-risk change incomplete.

For a high-risk pull request, the declared reviewer MUST also approve the
current head commit using a GitHub identity different from the PR author. A new
head commit invalidates that approval and requires re-review.

For a bug or PR review finding, the implementer MUST:

1. Reproduce the reported case
2. Identify the violated invariant and the broader defect class
3. Search the affected area for equivalent or adjacent cases
4. Add a regression test that fails without the fix
5. Fix the responsible abstraction rather than only the commented line
6. Run the regression test, adjacent tests, and risk-appropriate verification

A review comment is evidence of a defect class, not merely an instruction to
edit the commented line.

For a new feature, tests MUST cover acceptance behavior plus relevant negative,
boundary, compatibility, and cleanup behavior. If a meaningful case is
intentionally unsupported, document the reason and expected diagnostic or
failure mode.

Do not claim completion when any required command exits nonzero, Vitest reports
an unhandled error, verification stages are unexpectedly skipped, or relevant
verification could not run. Report the limitation and leave the task incomplete.

The final handoff MUST state:

- Behavior changed
- Tests added or updated
- Commands run and their outcomes
- Independent reviewer identity, verdict, and finding dispositions for high-risk changes
- Remaining risks or intentionally unsupported cases

## Project Direction

- Product brand: `Strelit UI`
- Parent brand: `CTHub`
- This repo was created from the Golden Layout v2 working tree and re-initialized as a fresh Git repository
- The current focus is modernization first, then deeper product development
- The active product-evolution phase is **Bridge**. Golden Layout behavior is
  migration and regression evidence, not a permanent design constraint. Phase
  transitions follow `docs/architecture/product-evolution-policy.md`.

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

Use `npm run verify:pr` before finalizing a coding change. It classifies changed
files and runs the repository checks required for that risk level.

Risk levels:

- Low: documentation, comments, and repository prose with no executable behavior
- Medium: tests, demos, and non-runtime verification support that does not affect public contracts
- High: runtime source, migration/config/persistence behavior, public API, lifecycle, packaging, build scripts, dependencies, CI, or agent/review policy

During iteration, run the narrowest relevant test first. Before handoff:

- Low-risk changes MUST pass documentation lint and formatting checks
- Medium-risk changes MUST pass typecheck, tests, lint, and formatting
- High-risk changes MUST pass `npm run verify:ordered` and the API demo build

If the automatic classification is too strict, run the stricter checks. Do not
downgrade risk merely to avoid verification.

## Coding Style

- TypeScript strict mode
- 2-space indentation
- single quotes
- semicolons
- ASCII by default
- preserve the active supported Strelit contract unless an intentional contract
  change or phase transition is part of the task

## Refactoring Rules

- Prefer standard ES module exports over `export namespace`
- Introduce named types/interfaces when API shapes become non-trivial
- Avoid broad churn in one pass if a narrower modernization step can be validated safely
- Do not preserve inherited Golden Layout classes or incidental behavior solely
  because they existed in the baseline; consult the active evolution phase and
  documented Strelit contract
- Keep source-facing modernization separate from legal/commercial packaging work unless explicitly requested
- Split changes by behavior and risk boundary. If a PR exceeds 1,000 non-generated changed lines, explain why it cannot be reviewed as smaller coherent changes

## Documentation Rules

- Keep `README.md`, `docs/index.md`, and relevant planning files aligned with actual repo behavior
- If behavior or workflows change, update docs in the same task when practical

## Temporary Artifacts

- Use the repository-root `.tmp/` directory for disposable local content such as PR-scoped audit reports, local review artifacts, temporary session context, and agent handoff notes
- Never commit `.tmp/` contents; promote durable findings or instructions into the appropriate tracked documentation

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
