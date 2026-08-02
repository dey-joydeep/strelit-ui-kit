# Verification Pipeline Maintenance

`npm run verify:ordered` is the fail-fast repository gate. `scripts/verify-ordered.js` runs each stage sequentially, writes live output to the terminal, and overwrites machine-readable and human-readable results under `.verification/`. A partial successful run is reported as `running`, never `passed`.

## Stage Order

1. TypeScript checks library, public modules, and API demo source without emitting files.
2. Build produces CJS, ESM, declarations, styles, and the API Extractor report.
3. Vitest validates runtime, migration, security-limit, and compatibility behavior.
4. Compatibility audit validates generated baseline dispositions.
5. Oxlint and strict TypeDoc validation reject lint warnings and undocumented public API.
6. Prettier checks tracked source and documentation formatting.

The runner stops at the first failed stage and records later stages as skipped. `.verification/summary.json`, `.verification/latest.txt`, and numbered logs are disposable local artifacts and are never committed.

CI checks out complete Git history so risk classification can compare the
declared base commit. A new branch push uses the merge base with the fetched
default branch when GitHub reports an all-zero previous SHA. Tag pushes force
High verification even when the tag points directly at the default branch.

Vitest bounds file-worker concurrency in `vitest.config.ts` because each jsdom worker has a substantial memory footprint. The default test timeout also accommodates migration tests that launch real Node and TypeScript processes; compile fixtures have a larger explicit bound. Raise either limit only with evidence from both constrained CI and representative developer machines.

## Browser Smoke

`npm run apitest:smoke` builds the Vite API demo, serves its production output, launches Chrome or Edge headlessly, and asserts that Strelit root, item, and brand markers were rendered. Set `STRELIT_BROWSER_PATH` when the browser is not in a standard location. `STRELIT_SMOKE_PORT` can override the default isolated port.

The browser smoke is a release and migration gate but is separate from `verify:ordered` because an external browser executable is not a package dependency. CI and release environments must install a supported browser and run both commands.

## Changing The Runner

Keep stages deterministic, non-interactive, and cross-platform. Add a unique ID and monotonically numbered log, preserve fail-fast behavior, and update this document whenever order or semantics change. Do not add commands that modify reviewed source or snapshots to the verification path.
