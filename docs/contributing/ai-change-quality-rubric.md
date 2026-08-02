# AI Change Quality Rubric

This rubric applies to human- and AI-authored changes. It measures the evidence
that a change is safe to review and merge; it does not award quality merely for
compiling, passing a happy-path test, or receiving few review comments.

## Review Roles

The implementer owns the contract, implementation, tests, self-review, and
verification. Self-review is mandatory but is not independent review.

For a high-risk change, an independent reviewer MUST review the complete diff.
The reviewer must be a human or a separate agent context that did not implement
the change. The reviewer first reports findings without editing the code and is
given the behavioral contract, diff, tests, and relevant repository policy, but
not the implementer's intended conclusion.

If an independent reviewer is unavailable, the high-risk change remains
incomplete. A same-context role change, checklist completion, or fresh prompt in
the implementation conversation does not satisfy the independent-review gate.
For a pull request, the declared reviewer must also approve the current head
commit using a GitHub identity different from the PR author. Repository text can
record agent review evidence, but self-attested text alone cannot prove
independence.

## Severity

- **Critical**: Data loss, security compromise, destructive behavior, or a
  broadly unusable product path. Blocks completion.
- **High**: Incorrect runtime behavior, broken compatibility, incomplete
  rollback or cleanup, resource exhaustion, or a likely regression in a major
  path. Blocks completion.
- **Medium**: A real defect with narrower impact or a material test, diagnostic,
  or maintainability gap. Must be fixed or explicitly accepted by the user.
- **Low**: Local clarity, consistency, or low-impact hardening improvement. May
  be deferred with a recorded rationale.

## Scoring

Score each applicable dimension from 0 to 3:

- **0 — Missing**: No credible evidence or the implementation violates the
  contract.
- **1 — Weak**: Evidence covers the reported example but misses material cases.
- **2 — Acceptable**: The contract and relevant failure classes are covered.
- **3 — Strong**: Evidence is comprehensive, focused, and independently
  challenged.

Use `N/A` only with a concrete rationale. A high-risk change cannot pass with a
score below 2 in any applicable dimension. A total score never compensates for
a blocking finding or failed hard gate.

## Dimensions

| Dimension                 | Review questions and required evidence                                                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Behavioral contract       | Are requested behavior, current behavior, invariants, and out-of-scope behavior explicit?                                                                                                                                          |
| Responsible abstraction   | Does the change fix the abstraction that owns the behavior rather than patching only the reported line?                                                                                                                            |
| Defect-class coverage     | For bugs and review findings, were equivalent syntax, callers, sibling paths, and adjacent cases searched?                                                                                                                         |
| Failure atomicity         | Can partial work escape? Are commit points, rollback order, rollback failure, and preserved state defined?                                                                                                                         |
| Lifecycle and ownership   | Are initialization, cleanup, cancellation, repeated calls, reentrancy, and resource ownership safe?                                                                                                                                |
| Input and resource safety | Are malformed, ambiguous, hostile, deep, large, empty, and exact-boundary inputs handled deliberately?                                                                                                                             |
| Compatibility             | Under the active product-evolution phase, are supported Strelit API, saved configuration, migration, packaging, and consumer behavior preserved or intentionally transitioned? Golden Layout parity alone is not a pass criterion. |
| Error behavior            | Are useful diagnostics preserved? Are errors propagated deliberately rather than swallowed or converted to broad fallbacks?                                                                                                        |
| Test strength             | Does a regression test fail without the fix? Are negative, boundary, compatibility, and cleanup paths covered without weakened assertions?                                                                                         |
| Scope and maintainability | Is the diff the smallest coherent change, free of unrelated cleanup and duplicated sources of truth?                                                                                                                               |
| Verification evidence     | Did focused checks and the risk-appropriate pipeline complete successfully without unexpected skips or unhandled errors?                                                                                                           |
| Residual risk             | Are unsupported cases, verification limitations, and accepted risks concrete and visible?                                                                                                                                          |

## Hard Gates

A change cannot receive a `Pass` verdict when any of these conditions is true:

- A Critical or High finding is unresolved.
- An applicable rubric dimension scores below 2.
- Executable behavior changed without a regression test or a substantive,
  evidence-backed exception.
- Required verification failed, was unexpectedly skipped, or did not run.
- Diagnostics or assertions were suppressed to obtain a pass.
- A high-risk change lacks an independent review.
- Review findings lack an explicit disposition and supporting evidence.

## Required Review Record

The independent reviewer records:

1. Reviewer identity or agent task identifier
2. Confirmation that the reviewer did not implement the change
3. Reviewed commit or diff boundary
4. Scores and rationale for each applicable dimension
5. Findings with severity and file/line evidence
6. Disposition of findings after the implementer responds
7. Residual risks and verification limitations
8. Final verdict: `Pass`, `Changes requested`, or `Blocked`

Disposable detailed reports belong in `.tmp/`. The PR body must retain the
review identity, artifact reference, verdict, open-finding count, dispositions,
and residual-risk summary.

## Measuring Quality Over Time

Track outcomes by change and defect class, not by whether the author was human
or AI. Useful rolling measures are:

- Independent-review Critical, High, and Medium findings per change
- Findings that escape local review and first appear in PR review
- Repeated findings in the same file or defect class
- Review rounds required before approval
- Regressions or rollbacks after merge
- Changes lacking a test that fails when the implementation is reverted
- Required verification failures, unexpected skips, and flaky reruns
- Non-generated changed lines and unrelated-scope findings

Raw comment count is not a quality target. Fewer comments are valuable only
when independent review, regression evidence, and post-merge outcomes also
improve.
