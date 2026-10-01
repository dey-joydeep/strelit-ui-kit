# Repository Guidelines

## How To Use These Instructions

This repository is the active product line for `Strelit UI` under `CTHub`.

Read this file before making changes. It defines the repository-wide defaults;
deeper `AGENTS.md` files, such as `scripts/AGENTS.md`, add scoped requirements.

## Startup Checklist

1. Work from the repository root: `E:\workspace\project-golden-layout\strelit-ui-kit`
2. Check `git status --short` before editing or committing
3. If `.tmp/agent-work/active.json` exists, run exactly one recovery command:
   use `agent:ledger -- enter` for a post-interruption control prompt, otherwise
   use `npm run agent:ledger -- recover`; resume ready work before creating
   duplicates
4. Confirm Node/npm compatibility before running toolchain commands
5. Prefer existing repo scripts over ad-hoc commands
6. Read `docs/architecture/product-evolution-policy.md` and apply its active phase
7. Keep the modernization direction intact unless the user explicitly changes it

After an agent, subagent, process, tool call, or usage window is interrupted,
treat the next user control prompt as a recovery entry. Prompts such as
`continue`, `status`, `brief summary`, and equivalent wording MUST run
`npm run agent:ledger -- enter --intent <continue|status|summary>` before
reporting or dispatching more work. Use the returned `readyUnits` rather than
creating replacement work. A status or summary entry reports the recovered
state without dispatching unless an earlier standing instruction requires
continued execution; a continue entry resumes ready units in dependency order.

## Autonomous Task Recovery

Long-running or multi-agent work MUST follow
`docs/contributing/autonomous-task-recovery.md`. The coordinating agent owns the
write-ahead ledger and MUST create bounded work units before dispatch. Each
agent writes structured checkpoints after each reviewable unit of progress.

An interrupted agent is not a completed agent. On recovery, preserve validated
evidence, reclaim abandoned running units, and resume only unfinished or stale
units. Do not restart valid work merely because a conversation or agent context
ended. Do not ask the user to reconstruct recoverable state.

Review evidence is valid only for its recorded scope and Git head. An unchanged
scoped review may be carried forward with explicit changed-path evidence, but a
head change always invalidates final synthesis, exact-head approval, and
verification evidence. Never promote a partial checkpoint to completed review
evidence.

## Autonomous Scope Control

Work autonomously for local, reversible changes that are in scope. Do not pause
merely because additional improvements, enforcement layers, or follow-up work
are discovered, and do not require the user to supervise routine implementation
decisions.

Before editing, establish an internal **scope lock** containing:

- The smallest coherent outcome requested by the user
- The files or subsystems reasonably expected to change
- The verification appropriate to that outcome
- The condition that ends the task
- Work explicitly excluded from the current task

The scope lock is an execution control, not a request for confirmation. Make
reasonable assumptions and continue unless a missing decision meets one of the
pause conditions below.

When work outside the scope lock is discovered:

1. Complete the smallest coherent requested outcome
2. Continue autonomously when the expansion is necessary, local, reversible,
   and clearly implied by that outcome
3. Do not silently add optional enforcement, architecture, permissions,
   integrations, external configuration, or unrelated cleanup
4. Record useful non-blocking expansion as follow-up work in the final handoff
5. If an expansion has already started but is not required, stop expanding it;
   preserve user work and leave a coherent, clearly reported boundary

Apply an autonomous circuit breaker when any of these occurs:

- 30 minutes or more have been spent without completing the original outcome
- The change grows by 300 unexpected lines or more
- More than three files outside the expected scope would need modification
- A final fresh-discovery review would need to restart more than once

The circuit breaker MUST NOT automatically halt for user input. Narrow back to
the requested outcome, complete and verify that outcome when possible, and move
the additional work to explicit follow-ups. If narrowing cannot preserve a
correct result, report the task as incomplete with the concrete blocker.

Request user input only when progress requires:

- An irreversible or destructive action
- A write to external systems, new credentials, or expanded permissions not
  already authorized by the task
- A materially different product or architecture decision
- Resolution of genuine ambiguity where reasonable alternatives produce
  materially different user-visible outcomes

For governance changes, use the committed `HEAD` version of repository policy
as the trusted baseline. Draft or uncommitted governance rules do not govern
their own implementation and become active only after they are committed. A
request to change policy text does not implicitly authorize executable CI
enforcement, workflow permissions, or repository settings; treat those as
separate follow-up stages unless they are explicitly requested.

Finding-closure reviews may repeat for identified findings. Perform only one
final fresh-discovery pass for an unchanged candidate. A finding outside the
scope lock becomes follow-up work unless it invalidates the requested outcome
or identifies a Critical or High defect in code changed for that outcome. Do
not repeat final review without a changed candidate or new external evidence.

Use precise completion labels in the handoff. Distinguish policy text added,
local enforcement implemented, GitHub enforcement implemented, repository
rules configured, and pull request merge-ready; none implies the next.

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
the implementer's intended conclusion. If none is available, leave the
high-risk change incomplete.

### Review Economics And Final Gate

Review domains are lenses, not reviewer assignments: runtime covers behavior,
ownership, rollback, and cleanup; migration covers conversion, configuration,
and persistence; public API covers exports, compatibility, and packaging;
tooling covers build, CI, and verification; tests/docs cover evidence and
guidance. Use the domains that the actual change affects. Do not dispatch an
agent per domain or require per-path domain manifests.

Scale review depth by behavior, file type, changed-line count, call-path reach,
and recorded finding concentration. File count or domain count alone does not
increase reviewer count. One independent reviewer normally handles the change.
Give extra attention to the focus files and defect classes recorded in
`.github/change-risk.json`; add another specialist only for a concrete skill or
trust-boundary gap and record why.

Close defect classes rather than individual comments. For every confirmed
class, record its name, the actual sibling-search query, hit count, disposition
count, and disposition summary. All hits must be fixed, rejected as false or
duplicate, accepted, or deferred before closure. Review a new class or module
once as a coherent unit across its entry points, failure paths, cleanup, and
tests. Existing code is reviewed through the diff and affected callers.

During implementation, use focused finding-closure reviews of the increment;
do not restart whole-PR discovery after every fix commit. Freeze the candidate
only after all known classes close. The definitive gate then requires exactly
one fresh independent whole-PR review of that SHA. A new commit invalidates the
final review and approval, but earlier closure evidence may be reused when
preparing the next frozen candidate.

Local review must detect Critical/High defects plus the declared focus classes.
Cloud P1 findings block completion. Cloud P2 findings are triaged against the
repository severity definitions and may be fixed, marked duplicate/false
positive, accepted with required evidence, or deferred with a concrete
rationale; their badge alone does not require an automatic fix. Critical/High
findings cannot be accepted or deferred. Confirmed behavioral defects need
regression coverage.

Initialize high-risk PR work with `npm run agent:ledger -- init --mode pr
--implementer <identity> --task <id> --base <ref> --head <sha>`. The ledger
derives the complete changed-path boundary and focus classes from Git and
trusted policy. `verify:review-ready` rejects a stale, dirty, incomplete, or
self-reviewed candidate and runs required verification only after structural
preflight. For a non-default target set `STRELIT_REVIEW_BASE_REF`; callers may
not narrow the definitive base or classification.

For autonomous finalization use `npm run review:finalize -- --pr <number>`.
It runs the final gate, pushes, and submits one cloud-review request for the
frozen PR/head/base and closed-class set. Do not post per-finding bot mentions
or request review for intermediate fix commits. Reopen only after a failed
request or meaningful new evidence.

Merge readiness requires a clean frozen SHA, passing gate-executed verification,
one passing independent fresh whole-PR review, explicit finding and class
dispositions, no open Critical/High finding, and current-head GitHub approval
from a different identity when repository rules require it. If committing is
not authorized, report the final gate as pending. Once these conditions pass,
stop. Track escaped P1s, repeated classes, review rounds, duplicate commands,
reviewer dispatches, and available time/token evidence; comment count alone is
not a quality measure.

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
- High-risk product, build, packaging, dependency, or mixed changes MUST pass
  `npm run verify:ordered` and the API demo build
- Pure review-governance changes MUST pass `npm run verify:governance`; they
  remain high risk and independently reviewed without running product tests

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
- Store active autonomous-work ledgers under `.tmp/agent-work/`; their schema,
  tooling, and recovery rules are tracked even though task instances are not

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
