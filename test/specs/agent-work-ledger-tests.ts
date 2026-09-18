import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
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
    status: 'open' | 'closed' | 'accepted' | 'deferred';
    summary: string;
    acceptanceEvidence?: string;
    deferralRationale?: string;
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

interface LedgerLock {
  fileName: string;
  token: string;
}

interface LedgerLockObservation {
  owner?: { pid?: number; token?: string; processIdentity?: string };
  modifiedAt: number;
  directoryIdentity: string;
  identity: string;
  kind: 'directory' | 'file';
}

interface ProcessIdentityState {
  status: 'alive' | 'missing' | 'unknown';
  identity?: string;
}

interface LedgerModule {
  acquireLedgerLock(
    fileName: string,
    options?: {
      timeoutMs?: number;
      staleMs?: number;
      retryMs?: number;
      identityLookup?: (
        pid: number,
        remainingMs: number,
      ) => ProcessIdentityState;
      currentIdentityLookup?: (remainingMs: number) => ProcessIdentityState;
    },
  ): LedgerLock;
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
  ledgerPath(root?: string, cwd?: string): string;
  moveLockBehindReclaimFence(
    fileName: string,
    reclaimDirectory: string,
    beforeRename?: () => void,
    expectedIdentity?: string,
  ): boolean;
  readProcessInstanceIdentity(
    pid: number,
    platform?: NodeJS.Platform,
    executeFile?: (
      file: string,
      args: string[],
      options: { timeout?: number },
    ) => string,
    timeoutMs?: number,
  ): ProcessIdentityState;
  publishLedgerLock(
    fileName: string,
    owner: {
      pid: number;
      token: string;
      createdAt: string;
      processIdentity: string;
    },
    token: string,
    beforePublish?: () => void,
    writeCandidate?: (handle: number, content: string) => void,
  ): LedgerLock;
  normalizePath(path: string): string;
  readLock(fileName: string): LedgerLockObservation | undefined;
  reclaimStaleLock(
    fileName: string,
    observed: LedgerLockObservation,
    staleMs: number,
    now?: number,
    identityLookup?: (pid: number) => ProcessIdentityState,
    beforeRename?: () => void,
  ): boolean;
  removeLockDirectoryIfIdentity(
    fileName: string,
    directoryIdentity: string,
  ): boolean;
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
  summarize(ledger: Ledger): {
    readyUnits: string[];
    work: Array<Record<string, unknown>>;
  };
  releaseLedgerLock(lock: LedgerLock): void;
  withLedgerTransaction<T>(
    fileName: string,
    transaction: () => T,
    options?: { timeoutMs?: number; staleMs?: number; retryMs?: number },
  ): T;
  writeLedger(fileName: string, ledger: Ledger, now?: Date): Ledger;
}

const require = createRequire(import.meta.url);
const ledgerModule =
  require('../../scripts/agent-work-ledger.js') as LedgerModule;
const firstHead = '1111111111111111111111111111111111111111';
const secondHead = '2222222222222222222222222222222222222222';
const thirdHead = '3333333333333333333333333333333333333333';

function createTemporaryRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), 'strelit-agent-ledger-'));
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
  writeFileSync(join(repository, 'src', 'ts', 'layout-manager.ts'), 'layout\n');
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
  return repository;
}

function withTemporaryRepository(run: (repository: string) => void): void {
  const repository = createTemporaryRepository();
  try {
    run(repository);
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
}

async function withTemporaryRepositoryAsync(
  run: (repository: string) => Promise<void>,
): Promise<void> {
  const repository = createTemporaryRepository();
  try {
    await run(repository);
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForPath(fileName: string, timeoutMs = 5_000): Promise<void> {
  const startedAt = Date.now();
  while (!existsSync(fileName)) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for ${fileName}`);
    }
    await delay(10);
  }
}

function waitForProcess(
  child: ReturnType<typeof spawn>,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolveProcess, rejectProcess) => {
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', rejectProcess);
    child.once('close', (code) => resolveProcess({ code, stderr }));
  });
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
  it('allows a contended Windows runner the full lock timeout for identity lookup', () => {
    let observedTimeout: number | undefined;
    const state = ledgerModule.readProcessInstanceIdentity(
      process.pid,
      'win32',
      (_file, _args, options) => {
        observedTimeout = options.timeout;
        return '638919072000000000';
      },
    );

    expect(state).toEqual({
      status: 'alive',
      identity: 'win32:638919072000000000',
    });
    expect(observedTimeout).toBe(30_000);
  });

  it('passes the remaining lock deadline to Windows identity lookup', () => {
    let observedTimeout: number | undefined;
    const state = ledgerModule.readProcessInstanceIdentity(
      process.pid,
      'win32',
      (_file, _args, options) => {
        observedTimeout = options.timeout;
        return '638919072000000000';
      },
      37,
    );

    expect(state.status).toBe('alive');
    expect(observedTimeout).toBe(37);
  });

  it('does not publish an ownerless lock when acquisition is interrupted', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      const ledgerFile = ledgerModule.ledgerPath('.tmp/agent-work', repository);
      const lockFile = `${ledgerFile}.lock`;
      expect(() =>
        ledgerModule.publishLedgerLock(
          lockFile,
          {
            pid: process.pid,
            token: 'interrupted-owner',
            createdAt: new Date().toISOString(),
            processIdentity: 'current-process',
          },
          'interrupted-owner',
          () => {
            throw new Error('injected interruption before publication');
          },
        ),
      ).toThrow('injected interruption before publication');
      expect(existsSync(lockFile)).toBe(false);
      expect(
        readdirSync(join(repository, '.tmp', 'agent-work')).filter((entry) =>
          entry.includes('.candidate-'),
        ),
      ).toEqual([]);

      const replacement = ledgerModule.acquireLedgerLock(ledgerFile);
      ledgerModule.releaseLedgerLock(replacement);
    });
  });

  it('cleans up a partially written private candidate', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      const ledgerFile = ledgerModule.ledgerPath('.tmp/agent-work', repository);
      const lockFile = `${ledgerFile}.lock`;
      expect(() =>
        ledgerModule.publishLedgerLock(
          lockFile,
          {
            pid: process.pid,
            token: 'partial-owner',
            createdAt: new Date().toISOString(),
            processIdentity: 'current-process',
          },
          'partial-owner',
          undefined,
          (handle) => {
            writeFileSync(handle, '{"pid":');
            throw new Error('injected candidate write failure');
          },
        ),
      ).toThrow('injected candidate write failure');
      expect(existsSync(lockFile)).toBe(false);
      expect(
        readdirSync(join(repository, '.tmp', 'agent-work')).filter((entry) =>
          entry.includes('.candidate-'),
        ),
      ).toEqual([]);
    });
  });

  it('does not replace an existing canonical lock during publication', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      const ledgerFile = ledgerModule.ledgerPath('.tmp/agent-work', repository);
      const lockFile = `${ledgerFile}.lock`;
      mkdirSync(lockFile);

      expect(() =>
        ledgerModule.publishLedgerLock(
          lockFile,
          {
            pid: process.pid,
            token: 'replacement-owner',
            createdAt: new Date().toISOString(),
            processIdentity: 'current-process',
          },
          'replacement-owner',
        ),
      ).toThrow();
      expect(ledgerModule.readLock(lockFile)?.kind).toBe('directory');
      expect(ledgerModule.readLock(lockFile)?.owner).toBeUndefined();
    });
  });

  it('completes an interrupted file-lock reclaim without replacing ownership', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      const ledgerFile = ledgerModule.ledgerPath('.tmp/agent-work', repository);
      const lockFile = `${ledgerFile}.lock`;
      ledgerModule.acquireLedgerLock(ledgerFile);
      const observed = ledgerModule.readLock(lockFile)!;
      const reclaimDirectory = `${lockFile}.reclaim-${observed.identity}`;
      mkdirSync(reclaimDirectory);
      linkSync(lockFile, join(reclaimDirectory, 'stale'));

      expect(
        ledgerModule.moveLockBehindReclaimFence(
          lockFile,
          reclaimDirectory,
          undefined,
          observed.identity,
        ),
      ).toBe(true);
      expect(existsSync(lockFile)).toBe(false);
    });
  });

  it('bounds initial owner identity lookup by the acquisition deadline', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      const ledgerFile = ledgerModule.ledgerPath('.tmp/agent-work', repository);
      let observedBudget: number | undefined;
      const lock = ledgerModule.acquireLedgerLock(ledgerFile, {
        timeoutMs: 37,
        currentIdentityLookup: (remainingMs) => {
          observedBudget = remainingMs;
          return { status: 'alive', identity: 'bounded-current-process' };
        },
      });
      ledgerModule.releaseLedgerLock(lock);

      expect(observedBudget).toBeGreaterThan(0);
      expect(observedBudget).toBeLessThanOrEqual(37);
    });
  });

  it('throttles live-owner probes and bounds them by the contention deadline', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      const ledgerFile = ledgerModule.ledgerPath('.tmp/agent-work', repository);
      const lock = ledgerModule.acquireLedgerLock(ledgerFile);
      const owner = ledgerModule.readLock(`${ledgerFile}.lock`)!.owner!;
      const observedBudgets: number[] = [];
      try {
        expect(() =>
          ledgerModule.acquireLedgerLock(ledgerFile, {
            timeoutMs: 80,
            staleMs: 0,
            retryMs: 5,
            identityLookup: (_pid, remainingMs) => {
              observedBudgets.push(remainingMs);
              return {
                status: 'alive',
                identity: owner.processIdentity,
              };
            },
          }),
        ).toThrow('Timed out waiting for ledger transaction lock');
      } finally {
        ledgerModule.releaseLedgerLock(lock);
      }

      expect(observedBudgets).toHaveLength(1);
      expect(observedBudgets[0]).toBeGreaterThan(0);
      expect(observedBudgets[0]).toBeLessThanOrEqual(80);
    });
  });

  it('serializes a contending command behind the complete ledger transaction', async () => {
    await withTemporaryRepositoryAsync(async (repository) => {
      initialize(repository);
      const modulePath = resolve('scripts/agent-work-ledger.js');
      const readyPath = join(repository, '.tmp', 'transaction-ready');
      const releasePath = join(repository, '.tmp', 'transaction-release');
      const holderSource = `
        const fs = require('node:fs');
        const ledgerModule = require(process.argv[1]);
        const repository = process.argv[2];
        const readyPath = process.argv[3];
        const releasePath = process.argv[4];
        const fileName = ledgerModule.ledgerPath('.tmp/agent-work', repository);
        ledgerModule.withLedgerTransaction(fileName, () => {
          const ledger = JSON.parse(fs.readFileSync(fileName, 'utf8'));
          fs.writeFileSync(readyPath, 'ready');
          while (!fs.existsSync(releasePath)) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
          }
          ledger.units.push({
            id: 'holder-checkpoint',
            kind: 'implementation',
            status: 'pending',
            head: ledger.currentHead,
            assignedPaths: ['README.md'],
            adjacentPaths: [],
            contracts: ['preserve the holder checkpoint'],
            dependencies: [],
            requiredCommands: [],
          });
          ledgerModule.writeLedger(fileName, ledger);
        });
      `;
      const holder = spawn(
        process.execPath,
        ['-e', holderSource, modulePath, repository, readyPath, releasePath],
        {
          cwd: repository,
          stdio: ['ignore', 'ignore', 'pipe'],
          windowsHide: true,
        },
      );
      const holderCompletion = waitForProcess(holder);
      await waitForPath(readyPath);

      const contender = spawn(
        process.execPath,
        [
          modulePath,
          'add',
          '--unit',
          'contender-checkpoint',
          '--kind',
          'implementation',
          '--paths',
          'README.md',
          '--contracts',
          'preserve the contender checkpoint',
        ],
        {
          cwd: repository,
          stdio: ['ignore', 'ignore', 'pipe'],
          windowsHide: true,
        },
      );
      const contenderCompletion = waitForProcess(contender);

      try {
        await delay(150);
        expect(contender.exitCode).toBeNull();
      } finally {
        writeFileSync(releasePath, 'release');
      }

      const [holderResult, contenderResult] = await Promise.all([
        holderCompletion,
        contenderCompletion,
      ]);
      expect(holderResult).toEqual({ code: 0, stderr: '' });
      expect(contenderResult).toEqual({ code: 0, stderr: '' });

      const ledgerFile = ledgerModule.ledgerPath('.tmp/agent-work', repository);
      const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8')) as Ledger;
      expect(ledger.units.map(({ id }) => id).sort()).toEqual([
        'contender-checkpoint',
        'holder-checkpoint',
      ]);
      expect(existsSync(`${ledgerFile}.lock`)).toBe(false);
      expect(
        readdirSync(join(repository, '.tmp', 'agent-work')).filter((path) =>
          path.endsWith('.tmp'),
        ),
      ).toEqual([]);
    });
  });

  it('bounds live-owner contention and releases the owned lock', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      const ledgerFile = ledgerModule.ledgerPath('.tmp/agent-work', repository);
      const lock = ledgerModule.acquireLedgerLock(ledgerFile);
      const startedAt = Date.now();
      try {
        expect(() =>
          ledgerModule.acquireLedgerLock(ledgerFile, {
            timeoutMs: 40,
            staleMs: 1,
            retryMs: 5,
          }),
        ).toThrow('Timed out waiting for ledger transaction lock');
      } finally {
        ledgerModule.releaseLedgerLock(lock);
      }
      expect(Date.now() - startedAt).toBeLessThan(1_000);
      expect(existsSync(`${ledgerFile}.lock`)).toBe(false);
    });
  });

  it('binds stale reclaim to the recorded process instance and fails closed', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      const ledgerFile = ledgerModule.ledgerPath('.tmp/agent-work', repository);
      const lockFile = `${ledgerFile}.lock`;
      mkdirSync(lockFile);
      writeFileSync(
        join(lockFile, 'owner.json'),
        `${JSON.stringify({
          pid: 42,
          token: 'same-pid-owner',
          createdAt: '2026-08-25T00:00:00.000Z',
          processIdentity: 'process-instance-a',
        })}\n`,
      );
      const staleTime = new Date(Date.now() - 60_000);
      utimesSync(lockFile, staleTime, staleTime);
      const observed = ledgerModule.readLock(lockFile)!;

      expect(
        ledgerModule.reclaimStaleLock(
          lockFile,
          observed,
          100,
          Date.now(),
          () => ({ status: 'alive', identity: 'process-instance-a' }),
        ),
      ).toBe(false);
      expect(existsSync(lockFile)).toBe(true);
      expect(
        ledgerModule.reclaimStaleLock(
          lockFile,
          observed,
          100,
          Date.now(),
          () => ({ status: 'unknown' }),
        ),
      ).toBe(false);
      expect(existsSync(lockFile)).toBe(true);
      expect(
        ledgerModule.reclaimStaleLock(
          lockFile,
          observed,
          100,
          Date.now(),
          () => ({ status: 'alive', identity: 'process-instance-b' }),
        ),
      ).toBe(true);
      expect(existsSync(lockFile)).toBe(false);
    });
  });

  it('does not clean up a replacement using a stale directory identity', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      const ledgerFile = ledgerModule.ledgerPath('.tmp/agent-work', repository);
      const lockFile = `${ledgerFile}.lock`;
      mkdirSync(lockFile);
      const staleDirectoryIdentity =
        ledgerModule.readLock(lockFile)!.directoryIdentity;
      rmSync(lockFile, { recursive: true });
      mkdirSync(lockFile);
      writeFileSync(join(lockFile, 'owner.json'), '{"token":"replacement"}\n');

      expect(
        ledgerModule.removeLockDirectoryIfIdentity(
          lockFile,
          staleDirectoryIdentity,
        ),
      ).toBe(false);
      expect(existsSync(lockFile)).toBe(true);
    });
  });

  it('reclaims an interrupted owner without deleting its live replacement', async () => {
    await withTemporaryRepositoryAsync(async (repository) => {
      initialize(repository);
      const modulePath = resolve('scripts/agent-work-ledger.js');
      const readyPath = join(repository, '.tmp', 'stale-owner-ready');
      const ownerSource = `
        const fs = require('node:fs');
        const ledgerModule = require(process.argv[1]);
        const fileName = ledgerModule.ledgerPath('.tmp/agent-work', process.argv[2]);
        ledgerModule.acquireLedgerLock(fileName);
        fs.writeFileSync(process.argv[3], 'ready');
        setInterval(() => {}, 1_000);
      `;
      const owner = spawn(
        process.execPath,
        ['-e', ownerSource, modulePath, repository, readyPath],
        {
          cwd: repository,
          stdio: ['ignore', 'ignore', 'pipe'],
          windowsHide: true,
        },
      );
      const ownerCompletion = waitForProcess(owner);
      await waitForPath(readyPath);
      owner.kill();
      const ownerResult = await ownerCompletion;
      expect(ownerResult.code).not.toBe(0);

      const ledgerFile = ledgerModule.ledgerPath('.tmp/agent-work', repository);
      const lockFile = `${ledgerFile}.lock`;
      const staleTime = new Date(Date.now() - 60_000);
      utimesSync(lockFile, staleTime, staleTime);

      const delayedContenderObservation = ledgerModule.readLock(lockFile);
      expect(delayedContenderObservation).toBeDefined();
      const deadOwner = () => ({ status: 'missing' as const });
      let replacement: LedgerLock | undefined;
      expect(
        ledgerModule.reclaimStaleLock(
          lockFile,
          delayedContenderObservation!,
          100,
          Date.now(),
          deadOwner,
          () => {
            expect(
              ledgerModule.moveLockBehindReclaimFence(
                lockFile,
                `${lockFile}.reclaim-${delayedContenderObservation!.identity}`,
              ),
            ).toBe(true);
            replacement = ledgerModule.acquireLedgerLock(ledgerFile, {
              timeoutMs: 1_000,
              staleMs: 100,
              retryMs: 5,
            });
          },
        ),
      ).toBe(false);
      expect(replacement).toBeDefined();
      try {
        expect(ledgerModule.readLock(lockFile)?.owner?.token).toBe(
          replacement!.token,
        );
      } finally {
        ledgerModule.releaseLedgerLock(replacement!);
      }

      const ledger = ledgerModule.execute(
        'add',
        {
          unit: 'recovered-after-interruption',
          kind: 'implementation',
          paths: 'README.md',
          contracts: 'resume after an interrupted lock owner',
        },
        repository,
      );

      expect(ledger.units.map(({ id }) => id)).toContain(
        'recovered-after-interruption',
      );
      expect(existsSync(lockFile)).toBe(false);
    });
  });

  it('cleans up the transaction lock when a mutating command fails', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      const ledgerFile = ledgerModule.ledgerPath('.tmp/agent-work', repository);
      const before = readFileSync(ledgerFile, 'utf8');

      expect(() =>
        ledgerModule.execute(
          'add',
          {
            unit: 'invalid-unit',
            kind: 'unsupported-kind',
            contracts: 'reject invalid work',
          },
          repository,
        ),
      ).toThrow('Invalid unit kind');
      expect(existsSync(`${ledgerFile}.lock`)).toBe(false);
      expect(readFileSync(ledgerFile, 'utf8')).toBe(before);
    });
  });

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

  it.each(['continue', 'status', 'summary'])(
    'enters recovery for a %s control prompt and exposes dependency-ready work',
    (intent) => {
      withTemporaryRepository((repository) => {
        initialize(repository);
        addReview(repository);
        ledgerModule.execute(
          'add',
          {
            unit: 'synthesis',
            kind: 'synthesis',
            paths: 'src/ts/layout-manager.ts',
            contracts: 'synthesize recovered review evidence',
            dependencies: 'runtime-review',
            commands: 'npm test',
          },
          repository,
        );
        ledgerModule.execute(
          'start',
          { unit: 'runtime-review', owner: 'agent-1' },
          repository,
        );

        const recovered = ledgerModule.execute(
          'enter',
          { intent },
          repository,
          new Date('2026-08-13T01:00:00.000Z'),
        );
        const summary = ledgerModule.summarize(recovered);

        expect(recovered.units[0]).toMatchObject({
          id: 'runtime-review',
          status: 'interrupted',
        });
        expect(summary.readyUnits).toEqual(['runtime-review']);
        expect(recovered.units[1]).toMatchObject({
          id: 'synthesis',
          status: 'pending',
        });

        const repeated = ledgerModule.execute(
          'enter',
          { intent },
          repository,
          new Date('2026-08-13T02:00:00.000Z'),
        );
        expect(ledgerModule.summarize(repeated).readyUnits).toEqual([
          'runtime-review',
        ]);
        expect(repeated.updatedAt).toBe(recovered.updatedAt);
      });
    },
  );

  it('rejects an unknown recovery intent without changing the ledger', () => {
    withTemporaryRepository((repository) => {
      initialize(repository);
      addReview(repository);
      const fileName = join(repository, '.tmp', 'agent-work', 'active.json');
      const before = readFileSync(fileName, 'utf8');

      expect(() =>
        ledgerModule.execute(
          'enter',
          { intent: 'restart-everything' },
          repository,
        ),
      ).toThrow('Invalid recovery intent');
      expect(readFileSync(fileName, 'utf8')).toBe(before);
    });
  });

  it('reports an empty recovery entry when no active ledger exists', () => {
    withTemporaryRepository((repository) => {
      const output = execFileSync(
        process.execPath,
        [
          resolve('scripts/agent-work-ledger.js'),
          'enter',
          '--intent',
          'status',
          '--root',
          '.tmp/missing-ledger',
        ],
        { cwd: repository, encoding: 'utf8' },
      );

      expect(JSON.parse(output)).toEqual({
        status: 'no-active-ledger',
        intent: 'status',
        readyUnits: [],
      });
    });
  });

  it('enters active recovery through the CLI with stable ready-unit ordering', () => {
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
      ledgerModule.execute(
        'add',
        {
          unit: 'docs-review',
          kind: 'review',
          paths: 'README.md',
          contracts: 'preserve unaffected review evidence',
          commands: 'npm test',
        },
        repository,
      );
      ledgerModule.execute(
        'start',
        { unit: 'docs-review', owner: 'agent-2' },
        repository,
      );
      ledgerModule.execute(
        'complete',
        {
          unit: 'docs-review',
          report: writeReport(repository, { inspectedPaths: ['README.md'] }),
        },
        repository,
      );
      for (const unit of ['z-ready', 'a-ready']) {
        ledgerModule.execute(
          'add',
          {
            unit,
            kind: 'implementation',
            paths: 'src/ts/layout-manager.ts',
            contracts: `resume ${unit} in ledger order`,
          },
          repository,
        );
      }
      ledgerModule.execute(
        'add',
        {
          unit: 'blocked-synthesis',
          kind: 'synthesis',
          paths: 'src/ts/layout-manager.ts',
          contracts: 'wait for recovered review evidence',
          dependencies: 'runtime-review',
        },
        repository,
      );
      writeFileSync(
        join(repository, 'src', 'ts', 'layout-manager.ts'),
        'changed\n',
      );

      const output = execFileSync(
        process.execPath,
        [
          resolve('scripts/agent-work-ledger.js'),
          'enter',
          '--intent',
          'continue',
        ],
        { cwd: repository, encoding: 'utf8' },
      );
      const summary = JSON.parse(output) as { readyUnits: string[] };
      const ledger = JSON.parse(
        readFileSync(
          join(repository, '.tmp', 'agent-work', 'active.json'),
          'utf8',
        ),
      ) as Ledger;

      expect(summary.readyUnits).toEqual([
        'runtime-review',
        'z-ready',
        'a-ready',
      ]);
      expect(ledger.workingPaths).toContain('src/ts/layout-manager.ts');
      expect(
        ledger.units.find(({ id }) => id === 'runtime-review')?.status,
      ).toBe('invalidated');
      expect(ledger.units.find(({ id }) => id === 'docs-review')?.status).toBe(
        'carried-forward',
      );
      expect(
        ledger.units.find(({ id }) => id === 'blocked-synthesis')?.status,
      ).toBe('invalidated');
      expect(summary.readyUnits).not.toContain('blocked-synthesis');
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
    unit.checkpoint!.findings = [
      {
        severity: 'low',
        status: 'deferred',
        summary: 'Local cleanup can follow later.',
      },
    ];
    expect(() => ledgerModule.validateLedger(ledger)).toThrow(
      'deferralRationale',
    );
    unit.checkpoint!.findings[0].deferralRationale =
      'No user-visible effect; tracked for the next cleanup slice.';
    expect(() => ledgerModule.validateLedger(ledger)).not.toThrow();
    unit.checkpoint!.findings = [
      {
        severity: 'medium',
        status: 'deferred',
        summary: 'Material defect cannot be deferred.',
        deferralRationale: 'Would block the current outcome.',
      },
    ];
    expect(() => ledgerModule.validateLedger(ledger)).toThrow(
      'can defer only Low findings',
    );
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

  it('reports both source and destination paths for dirty and committed renames', () => {
    withTemporaryRepository((repository) => {
      const sourcePath = 'src/rename-source.ts';
      const destinationPath = 'src/rename-destination.ts';
      writeFileSync(join(repository, sourcePath), 'export const value = 1;\n');
      execFileSync('git', ['add', '.'], { cwd: repository });
      execFileSync('git', ['commit', '-m', 'Add rename source.'], {
        cwd: repository,
      });
      const before = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();

      execFileSync('git', ['mv', sourcePath, destinationPath], {
        cwd: repository,
      });
      expect(ledgerModule.currentSourceState(repository).workingPaths).toEqual(
        expect.arrayContaining([sourcePath, destinationPath]),
      );
      execFileSync('git', ['commit', '-am', 'Rename source.'], {
        cwd: repository,
      });
      const after = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();

      expect(ledgerModule.gitChangedPaths(before, after, repository)).toEqual(
        expect.arrayContaining([sourcePath, destinationPath]),
      );
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
      'npm run agent:ledger -- enter --intent <continue|status|summary>',
    );
    expect(rootPolicy).toContain(
      'docs/contributing/autonomous-task-recovery.md',
    );
    expect(recoveryPolicy).toContain('selectively invalidates');
    expect(recoveryPolicy).toContain('next user control prompt');
    expect(recoveryPolicy).toContain(
      'npm run agent:ledger -- enter --intent continue',
    );
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
