---
name: strelit-change-discipline
description: Contract-driven implementation workflow for Strelit UI Kit changes. Use when implementing or modifying runtime behavior, fixing bugs, addressing PR review findings, adding features, refactoring code, or changing high-risk scripts, configuration, persistence, lifecycle, packaging, public API, tests, or CI.
---

# Strelit Change Discipline

Follow the mandatory policy in the nearest `AGENTS.md`. Use this skill for the
repeatable reasoning workflow; do not treat it as a replacement policy source.

## Establish The Contract

Before editing:

1. Inspect the current implementation, tests, and relevant public contract
2. Read `docs/architecture/product-evolution-policy.md` and identify the active
   compatibility phase
3. State the requested behavior and invariants
4. Classify the change as Low, Medium, or High risk using root `AGENTS.md`
5. Identify negative, boundary, compatibility, and lifecycle cases
6. Define what remains out of scope

Keep this concise and continue unless a missing decision would materially change
the requested outcome.

## Implement A Bug Or Review Fix

1. Reproduce the reported case
2. Convert the instance into a defect class
3. Search the affected abstraction and sibling paths for that class
4. Add a failing regression test covering the class and key boundaries
5. Fix the responsible abstraction with the smallest coherent change
6. Run the focused test before broader verification

Do not close a finding by matching only the reviewer-provided input. Do not
suppress diagnostics, weaken assertions, or add an unbounded fallback.

## Implement A Feature Or Refactor

1. Add acceptance coverage for the observable behavior
2. Add relevant rejection, boundary, cleanup, and compatibility coverage
3. Preserve the active supported Strelit contract unless the task explicitly
   changes a scoped contract or includes an approved phase transition
4. Keep unrelated modernization and cleanup separate
5. Update docs and API reports when behavior or public contracts change

Golden Layout baselines are evidence for migration and disposition decisions;
they are not permanent architecture requirements. Do not infer a breaking
redesign from an ambiguous task, and do not reject an explicitly authorized
redesign merely because inherited classes or behavior would be removed.

## Adversarial Self-Review

Review the complete diff after implementation:

- Trace inputs through success, failure, and cleanup paths
- Check ownership, resource release, error propagation, and state round trips
- Search for copied logic and alternate entry points
- Verify unsupported cases fail safely or produce explicit diagnostics
- Confirm tests would fail if the implementation were reverted

Treat review scope and review purpose as separate evidence. A patch review that
closes known findings is `Finding closure`; it does not establish that the rest
of the pull request is sound. For high-risk work, follow closure with a `Fresh
discovery` review from an unused independent context over the `Whole PR` from
merge base through the current head, including every changed path.

Self-review does not satisfy the independent-review requirement for high-risk
changes.

## Independent Quality Review

For high-risk changes, apply
`docs/contributing/ai-change-quality-rubric.md` after implementation and focused
verification:

1. Hand the contract, complete diff, changed tests, and repository policy to a
   human or separate agent context that did not implement the change
2. Do not give the reviewer the intended conclusion or ask for confirmation
3. Have the reviewer inspect and report findings before making edits
4. Record rubric scores, findings, evidence, residual risks, and a verdict
5. Disposition every finding and fix every Critical and High finding
6. Rerun affected checks and obtain reviewer confirmation that blockers closed

For a high-risk pull request, record the current full head SHA as the reviewed
boundary and require the declared reviewer to approve that SHA using a GitHub
identity different from the PR author. Re-review after any new head commit.
Record `Review scope: Whole PR` and `Review pass: Fresh discovery`; patch-only
or finding-closure evidence cannot satisfy the final gate.

A same-context role change is still self-review. If no independent reviewer is
available, report that limitation and leave the high-risk task incomplete.
Detailed local review artifacts belong in `.tmp/`; retain the required summary
in the PR body or final handoff.

## Verify And Handoff

Run `npm run verify:pr`. Run narrower tests first while iterating. Treat every
nonzero exit, unhandled test error, or unexpected skip as failure.

Report changed behavior, regression evidence, commands and outcomes,
independent-review evidence when required, and remaining risks. Do not claim
completion when required verification or review is missing.
