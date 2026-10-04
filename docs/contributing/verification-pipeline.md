# Verification Pipeline Maintenance

`npm run verify:ordered` is the fail-fast repository gate. `scripts/verify-ordered.js` runs each stage sequentially, writes live output to the terminal, and overwrites machine-readable and human-readable results under `.verification/`. A partial successful run is reported as `running`, never `passed`.

## Stage Order

1. TypeScript checks library, public modules, and API demo source without emitting files.
2. Build produces CJS, ESM, declarations, styles, and the API Extractor report.
3. Package-runtime verification executes the packed CommonJS and ES module entry points through the published exports map.
4. Vitest validates runtime, migration, security-limit, and compatibility behavior.
5. Compatibility audit validates generated baseline dispositions.
6. Oxlint and strict TypeDoc validation reject lint warnings and undocumented public API.
7. Prettier checks tracked source and documentation formatting.

The runner stops at the first failed stage and records later stages as skipped. `.verification/summary.json`, `.verification/latest.txt`, and numbered logs are disposable local artifacts and are never committed.

CI checks out complete Git history so risk classification can compare the
declared base commit. A new branch push uses the merge base with the fetched
default branch when GitHub reports an all-zero previous SHA. Tag pushes force
High verification even when the tag points directly at the default branch.

Changed-file risk is fail-closed. High-risk policy and runtime patterns take
precedence, explicitly listed documentation paths are Low, test/demo paths are
Medium, and every unmatched path defaults to Medium. Repository and review
policy under `.github/` is High. Pull-request metadata reads the policy from the
trusted base commit; when a PR introduces the policy and no base copy exists,
the complete PR is treated as High rather than trusting PR-controlled rules.

Risk controls review strength; the verification profile controls test scope.
A diff made entirely of explicitly listed review-governance paths uses
`npm run verify:governance`, which runs test typechecking, governance/ledger/
handoff tests, lint, documentation checks, and formatting. Mixed, unknown,
runtime, build, dependency, packaging, and general CI diffs fail closed to the
product profile and its ordered pipeline. Governance changes remain High risk
and require independent review under either profile.

Vitest bounds file-worker concurrency in `vitest.config.ts` because each jsdom worker has a substantial memory footprint. The default test timeout also accommodates migration tests that launch real Node and TypeScript processes; compile fixtures have a larger explicit bound. Raise either limit only with evidence from both constrained CI and representative developer machines.

## Browser Smoke

`npm run apitest:smoke` builds the Vite API demo, serves its production output, launches Chrome or Edge headlessly, and asserts that Strelit root, item, and brand markers were rendered. Set `STRELIT_BROWSER_PATH` when the browser is not in a standard location. `STRELIT_SMOKE_PORT` can override the default isolated port.

The browser smoke is separate from `verify:ordered` because an external browser
executable is not a package dependency. `npm run verify:pr` includes it for
high-risk product-profile changes after the ordered pipeline and API demo
build. That gate then runs `verify:browser-bundle`, which executes the packed
IIFE and browser-isolation fixtures in sandboxed Chrome. The ordered package
stage checks the packed CJS/ESM entries and IIFE export path without launching
a browser, so `npm run verify:ordered` and Vitest also run on browser-free hosts.
CI, release, and migration environments running the high-risk gate must install
a supported browser.

## Frozen Candidate Review Gate

Verification is necessary evidence but does not establish review coverage. For
a high-risk pull request, use this final sequence:

1. Complete implementation, focused checks, self-review, and finding closure.
2. Commit the candidate so the final review targets an immutable full SHA.
3. Obtain one independent fresh whole-PR review. It must inspect every changed
   path, affected callers, declared focus classes, tests, and omissions.
4. Record each confirmed defect class with its sibling-search query, hit count,
   dispositioned count, and summary. Close every hit.
5. Finish the ledger and run `npm run verify:pr`. It validates review structure
   before running the generated governance or product profile once.
6. Obtain approval on the same SHA from the declared reviewer when repository
   rules require it.

Any new commit invalidates final review and approval. Use focused closure review
while preparing the next freeze; do not run fresh whole-PR discovery per fix
commit. Once the unchanged SHA passes review, verification, dispositions, and
approval, stop.

## Changing The Runner

Keep stages deterministic, non-interactive, and cross-platform. Add a unique ID and monotonically numbered log, preserve fail-fast behavior, and update this document whenever order or semantics change. Do not add commands that modify reviewed source or snapshots to the verification path.
