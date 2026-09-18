# Product Evolution Policy

This document is the canonical source for deciding which compatibility
contracts constrain product development. It prevents a temporary migration
phase from becoming a permanent architectural restriction.

## Active Phase

- **Phase:** Bridge
- **Effective:** 2026-08-02
- **Review trigger:** 2027-08-01, before every major release, or when an
  approved product redesign materially changes the supported contract
- **Automatic transition:** Forbidden

The review trigger is not an expiry date. Reaching it does not silently relax
compatibility. Maintainers must either renew the Bridge phase or commit an
explicit phase transition with the evidence described below.

## Contract Precedence

When sources disagree, use this order:

1. The current task's explicitly approved product decision or scoped breaking
   change
2. The documented, currently supported Strelit contract
3. The active phase in this policy
4. Golden Layout baselines and historical behavior

Golden Layout behavior is migration and regression evidence, not a permanent
product-design constraint. General engineering invariants such as data safety,
failure atomicity, deterministic migration, diagnostics, and lifecycle cleanup
remain applicable in every phase.

## Phase Model

| Phase               | Product-development rule                                                                                                              | Golden Layout baseline                                                                | Compatibility audit                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Bridge** (active) | Preserve supported Strelit API, saved-config, packaging, and consumer behavior unless the task explicitly authorizes a scoped change. | Maintain migration coverage and explicit dispositions.                                | Required by the normal high-risk verification pipeline.                        |
| **Evolution**       | Intentional breaking changes are allowed with a version boundary, rationale, tests, and migration or deprecation plan.                | Evidence for migration decisions, not a parity target.                                | Remains a disposition ledger; may move to release-specific verification.       |
| **Redesign**        | Approved Strelit architecture and product contracts are authoritative; inherited classes and behavior may be replaced or removed.     | Historical input only, except for any explicitly supported migration path.            | Records replacement, removal, or migration outcomes; it must not force parity. |
| **Legacy closed**   | Only contracts explicitly listed as supported remain binding.                                                                         | Migration tooling is archived, separated, or maintained under its own support policy. | Removed from universal verification when the transition record authorizes it.  |

“Preserve compatibility” always means preserve the active supported Strelit
contract for the current phase. It does not mean preserve every inherited
Golden Layout class, internal structure, API, or incidental behavior.

## Intentional Contract Changes

A task may intentionally change a supported contract without changing the
repository-wide phase when its scope is explicit. The change must identify:

1. The contract being changed and why
2. The first affected release or version boundary
3. Consumer and saved-data impact
4. Migration, deprecation, diagnostic, or intentional no-migration decision
5. Tests for the new contract and relevant transition behavior
6. Documentation and compatibility-audit disposition updates

Ambiguous feature or refactoring requests do not authorize unrelated breaking
changes. Agents should request a product decision only when the missing choice
would materially alter the result.

## Phase Transition Record

Changing the active phase requires a reviewed repository change that updates
this document and states:

- The new phase and effective release
- Supported and unsupported public contracts
- Saved-config and persistence support windows
- Migration-tool ownership and support status
- Compatibility-audit mode and verification-pipeline changes
- User-facing migration or redesign documentation
- Independent-review evidence for the complete transition diff

An explicit user direction may authorize preparation of this transition, but
the phase changes only when the policy update and its required evidence are
committed together. Dates, stale roadmap text, or an agent's inference cannot
change the phase automatically.

## Current Bridge Obligations

During the active Bridge phase:

- Preserve documented Strelit behavior by default
- Allow scoped intentional contract changes with transition evidence
- Keep Golden Layout migration tooling conservative and deterministic
- Keep `audit:compatibility` in high-risk verification
- Treat audit entries as dispositions: preserve, replace, migrate, diagnose,
  or intentionally remove
- Review this phase at the trigger date without presuming renewal or redesign
