import { execFileSync } from 'node:child_process';
import {
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
  parsePushUpdates(input: string): Array<{
    localRef: string;
    localSha: string;
    remoteRef: string;
    remoteSha: string;
  }>;
  receiptPath(cwd?: string): string;
  validateReceipt(
    receipt: Record<string, unknown> | undefined,
    source: SourceState,
    expectedBaseHead: string,
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

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

describe('review handoff', () => {
  it('rejects missing, stale-head, stale-source, and stale-base receipts', () => {
    const source = { head: 'head-a', fingerprint: 'fingerprint-a' };
    expect(handoff.validateReceipt(undefined, source, 'base-a')).toEqual([
      'No review-ready receipt exists for this checkout.',
    ]);
    expect(
      handoff.validateReceipt(
        {
          version: 1,
          head: 'head-b',
          fingerprint: 'fingerprint-b',
          baseHead: 'base-b',
        },
        source,
        'base-a',
      ),
    ).toEqual([
      'The review-ready receipt targets a different commit.',
      'The review-ready receipt is stale for the current source state.',
      'The review-ready receipt targets a different pull-request base.',
    ]);
  });

  it('accepts a receipt only for the exact source and base', () => {
    const source = { head: 'head-a', fingerprint: 'fingerprint-a' };
    expect(
      handoff.validateReceipt(
        {
          version: 1,
          head: source.head,
          fingerprint: source.fingerprint,
          baseHead: 'base-a',
        },
        source,
        'base-a',
      ),
    ).toEqual([]);
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

  it('installs the tracked hook path without overriding a custom path', () => {
    const cwd = temporaryDirectory();
    git(cwd, 'init');
    mkdirSync(join(cwd, '.githooks'));
    writeFileSync(join(cwd, '.githooks/pre-push'), '#!/bin/sh\n');
    expect(hookInstaller.install(cwd)).toBe('installed');
    expect(git(cwd, 'config', '--local', '--get', 'core.hooksPath')).toBe(
      '.githooks',
    );
    git(cwd, 'config', '--local', 'core.hooksPath', 'custom-hooks');
    expect(() => hookInstaller.install(cwd)).toThrow(/already custom-hooks/u);
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
