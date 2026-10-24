---
name: strelit-release-coordinator
description: Coordinate a Strelit UI Kit release across npm, JSR, GitHub Releases, and the separate Strelit website. Use for a requested new release, release preparation, or resuming a partially completed release; not for ordinary package development or website edits.
---

# Strelit release coordinator

Coordinate one version across `strelit-ui-kit` and the separate `strelit-website` repository. Read [the release runbook](references/release-runbook.md) before starting or resuming. Use the current repository `AGENTS.md` files and scripts as authority when commands or policies change. This skill does not grant permission to publish, merge, deploy, or change external settings.

## Start and resume

1. Identify the target version and requested channels. Check both repository heads, branches, dirty state, Node/npm requirements, the active product-evolution phase, and the exact version already present on npm, JSR, and GitHub. Do not infer current state from a prior handoff.
2. Create a release record under the UI Kit's ignored `.tmp/` directory. Record the target, both repository paths and SHAs, channel state, approved actions, commands and exit codes, artifact identities, URLs, and blockers. Follow `docs/contributing/autonomous-task-recovery.md` for bounded work units and the active ledger. Keep secrets out of the record.
3. After interruption, run the UI Kit's required ledger recovery entry once and resume its ready units. Reconcile every externally visible channel against its recorded artifact before retrying any write. Treat an uncertain publish or deployment result as **unknown**, not failed: inspect the registry, release, check run, or live endpoint first. Never publish the same version a second time to discover whether the first attempt worked.

## Release sequence

Follow the runbook's evidence checklist in order. Stop on a failed required gate, a mismatched artifact, or missing authorization; preserve the checkpoint and report the blocker.

1. **Prepare and freeze the UI Kit.** Align `package.json`, root lockfile, and `jsr.json` to the target version; assess the Bridge contract and major-release review trigger. Run focused preflight checks, API demo, npm payload/runtime checks, and JSR dry run. Prepare a review-ready PR under current `AGENTS.md` policy. Complete the independent whole-diff review and ledger before the high-risk exact-head gate. Freeze and record the reviewed source SHA and release artifact identity before publication.
2. **Publish each core channel deliberately.** Seek explicit authorization for the exact target version and source/artifact before each new npm publish, JSR publish, and GitHub tag/Release. After each write, verify the exact version and artifact from the public destination and checkpoint the result before moving on. A pre-existing matching version is verification evidence, not a reason to publish again; a mismatch is a blocker.
3. **Update the website.** After core channels are verified, pin the published npm version in the website package and lockfile, update both languages' download/tutorial examples and other versioned references, and confirm copied CSS/IIFE assets come from that installed package. Run website verification and build, prepare and review its PR, and record its frozen SHA.
4. **Verify staging and production.** Deploy and verify every website release candidate on staging before production, obtaining authorization for that external write. If staging cannot be deployed and verified, stop before the production merge. Validate the staging download page, demos, and versioned assets. Follow the chosen approved production path: normally the website's Git-connected Cloudflare build after merge; use `deploy:prod` only when a separately authorized manual deployment is intended. Verify the commit's Cloudflare check, live download pages and demos, and npm-backed CDN URLs. A successful script exit alone is insufficient proof of live behavior.
5. **Close out.** Record final URLs, SHAs, version alignment, review verdicts, check/deployment identifiers, live observations, unresolved limitations, and every external write. Stop when all requested channels are verified; do not perform unrelated Cloudflare configuration or credential work.

## Boundaries

- A draft PR, passing local check, or prior-version approval does not authorize a new registry publish or Release. Confirm each irreversible target at the last responsible moment, including exact version, destination, and artifact/source SHA. Apply current repository merge and deployment permissions separately.
- Do not configure OIDC trusted publishing, change Cloudflare build settings, or create persistent token storage as part of an ordinary release. Use the existing credential mechanism only for an authorized direct deploy or API action. Never record token values.
- If any channel has shipped while another fails, preserve its verified state and continue only with the missing channel after diagnosis and any required authorization. Do not bump or replace an already published version to hide a partial release.
