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

The final high-risk review is a **fresh discovery pass** over the **whole PR**:
the merge base through the reviewed head, across every changed path. Reviewing
only the latest fix commit, checking closure of known findings, or reusing a
review context already anchored to the known finding list does not satisfy this
gate. Finding closure is a separate pass and must be followed by fresh whole-PR
discovery whenever the head changes.

If an independent reviewer is unavailable, the high-risk change remains
incomplete. A same-context role change, checklist completion, or fresh prompt in
the implementation conversation does not satisfy the independent-review gate.
For a pull request, the declared reviewer must also approve the current head
commit using a GitHub identity different from the PR author. Repository text can
record agent review evidence, but self-attested text alone cannot prove
independence.

## Review Scale And Coverage

Final high-risk review uses a frozen commit SHA. A dirty working-tree review can
support iteration or finding closure but cannot establish merge readiness.

Before discovery, create a coverage manifest mapping every changed path to its
contract, risk domain, adjacent call paths, relevant tests, and reviewer. Use
the risk domains defined in `AGENTS.md`. A review record must identify anything
not inspected; an unexplained coverage gap prevents `Pass`. Pull requests use
the machine-readable `Review Coverage Manifest` format from the PR template so
reviewers can verify exact path coverage, applicable domains, per-domain
reviewer assignments, and substantive adjacent-path and test evidence.
For large high-risk pull requests, the machine-readable `Domain Discovery
Reports` section must also bind every declared domain reviewer to the frozen
base and head, exact assigned paths and domains, adjacent call paths, commands,
findings, and uninspected scope.

A large high-risk pull request changes more than 50 paths, exceeds 1,000
non-generated changed lines, or spans at least three risk domains. It requires:

1. At least two unused independent reviewer contexts assigned across all
   applicable domains
2. Independent domain discovery without sharing findings or intended
   conclusions between discovery reviewers
3. Validation and disposition of every finding before fixes are accepted
4. Finding closure after confirmed defects are fixed
5. An unused independent synthesis reviewer performing fresh whole-PR
   discovery on the frozen SHA

The synthesis reviewer inspects the complete diff, coverage manifest, domain
reports, verification, and dispositions. Domain verdict aggregation does not
replace synthesis, and a single general-purpose reviewer cannot pass a large
high-risk pull request. The synthesis reviewer is the declared final reviewer
and must provide the required independent GitHub approval on the frozen SHA.
For a high-risk pull request that is not large, the normal fresh whole-PR
reviewer remains the declared reviewer and approver; no additional synthesis
context is required.

Medium findings must be closed or explicitly accepted. Acceptance requires a
linked, existing comment on the current PR from its author that states the
accepted Medium count and rationale; a URL-shaped string in the PR body is not
sufficient evidence.

Any new commit invalidates synthesis and GitHub approval. New external findings
on the frozen SHA reopen the gate until validated and dispositioned. Once the
same frozen SHA has complete coverage, successful verification, an applicable
final-review `Pass`, and required approval, repeated reviews are not required
without new code or new external evidence. For a large high-risk pull request,
the applicable final review is synthesis; otherwise it is the normal fresh
whole-PR review.

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
| Review coverage           | Does every changed path and applicable risk domain have an assigned independent reviewer, adjacent-call-path evidence, and an explicit inspected or not-inspected record?                                                          |
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
- A large high-risk pull request relies on one general-purpose reviewer, lacks
  complete path/domain coverage, or lacks an independent synthesis review.
- Review findings lack an explicit disposition and supporting evidence.
- A Medium finding remains without a fix or explicit user acceptance with
  rationale.
- The final review targets a dirty working tree or a SHA other than the current
  pull-request head.
- An interrupted unit is represented as completed, or final synthesis relies on
  partial, stale, or unvalidated checkpoint evidence.

## Required Review Record

The independent reviewer records:

1. Reviewer identity or agent task identifier
2. Confirmation that the reviewer did not implement the change
3. Reviewed commit or diff boundary
4. Review scope (`Whole PR` or `Patch`) and pass type (`Fresh discovery` or
   `Finding closure`)
5. Change scale and applicable risk domains
6. Coverage-manifest reference and paths, domains, adjacent call paths, tests,
   and uninspected areas owned by the reviewer
7. Domain-discovery reviewer identities and synthesis-reviewer identity when
   the large-change gate applies
8. Scores and rationale for each applicable dimension
9. Findings with severity and file/line evidence
10. Finding validation evidence and disposition after the implementer responds
11. Residual risks and verification limitations
12. Final verdict: `Pass`, `Changes requested`, or `Blocked`

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
