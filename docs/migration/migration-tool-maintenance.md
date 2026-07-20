# Migration Tool Maintenance

This document describes how to change `scripts/migrate-golden-layout-to-strelit.js` without weakening its consumer-safety contract.

## Processing Pipeline

The command discovers supported text files under `--target`, rejects unsafe filesystem entries, and dispatches content by file type. TypeScript and JavaScript use the TypeScript parser; JSON uses schema-aware layout conversion; styles and markup use bounded text replacements. Dry-run is the default. Write mode is the only path allowed to mutate files.

Source migration proceeds in three stages:

1. Parse valid source and collect declared, imported, and manual-only bindings.
2. Classify package specifiers and known receivers, then collect non-overlapping source edits.
3. Apply edits from the end of the file and add collision-safe ESM or CommonJS imports.

`classifyGoldenLayoutPackageSpecifier()` is the single package-path policy for syntax-aware and text-mode migration. It migrates only published root, style, and package metadata paths. Unknown or internal paths must remain unchanged with a blocking diagnostic. Do not add a separate regex path policy for markup, import maps, or non-layout JSON.

Saved-layout migration walks recognized layout items, converts deterministic v1/v2 fields, and records a manual-review diagnostic whenever a conversion could be lossy or context-dependent.

## Safety Invariants

- Never follow symbolic links, junctions, Windows reparse points, or multiply linked files.
- Resolve the canonical target once and verify real-path containment again before every read and write.
- Keep dry-run byte-preserving and make write mode idempotent.
- Do not guess receiver ownership, dynamic property access, serializability, multiple-root intent, or framework binding behavior.
- Preserve URL query and hash suffixes on migrated style imports.
- Preserve unrelated source text and formatting; this is a targeted codemod, not a formatter.
- Once a module expression is classified as manual-only, preserve its owned expression or atomic declaration plus its local bindings, callbacks, destructuring property names, and binding-owned API expressions; continue migrating unrelated siblings and function bodies.
- Never run identifier or API replacements over unparsed markup or non-layout JSON; only bounded package and selector rewrites are safe there.
- Preserve malformed source unchanged and report it instead of applying edits to a recovery parse tree.
- A warning-free run means only that all recognized transformations were deterministic. The migrated application still requires its own typecheck and behavioral tests.

## Adding A Transformation

1. Decide whether syntax-aware, schema-aware, or literal migration is appropriate.
2. Add the narrowest recognition predicate and a blocking manual-review diagnostic for ambiguous forms.
3. Add CLI-level dry-run and write tests in `test/specs/migration-tool-tests.ts`.
4. Verify byte preservation, idempotence, path safety, and import-name collision handling.
5. Add or update a v1/v2 fixture that compiles against the current public API when the public contract changes.
6. Update `docs/migration/golden-layout-to-strelit.md` with automated and manual behavior.
7. Run `npm run test`, `npm run apitest:smoke`, and `npm run verify:ordered`.

Do not export transformer internals merely to make tests convenient. Tests intentionally launch the actual command so argument parsing, discovery, diagnostics, and filesystem behavior remain covered.

## Release Checklist

- Run the migrator twice over a disposable copy of representative consumer code; the second write run must report no changes.
- Confirm dry-run leaves the tree unchanged with `git status` or a content hash comparison.
- Compile migrated v1 and v2 fixtures against the package API.
- Exercise migrated saved layouts through load, save, and reload.
- Run the real API demo browser smoke check.
- Review every manual-review diagnostic before declaring a consumer migrated.
