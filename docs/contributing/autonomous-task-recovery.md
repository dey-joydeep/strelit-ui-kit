# Autonomous Task Recovery

This protocol lets an autonomous task survive an interrupted conversation,
agent, subagent, process, or usage window without restarting valid work or
silently treating partial work as complete.

## Recovery Contract

- The coordinator records each work unit before dispatching it.
- Work is split into bounded units with explicit paths, contracts,
  dependencies, and required commands.
- Agents checkpoint cumulative evidence after each reviewable increment.
- A unit is complete only when its structured evidence passes validation.
- Recovery reclaims abandoned running units and resumes unfinished units.
- Evidence is reused only for its recorded scope, source head, and working-tree
  fingerprint.
- A head change selectively invalidates dependent evidence.
- Final synthesis, exact-head approval, and verification never carry across a
  head change.
- Recovery proceeds autonomously unless repository state is contradictory or
  unsafe.

The active ledger lives at `.tmp/agent-work/active.json`. It is disposable
workspace state and is never committed. The checked-in schema and CLI define
its durable contract.

## Work-Unit Design

A unit should cover one behavioral contract or a small, explicit path set and
normally fit within 10 to 20 minutes. Do not dispatch an opaque instruction such
as “review the whole PR.” Split it into domain discovery units followed by a
separate synthesis unit.

Supported unit kinds are:

- `implementation`: an independently recoverable code or documentation change
- `review`: read-only discovery or finding closure over assigned paths
- `verification`: commands proving the current tree or head
- `synthesis`: the final cross-domain judgment and exact-head gate

Before dispatch, record the unit, assigned paths, behavioral contracts,
dependencies, and commands that must pass. An agent receives the unit ID and
writes checkpoints only for that unit.

## Checkpoint Evidence

A checkpoint report is cumulative and contains:

- `lastVerifiedHead`
- `sourceFingerprint`, obtained from the ledger CLI for the exact tracked and
  untracked source state
- `inspectedPaths`
- `remainingPaths`
- `commands`, including command, exit code, and head
- `findingSummary`, including an explicit statement when no findings exist
- `findings`, each with severity, disposition, and summary
- `uninspected`

Completion requires every assigned and adjacent path to be inspected, no
remaining or uninspected scope, every required command to have a successful
current-source receipt, no open findings, and a substantive finding summary. A partial checkpoint remains
`running` or becomes `interrupted`; it cannot satisfy a review gate.

Finishing a ledger requires nonempty work plus completed verification and
synthesis units for the exact current source fingerprint.

## Recovery Procedure

At the start of every session:

1. Inspect `git status --short` and the current head.
2. If the active ledger exists, run exactly one recovery command: use
   `agent:ledger -- enter` at a post-interruption control-prompt boundary;
   otherwise use `npm run agent:ledger -- recover`.
3. Validate the ledger with `npm run verify:agent-ledger`.
4. Resume `interrupted`, `pending`, and `invalidated` units in dependency order.
5. Do not redispatch completed units unless recovery invalidated them.

Recovery changes any abandoned `running` unit to `interrupted`. When the head
or working-tree fingerprint changed, the CLI obtains the changed paths from
Git and the before/after dirty-path inventories. If the comparison is not
available, it fails closed by invalidating all review, verification, and
synthesis evidence. Invalidation propagates through unit dependencies.

### Recovery Entry After Interruption

If an agent or tool reports a terminal interruption, including cancellation,
connection loss, process failure, or a usage limit, the coordinator immediately
records `agent:ledger -- interrupt --unit <id>` when it remains available. If
the coordinator is also interrupted, the next user control prompt is the
recovery boundary; the user does not need to identify the failed unit or
reconstruct its state.

Before responding to `continue`, `status`, `brief summary`, or equivalent
wording after an interruption, run exactly one recovery entry:

```powershell
npm run agent:ledger -- enter --intent continue
npm run agent:ledger -- enter --intent status
npm run agent:ledger -- enter --intent summary
```

At this boundary, `enter` replaces the ordinary startup `recover`; do not run
both commands for the same prompt.

The command performs normal source-aware recovery and returns `readyUnits` in
ledger order. A continue entry resumes those units in dependency order. A
status or summary entry reports the recovered state and does not create or
dispatch replacement work unless an earlier standing instruction already
requires continued execution. If no active ledger exists, the command reports
`no-active-ledger` with an empty ready list. Repeating the command is
idempotent: completed evidence remains complete and already interrupted units
remain resumable.

Recovery does not bypass unavailable external capacity. A unit remains
interrupted until an eligible agent can resume it, while unrelated ready work
may continue.

A completed ledger remains complete during later startup recovery and may be
replaced by the next `init`. Recovery never resurrects it as active work.

## Selective Invalidation

After a head change:

- Completed implementation units remain historical evidence.
- Pending and interrupted units target the new head.
- A completed scoped review becomes `carried-forward` only when none of its
  assigned or adjacent paths changed.
- A review intersecting changed paths becomes `invalidated`.
- Verification and synthesis units become `invalidated`.
- Any final GitHub approval must target the new exact head.

Carried-forward domain reports are inputs to a new synthesis; they are not
themselves exact-head whole-PR approval.

## Failure-Mode Matrices

High-risk lifecycle and transaction units must include applicable combinations
from this matrix in their contracts or findings:

| Dimension    | Cases                                                                         |
| ------------ | ----------------------------------------------------------------------------- |
| Stage        | construct, commit, rollback, cleanup                                          |
| Thrown value | `Error`, `null`, `undefined`, partial success                                 |
| Resource     | DOM, listener, timer, storage, window, ownership collection                   |
| Outcome      | primary error retained, cleanup completed, retry possible, state serializable |

Documentation examples that claim to compile must have a required compilation
command. Governance validators must include contradictory and malformed input,
not only successful template examples.

## CLI

Examples:

```powershell
npm run agent:ledger -- init --task PR-1 --base <sha> --head <sha>
npm run agent:ledger -- add --unit runtime-popouts --kind review --paths src/ts/layout-manager.ts,src/ts/controls/browser-popout.ts --contracts "rollback ownership; listener restoration"
npm run agent:ledger -- start --unit runtime-popouts --owner agent-id
npm run agent:ledger -- fingerprint
npm run agent:ledger -- checkpoint --unit runtime-popouts --report .tmp/runtime-popouts-report.json
npm run agent:ledger -- complete --unit runtime-popouts --report .tmp/runtime-popouts-report.json
npm run agent:ledger -- interrupt --unit runtime-popouts
npm run agent:ledger -- recover
npm run agent:ledger -- enter --intent continue
npm run agent:ledger -- finish
npm run agent:ledger -- status
npm run verify:agent-ledger
```

For high-risk pull-request work, initialize the definitive gate instead:

```powershell
npm run agent:ledger -- init --mode pr --implementer <identity> --task PR-1 --base <ref> --head <sha>
```

This mode records the merge-base diff, canonical path-domain coverage,
non-generated line count, and large-PR classification. Review and synthesis
units declare `--reviewer`, `--scope`, `--pass`, and semicolon-delimited
`--domains`. Their checkpoint reports include a `coverage` entry for every
assigned path with its exact domains, declared contract, inspected adjacent
paths, and verification commands. `finish` closes structurally complete work;
the subsequent definitive gate rejects missing or duplicate coverage,
self-review, non-fresh evidence, incomplete verification, a dirty tree, and
stale source. After finishing, `npm run verify:review-ready` revalidates the persisted gate.
The normal local `npm run verify:pr` invokes this final gate for high-risk work;
GitHub Actions instead validates committed PR metadata and approval state.
Use trusted `GITHUB_BASE_SHA` or configured `STRELIT_REVIEW_BASE_REF` for PRs
whose target is not the default branch. `verify:review-ready` rejects CLI base
and classification overrides so a caller cannot narrow or skip the definitive
scope.

The local ledger can validate declared context separation and exact review
boundaries, but editable identity strings are not cryptographic proof of
independence. Preserve the orchestrator task identifiers in the review record;
GitHub's different-identity approval remains authoritative. Verification is
execution-backed only when `verify:review-ready` runs the required commands and
validates the ledger in that same process; hand-authored command receipts alone
cannot satisfy the definitive gate.

Use `--root <directory>` for isolated tests or alternate workspaces. Ledger
writes are atomic, and ledger/report paths reject symbolic-link or junction
traversal. Invalid input leaves the previous ledger unchanged.
