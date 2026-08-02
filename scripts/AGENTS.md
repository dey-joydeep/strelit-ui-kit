# Scripts Change Rules

These rules extend the repository root `AGENTS.md` for executable scripts and
codemods.

## Safety Contract

Before changing a script, define which inputs are:

- transformed automatically;
- preserved with a blocking diagnostic;
- rejected as invalid or unsafe.

Do not allow an unclassified input to reach a catch-all rewrite.

Script changes MUST verify, where applicable:

- idempotence;
- deterministic output;
- byte preservation for unsupported or malformed input;
- filesystem containment and link safety;
- syntax validity of generated source;
- preservation of comments, directives, shebangs, aliases, suffixes, and unrelated code;
- explicit diagnostics for ambiguous or lossy behavior.

When syntax or symbol ownership matters, use the parser and binding information.
Do not add a regex rewrite as a parallel source of semantic truth.

## Migration Script

Changes to `migrate-golden-layout-to-strelit.js` MUST:

1. Classify the input family before transforming it
2. Add table-driven coverage for equivalent syntax forms and boundary cases
3. Verify a second migration produces no change
4. Compile relevant migrated fixtures against the public API
5. Exercise migrated saved layouts through load, save, and reload when config behavior changes
6. Keep unsupported forms unchanged and emit a manual-review diagnostic

Every migration review finding must become a permanent regression fixture for
the entire defect class, not only the exact reported spelling.
