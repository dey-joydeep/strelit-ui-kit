# Compatibility Audit Maintenance

`scripts/audit-compatibility.js` keeps the modernization decisions reproducible. It compares Strelit's public API and tests with immutable Golden Layout v2.6.0 source at commit `f442a2d` and records v1 feature dispositions.

## Inputs And Outputs

The audit expects sibling source repositories described in `docs/architecture/v1-v2-compatibility-modernization-audit.md`. It reads source and API Extractor data from those baselines and writes the generated JSON inventories under `docs/architecture/generated/`.

The inventories are reviewed artifacts, not runtime inputs:

- `v2-api-disposition.json` maps every baseline declaration to a current API, migration rule, diagnostic, or intentional removal.
- `v2-test-disposition.json` records how every baseline test behavior is preserved, consolidated, replaced, or rejected.
- `v1-api-disposition.json` records selected v1-only features and their long-term product decision.

## Modes

- `npm run audit:compatibility` validates the committed snapshots and their source provenance.
- `npm run audit:compatibility:check` regenerates in memory and fails when tracked output is stale.
- `npm run audit:compatibility:refresh` rewrites snapshots after an intentional mapping change.

Never refresh snapshots merely to make verification pass. Inspect the diff and update mapping logic or the written audit rationale in the same change. A missing current target must receive an explicit migration or product disposition; it must not disappear from the inventory.

When changing public API, baseline mappings, migration rules, or test coverage, run all three modes in order, review the generated diff, then run `npm run verify:ordered`.
