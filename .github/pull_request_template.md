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
Reviewed boundary: Pending
Rubric: `docs/contributing/ai-change-quality-rubric.md`
Rubric result: **Pending**
Dimensions below 2: **Pending**
Verdict: **Pending**
Findings: Critical Pending; High Pending; Medium Pending; Low Pending
Open Critical/High findings: **Pending**
Review artifact: Pending
Finding dispositions: Pending
Residual risks: Pending

<!--
High-risk changes require Review mode: **Independent**, a reviewer that did not
implement the change, Rubric result: **Pass**, zero dimensions below 2, Verdict:
**Pass**, numeric finding counts, and zero open Critical/High findings. Low- or
Medium-risk changes use at least **Self-review**. For high risk, Reviewer must be
the GitHub login that approved the current PR head, and Reviewed boundary must be
the current full head SHA. Detailed local reports may live in .tmp/, but
summarize durable evidence here.
-->

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
- [ ] No diagnostics or tests were suppressed to obtain a pass
- [ ] New public behavior is documented
