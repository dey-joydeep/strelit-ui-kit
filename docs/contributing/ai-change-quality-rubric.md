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

Finding-closure reviews inspect each increment and close the whole defect class.
After known classes close, freeze the candidate and perform one fresh whole-PR
discovery pass. Do not freeze or restart discovery after every fix commit.

If an independent reviewer is unavailable, the high-risk change remains
incomplete. A same-context role change, checklist completion, or fresh prompt in
the implementation conversation does not satisfy the independent-review gate.
For a pull request, the declared reviewer must also approve the current head
commit using a GitHub identity different from the PR author. Repository text can
record agent review evidence, but self-attested text alone cannot prove
independence.

## Review Scale And Coverage

Use one independent reviewer by default. Domains guide inspection but do not
create reviewer assignments. Scale depth by behavioral reach, file type, diff
size, and `.github/change-risk.json` focus history. Add a specialist only for a
concrete expertise or trust-boundary gap.

Review new modules as coherent units. For existing code, inspect the diff,
affected callers, failure/cleanup paths, and relevant tests. Each confirmed
class records its search query, hit count, dispositioned count, and summary.
Unexplained or undispositioned hits prevent `Pass`.

The final review targets one clean frozen SHA. A new commit invalidates that
decision and approval; incremental closure reports may be reused while preparing
the next candidate. Cloud P2 findings are triaged under repository severity
definitions instead of being automatically fixed.

## Severity

- **Critical**: Data loss, security compromise, destructive behavior, or a
  broadly unusable product path. Blocks completion.
- **High**: Incorrect runtime behavior, broken compatibility, incomplete
  rollback or cleanup, resource exhaustion, or a likely regression in a major
  path. Blocks completion.
- **Medium**: A narrower real defect or material evidence gap. Fix it, accept it
  with required evidence, or defer it with a concrete rationale and owner.
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
| Review coverage           | Did the reviewer inspect the complete diff, affected call paths, declared focus classes, tests, and explicit omissions?                                                                                                            |
| Recovery integrity        | Were interrupted units resumed from validated checkpoints, partial work kept incomplete, and stale evidence selectively invalidated against the current head?                                                                      |
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
- A confirmed class lacks its search query, hit count, or complete disposition.
- The final review targets a dirty working tree or a SHA other than the current
  pull-request head.
- An interrupted unit is represented as completed, or final review relies on
  partial, stale, or unvalidated checkpoint evidence.
- A local high-risk PR lacks a completed generated-scope ledger or has not
  passed `npm run verify:review-ready` on the frozen source.

## Required Review Record

The independent reviewer records:

1. Reviewer identity or agent task identifier
2. Confirmation that the reviewer did not implement the change
3. Reviewed commit or diff boundary
4. Review scope (`Whole PR` or `Patch`) and pass type (`Fresh discovery` or
   `Finding closure`)
5. Change scale, affected domains, adjacent paths, tests, and omissions
6. Declared focus classes inspected
7. Defect-class queries, hit counts, and dispositions
8. Scores and rationale for each applicable dimension
9. Findings with severity and file/line evidence
10. Residual risks and verification limitations
11. Final verdict: `Pass`, `Changes requested`, or `Blocked`

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
- Duplicate verification commands and reviewer dispatches
- Available review time or token evidence
- Non-generated changed lines and unrelated-scope findings

Raw comment count is not a quality target. Fewer comments are valuable only
when independent review, regression evidence, and post-merge outcomes also
improve.
