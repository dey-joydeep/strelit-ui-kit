import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface CommandReceipt {
  command: string;
  exitCode: number;
  head: string;
  sourceFingerprint: string;
}

interface Checkpoint {
  lastVerifiedHead: string;
  sourceFingerprint: string;
  reviewedBase?: string;
  reviewedHead?: string;
  inspectedPaths: string[];
  remainingPaths: string[];
  commands: CommandReceipt[];
  findingSummary: string;
  findings: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    status: 'open' | 'closed' | 'accepted';
    summary: string;
    acceptanceEvidence?: string;
  }>;
  uninspected: string[];
  verdict?: 'pass' | 'changes-requested' | 'blocked';
  coverage?: Array<{
    path: string;
    domains: string[];
    contract: string;
    adjacentPaths: string[];
    tests: string[];
  }>;
}

interface ReviewAssignment {
  reviewer: string;
  scope: 'domain' | 'whole-pr';
  pass: 'fresh-discovery' | 'finding-closure';
  domains: string[];
}

interface WorkUnit {
  id: string;
  kind: 'implementation' | 'review' | 'verification' | 'synthesis';
  status:
    | 'pending'
    | 'running'
    | 'interrupted'
    | 'completed'
    | 'carried-forward'
    | 'invalidated';
  head: string;
  sourceFingerprint?: string;
  assignedPaths: string[];
  adjacentPaths: string[];
  contracts: string[];
  dependencies: string[];
  requiredCommands: string[];
  owner?: string;
  startedAt?: string;
  checkpoint?: Checkpoint;
  carryForward?: {
    fromHead: string;
    toHead: string;
    changedPaths: string[];
  };
  review?: ReviewAssignment;
}

interface ReviewGate {
  mode: 'pull-request';
  implementer: string;
  risk: 'low' | 'medium' | 'high';
  requiredPaths: string[];
  requiredCoverage: Array<{ path: string; domains: string[] }>;
  applicableDomains: string[];
  nonGeneratedLines: number;
  largeHighRisk: boolean;
}

interface Ledger {
  schemaVersion: number;
  taskId: string;
  baseHead: string;
  currentHead: string;
  currentFingerprint: string;
  workingPaths: string[];
  status: 'active' | 'complete';
  units: WorkUnit[];
  updatedAt: string;
  reviewGate?: ReviewGate;
}

interface LedgerModule {
  currentSourceState(cwd?: string): {
    head: string;
    fingerprint: string;
    workingPaths: string[];
  };
  gitChangedPaths(
    fromHead: string,
    toHead: string,
    cwd: string,
  ): string[] | undefined;
  execute(
    command: string,
    options: Record<string, string | boolean>,
    cwd?: string,
    now?: Date,
  ): Ledger;
  normalizePath(path: string): string;
  recoverLedger(
    ledger: Ledger,
    newHead: string,
    changedPaths: string[] | undefined,
    newFingerprint?: string,
    newWorkingPaths?: string[],
  ): {
    ledger: Ledger;
    comparisonAvailable: boolean;
    changedPaths: string[];
    headChanged: boolean;
    sourceChanged: boolean;
  };
  validateLedger(ledger: Ledger): Ledger;
  validatePullRequestGate(
    ledger: Ledger,
    sourceState: { head: string; fingerprint: string; workingPaths: string[] },
    options?: {
      requireComplete?: boolean;
      expectedBaseHead?: string;
      expectedReviewGate?: ReviewGate;
      executedCommands?: string[];
    },
  ): Ledger;
  summarize(ledger: Ledger): { work: Array<Record<string, unknown>> };
}

const require = createRequire(import.meta.url);
const ledgerModule =
  require('../../scripts/agent-work-ledger.js') as LedgerModule;
const firstHead = '1111111111111111111111111111111111111111';
const secondHead = '2222222222222222222222222222222222222222';
const thirdHead = '3333333333333333333333333333333333333333';

function withTemporaryRepository(run: (repository: string) => void): void {
  const repository = mkdtempSync(join(tmpdir(), 'strelit-agent-ledger-'));
  try {
    execFileSync('git', ['init'], { cwd: repository });
    execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], {
      cwd: repository,
    });
    execFileSync('git', ['config', 'user.name', 'Strelit Tests'], {
      cwd: repository,
    });
    writeFileSync(join(repository, 'README.md'), 'base\n');
    writeFileSync(join(repository, '.gitignore'), '.tmp/\n');
    mkdirSync(join(repository, 'src', 'ts', 'controls'), { recursive: true });
    writeFileSync(
      join(repository, 'src', 'ts', 'layout-manager.ts'),
      'layout\n',
    );
    writeFileSync(
      join(repository, 'src', 'ts', 'controls', 'browser-popout.ts'),
      'popout\n',
    );
    execFileSync('git', ['add', '.'], { cwd: repository });
    execFileSync('git', ['commit', '-m', 'Create fixture.'], {
      cwd: repository,
    });
    execFileSync('git', ['branch', '-M', 'main'], { cwd: repository });
    execFileSync('git', ['switch', '-c', 'feature'], { cwd: repository });
    run(repository);
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
}

function initialize(repository: string): void {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  ledgerModule.execute(
    'init',
    { task: 'PR-1', base: head, head },
    repository,
    new Date('2026-08-13T00:00:00.000Z'),
  );
}

function addReview(repository: string): void {
  ledgerModule.execute(
    'add',
    {
      unit: 'runtime-review',
      kind: 'review',
      paths: 'src/ts/layout-manager.ts',
      adjacent: 'src/ts/controls/browser-popout.ts',
      contracts: 'rollback ownership;listener cleanup',
      commands: 'npm test',
    },
    repository,
  );
}

function writeReport(
  repository: string,
  overrides: Partial<Checkpoint> = {},
): string {
  const ledger = JSON.parse(
    readFileSync(join(repository, '.tmp', 'agent-work', 'active.json'), 'utf8'),
  ) as Ledger;
  const report: Checkpoint = {
    lastVerifiedHead: ledger.currentHead,
    sourceFingerprint: ledger.currentFingerprint,
    inspectedPaths: [
      'src/ts/layout-manager.ts',
      'src/ts/controls/browser-popout.ts',
    ],
    remainingPaths: [],
    commands: [
      {
        command: 'npm test',
        exitCode: 0,
        head: ledger.currentHead,
        sourceFingerprint: ledger.currentFingerprint,
      },
    ],
    findingSummary: 'No findings in the assigned contract.',
    findings: [],
    uninspected: [],
    ...overrides,
  };
  const reportPath = join(repository, '.tmp', 'report.json');
  mkdirSync(join(repository, '.tmp'), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report));
  return reportPath;
}

function completedUnit(
  id: string,
  kind: WorkUnit['kind'],
  paths: string[],
): WorkUnit {
  return {
    id,
    kind,
    status: 'completed',
    head: firstHead,
    sourceFingerprint: 'a'.repeat(64),
    assignedPaths: paths,
    adjacentPaths: [],
    contracts: ['Inspect the assigned contract.'],
    dependencies: [],
    requiredCommands: [],
    checkpoint: {
      lastVerifiedHead: firstHead,
      sourceFingerprint: 'a'.repeat(64),
      inspectedPaths: paths,
      remainingPaths: [],
      commands: [],
      findingSummary: 'No findings in the assigned contract.',
      findings: [],
      uninspected: [],
    },
  };
}

function retargetCompletedUnit(
  unit: WorkUnit,
  source: { head: string; fingerprint: string },
  inspectedPaths: string[],
): WorkUnit {
  unit.head = source.head;
  unit.sourceFingerprint = source.fingerprint;
  unit.checkpoint = {
    lastVerifiedHead: source.head,
    sourceFingerprint: source.fingerprint,
    inspectedPaths,
    remainingPaths: [],
    commands: unit.requiredCommands.map((command) => ({
      command,
      exitCode: 0,
      head: source.head,
      sourceFingerprint: source.fingerprint,
    })),
    findingSummary: 'No findings in the assigned contract.',
    findings: [],
    uninspected: [],
    verdict: 'pass',
  };
  return unit;
}

function addPathEvidence(
  unit: WorkUnit,
  path: string,
  domains: string[],
  adjacentPath: string,
  command: string,
): void {
  unit.checkpoint!.coverage = [
    {
      path,
      domains,
      contract: unit.contracts[0],
      adjacentPaths: [adjacentPath],
      tests: [command],
    },
  ];
}

function gateOptions(ledger: Ledger): {
  expectedBaseHead: string;
  expectedReviewGate: ReviewGate;
  executedCommands: string[];
} {
  return {
    expectedBaseHead: ledger.baseHead,
    expectedReviewGate: structuredClone(ledger.reviewGate!),
    executedCommands: [
      'npm run verify:ordered',
      'npm run apitest:build',
      'npm run apitest:smoke',
    ],
  };
}

function bindReviewBoundary(unit: WorkUnit, ledger: Ledger): void {
  unit.checkpoint!.reviewedBase = ledger.baseHead;
  unit.checkpoint!.reviewedHead = ledger.currentHead;
}

describe('agent work ledger', () => {
  it('records work before dispatch and reclaims an interrupted running unit', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      addReview(repository);
      ledgerModule.execute(
        'start',
        { unit: 'runtime-review', owner: 'agent-1' },
        repository,
      );

      const recovered = ledgerModule.execute('recover', {}, repository);

      expect(recovered.units[0]).toMatchObject({
        id: 'runtime-review',
        status: 'interrupted',
      });
      expect(recovered.units[0].owner).toBeUndefined();
    });
  });

  it('rejects partial completion and preserves the previous ledger', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      addReview(repository);
      ledgerModule.execute(
        'start',
        { unit: 'runtime-review', owner: 'agent-1' },
        repository,
      );
      const reportPath = writeReport(repository, {
        inspectedPaths: [],
        remainingPaths: ['src/ts/layout-manager.ts'],
      });
      const ledgerPath = join(repository, '.tmp', 'agent-work', 'active.json');
      const before = readFileSync(ledgerPath, 'utf8');

      expect(() =>
        ledgerModule.execute(
          'complete',
          { unit: 'runtime-review', report: reportPath },
          repository,
        ),
      ).toThrow('uninspected assigned paths');
      expect(readFileSync(ledgerPath, 'utf8')).toBe(before);
    });
  });

  it('requires successful command evidence from the current head', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      addReview(repository);
      ledgerModule.execute(
        'start',
        { unit: 'runtime-review', owner: 'agent-1' },
        repository,
      );
      const reportPath = writeReport(repository, {
        commands: [
          {
            command: 'npm test',
            exitCode: 1,
            head: firstHead,
            sourceFingerprint: 'a'.repeat(64),
          },
        ],
      });

      expect(() =>
        ledgerModule.execute(
          'complete',
          { unit: 'runtime-review', report: reportPath },
          repository,
        ),
      ).toThrow('lacks a successful current-head receipt');
    });
  });

  it('completes a fully evidenced unit and permits dependent synthesis', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      addReview(repository);
      ledgerModule.execute(
        'add',
        {
          unit: 'verification',
          kind: 'verification',
          contracts: 'Verify the exact source.',
          dependencies: 'runtime-review',
        },
        repository,
      );
      ledgerModule.execute(
        'add',
        {
          unit: 'synthesis',
          kind: 'synthesis',
          contracts: 'Synthesize all domain reports.',
          dependencies: 'runtime-review,verification',
        },
        repository,
      );
      expect(() =>
        ledgerModule.execute(
          'start',
          { unit: 'synthesis', owner: 'agent-2' },
          repository,
        ),
      ).toThrow('dependency is not complete');

      ledgerModule.execute(
        'start',
        { unit: 'runtime-review', owner: 'agent-1' },
        repository,
      );
      const reportPath = writeReport(repository);
      ledgerModule.execute(
        'complete',
        { unit: 'runtime-review', report: reportPath },
        repository,
      );
      ledgerModule.execute(
        'start',
        { unit: 'verification', owner: 'agent-verify' },
        repository,
      );
      ledgerModule.execute(
        'complete',
        { unit: 'verification', report: reportPath },
        repository,
      );
      const result = ledgerModule.execute(
        'start',
        { unit: 'synthesis', owner: 'agent-2' },
        repository,
      );

      expect(result.units.map(({ status }) => status)).toEqual([
        'completed',
        'completed',
        'running',
      ]);
      ledgerModule.execute(
        'complete',
        { unit: 'synthesis', report: reportPath },
        repository,
      );
      const finished = ledgerModule.execute('finish', {}, repository);
      expect(finished.status).toBe('complete');
      const recoveredFinished = ledgerModule.execute('recover', {}, repository);
      expect(recoveredFinished.status).toBe('complete');
    });
  });

  it('selectively carries forward unchanged review evidence', () => {
    const ledger: Ledger = {
      schemaVersion: 1,
      taskId: 'PR-1',
      baseHead: firstHead,
      currentHead: firstHead,
      currentFingerprint: 'a'.repeat(64),
      workingPaths: [],
      status: 'active',
      updatedAt: '2026-08-13T00:00:00.000Z',
      units: [
        completedUnit('runtime', 'review', ['src/ts/layout-manager.ts']),
        completedUnit('docs', 'review', ['docs/index.md']),
        completedUnit('checks', 'verification', []),
        completedUnit('final', 'synthesis', []),
        completedUnit('fix', 'implementation', ['src/ts/layout-manager.ts']),
      ],
    };

    const recovered = ledgerModule.recoverLedger(
      ledger,
      secondHead,
      ['src/ts/layout-manager.ts'],
      'b'.repeat(64),
      [],
    ).ledger;

    expect(recovered.units.map(({ status }) => status)).toEqual([
      'invalidated',
      'carried-forward',
      'invalidated',
      'invalidated',
      'completed',
    ]);
    expect(recovered.units[1].carryForward).toEqual({
      fromHead: firstHead,
      toHead: secondHead,
      changedPaths: ['src/ts/layout-manager.ts'],
    });
    expect(recovered.units[1].head).toBe(firstHead);
    expect(() => ledgerModule.validateLedger(recovered)).not.toThrow();

    const recoveredAgain = ledgerModule.recoverLedger(
      recovered,
      thirdHead,
      ['scripts/verify-pr.js'],
      'c'.repeat(64),
      [],
    ).ledger;
    expect(recoveredAgain.units[1].status).toBe('carried-forward');
    expect(recoveredAgain.units[1].carryForward).toEqual({
      fromHead: firstHead,
      toHead: thirdHead,
      changedPaths: ['scripts/verify-pr.js', 'src/ts/layout-manager.ts'],
    });
  });

  it('fails closed when changed-path comparison is unavailable', () => {
    const ledger: Ledger = {
      schemaVersion: 1,
      taskId: 'PR-1',
      baseHead: firstHead,
      currentHead: firstHead,
      currentFingerprint: 'a'.repeat(64),
      workingPaths: [],
      status: 'active',
      updatedAt: '2026-08-13T00:00:00.000Z',
      units: [completedUnit('docs', 'review', ['docs/index.md'])],
    };

    const result = ledgerModule.recoverLedger(
      ledger,
      secondHead,
      undefined,
      'b'.repeat(64),
      [],
    );

    expect(result.comparisonAvailable).toBe(false);
    expect(result.ledger.units[0].status).toBe('invalidated');
  });

  it('invalidates completed evidence when the working tree changes', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      addReview(repository);
      ledgerModule.execute(
        'start',
        { unit: 'runtime-review', owner: 'agent-1' },
        repository,
      );
      ledgerModule.execute(
        'complete',
        { unit: 'runtime-review', report: writeReport(repository) },
        repository,
      );

      writeFileSync(
        join(repository, 'src', 'ts', 'layout-manager.ts'),
        'changed\n',
      );
      expect(() => ledgerModule.execute('validate', {}, repository)).toThrow(
        'Active ledger is stale',
      );
      const recovered = ledgerModule.execute('recover', {}, repository);

      expect(recovered.units[0].status).toBe('invalidated');
      expect(recovered.workingPaths).toContain('src/ts/layout-manager.ts');
    });
  });

  it('synchronizes a running implementation checkpoint after source edits', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      ledgerModule.execute(
        'add',
        {
          unit: 'implementation',
          kind: 'implementation',
          paths: 'src/ts/layout-manager.ts',
          contracts: 'Change the assigned implementation.',
        },
        repository,
      );
      ledgerModule.execute(
        'start',
        { unit: 'implementation', owner: 'agent-1' },
        repository,
      );
      writeFileSync(
        join(repository, 'src', 'ts', 'layout-manager.ts'),
        'changed\n',
      );
      const source = ledgerModule.currentSourceState(repository);
      const report = writeReport(repository, {
        lastVerifiedHead: source.head,
        sourceFingerprint: source.fingerprint,
        inspectedPaths: ['src/ts/layout-manager.ts'],
        commands: [],
      });

      const completed = ledgerModule.execute(
        'complete',
        { unit: 'implementation', report },
        repository,
      );

      expect(completed.currentFingerprint).toBe(source.fingerprint);
      expect(completed.units[0]).toMatchObject({
        status: 'completed',
        sourceFingerprint: source.fingerprint,
      });
    });
  });

  it('rejects implementation completion when synchronization invalidates a dependency', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      addReview(repository);
      ledgerModule.execute(
        'start',
        { unit: 'runtime-review', owner: 'reviewer' },
        repository,
      );
      ledgerModule.execute(
        'complete',
        { unit: 'runtime-review', report: writeReport(repository) },
        repository,
      );
      ledgerModule.execute(
        'add',
        {
          unit: 'implementation',
          kind: 'implementation',
          paths: 'src/ts/layout-manager.ts',
          contracts: 'Implement reviewed behavior.',
          dependencies: 'runtime-review',
        },
        repository,
      );
      ledgerModule.execute(
        'start',
        { unit: 'implementation', owner: 'implementer' },
        repository,
      );
      writeFileSync(
        join(repository, 'src', 'ts', 'layout-manager.ts'),
        'changed\n',
      );
      const source = ledgerModule.currentSourceState(repository);
      const report = writeReport(repository, {
        lastVerifiedHead: source.head,
        sourceFingerprint: source.fingerprint,
        inspectedPaths: ['src/ts/layout-manager.ts'],
        commands: [],
      });

      expect(() =>
        ledgerModule.execute(
          'complete',
          { unit: 'implementation', report },
          repository,
        ),
      ).toThrow('dependency is not complete');
    });
  });

  it('propagates invalidation through review dependencies', () => {
    const upstream = completedUnit('upstream', 'review', [
      'src/ts/layout-manager.ts',
    ]);
    const downstream = completedUnit('downstream', 'review', ['docs/index.md']);
    downstream.dependencies = ['upstream'];
    const ledger: Ledger = {
      schemaVersion: 1,
      taskId: 'PR-1',
      baseHead: firstHead,
      currentHead: firstHead,
      currentFingerprint: 'a'.repeat(64),
      workingPaths: [],
      status: 'active',
      updatedAt: '2026-08-13T00:00:00.000Z',
      units: [upstream, downstream],
    };

    const recovered = ledgerModule.recoverLedger(
      ledger,
      secondHead,
      ['src/ts/layout-manager.ts'],
      'b'.repeat(64),
      [],
    ).ledger;

    expect(recovered.units.map(({ status }) => status)).toEqual([
      'invalidated',
      'invalidated',
    ]);
  });

  it('rejects completed state without checkpoint evidence and open findings', () => {
    const incomplete = completedUnit('review', 'review', ['docs/index.md']);
    delete incomplete.checkpoint;
    const ledger: Ledger = {
      schemaVersion: 1,
      taskId: 'PR-1',
      baseHead: firstHead,
      currentHead: firstHead,
      currentFingerprint: 'a'.repeat(64),
      workingPaths: [],
      status: 'active',
      updatedAt: '2026-08-13T00:00:00.000Z',
      units: [incomplete],
    };
    expect(() => ledgerModule.validateLedger(ledger)).toThrow(
      'requires checkpoint evidence',
    );

    withTemporaryRepository((repository) => {
      initialize(repository);
      addReview(repository);
      ledgerModule.execute(
        'start',
        { unit: 'runtime-review', owner: 'agent-1' },
        repository,
      );
      const report = writeReport(repository, {
        findings: [
          { severity: 'high', status: 'open', summary: 'Unresolved cleanup.' },
        ],
      });
      expect(() =>
        ledgerModule.execute(
          'complete',
          { unit: 'runtime-review', report },
          repository,
        ),
      ).toThrow('has open findings');
    });
  });

  it('rejects contradictory completed evidence and blocking acceptance', () => {
    const unit = completedUnit('review', 'review', ['docs/index.md']);
    unit.checkpoint!.sourceFingerprint = 'b'.repeat(64);
    const ledger: Ledger = {
      schemaVersion: 1,
      taskId: 'PR-1',
      baseHead: firstHead,
      currentHead: firstHead,
      currentFingerprint: 'a'.repeat(64),
      workingPaths: [],
      status: 'active',
      updatedAt: '2026-08-13T00:00:00.000Z',
      units: [unit],
    };
    expect(() => ledgerModule.validateLedger(ledger)).toThrow(
      'checkpoint does not match',
    );
    unit.checkpoint!.sourceFingerprint = 'a'.repeat(64);
    unit.checkpoint!.findings = [
      { severity: 'high', status: 'accepted', summary: 'Blocking issue.' },
    ];
    expect(() => ledgerModule.validateLedger(ledger)).toThrow(
      'cannot accept Critical, High, or Low',
    );
    unit.checkpoint!.findings = [
      { severity: 'medium', status: 'accepted', summary: 'Accepted issue.' },
    ];
    expect(() => ledgerModule.validateLedger(ledger)).toThrow(
      'acceptanceEvidence',
    );
    unit.checkpoint!.findings[0].acceptanceEvidence =
      'https://github.example/acceptance';
    expect(() => ledgerModule.validateLedger(ledger)).not.toThrow();
    unit.status = 'pending';
    delete unit.sourceFingerprint;
    delete unit.checkpoint;
    ledger.status = 'complete';
    expect(() => ledgerModule.validateLedger(ledger)).toThrow(
      'complete ledger cannot contain incomplete units',
    );
  });

  it('revalidates persisted completion semantics and requires final gates', () => {
    const unit = completedUnit('review', 'review', ['docs/index.md']);
    unit.checkpoint!.remainingPaths = ['docs/index.md'];
    const ledger: Ledger = {
      schemaVersion: 1,
      taskId: 'PR-1',
      baseHead: firstHead,
      currentHead: firstHead,
      currentFingerprint: 'a'.repeat(64),
      workingPaths: [],
      status: 'active',
      updatedAt: '2026-08-13T00:00:00.000Z',
      units: [unit],
    };
    expect(() => ledgerModule.validateLedger(ledger)).toThrow(
      'remaining or uninspected scope',
    );

    withTemporaryRepository((repository) => {
      initialize(repository);
      expect(() => ledgerModule.execute('finish', {}, repository)).toThrow(
        'empty ledger',
      );
      addReview(repository);
      ledgerModule.execute(
        'start',
        { unit: 'runtime-review', owner: 'reviewer' },
        repository,
      );
      ledgerModule.execute(
        'complete',
        { unit: 'runtime-review', report: writeReport(repository) },
        repository,
      );
      expect(() => ledgerModule.execute('finish', {}, repository)).toThrow(
        'verification evidence',
      );
      ledgerModule.execute(
        'add',
        {
          unit: 'verification',
          kind: 'verification',
          contracts: 'Verify exact source.',
        },
        repository,
      );
      ledgerModule.execute(
        'start',
        { unit: 'verification', owner: 'verifier' },
        repository,
      );
      ledgerModule.execute(
        'complete',
        { unit: 'verification', report: writeReport(repository) },
        repository,
      );
      expect(() => ledgerModule.execute('finish', {}, repository)).toThrow(
        'synthesis evidence',
      );
    });
  });

  it('fingerprints Unicode and newline-containing Git paths', () => {
    withTemporaryRepository((repository) => {
      writeFileSync(join(repository, '日本語.txt'), 'unicode\n');
      if (process.platform !== 'win32') {
        writeFileSync(join(repository, 'line\nbreak.txt'), 'newline\n');
      }

      const state = ledgerModule.currentSourceState(repository);

      expect(state.workingPaths).toContain('日本語.txt');
      if (process.platform !== 'win32') {
        expect(state.workingPaths).toContain('line\nbreak.txt');
      }
      expect(state.fingerprint).toMatch(/^[a-f0-9]{64}$/);

      const before = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();
      execFileSync('git', ['add', '.'], { cwd: repository });
      execFileSync('git', ['commit', '-m', 'Add unusual paths.'], {
        cwd: repository,
      });
      const after = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();
      const changed = ledgerModule.gitChangedPaths(before, after, repository);
      expect(changed).toContain('日本語.txt');
      if (process.platform !== 'win32') {
        expect(changed).toContain('line\nbreak.txt');
      }
    });
  });

  it('reports actionable pending scope and rejects a linked ledger file', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      addReview(repository);
      const ledger = ledgerModule.execute('status', {}, repository);
      expect(ledgerModule.summarize(ledger).work[0]).toMatchObject({
        id: 'runtime-review',
        contracts: ['rollback ownership', 'listener cleanup'],
        requiredCommands: ['npm test'],
        remainingPaths: [
          'src/ts/controls/browser-popout.ts',
          'src/ts/layout-manager.ts',
        ],
      });

      const ledgerFile = join(repository, '.tmp', 'agent-work', 'active.json');
      const linkedTarget = join(repository, '.tmp', 'linked-ledger');
      rmSync(ledgerFile);
      mkdirSync(linkedTarget);
      symlinkSync(linkedTarget, ledgerFile, 'junction');
      expect(() => ledgerModule.execute('status', {}, repository)).toThrow(
        'symbolic link or junction',
      );
    });
  });

  it('derives pull-request review scope and canonical domains from the base diff', () => {
    withTemporaryRepository((repository) => {
      const base = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();
      writeFileSync(
        join(repository, 'src', 'ts', 'layout-manager.ts'),
        'layout changed\n',
      );
      execFileSync('git', ['add', '.'], { cwd: repository });
      execFileSync('git', ['commit', '-m', 'Change layout.'], {
        cwd: repository,
      });
      const head = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();

      const ledger = ledgerModule.execute(
        'init',
        {
          task: 'PR-review',
          base,
          head,
          mode: 'pr',
          implementer: 'codex-main',
        },
        repository,
      );

      expect(ledger.reviewGate).toMatchObject({
        mode: 'pull-request',
        implementer: 'codex-main',
        risk: 'high',
        requiredPaths: ['src/ts/layout-manager.ts'],
        applicableDomains: [
          'Public API, compatibility, and packaging',
          'Runtime behavior, lifecycle, and ownership',
        ],
        largeHighRisk: false,
      });
      expect(ledger.reviewGate?.requiredCoverage).toEqual([
        {
          path: 'src/ts/layout-manager.ts',
          domains: [
            'Public API, compatibility, and packaging',
            'Runtime behavior, lifecycle, and ownership',
          ],
        },
      ]);
    });
  });

  it('fails the definitive PR gate for an empty ledger and self-review', () => {
    withTemporaryRepository((repository) => {
      const base = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();
      writeFileSync(
        join(repository, 'src', 'ts', 'layout-manager.ts'),
        'layout changed\n',
      );
      execFileSync('git', ['add', '.'], { cwd: repository });
      execFileSync('git', ['commit', '-m', 'Change layout.'], {
        cwd: repository,
      });
      const head = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();
      const ledger = ledgerModule.execute(
        'init',
        {
          task: 'PR-review',
          base,
          head,
          mode: 'pr',
          implementer: 'codex-main',
        },
        repository,
      );
      const source = ledgerModule.currentSourceState(repository);

      expect(() =>
        ledgerModule.validatePullRequestGate(
          ledger,
          source,
          gateOptions(ledger),
        ),
      ).toThrow('missing completed fresh-discovery review coverage');

      const selfReview = completedUnit('whole-pr-review', 'review', [
        'src/ts/layout-manager.ts',
      ]);
      selfReview.head = source.head;
      selfReview.sourceFingerprint = source.fingerprint;
      selfReview.adjacentPaths = ['src/ts/controls/browser-popout.ts'];
      selfReview.review = {
        reviewer: 'codex-main',
        scope: 'whole-pr',
        pass: 'fresh-discovery',
        domains: [
          'Public API, compatibility, and packaging',
          'Runtime behavior, lifecycle, and ownership',
        ],
      };
      selfReview.checkpoint = {
        ...selfReview.checkpoint!,
        lastVerifiedHead: source.head,
        sourceFingerprint: source.fingerprint,
        inspectedPaths: [
          'src/ts/controls/browser-popout.ts',
          'src/ts/layout-manager.ts',
        ],
        verdict: 'pass',
      };
      ledger.units.push(selfReview);

      expect(() =>
        ledgerModule.validatePullRequestGate(
          ledger,
          source,
          gateOptions(ledger),
        ),
      ).toThrow('must be independent from implementer codex-main');
    });
  });

  it('rejects a caller-selected base that narrows the trusted PR diff', () => {
    withTemporaryRepository((repository) => {
      writeFileSync(
        join(repository, 'src', 'ts', 'layout-manager.ts'),
        'layout changed\n',
      );
      execFileSync('git', ['add', '.'], { cwd: repository });
      execFileSync('git', ['commit', '-m', 'Change layout.'], {
        cwd: repository,
      });
      const head = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();

      expect(() =>
        ledgerModule.execute(
          'init',
          {
            task: 'narrowed-pr',
            base: head,
            head,
            mode: 'pr',
            implementer: 'codex-main',
          },
          repository,
        ),
      ).toThrow('trusted base');
    });
  });

  it('accepts exact independent coverage, verification, and synthesis', () => {
    withTemporaryRepository((repository) => {
      const base = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();
      writeFileSync(
        join(repository, 'src', 'ts', 'layout-manager.ts'),
        'layout changed\n',
      );
      execFileSync('git', ['add', '.'], { cwd: repository });
      execFileSync('git', ['commit', '-m', 'Change layout.'], {
        cwd: repository,
      });
      const head = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();
      const ledger = ledgerModule.execute(
        'init',
        {
          task: 'PR-review',
          base,
          head,
          mode: 'pr',
          implementer: 'codex-main',
        },
        repository,
      );
      const source = ledgerModule.currentSourceState(repository);
      const changedPath = 'src/ts/layout-manager.ts';
      const adjacentPath = 'src/ts/controls/browser-popout.ts';
      const domains = ledger.reviewGate!.applicableDomains;

      const review = completedUnit('whole-review', 'review', [changedPath]);
      review.adjacentPaths = [adjacentPath];
      review.requiredCommands = ['source inspection'];
      review.review = {
        reviewer: 'reviewer-a',
        scope: 'whole-pr',
        pass: 'fresh-discovery',
        domains,
      };
      retargetCompletedUnit(review, source, [changedPath, adjacentPath]);
      addPathEvidence(
        review,
        changedPath,
        domains,
        adjacentPath,
        'source inspection',
      );
      bindReviewBoundary(review, ledger);

      const verification = completedUnit('verification', 'verification', []);
      verification.requiredCommands = [
        'npm run verify:ordered',
        'npm run apitest:build',
        'npm run apitest:smoke',
      ];
      retargetCompletedUnit(verification, source, []);

      const synthesis = completedUnit('synthesis', 'synthesis', [changedPath]);
      synthesis.adjacentPaths = [adjacentPath];
      synthesis.requiredCommands = ['source inspection'];
      synthesis.dependencies = ['whole-review', 'verification'];
      synthesis.review = {
        reviewer: 'reviewer-a',
        scope: 'whole-pr',
        pass: 'fresh-discovery',
        domains,
      };
      retargetCompletedUnit(synthesis, source, [changedPath, adjacentPath]);
      bindReviewBoundary(synthesis, ledger);
      ledger.units.push(review, verification, synthesis);

      expect(() =>
        ledgerModule.validatePullRequestGate(
          ledger,
          source,
          gateOptions(ledger),
        ),
      ).not.toThrow();

      synthesis.dependencies = ['whole-review'];
      expect(() =>
        ledgerModule.validatePullRequestGate(
          ledger,
          source,
          gateOptions(ledger),
        ),
      ).toThrow('verification unit');
      synthesis.dependencies = ['whole-review', 'verification'];

      const completedReview = structuredClone(review);
      review.status = 'carried-forward';
      review.head = secondHead;
      review.sourceFingerprint = 'b'.repeat(64);
      review.checkpoint!.lastVerifiedHead = secondHead;
      review.checkpoint!.sourceFingerprint = 'b'.repeat(64);
      review.checkpoint!.reviewedHead = secondHead;
      review.carryForward = {
        fromHead: secondHead,
        toHead: source.head,
        changedPaths: ['README.md'],
      };
      expect(() =>
        ledgerModule.validatePullRequestGate(
          ledger,
          source,
          gateOptions(ledger),
        ),
      ).not.toThrow();
      Object.assign(review, completedReview);

      expect(() =>
        ledgerModule.validatePullRequestGate(
          ledger,
          { ...source, workingPaths: ['README.md'] },
          gateOptions(ledger),
        ),
      ).toThrow('clean working tree');
      expect(() =>
        ledgerModule.validatePullRequestGate(
          ledger,
          { ...source, fingerprint: 'b'.repeat(64) },
          gateOptions(ledger),
        ),
      ).toThrow('does not target the current source');
      expect(() =>
        ledgerModule.validatePullRequestGate(ledger, source, {
          ...gateOptions(ledger),
          executedCommands: [],
        }),
      ).toThrow('gate-executed');

      review.checkpoint!.reviewedBase = secondHead;
      expect(() =>
        ledgerModule.validatePullRequestGate(
          ledger,
          source,
          gateOptions(ledger),
        ),
      ).toThrow('exact base/head boundary');
      review.checkpoint!.reviewedBase = ledger.baseHead;
      synthesis.checkpoint!.reviewedHead = secondHead;
      expect(() =>
        ledgerModule.validatePullRequestGate(
          ledger,
          source,
          gateOptions(ledger),
        ),
      ).toThrow('exact base/head boundary');
      synthesis.checkpoint!.reviewedHead = ledger.currentHead;

      const originalCoverage = ledger.reviewGate!.requiredCoverage;
      const canonicalGate = structuredClone(ledger.reviewGate!);
      ledger.reviewGate!.requiredCoverage = [];
      expect(() => ledgerModule.validateLedger(ledger)).toThrow(
        'coverage paths must match requiredPaths exactly',
      );
      expect(() =>
        ledgerModule.validatePullRequestGate(ledger, source, {
          ...gateOptions(ledger),
          expectedReviewGate: canonicalGate,
        }),
      ).toThrow('regenerated canonical gate');
      ledger.reviewGate!.requiredCoverage = originalCoverage;

      const pathEvidence = review.checkpoint!.coverage;
      delete review.checkpoint!.coverage;
      expect(() =>
        ledgerModule.validatePullRequestGate(
          ledger,
          source,
          gateOptions(ledger),
        ),
      ).toThrow('lacks per-path review evidence');
      review.checkpoint!.coverage = pathEvidence;

      review.review.domains = [domains[0]];
      review.checkpoint!.coverage![0].domains = [domains[0]];
      expect(() =>
        ledgerModule.validatePullRequestGate(
          ledger,
          source,
          gateOptions(ledger),
        ),
      ).toThrow('does not exactly match the base diff');
    });
  });

  it('requires multiple domain reviewers and an unused large-PR synthesis reviewer', () => {
    const source = {
      head: firstHead,
      fingerprint: 'a'.repeat(64),
      workingPaths: [],
    };
    const path = 'src/ts/layout-manager.ts';
    const adjacent = 'src/ts/controls/browser-popout.ts';
    const domains = [
      'Public API, compatibility, and packaging',
      'Runtime behavior, lifecycle, and ownership',
    ];
    const ledger: Ledger = {
      schemaVersion: 1,
      taskId: 'large-pr',
      baseHead: secondHead,
      currentHead: source.head,
      currentFingerprint: source.fingerprint,
      workingPaths: [],
      status: 'active',
      updatedAt: '2026-08-13T00:00:00.000Z',
      reviewGate: {
        mode: 'pull-request',
        implementer: 'codex-main',
        risk: 'high',
        requiredPaths: [path],
        requiredCoverage: [{ path, domains }],
        applicableDomains: domains,
        nonGeneratedLines: 1001,
        largeHighRisk: true,
      },
      units: [],
    };
    const makeDomainReview = (id: string, reviewer: string, domain: string) => {
      const unit = completedUnit(id, 'review', [path]);
      unit.adjacentPaths = [adjacent];
      unit.requiredCommands = ['source inspection'];
      unit.review = {
        reviewer,
        scope: 'domain',
        pass: 'fresh-discovery',
        domains: [domain],
      };
      return retargetCompletedUnit(unit, source, [path, adjacent]);
    };
    const firstReview = makeDomainReview('domain-a', 'reviewer-a', domains[0]);
    const secondReview = makeDomainReview('domain-b', 'reviewer-b', domains[1]);
    addPathEvidence(
      firstReview,
      path,
      [domains[0]],
      adjacent,
      'source inspection',
    );
    bindReviewBoundary(firstReview, ledger);
    addPathEvidence(
      secondReview,
      path,
      [domains[1]],
      adjacent,
      'source inspection',
    );
    bindReviewBoundary(secondReview, ledger);
    const verification = completedUnit('verification', 'verification', []);
    verification.requiredCommands = [
      'npm run verify:ordered',
      'npm run apitest:build',
      'npm run apitest:smoke',
    ];
    retargetCompletedUnit(verification, source, []);
    const synthesis = completedUnit('synthesis', 'synthesis', [path]);
    synthesis.adjacentPaths = [adjacent];
    synthesis.requiredCommands = ['source inspection'];
    synthesis.dependencies = ['domain-a', 'domain-b', 'verification'];
    synthesis.review = {
      reviewer: 'reviewer-c',
      scope: 'whole-pr',
      pass: 'fresh-discovery',
      domains,
    };
    retargetCompletedUnit(synthesis, source, [path, adjacent]);
    bindReviewBoundary(synthesis, ledger);
    ledger.units.push(firstReview, secondReview, verification, synthesis);

    expect(() =>
      ledgerModule.validatePullRequestGate(ledger, source, gateOptions(ledger)),
    ).not.toThrow();

    synthesis.review.reviewer = 'reviewer-a';
    expect(() =>
      ledgerModule.validatePullRequestGate(ledger, source, gateOptions(ledger)),
    ).toThrow('unused independent reviewer');
  });

  it('rejects paths outside the repository and malformed dependencies', () => {
    expect(() => ledgerModule.normalizePath('../outside.json')).toThrow(
      'repository-relative',
    );
    const ledger: Ledger = {
      schemaVersion: 1,
      taskId: 'PR-1',
      baseHead: firstHead,
      currentHead: firstHead,
      currentFingerprint: 'a'.repeat(64),
      workingPaths: [],
      status: 'active',
      updatedAt: '2026-08-13T00:00:00.000Z',
      units: [
        {
          ...completedUnit('review', 'review', ['docs/index.md']),
          dependencies: ['missing'],
        },
      ],
    };

    expect(() => ledgerModule.validateLedger(ledger)).toThrow(
      'unknown dependency',
    );
  });

  it('rejects dependency cycles and unsupported state properties', () => {
    const first = completedUnit('first', 'review', ['docs/index.md']);
    const second = completedUnit('second', 'review', ['README.md']);
    first.dependencies = ['second'];
    second.dependencies = ['first'];
    const cyclic: Ledger = {
      schemaVersion: 1,
      taskId: 'PR-1',
      baseHead: firstHead,
      currentHead: firstHead,
      currentFingerprint: 'a'.repeat(64),
      workingPaths: [],
      status: 'active',
      updatedAt: '2026-08-13T00:00:00.000Z',
      units: [first, second],
    };
    expect(() => ledgerModule.validateLedger(cyclic)).toThrow(
      'Dependency cycle',
    );

    const unsupported = {
      ...cyclic,
      units: [],
      silentlyTrusted: true,
    } as Ledger;
    expect(() => ledgerModule.validateLedger(unsupported)).toThrow(
      'unsupported property',
    );
  });

  it('keeps policy, schema, CLI, and package commands connected', () => {
    const rootPolicy = readFileSync(resolve('AGENTS.md'), 'utf8');
    const recoveryPolicy = readFileSync(
      resolve('docs/contributing/autonomous-task-recovery.md'),
      'utf8',
    );
    const schema = JSON.parse(
      readFileSync(
        resolve('docs/contributing/schemas/agent-work-ledger.schema.json'),
        'utf8',
      ),
    ) as { properties?: { schemaVersion?: { const?: number } } };
    const packageJson = JSON.parse(
      readFileSync(resolve('package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(rootPolicy).toContain('npm run agent:ledger -- recover');
    expect(rootPolicy).toContain(
      'docs/contributing/autonomous-task-recovery.md',
    );
    expect(recoveryPolicy).toContain('selectively invalidates');
    expect(recoveryPolicy).toContain(
      '`Error`, `null`, `undefined`, partial success',
    );
    expect(schema.properties?.schemaVersion?.const).toBe(1);
    expect(packageJson.scripts?.['agent:ledger']).toBe(
      'node ./scripts/agent-work-ledger.js',
    );
    expect(packageJson.scripts?.['verify:agent-ledger']).toBe(
      'node ./scripts/agent-work-ledger.js validate',
    );
    expect(packageJson.scripts?.['verify:review-ready']).toBe(
      'node ./scripts/verify-pr.js --review-ready',
    );
  });
});
