import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

interface SourceState {
  readonly fingerprint: string;
  readonly head: string;
}

interface ReviewHandoffModule {
  hasReviewRequest(marker: string, comments: Array<{ body?: string }>): boolean;
  parsePushUpdates(input: string): Array<{
    localRef: string;
    localSha: string;
    remoteRef: string;
    remoteSha: string;
  }>;
  parseArguments(args: string[]): {
    command: string;
    options: Record<string, string | boolean>;
  };
  receiptPath(cwd?: string): string;
  prePush(input: string, cwd?: string): void;
  reviewRequestMarker(
    pullRequest: string,
    head: string,
    baseTip: string,
  ): string;
  validateReceipt(
    receipt: Record<string, unknown> | undefined,
    source: SourceState,
    expectedBaseHead: string,
    expectedBaseTip: string,
  ): string[];
  validatePullRequestBoundary(
    pullRequest: string,
    remotePullRequest: { headRefOid: string; baseRefOid: string },
    source: SourceState,
    receipt: { baseTip: string },
  ): string[];
}

interface HookInstallerModule {
  install(cwd?: string): string;
}

const require = createRequire(import.meta.url);
const handoff =
  require('../../scripts/review-handoff.js') as ReviewHandoffModule;
const hookInstaller =
  require('../../scripts/install-git-hooks.js') as HookInstallerModule;
const temporaryPaths: string[] = [];

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), 'strelit-review-handoff-'));
  temporaryPaths.push(path);
  return path;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initializeReviewRepository(cwd: string): string {
  git(cwd, 'init');
  git(cwd, 'config', 'user.email', 'review@example.test');
  git(cwd, 'config', 'user.name', 'Review Test');
  writeFileSync(join(cwd, 'README.md'), 'base\n');
  git(cwd, 'add', 'README.md');
  git(cwd, 'commit', '-m', 'base');
  git(cwd, 'branch', '-M', 'main');
  const base = git(cwd, 'rev-parse', 'HEAD');
  git(cwd, 'update-ref', 'refs/remotes/origin/main', base);
  return base;
}

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

describe('review handoff', () => {
  it('rejects missing, stale-head, stale-source, and stale-base receipts', () => {
    const source = { head: 'head-a', fingerprint: 'fingerprint-a' };
    expect(
      handoff.validateReceipt(undefined, source, 'base-a', 'base-tip-a'),
    ).toEqual(['No review-ready receipt exists for this checkout.']);
    expect(
      handoff.validateReceipt(
        {
          version: 2,
          head: 'head-b',
          fingerprint: 'fingerprint-b',
          baseHead: 'base-b',
          baseTip: 'base-tip-b',
        },
        source,
        'base-a',
        'base-tip-a',
      ),
    ).toEqual([
      'The review-ready receipt targets a different commit.',
      'The review-ready receipt is stale for the current source state.',
      'The review-ready receipt targets a different pull-request base.',
      'The review-ready receipt targets a different pull-request base tip.',
    ]);
  });

  it('accepts a receipt only for the exact source and base', () => {
    const source = { head: 'head-a', fingerprint: 'fingerprint-a' };
    expect(
      handoff.validateReceipt(
        {
          version: 2,
          head: source.head,
          fingerprint: source.fingerprint,
          baseHead: 'base-a',
          baseTip: 'base-tip-a',
        },
        source,
        'base-a',
        'base-tip-a',
      ),
    ).toEqual([]);
  });

  it('rejects a cloud request when the PR head or base differs', () => {
    expect(
      handoff.validatePullRequestBoundary(
        '1',
        { headRefOid: 'remote-head', baseRefOid: 'remote-base' },
        { head: 'reviewed-head', fingerprint: 'fingerprint' },
        { baseTip: 'reviewed-base' },
      ),
    ).toEqual([
      'Pull request #1 targets remote-head, not local HEAD reviewed-head. Push first.',
      'Pull request #1 base remote-base does not match reviewed base reviewed-base.',
    ]);
  });

  it('checks high-risk HEAD pushes for branch, HEAD, and SHA refspecs', () => {
    const cwd = temporaryDirectory();
    const base = initializeReviewRepository(cwd);
    mkdirSync(join(cwd, 'scripts'));
    writeFileSync(
      join(cwd, 'scripts/high-risk.js'),
      'module.exports = true;\n',
    );
    git(cwd, 'add', 'scripts/high-risk.js');
    git(cwd, 'commit', '-m', 'high risk');
    const head = git(cwd, 'rev-parse', 'HEAD');

    for (const localRef of ['refs/heads/main', 'HEAD', head]) {
      expect(() =>
        handoff.prePush(`${localRef} ${head} refs/heads/topic ${base}\n`, cwd),
      ).toThrow(/No review-ready receipt exists/u);
    }
  });

  it('classifies the committed candidate independently of worktree edits', () => {
    const highRiskCwd = temporaryDirectory();
    const highRiskBase = initializeReviewRepository(highRiskCwd);
    mkdirSync(join(highRiskCwd, 'scripts'));
    const highRiskPath = join(highRiskCwd, 'scripts/high-risk.js');
    writeFileSync(highRiskPath, 'module.exports = true;\n');
    git(highRiskCwd, 'add', 'scripts/high-risk.js');
    git(highRiskCwd, 'commit', '-m', 'high risk');
    const highRiskHead = git(highRiskCwd, 'rev-parse', 'HEAD');
    rmSync(highRiskPath);
    expect(() =>
      handoff.prePush(
        `HEAD ${highRiskHead} refs/heads/topic ${highRiskBase}\n`,
        highRiskCwd,
      ),
    ).toThrow(/clean committed candidate/u);

    const safeCwd = temporaryDirectory();
    const safeHead = initializeReviewRepository(safeCwd);
    mkdirSync(join(safeCwd, 'scripts'));
    writeFileSync(join(safeCwd, 'scripts/uncommitted.js'), 'dirty\n');
    expect(() =>
      handoff.prePush(
        `HEAD ${safeHead} refs/heads/topic ${safeHead}\n`,
        safeCwd,
      ),
    ).not.toThrow();
  });

  it('parses the updates supplied to a pre-push hook', () => {
    expect(
      handoff.parsePushUpdates(
        'refs/heads/topic aaa refs/heads/topic bbb\nrefs/tags/v1 ccc refs/tags/v1 000\n',
      ),
    ).toEqual([
      {
        localRef: 'refs/heads/topic',
        localSha: 'aaa',
        remoteRef: 'refs/heads/topic',
        remoteSha: 'bbb',
      },
      {
        localRef: 'refs/tags/v1',
        localSha: 'ccc',
        remoteRef: 'refs/tags/v1',
        remoteSha: '000',
      },
    ]);
  });

  it('forwards hook input without passing Git hook positional arguments', () => {
    const hook = readFileSync(resolve('.githooks/pre-push'), 'utf8');
    expect(hook).toContain('node scripts/review-handoff.js pre-push');
    expect(hook).not.toContain('"$@"');
  });

  it('stores receipts in the checkout git directory', () => {
    const cwd = temporaryDirectory();
    git(cwd, 'init');
    expect(handoff.receiptPath(cwd)).toBe(
      join(
        git(cwd, 'rev-parse', '--absolute-git-dir'),
        'strelit',
        'review-ready.json',
      ),
    );
  });

  it('integrates with default hooks without disabling existing hooks', () => {
    const cwd = temporaryDirectory();
    initializeReviewRepository(cwd);
    const remote = temporaryDirectory();
    git(remote, 'init', '--bare');
    git(cwd, 'remote', 'add', 'origin', remote);
    mkdirSync(join(cwd, '.githooks'));
    const trackedHook = join(cwd, '.githooks/pre-push');
    writeFileSync(trackedHook, '#!/bin/sh\nprintf tracked >> hook-order.txt\n');
    chmodSync(trackedHook, 0o755);
    const hooksDirectory = join(
      git(cwd, 'rev-parse', '--absolute-git-dir'),
      'hooks',
    );
    writeFileSync(join(hooksDirectory, 'pre-commit'), '#!/bin/sh\nexit 0\n');
    const existingPrePush = join(hooksDirectory, 'pre-push');
    writeFileSync(
      existingPrePush,
      '#!/bin/sh\nprintf previous- >> hook-order.txt\n',
    );
    chmodSync(existingPrePush, 0o755);
    git(cwd, 'config', '--local', 'core.hooksPath', '.githooks');
    expect(hookInstaller.install(cwd)).toBe('installed');
    expect(() =>
      git(cwd, 'config', '--local', '--get', 'core.hooksPath'),
    ).toThrow();
    expect(readFileSync(join(hooksDirectory, 'pre-commit'), 'utf8')).toBe(
      '#!/bin/sh\nexit 0\n',
    );
    expect(
      readFileSync(join(hooksDirectory, 'pre-push.strelit-existing'), 'utf8'),
    ).toBe('#!/bin/sh\nprintf previous- >> hook-order.txt\n');
    expect(readFileSync(join(hooksDirectory, 'pre-push'), 'utf8')).toContain(
      '# strelit-managed-pre-push',
    );
    git(cwd, 'push', 'origin', 'main');
    expect(readFileSync(join(cwd, 'hook-order.txt'), 'utf8')).toBe(
      'previous-tracked',
    );
    expect(hookInstaller.install(cwd)).toBe('installed');
  });

  it('installs default hooks in the common Git directory for linked worktrees', () => {
    const cwd = temporaryDirectory();
    initializeReviewRepository(cwd);
    mkdirSync(join(cwd, '.githooks'));
    writeFileSync(join(cwd, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n');
    git(cwd, 'add', '.githooks/pre-push');
    git(cwd, 'commit', '-m', 'add tracked hook');
    const worktreeParent = temporaryDirectory();
    const worktree = join(worktreeParent, 'linked');
    git(cwd, 'worktree', 'add', '-b', 'linked', worktree);

    expect(hookInstaller.install(worktree)).toBe('installed');

    const commonHooksDirectory = join(
      git(worktree, 'rev-parse', '--path-format=absolute', '--git-common-dir'),
      'hooks',
    );
    const worktreeHooksDirectory = join(
      git(worktree, 'rev-parse', '--absolute-git-dir'),
      'hooks',
    );
    expect(
      readFileSync(join(commonHooksDirectory, 'pre-push'), 'utf8'),
    ).toContain('# strelit-managed-pre-push');
    expect(existsSync(join(worktreeHooksDirectory, 'pre-push'))).toBe(false);
  });

  it('does not override a custom hook path', () => {
    const cwd = temporaryDirectory();
    git(cwd, 'init');
    mkdirSync(join(cwd, '.githooks'));
    writeFileSync(join(cwd, '.githooks/pre-push'), '#!/bin/sh\n');
    git(cwd, 'config', '--local', 'core.hooksPath', 'custom-hooks');
    expect(() => hookInstaller.install(cwd)).toThrow(/already custom-hooks/u);
  });

  it('keys Codex review requests by PR, exact head, and base', () => {
    const marker = handoff.reviewRequestMarker('1', 'head-a', 'base-a');
    expect(marker).toContain('pr=1 head=head-a base=base-a');
    expect(
      handoff.hasReviewRequest(marker, [{ body: `@codex review\n${marker}` }]),
    ).toBe(true);
    expect(
      handoff.hasReviewRequest(marker, [
        {
          body: `@codex review\n${handoff.reviewRequestMarker('1', 'head-b', 'base-a')}`,
        },
      ]),
    ).toBe(false);
  });

  it('requires an explicit reopen option for intentional repeat requests', () => {
    expect(
      handoff.parseArguments(['request', '--pr', '1', '--reopen']),
    ).toEqual({
      command: 'request',
      options: { pr: '1', reopen: true },
    });
  });

  it('does nothing outside a git checkout', () => {
    const cwd = temporaryDirectory();
    mkdirSync(join(cwd, 'nested'));
    writeFileSync(join(cwd, 'marker'), 'not a repository');
    expect(readFileSync(join(cwd, 'marker'), 'utf8')).toBe('not a repository');
    expect(hookInstaller.install(join(cwd, 'nested'))).toBe(
      'not-a-git-checkout',
    );
  });
});
