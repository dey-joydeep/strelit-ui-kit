## Summary

<!-- Describe the user-facing and maintainer-facing purpose. -->

## What Changed

<!-- List the implementation changes and their observable impact. -->

## Why

<!-- Explain the problem being solved or reason for the change. -->

## Behavioral Contract

<!--
State the observable behavior and invariants that must remain true. Name the
active product-evolution phase and any intentionally changed supported contract.
-->

## Risk Classification

Risk: **Low**

<!-- Choose Low, Medium, or High using AGENTS.md and explain the driver. -->

## Failure and Boundary Cases

<!-- List negative, boundary, compatibility, and lifecycle cases considered. -->

## Test Evidence

<!-- Name tests added or updated and the behavior each proves. -->

## Test Exception

<!--
If executable behavior changed without test changes, explain why tests cannot
reasonably be added. Otherwise state which tests were added.
-->

## Review-Finding Expansion

<!--
For review fixes, state the invariant, defect class, equivalent cases searched,
and regression coverage. Otherwise explain why this is not a review-finding fix.
-->

## Out of Scope

<!-- List related behavior intentionally left unchanged and why. -->

## Scope Justification

<!--
Required above 1,000 non-generated changed lines. Otherwise state that the
change is below the threshold.
-->

## Independent Quality Review

Review mode: **Pending**
Reviewer: Pending
Review scope: **Pending**
Review pass: **Pending**
Reviewed boundary: Pending
Candidate head SHA frozen: **Pending**
Large high-risk PR gate applies: **Pending**
Changed paths: Pending
Non-generated changed lines: Pending
Applicable risk domains: Pending
Coverage manifest: Pending
Coverage gaps: Pending
Domain discovery reviewers: Pending
Synthesis reviewer: Pending
Rubric: `docs/contributing/ai-change-quality-rubric.md`
Rubric result: **Pending**
Dimensions below 2: **Pending**
Verdict: **Pending**
Findings: Critical Pending; High Pending; Medium Pending; Low Pending
Open Critical/High findings: **Pending**
Closed Critical/High findings: **Pending**
Open Medium findings: **Pending**
Closed Medium findings: **Pending**
Accepted Medium findings: **Pending**
Medium acceptance evidence: Pending
Review artifact: Pending
Finding dispositions: Pending
Residual risks: Pending

<!--
High-risk changes require Review mode: **Independent**, a reviewer that did not
implement the change, Review scope: **Whole PR**, Review pass: **Fresh
discovery**, Rubric result: **Pass**, zero dimensions below 2, Verdict: **Pass**,
numeric finding counts, and zero open Critical/High findings. A finding-closure
or latest-patch review cannot satisfy the final high-risk gate. Low- or
Medium-risk changes use at least **Self-review**. For high risk, Reviewer must be
the GitHub login that approved the current PR head, and Reviewed boundary must
be the current full head SHA. For a large high-risk PR, record at least two
unused independent domain-discovery reviewers, complete path/domain coverage,
and an unused independent synthesis reviewer. A single general-purpose reviewer
cannot pass that gate. For a large high-risk PR, Reviewer and Synthesis reviewer
must identify the same final reviewer, who must provide the GitHub approval. For
other high-risk PRs, Synthesis reviewer may be `Not applicable`, and Reviewer is
the required approver. Detailed local reports may live in .tmp/, but summarize
durable evidence here.
If Accepted Medium findings is nonzero, link an existing comment on this PR
authored by the PR author. That comment must state `Accepted Medium findings: N`
and `Rationale: ...` with the same accepted count.
-->

## Review Coverage Manifest

<!--
High-risk PRs require exactly one line per changed path in this format:
Path: path/from/repository/root | Contract: behavioral contract inspected | Domains: Domain one; Domain two | Assignments: Domain one => @reviewer-one; Domain two => @reviewer-two | Adjacent: inspected call paths | Tests: relevant test evidence

The Domains value must exactly equal the applicable canonical domains from
AGENTS.md; extra canonical domains are invalid.
Large high-risk PR entries must be assigned to declared domain-discovery
reviewers, not the PR author or synthesis reviewer. Every applicable domain must
have one assignment; a reviewer may own multiple domains. Non-large high-risk
entries assign every domain to the declared Reviewer. Low/Medium PRs may state
why the manifest is not required.
-->

Pending coverage manifest.

## Domain Discovery Reports

<!--
Large high-risk PRs require exactly one line per declared domain reviewer:
Reviewer: @reviewer-or-agent-id | Base: full-base-SHA | Head: full-head-SHA | Paths: path/one; path/two | Domains: Domain one; Domain two | Coverage: path/one => Domain one; path/two => Domain two | Adjacent: inspected call paths | Commands: commands and inspections run | Findings: finding report or explicit none | Uninspected: explicit omissions or none

The Paths and Domains sets and every Coverage path-domain pair must exactly
match that reviewer's assignments in the coverage manifest. Adjacent must
summarize the inspection evidence. Low, Medium, and non-large High PRs may state
why domain reports are not required.
-->

Pending domain discovery reports.

## Verification

- [ ] `npm run verify:pr`

<!--
List command outcomes and additional checks. A nonzero exit or unhandled error
is not a pass.
-->

## Migration Impact

- [ ] Active product-evolution phase reviewed
- [ ] No phase transition, or transition policy/RFC linked above
- [ ] No public API, config, or CSS namespace change
- [ ] Public API change documented
- [ ] Config migration documented
- [ ] Docs updated
- [ ] Demo or `apitest` updated when relevant

## Checklist

- [ ] Scope is intentionally limited
- [ ] Commit history is reviewable
- [ ] New behavior includes tests or a substantive test exception
- [ ] Review findings were expanded to their defect class
- [ ] Every changed path and applicable risk domain has recorded review coverage
- [ ] Every finding was validated and explicitly dispositioned before closure
- [ ] Large high-risk review used multiple domain reviewers and independent synthesis, or is not applicable
- [ ] Final verification, applicable final review, and approval target the same frozen SHA
- [ ] No Critical or High finding and no unaccepted Medium finding remains
- [ ] No diagnostics or tests were suppressed to obtain a pass
- [ ] New public behavior is documented
