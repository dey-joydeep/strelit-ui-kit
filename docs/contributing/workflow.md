# Contributor Workflow

This repository uses a contract-driven contributor workflow for non-trivial
tasks. The same quality gates apply to human- and AI-authored changes.

## Default Flow

1. Read `AGENTS.md`
2. Read the active phase in the
   [product evolution policy](../architecture/product-evolution-policy.md) and
   current planning or migration documents
3. Inspect the relevant code, tests, docs, and build surfaces
4. State the behavioral contract, invariants, risk, and failure classes
5. Produce a short implementation plan for non-trivial work
6. Add regression or acceptance evidence before the implementation when practical
7. Implement in the smallest safe slice
8. Perform an adversarial self-review of the complete diff
9. For high-risk work, obtain an independent review using the
   [AI change quality rubric](./ai-change-quality-rubric.md)
10. Resolve review findings, update docs, and run risk-appropriate verification

For a high-risk pull request, finish that flow with the model-independent
handoff command after the candidate and its exact-head review evidence are
committed:

```bash
npm run review:finalize -- --pr <number>
```

This command runs the definitive local gate, records an exact-head receipt,
pushes that same commit, confirms that the pull request points to it, and only
then posts `@codex review`. A tracked pre-push hook rejects a high-risk current
branch push when its receipt is missing or stale. `npm install` configures that
hook without replacing a pre-existing custom hook path.

Use `npm run review:prepare` when only the local gate and receipt are needed,
and `npm run review:request -- --pr <number>` when the verified commit is already
on GitHub. A new commit or working-tree change invalidates the receipt. These
commands do not replace independent review, GitHub approval, finding
disposition, or the maintainer's merge decision.

The independent reviewer must be a human or separate agent context that did not
implement the change. If that reviewer is unavailable, high-risk work remains
incomplete. A high-risk pull request additionally requires approval of its
current head commit by the declared reviewer using a GitHub identity different
from the author; updating the head invalidates that approval.

Use a finding-closure pass to verify specific fixes, then use a fresh reviewer
context for final discovery over the whole PR from merge base through current
head. A review of only the latest patch cannot satisfy the high-risk gate. Record
`Review scope: Whole PR` and `Review pass: Fresh discovery` in the PR review
evidence.

## Preferred Validation Set

During iteration, run the narrowest relevant checks. Before handoff, run:

```bash
npm run verify:pr
```

This classifies the changed files and runs the checks required by `AGENTS.md`.
Verification complements independent semantic review; it does not replace it.

Add when relevant:

```bash
npm run apitest:build
npm run apitest:smoke
npm run doc
npm run bench
```

Oxlint validates JSDoc access and tag syntax. Every new or changed public API must also have a meaningful summary and document observable errors or limits. The required lint command runs TypeDoc's strict public-documentation audit after Oxlint. It can also be run independently with:

```bash
npm run lint:docs
```

The TypeDoc configuration excludes only setter reflections whose contracts are documented on their getters, as required by API Extractor. It does not exempt undocumented public declarations.

Maintainer-facing Node scripts are not part of the generated public API, but their processing stages, safety invariants, extension points, and release checks must be documented. See the [migration tool](../migration/migration-tool-maintenance.md), [compatibility audit](../architecture/compatibility-audit-maintenance.md), and [verification pipeline](./verification-pipeline.md) maintenance guides.

## Priority Questions For This Repo

When planning or reviewing, ask:

1. Does this preserve or intentionally transition the supported Strelit
   contract for the active product-evolution phase?
2. Does it preserve the current modern stack?
3. Does it keep API/documentation/build outputs coherent?
4. Is the diff narrow enough to validate confidently?

## Current Main Tracks

1. Namespace-to-module modernization
2. Typing/API quality improvements
3. Docs/TSDoc cleanup
4. Rebrand cleanup in safe repo-facing surfaces
5. Review of remaining jQuery-era compatibility seams

Golden Layout inventories inform migration and disposition work; they do not
permanently constrain Strelit's architecture. A repository-wide phase change
must update the product evolution policy explicitly and cannot occur merely
because its review date has arrived.
