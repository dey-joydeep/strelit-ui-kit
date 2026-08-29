const { execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const nodePath = require('node:path');
const dirname = (value) => nodePath.dirname(value);
const isAbsolute = (value) => nodePath.isAbsolute(value);
const join = (...values) => nodePath.join(...values);
const relative = (from, to) => nodePath.relative(from, to);
const resolve = (...values) => nodePath.resolve(...values);
const { sep } = nodePath;
const {
  canonicalDomains,
  createPullRequestReviewGate,
} = require('./change-review-policy.js');

const schemaVersion = 1;
const defaultRoot = '.tmp/agent-work';
const validKinds = new Set([
  'implementation',
  'review',
  'verification',
  'synthesis',
]);
const validStatuses = new Set([
  'pending',
  'running',
  'interrupted',
  'completed',
  'carried-forward',
  'invalidated',
]);
const validReviewScopes = new Set(['domain', 'whole-pr']);
const validReviewPasses = new Set(['fresh-discovery', 'finding-closure']);
const validRecoveryIntents = new Set(['continue', 'status', 'summary']);
const mutatingCommands = new Set([
  'init',
  'add',
  'start',
  'checkpoint',
  'complete',
  'interrupt',
  'recover',
  'enter',
  'finish',
]);
const ledgerLockTimeoutMs = 30_000;
const ledgerLockStaleMs = 10_000;
const ledgerLockRetryMs = 25;
const ledgerLockIdentityProbeMs = 1_000;
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function parseArguments(args) {
  const [command = 'status', ...rest] = args;
  const options = {};
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = value;
      index++;
    }
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required option: --${name}`);
  }
  return value.trim();
}

function requireRecoveryIntent(options) {
  const intent = requireOption(options, 'intent').toLowerCase();
  if (!validRecoveryIntents.has(intent)) {
    throw new Error(
      `Invalid recovery intent: ${intent}; expected continue, status, or summary.`,
    );
  }
  return intent;
}

function splitList(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function splitContracts(value) {
  if (typeof value !== 'string') {
    return [];
  }
  return [
    ...new Set(
      value
        .split(';')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizePath(fileName) {
  const normalized = fileName.replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    normalized.length === 0 ||
    isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new Error(`Path must remain repository-relative: ${fileName}`);
  }
  return normalized;
}

function normalizePaths(paths) {
  return [...new Set(paths.map(normalizePath))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function ledgerPath(root = defaultRoot, cwd = process.cwd()) {
  const resolvedCwd = realpathSync(cwd);
  const resolvedRoot = resolve(resolvedCwd, root);
  const relativeRoot = relative(resolvedCwd, resolvedRoot);
  if (
    relativeRoot === '' ||
    relativeRoot === '..' ||
    relativeRoot.startsWith(`..${sep}`)
  ) {
    throw new Error(
      'Ledger root must be a contained directory, not the repository root.',
    );
  }
  assertNoLinks(resolvedCwd, resolvedRoot);
  const fileName = join(resolvedRoot, 'active.json');
  assertNoLinks(resolvedCwd, fileName);
  return fileName;
}

function assertNoLinks(cwd, target) {
  const relativeTarget = relative(cwd, target);
  let candidate = cwd;
  for (const segment of relativeTarget.split(sep).filter(Boolean)) {
    candidate = join(candidate, segment);
    if (!existsSync(candidate)) {
      continue;
    }
    if (lstatSync(candidate).isSymbolicLink()) {
      throw new Error(
        `Path traverses a symbolic link or junction: ${candidate}`,
      );
    }
  }
}

function containedPath(fileName, cwd) {
  const resolvedCwd = realpathSync(cwd);
  const target = resolve(resolvedCwd, fileName);
  const relativeTarget = relative(resolvedCwd, target);
  if (
    relativeTarget === '' ||
    relativeTarget === '..' ||
    relativeTarget.startsWith(`..${sep}`)
  ) {
    throw new Error(`Path must remain inside the repository: ${fileName}`);
  }
  assertNoLinks(resolvedCwd, target);
  return target;
}

function gitOutput(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitPaths(args, cwd) {
  const output = execFileSync('git', [...args, '-z'], {
    cwd,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return normalizePaths(output.toString('utf8').split('\0').filter(Boolean));
}

function currentSourceState(cwd = process.cwd()) {
  const head = gitOutput(['rev-parse', 'HEAD'], cwd);
  const trackedPaths = gitPaths(
    ['diff', '--name-only', '--no-renames', 'HEAD'],
    cwd,
  );
  const untrackedPaths = gitPaths(
    ['ls-files', '--others', '--exclude-standard'],
    cwd,
  );
  const workingPaths = normalizePaths([...trackedPaths, ...untrackedPaths]);
  const hash = createHash('sha256');
  hash.update(`${head}\0`);
  hash.update(gitOutput(['diff', '--binary', 'HEAD'], cwd));
  for (const path of normalizePaths(untrackedPaths)) {
    hash.update(`\0${path}\0`);
    hash.update(readFileSync(containedPath(path, cwd)));
  }
  return { head, fingerprint: hash.digest('hex'), workingPaths };
}

function readJson(fileName, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(fileName, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${label} ${fileName}: ${String(error)}`);
  }
  return parsed;
}

function readLedger(root, cwd) {
  const fileName = ledgerPath(root, cwd);
  if (!existsSync(fileName)) {
    throw new Error(`No active agent ledger at ${fileName}`);
  }
  const ledger = readJson(fileName, 'ledger');
  validateLedger(ledger);
  return { fileName, ledger };
}

function sleep(milliseconds) {
  Atomics.wait(sleepBuffer, 0, 0, milliseconds);
}

function lockPath(fileName) {
  return `${fileName}.lock`;
}

function processExistence(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return 'unknown';
  }
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      ['ESRCH', 'EINVAL'].includes(error.code)
    ) {
      return 'missing';
    }
    return 'unknown';
  }
}

function readProcessInstanceIdentity(
  pid,
  platform = process.platform,
  executeFile = execFileSync,
  timeoutMs = ledgerLockTimeoutMs,
) {
  const existence = processExistence(pid);
  if (existence !== 'alive') {
    return { status: existence };
  }
  try {
    let identity;
    if (platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8').trim();
      const commandEnd = stat.lastIndexOf(')');
      const fields = stat.slice(commandEnd + 2).split(/\s+/);
      const startTime = fields[19];
      const bootId = readFileSync(
        '/proc/sys/kernel/random/boot_id',
        'utf8',
      ).trim();
      if (commandEnd < 0 || startTime === undefined || bootId.length === 0) {
        throw new Error('Linux process identity fields are unavailable.');
      }
      identity = `linux:${bootId}:${startTime}`;
    } else if (platform === 'win32') {
      const ticks = executeFile(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `[System.Diagnostics.Process]::GetProcessById(${pid}).StartTime.ToUniversalTime().Ticks`,
        ],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: Math.max(1, Math.ceil(timeoutMs)),
          windowsHide: true,
        },
      ).trim();
      if (!/^\d+$/.test(ticks)) {
        throw new Error('Windows process start time is unavailable.');
      }
      identity = `win32:${ticks}`;
    } else {
      const startedAt = execFileSync(
        'ps',
        ['-o', 'lstart=', '-p', String(pid)],
        {
          encoding: 'utf8',
          env: { ...process.env, LC_ALL: 'C' },
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5_000,
        },
      ).trim();
      if (startedAt.length === 0) {
        throw new Error('POSIX process start time is unavailable.');
      }
      identity = `${platform}:${startedAt}`;
    }
    return { status: 'alive', identity };
  } catch {
    const currentExistence = processExistence(pid);
    return currentExistence === 'missing'
      ? { status: 'missing' }
      : { status: 'unknown' };
  }
}

let cachedCurrentProcessIdentity;
function currentProcessInstanceIdentity(timeoutMs = ledgerLockTimeoutMs) {
  if (cachedCurrentProcessIdentity === undefined) {
    const current = readProcessInstanceIdentity(
      process.pid,
      process.platform,
      execFileSync,
      timeoutMs,
    );
    if (current.status === 'alive' && current.identity !== undefined) {
      cachedCurrentProcessIdentity = current.identity;
    }
    return current;
  }
  return { status: 'alive', identity: cachedCurrentProcessIdentity };
}

function lockOwnerState(owner, identityLookup = readProcessInstanceIdentity) {
  if (
    owner === null ||
    typeof owner !== 'object' ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid <= 0 ||
    typeof owner.processIdentity !== 'string' ||
    owner.processIdentity.length === 0
  ) {
    return 'unknown';
  }
  const current =
    owner.pid === process.pid && identityLookup === readProcessInstanceIdentity
      ? currentProcessInstanceIdentity()
      : identityLookup(owner.pid);
  if (current.status === 'missing') {
    return 'dead';
  }
  if (current.status !== 'alive' || typeof current.identity !== 'string') {
    return 'unknown';
  }
  return current.identity === owner.processIdentity ? 'live' : 'dead';
}

function readLock(fileName) {
  let stats;
  try {
    stats = lstatSync(fileName);
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      error.code === 'ENOENT'
    ) {
      return undefined;
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`Ledger lock must not be a symbolic link: ${fileName}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Ledger lock must be a directory: ${fileName}`);
  }
  const ownerFile = join(fileName, 'owner.json');
  let rawOwner = '';
  let owner;
  try {
    rawOwner = readFileSync(ownerFile, 'utf8');
    owner = JSON.parse(rawOwner);
  } catch {
    owner = undefined;
  }
  const directoryIdentity = createHash('sha256')
    .update(`${stats.dev}\0${stats.ino}\0${stats.birthtimeMs}`)
    .digest('hex');
  const identity = createHash('sha256')
    .update(directoryIdentity)
    .update(`\0${rawOwner}`)
    .digest('hex');
  return { owner, modifiedAt: stats.mtimeMs, directoryIdentity, identity };
}

function prepareReclaimFence(fileName, observed) {
  const reclaimDirectory = `${fileName}.reclaim-${observed.identity}`;
  try {
    mkdirSync(reclaimDirectory, { mode: 0o700 });
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      error.code === 'ENOENT'
    ) {
      return false;
    }
    if (
      error === null ||
      typeof error !== 'object' ||
      error.code !== 'EEXIST'
    ) {
      throw error;
    }
    const reclaimStats = lstatSync(reclaimDirectory);
    if (reclaimStats.isSymbolicLink() || !reclaimStats.isDirectory()) {
      throw new Error(
        `Ledger reclaim fence must be a directory: ${reclaimDirectory}`,
      );
    }
  }
  return reclaimDirectory;
}

function moveLockBehindReclaimFence(fileName, reclaimDirectory, beforeRename) {
  beforeRename?.();
  const staleTarget = join(reclaimDirectory, 'stale');
  try {
    renameSync(fileName, staleTarget);
    return true;
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      (['EEXIST', 'ENOENT', 'ENOTEMPTY'].includes(error.code) ||
        (['EACCES', 'EPERM'].includes(error.code) && existsSync(staleTarget)))
    ) {
      return false;
    }
    throw error;
  }
}

function reclaimStaleLock(
  fileName,
  observed,
  staleMs,
  now = Date.now(),
  identityLookup = readProcessInstanceIdentity,
  beforeRename,
) {
  if (
    now - observed.modifiedAt < staleMs ||
    lockOwnerState(observed.owner, identityLookup) !== 'dead'
  ) {
    return false;
  }

  const reclaimDirectory = prepareReclaimFence(fileName, observed);

  const current = readLock(fileName);
  if (
    current === undefined ||
    current.identity !== observed.identity ||
    now - current.modifiedAt < staleMs ||
    lockOwnerState(current.owner, identityLookup) !== 'dead'
  ) {
    return false;
  }

  const marker = join(fileName, `.reclaim-${observed.identity}`);
  try {
    writeFileSync(marker, '', { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      error.code === 'ENOENT'
    ) {
      return false;
    }
    if (
      error === null ||
      typeof error !== 'object' ||
      error.code !== 'EEXIST'
    ) {
      throw error;
    }
  }
  const confirmed = readLock(fileName);
  if (confirmed === undefined || confirmed.identity !== observed.identity) {
    return false;
  }
  return moveLockBehindReclaimFence(fileName, reclaimDirectory, beforeRename);
}

function removeLockDirectoryIfIdentity(fileName, directoryIdentity) {
  const current = readLock(fileName);
  if (
    current === undefined ||
    current.directoryIdentity !== directoryIdentity
  ) {
    return false;
  }
  rmSync(fileName, { force: true, recursive: true });
  return true;
}

function publishLedgerLock(fileLock, owner, token, beforePublish) {
  const candidate = `${fileLock}.candidate-${token}`;
  let candidateDirectoryIdentity;
  try {
    mkdirSync(candidate, { mode: 0o700 });
    writeFileSync(join(candidate, 'owner.json'), `${JSON.stringify(owner)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    candidateDirectoryIdentity = readLock(candidate).directoryIdentity;
    beforePublish?.();
    renameSync(candidate, fileLock);
    return { fileName: fileLock, token };
  } catch (error) {
    if (candidateDirectoryIdentity !== undefined) {
      removeLockDirectoryIfIdentity(candidate, candidateDirectoryIdentity);
    }
    throw error;
  }
}

function acquireLedgerLock(
  fileName,
  {
    timeoutMs = ledgerLockTimeoutMs,
    staleMs = ledgerLockStaleMs,
    retryMs = ledgerLockRetryMs,
    identityLookup = (pid, remainingMs) =>
      readProcessInstanceIdentity(
        pid,
        process.platform,
        execFileSync,
        remainingMs,
      ),
  } = {},
) {
  for (const [value, label] of [
    [timeoutMs, 'timeoutMs'],
    [staleMs, 'staleMs'],
    [retryMs, 'retryMs'],
  ]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Ledger lock ${label} must be a non-negative number.`);
    }
  }
  if (retryMs === 0) {
    throw new Error('Ledger lock retryMs must be greater than zero.');
  }

  mkdirSync(dirname(fileName), { recursive: true });
  const fileLock = lockPath(fileName);
  const startedAt = Date.now();
  const token = `${process.pid}-${randomUUID()}`;
  const processState = currentProcessInstanceIdentity();
  if (processState.status !== 'alive' || processState.identity === undefined) {
    throw new Error(
      `Cannot establish process instance identity for ledger lock owner ${process.pid}.`,
    );
  }
  const owner = {
    pid: process.pid,
    token,
    createdAt: new Date(startedAt).toISOString(),
    processIdentity: processState.identity,
  };

  let contended = false;
  let nextIdentityProbeAt = 0;
  let existingPid;
  while (true) {
    const elapsed = Date.now() - startedAt;
    if (contended && elapsed >= timeoutMs) {
      const ownerLabel = Number.isSafeInteger(existingPid)
        ? `process ${existingPid}`
        : 'an unknown process';
      throw new Error(
        `Timed out waiting for ledger transaction lock held by ${ownerLabel}.`,
      );
    }
    try {
      return publishLedgerLock(fileLock, owner, token);
    } catch (error) {
      if (
        error === null ||
        typeof error !== 'object' ||
        !['EACCES', 'EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code) ||
        !existsSync(fileLock)
      ) {
        throw error;
      }
    }
    contended = true;

    const existing = readLock(fileLock);
    if (existing === undefined) {
      continue;
    }
    const age = Date.now() - existing.modifiedAt;
    existingPid = existing.owner?.pid;
    const now = Date.now();
    if (age >= staleMs && now >= nextIdentityProbeAt) {
      nextIdentityProbeAt = now + ledgerLockIdentityProbeMs;
      const boundedIdentityLookup = (pid) =>
        identityLookup(pid, Math.max(1, timeoutMs - (Date.now() - startedAt)));
      if (
        reclaimStaleLock(
          fileLock,
          existing,
          staleMs,
          now,
          boundedIdentityLookup,
        )
      ) {
        continue;
      }
    }
    sleep(Math.min(retryMs, Math.max(1, timeoutMs - (Date.now() - startedAt))));
  }
}

function releaseLedgerLock(lock) {
  const existing = readLock(lock.fileName);
  if (existing === undefined) {
    throw new Error(
      `Cannot release ledger transaction lock because it is missing: ${lock.fileName}`,
    );
  }
  if (existing.owner?.token !== lock.token) {
    throw new Error(
      `Cannot release ledger transaction lock because ownership changed: ${lock.fileName}`,
    );
  }
  rmSync(lock.fileName, { recursive: true });
}

function withLedgerTransaction(fileName, transaction, lockOptions) {
  const lock = acquireLedgerLock(fileName, lockOptions);
  let failed = false;
  let failure;
  let result;
  try {
    result = transaction();
  } catch (error) {
    failed = true;
    failure = error;
  }
  try {
    releaseLedgerLock(lock);
  } catch (cleanupError) {
    if (failed) {
      throw new AggregateError(
        [failure, cleanupError],
        `Ledger transaction failed and lock cleanup also failed: ${String(failure)}`,
      );
    }
    throw cleanupError;
  }
  if (failed) {
    throw failure;
  }
  return result;
}

function writeLedger(fileName, ledger, now = new Date()) {
  const nextLedger = { ...ledger, updatedAt: now.toISOString() };
  validateLedger(nextLedger);
  if (existsSync(fileName)) {
    const previousLedger = readJson(fileName, 'ledger');
    validateLedger(previousLedger);
    const semanticCandidate = {
      ...nextLedger,
      updatedAt: previousLedger.updatedAt,
    };
    if (JSON.stringify(previousLedger) === JSON.stringify(semanticCandidate)) {
      return previousLedger;
    }
  }
  mkdirSync(dirname(fileName), { recursive: true });
  const temporary = `${fileName}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(nextLedger, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    renameSync(temporary, fileName);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  return nextLedger;
}

function validateString(value, label, minimum = 1) {
  if (typeof value !== 'string' || value.trim().length < minimum) {
    throw new Error(
      `${label} must be a string of at least ${minimum} characters.`,
    );
  }
}

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unsupported property: ${key}`);
    }
  }
}

function validateStringArray(
  value,
  label,
  { paths = false, minimum = 0 } = {},
) {
  if (!Array.isArray(value) || value.length < minimum) {
    throw new Error(
      `${label} must be an array with at least ${minimum} entries.`,
    );
  }
  const seen = new Set();
  for (const item of value) {
    validateString(item, `${label} entry`);
    if (paths) {
      normalizePath(item);
    }
    if (seen.has(item)) {
      throw new Error(`${label} contains a duplicate entry: ${item}`);
    }
    seen.add(item);
  }
}

function validateReport(report, label = 'checkpoint') {
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error(`${label} must be an object.`);
  }
  rejectUnknownKeys(
    report,
    new Set([
      'lastVerifiedHead',
      'inspectedPaths',
      'remainingPaths',
      'commands',
      'findingSummary',
      'findings',
      'uninspected',
      'sourceFingerprint',
      'verdict',
      'coverage',
      'reviewedBase',
      'reviewedHead',
    ]),
    label,
  );
  validateString(report.lastVerifiedHead, `${label}.lastVerifiedHead`);
  validateString(report.sourceFingerprint, `${label}.sourceFingerprint`);
  if (report.reviewedBase !== undefined) {
    validateString(report.reviewedBase, `${label}.reviewedBase`);
  }
  if (report.reviewedHead !== undefined) {
    validateString(report.reviewedHead, `${label}.reviewedHead`);
  }
  validateStringArray(report.inspectedPaths, `${label}.inspectedPaths`, {
    paths: true,
  });
  validateStringArray(report.remainingPaths, `${label}.remainingPaths`, {
    paths: true,
  });
  validateString(report.findingSummary, `${label}.findingSummary`, 4);
  if (!Array.isArray(report.findings)) {
    throw new Error(`${label}.findings must be an array.`);
  }
  for (const finding of report.findings) {
    if (
      finding === null ||
      typeof finding !== 'object' ||
      Array.isArray(finding)
    ) {
      throw new Error(`${label}.findings entries must be objects.`);
    }
    rejectUnknownKeys(
      finding,
      new Set([
        'severity',
        'status',
        'summary',
        'acceptanceEvidence',
        'deferralRationale',
      ]),
      `${label}.finding`,
    );
    if (!['critical', 'high', 'medium', 'low'].includes(finding.severity)) {
      throw new Error(
        `${label}.finding has invalid severity: ${finding.severity}`,
      );
    }
    if (!['open', 'closed', 'accepted', 'deferred'].includes(finding.status)) {
      throw new Error(`${label}.finding has invalid status: ${finding.status}`);
    }
    validateString(finding.summary, `${label}.finding.summary`);
    if (finding.status === 'accepted') {
      if (finding.severity !== 'medium') {
        throw new Error(
          `${label} cannot accept Critical, High, or Low findings.`,
        );
      }
      validateString(
        finding.acceptanceEvidence,
        `${label}.finding.acceptanceEvidence`,
        4,
      );
    }
    if (finding.status === 'deferred') {
      if (finding.severity !== 'low') {
        throw new Error(`${label} can defer only Low findings.`);
      }
      validateString(
        finding.deferralRationale,
        `${label}.finding.deferralRationale`,
        4,
      );
    }
  }
  validateStringArray(report.uninspected, `${label}.uninspected`);
  if (
    report.verdict !== undefined &&
    !['pass', 'changes-requested', 'blocked'].includes(report.verdict)
  ) {
    throw new Error(`${label}.verdict is invalid: ${report.verdict}`);
  }
  if (report.coverage !== undefined) {
    if (!Array.isArray(report.coverage)) {
      throw new Error(`${label}.coverage must be an array.`);
    }
    const paths = new Set();
    for (const entry of report.coverage) {
      rejectUnknownKeys(
        entry,
        new Set(['path', 'domains', 'contract', 'adjacentPaths', 'tests']),
        `${label}.coverage entry`,
      );
      const path = normalizePath(entry.path);
      if (paths.has(path)) {
        throw new Error(`${label}.coverage repeats path: ${path}`);
      }
      paths.add(path);
      validateStringArray(entry.domains, `${path}.domains`, { minimum: 1 });
      validateString(entry.contract, `${path}.contract`, 4);
      validateStringArray(entry.adjacentPaths, `${path}.adjacentPaths`, {
        paths: true,
        minimum: 1,
      });
      validateStringArray(entry.tests, `${path}.tests`, { minimum: 1 });
    }
  }
  if (!Array.isArray(report.commands)) {
    throw new Error(`${label}.commands must be an array.`);
  }
  for (const command of report.commands) {
    if (command === null || typeof command !== 'object') {
      throw new Error(`${label}.commands entries must be objects.`);
    }
    rejectUnknownKeys(
      command,
      new Set(['command', 'exitCode', 'head', 'sourceFingerprint']),
      `${label}.commands entry`,
    );
    validateString(command.command, `${label}.commands.command`);
    if (!Number.isInteger(command.exitCode)) {
      throw new Error(`${label}.commands.exitCode must be an integer.`);
    }
    validateString(command.head, `${label}.commands.head`);
    validateString(
      command.sourceFingerprint,
      `${label}.commands.sourceFingerprint`,
    );
  }
}

function validateReviewAssignment(review, label) {
  if (review === null || typeof review !== 'object' || Array.isArray(review)) {
    throw new Error(`${label} must be an object.`);
  }
  rejectUnknownKeys(
    review,
    new Set(['reviewer', 'scope', 'pass', 'domains']),
    label,
  );
  validateString(review.reviewer, `${label}.reviewer`);
  if (!validReviewScopes.has(review.scope)) {
    throw new Error(`${label}.scope is invalid: ${review.scope}`);
  }
  if (!validReviewPasses.has(review.pass)) {
    throw new Error(`${label}.pass is invalid: ${review.pass}`);
  }
  validateStringArray(review.domains, `${label}.domains`, { minimum: 1 });
  for (const domain of review.domains) {
    if (!canonicalDomains.includes(domain)) {
      throw new Error(`${label} contains an invalid domain: ${domain}`);
    }
  }
}

function validateReviewGate(reviewGate) {
  if (
    reviewGate === null ||
    typeof reviewGate !== 'object' ||
    Array.isArray(reviewGate)
  ) {
    throw new Error('reviewGate must be an object.');
  }
  rejectUnknownKeys(
    reviewGate,
    new Set([
      'mode',
      'implementer',
      'risk',
      'requiredPaths',
      'requiredCoverage',
      'applicableDomains',
      'nonGeneratedLines',
      'largeHighRisk',
    ]),
    'reviewGate',
  );
  if (reviewGate.mode !== 'pull-request') {
    throw new Error(`Unsupported review gate mode: ${reviewGate.mode}`);
  }
  validateString(reviewGate.implementer, 'reviewGate.implementer');
  if (!['low', 'medium', 'high'].includes(reviewGate.risk)) {
    throw new Error(`Invalid reviewGate risk: ${reviewGate.risk}`);
  }
  validateStringArray(reviewGate.requiredPaths, 'reviewGate.requiredPaths', {
    paths: true,
  });
  validateStringArray(
    reviewGate.applicableDomains,
    'reviewGate.applicableDomains',
  );
  if (
    !Number.isInteger(reviewGate.nonGeneratedLines) ||
    reviewGate.nonGeneratedLines < 0
  ) {
    throw new Error(
      'reviewGate.nonGeneratedLines must be a nonnegative integer.',
    );
  }
  if (typeof reviewGate.largeHighRisk !== 'boolean') {
    throw new Error('reviewGate.largeHighRisk must be boolean.');
  }
  if (!Array.isArray(reviewGate.requiredCoverage)) {
    throw new Error('reviewGate.requiredCoverage must be an array.');
  }
  const coveredPaths = new Set();
  for (const entry of reviewGate.requiredCoverage) {
    rejectUnknownKeys(entry, new Set(['path', 'domains']), 'coverage entry');
    const path = normalizePath(entry.path);
    if (coveredPaths.has(path)) {
      throw new Error(`reviewGate repeats coverage path: ${path}`);
    }
    coveredPaths.add(path);
    validateStringArray(entry.domains, `${path}.domains`, { minimum: 1 });
    for (const domain of entry.domains) {
      if (!canonicalDomains.includes(domain)) {
        throw new Error(`reviewGate contains an invalid domain: ${domain}`);
      }
    }
  }
  if (
    coveredPaths.size !== reviewGate.requiredPaths.length ||
    reviewGate.requiredPaths.some((path) => !coveredPaths.has(path))
  ) {
    throw new Error(
      'reviewGate coverage paths must match requiredPaths exactly.',
    );
  }
}

function validateLedger(ledger) {
  if (ledger === null || typeof ledger !== 'object' || Array.isArray(ledger)) {
    throw new Error('Ledger must be an object.');
  }
  rejectUnknownKeys(
    ledger,
    new Set([
      'schemaVersion',
      'taskId',
      'baseHead',
      'currentHead',
      'status',
      'units',
      'updatedAt',
      'currentFingerprint',
      'workingPaths',
      'reviewGate',
    ]),
    'Ledger',
  );
  if (ledger.schemaVersion !== schemaVersion) {
    throw new Error(
      `Unsupported ledger schema version: ${ledger.schemaVersion}`,
    );
  }
  validateString(ledger.taskId, 'taskId');
  validateString(ledger.baseHead, 'baseHead');
  validateString(ledger.currentHead, 'currentHead');
  validateString(ledger.currentFingerprint, 'currentFingerprint');
  validateStringArray(ledger.workingPaths, 'workingPaths', { paths: true });
  if (ledger.reviewGate !== undefined) {
    validateReviewGate(ledger.reviewGate);
  }
  if (!['active', 'complete'].includes(ledger.status)) {
    throw new Error(`Invalid ledger status: ${ledger.status}`);
  }
  validateString(ledger.updatedAt, 'updatedAt');
  if (Number.isNaN(Date.parse(ledger.updatedAt))) {
    throw new Error('updatedAt must be an ISO-compatible date-time.');
  }
  if (!Array.isArray(ledger.units)) {
    throw new Error('units must be an array.');
  }
  const ids = new Set();
  for (const unit of ledger.units) {
    rejectUnknownKeys(
      unit,
      new Set([
        'id',
        'kind',
        'status',
        'head',
        'assignedPaths',
        'adjacentPaths',
        'contracts',
        'dependencies',
        'requiredCommands',
        'owner',
        'startedAt',
        'checkpoint',
        'carryForward',
        'sourceFingerprint',
        'review',
      ]),
      'unit',
    );
    validateString(unit.id, 'unit.id');
    if (ids.has(unit.id)) {
      throw new Error(`Duplicate unit id: ${unit.id}`);
    }
    ids.add(unit.id);
    if (!validKinds.has(unit.kind)) {
      throw new Error(`Invalid unit kind for ${unit.id}: ${unit.kind}`);
    }
    if (!validStatuses.has(unit.status)) {
      throw new Error(`Invalid unit status for ${unit.id}: ${unit.status}`);
    }
    validateString(unit.head, `${unit.id}.head`);
    if (unit.sourceFingerprint !== undefined) {
      validateString(unit.sourceFingerprint, `${unit.id}.sourceFingerprint`);
    }
    validateStringArray(unit.assignedPaths, `${unit.id}.assignedPaths`, {
      paths: true,
    });
    validateStringArray(unit.adjacentPaths, `${unit.id}.adjacentPaths`, {
      paths: true,
    });
    validateStringArray(unit.contracts, `${unit.id}.contracts`, { minimum: 1 });
    validateStringArray(unit.dependencies, `${unit.id}.dependencies`);
    validateStringArray(unit.requiredCommands, `${unit.id}.requiredCommands`);
    if (unit.review !== undefined) {
      validateReviewAssignment(unit.review, `${unit.id}.review`);
    }
    if (unit.checkpoint !== undefined) {
      validateReport(unit.checkpoint, `${unit.id}.checkpoint`);
    }
    if (unit.owner !== undefined) {
      validateString(unit.owner, `${unit.id}.owner`);
    }
    if (
      unit.startedAt !== undefined &&
      Number.isNaN(Date.parse(unit.startedAt))
    ) {
      throw new Error(
        `${unit.id}.startedAt must be an ISO-compatible date-time.`,
      );
    }
    if (unit.carryForward !== undefined) {
      rejectUnknownKeys(
        unit.carryForward,
        new Set(['fromHead', 'toHead', 'changedPaths']),
        `${unit.id}.carryForward`,
      );
      validateString(
        unit.carryForward.fromHead,
        `${unit.id}.carryForward.fromHead`,
      );
      validateString(
        unit.carryForward.toHead,
        `${unit.id}.carryForward.toHead`,
      );
      validateStringArray(
        unit.carryForward.changedPaths,
        `${unit.id}.carryForward.changedPaths`,
        { paths: true },
      );
    }
    if (['running', 'completed', 'carried-forward'].includes(unit.status)) {
      if (unit.sourceFingerprint === undefined) {
        throw new Error(
          `${unit.id} requires sourceFingerprint in status ${unit.status}.`,
        );
      }
    }
    if (['completed', 'carried-forward'].includes(unit.status)) {
      if (unit.checkpoint === undefined) {
        throw new Error(
          `${unit.id} requires checkpoint evidence in status ${unit.status}.`,
        );
      }
      if (
        unit.checkpoint.lastVerifiedHead !== unit.head ||
        unit.checkpoint.sourceFingerprint !== unit.sourceFingerprint
      ) {
        throw new Error(
          `${unit.id} checkpoint does not match its recorded source.`,
        );
      }
    }
    if (
      unit.status === 'running' &&
      (unit.owner === undefined || unit.startedAt === undefined)
    ) {
      throw new Error(`${unit.id} requires owner and startedAt while running.`);
    }
    if (
      unit.status !== 'running' &&
      (unit.owner !== undefined || unit.startedAt !== undefined)
    ) {
      throw new Error(
        `${unit.id} cannot retain an owner or start time in status ${unit.status}.`,
      );
    }
  }
  for (const unit of ledger.units) {
    for (const dependency of unit.dependencies) {
      if (!ids.has(dependency)) {
        throw new Error(`${unit.id} has unknown dependency: ${dependency}`);
      }
      if (dependency === unit.id) {
        throw new Error(`${unit.id} cannot depend on itself.`);
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (unit) => {
    if (visiting.has(unit.id)) {
      throw new Error(`Dependency cycle includes: ${unit.id}`);
    }
    if (visited.has(unit.id)) {
      return;
    }
    visiting.add(unit.id);
    for (const dependency of unit.dependencies) {
      visit(ledger.units.find((candidate) => candidate.id === dependency));
    }
    visiting.delete(unit.id);
    visited.add(unit.id);
  };
  for (const unit of ledger.units) {
    visit(unit);
  }
  for (const unit of ledger.units) {
    if (['completed', 'carried-forward'].includes(unit.status)) {
      validateCompletion(unit, unit.checkpoint, {
        head: unit.head,
        fingerprint: unit.sourceFingerprint,
      });
    }
  }
  if (
    ledger.status === 'complete' &&
    ledger.units.some(
      (unit) => !['completed', 'carried-forward'].includes(unit.status),
    )
  ) {
    throw new Error('A complete ledger cannot contain incomplete units.');
  }
  return ledger;
}

function findUnit(ledger, id) {
  const unit = ledger.units.find((candidate) => candidate.id === id);
  if (unit === undefined) {
    throw new Error(`Unknown work unit: ${id}`);
  }
  return unit;
}

function loadReport(reportPath, cwd) {
  const report = readJson(containedPath(reportPath, cwd), 'checkpoint report');
  validateReport(report);
  return {
    ...report,
    inspectedPaths: normalizePaths(report.inspectedPaths),
    remainingPaths: normalizePaths(report.remainingPaths),
  };
}

function validateCompletion(unit, report, sourceState) {
  const currentHead = sourceState.head;
  if (report.lastVerifiedHead !== currentHead || unit.head !== currentHead) {
    throw new Error(
      `${unit.id} completion targets ${report.lastVerifiedHead}; current head is ${currentHead}.`,
    );
  }
  if (
    report.sourceFingerprint !== sourceState.fingerprint ||
    unit.sourceFingerprint !== sourceState.fingerprint
  ) {
    throw new Error(
      `${unit.id} completion does not match the current source fingerprint.`,
    );
  }
  const inspected = new Set(report.inspectedPaths);
  const missing = [...unit.assignedPaths, ...unit.adjacentPaths].filter(
    (path) => !inspected.has(path),
  );
  if (missing.length > 0) {
    throw new Error(
      `${unit.id} has uninspected assigned paths: ${missing.join(', ')}`,
    );
  }
  if (report.remainingPaths.length > 0 || report.uninspected.length > 0) {
    throw new Error(`${unit.id} still has remaining or uninspected scope.`);
  }
  for (const required of unit.requiredCommands) {
    const receipt = report.commands.find(
      (command) => command.command === required && command.head === currentHead,
    );
    if (
      receipt === undefined ||
      receipt.exitCode !== 0 ||
      receipt.sourceFingerprint !== sourceState.fingerprint
    ) {
      throw new Error(
        `${unit.id} lacks a successful current-head receipt for: ${required}`,
      );
    }
  }
  const openFindings = report.findings.filter(
    (finding) => finding.status === 'open',
  );
  if (openFindings.length > 0) {
    throw new Error(`${unit.id} has open findings and cannot be completed.`);
  }
}

function sameStringSet(left, right) {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}

function requiredCoveragePairs(reviewGate) {
  return new Set(
    reviewGate.requiredCoverage.flatMap((entry) =>
      entry.domains.map((domain) => `${entry.path}\0${domain}`),
    ),
  );
}

function unitCoveragePairs(unit, reviewGate) {
  const requiredByPath = new Map(
    reviewGate.requiredCoverage.map((entry) => [
      entry.path,
      new Set(entry.domains),
    ]),
  );
  if (!Array.isArray(unit.checkpoint.coverage)) {
    throw new Error(`${unit.id} lacks per-path review evidence.`);
  }
  const evidencePaths = unit.checkpoint.coverage.map((entry) => entry.path);
  if (!sameStringSet(evidencePaths, unit.assignedPaths)) {
    throw new Error(
      `${unit.id} per-path evidence must exactly match assigned paths.`,
    );
  }
  const pairs = new Set();
  for (const evidence of unit.checkpoint.coverage) {
    const path = evidence.path;
    const requiredDomains = requiredByPath.get(path);
    if (requiredDomains === undefined) {
      throw new Error(`${unit.id} assigns unchanged path: ${path}`);
    }
    const applicable = unit.review.domains.filter((domain) =>
      requiredDomains.has(domain),
    );
    if (applicable.length === 0) {
      throw new Error(`${unit.id} assigns no applicable domain for ${path}.`);
    }
    if (!sameStringSet(evidence.domains, applicable)) {
      throw new Error(`${unit.id} domain evidence is incorrect for ${path}.`);
    }
    if (!unit.contracts.includes(evidence.contract)) {
      throw new Error(
        `${unit.id} contract evidence is undeclared for ${path}.`,
      );
    }
    if (
      evidence.adjacentPaths.some(
        (adjacent) =>
          !unit.adjacentPaths.includes(adjacent) ||
          !unit.checkpoint.inspectedPaths.includes(adjacent),
      )
    ) {
      throw new Error(
        `${unit.id} adjacent evidence is uninspected for ${path}.`,
      );
    }
    if (
      evidence.tests.some((command) => !unit.requiredCommands.includes(command))
    ) {
      throw new Error(`${unit.id} test evidence is undeclared for ${path}.`);
    }
    for (const domain of evidence.domains) {
      pairs.add(`${path}\0${domain}`);
    }
  }
  return pairs;
}

function validatePullRequestGate(
  ledger,
  sourceState,
  {
    requireComplete = false,
    expectedBaseHead,
    expectedReviewGate,
    executedCommands = [],
  } = {},
) {
  const gate = ledger.reviewGate;
  if (gate === undefined || gate.mode !== 'pull-request') {
    throw new Error('High-risk pull-request work requires a PR review ledger.');
  }
  if (requireComplete && ledger.status !== 'complete') {
    throw new Error('The definitive PR review ledger is not complete.');
  }
  if (expectedBaseHead === undefined || ledger.baseHead !== expectedBaseHead) {
    throw new Error(
      `PR review base mismatch: ledger ${ledger.baseHead}; expected ${expectedBaseHead ?? '(missing)'}.`,
    );
  }
  if (
    expectedReviewGate === undefined ||
    JSON.stringify(gate) !== JSON.stringify(expectedReviewGate)
  ) {
    throw new Error(
      'Persisted PR review scope does not match the regenerated canonical gate.',
    );
  }
  if (gate.risk !== 'high') {
    return ledger;
  }
  if (
    ledger.currentHead !== sourceState.head ||
    ledger.currentFingerprint !== sourceState.fingerprint
  ) {
    throw new Error('The PR review ledger does not target the current source.');
  }
  if (ledger.workingPaths.length > 0 || sourceState.workingPaths.length > 0) {
    throw new Error(
      'The definitive PR review gate requires a frozen commit with a clean working tree.',
    );
  }

  const implementer = gate.implementer.toLowerCase();
  const currentCompleted = (unit) =>
    unit.status === 'completed' &&
    unit.head === sourceState.head &&
    unit.sourceFingerprint === sourceState.fingerprint;
  const eligibleReview = (unit) =>
    currentCompleted(unit) ||
    (unit.status === 'carried-forward' &&
      unit.carryForward?.toHead === sourceState.head);
  const reviewUnits = ledger.units.filter(
    (unit) => unit.kind === 'review' && eligibleReview(unit),
  );
  const validDiscovery = reviewUnits.filter(
    (unit) =>
      unit.review?.pass === 'fresh-discovery' &&
      unit.checkpoint?.verdict === 'pass',
  );
  if (validDiscovery.length === 0) {
    throw new Error(
      'High-risk PR is missing completed fresh-discovery review coverage.',
    );
  }
  for (const unit of validDiscovery) {
    if (unit.review.reviewer.toLowerCase() === implementer) {
      throw new Error(
        `${unit.id} reviewer must be independent from implementer ${gate.implementer}.`,
      );
    }
    if (unit.adjacentPaths.length === 0) {
      throw new Error(`${unit.id} requires adjacent-path evidence.`);
    }
    if (unit.requiredCommands.length === 0) {
      throw new Error(
        `${unit.id} requires test or inspection command evidence.`,
      );
    }
    const attestedHead =
      unit.status === 'carried-forward' ? unit.head : sourceState.head;
    if (
      unit.checkpoint.reviewedBase !== ledger.baseHead ||
      unit.checkpoint.reviewedHead !== attestedHead
    ) {
      throw new Error(
        `${unit.id} does not attest the exact base/head boundary.`,
      );
    }
    const invalidDomains = unit.review.domains.filter(
      (domain) => !gate.applicableDomains.includes(domain),
    );
    if (invalidDomains.length > 0) {
      throw new Error(
        `${unit.id} declares inapplicable domains: ${invalidDomains.join(', ')}`,
      );
    }
  }

  const requiredPairs = requiredCoveragePairs(gate);
  const coveredPairs = new Set();
  const reviewers = new Set();
  for (const unit of validDiscovery) {
    if (gate.largeHighRisk && unit.review.scope !== 'domain') {
      throw new Error(`${unit.id} must be a domain discovery review.`);
    }
    if (!gate.largeHighRisk && unit.review.scope !== 'whole-pr') {
      throw new Error(`${unit.id} must review the whole PR.`);
    }
    reviewers.add(unit.review.reviewer.toLowerCase());
    for (const pair of unitCoveragePairs(unit, gate)) {
      if (coveredPairs.has(pair)) {
        throw new Error(`Review coverage is assigned more than once: ${pair}`);
      }
      coveredPairs.add(pair);
    }
  }
  const missingPairs = [...requiredPairs].filter(
    (pair) => !coveredPairs.has(pair),
  );
  const extraPairs = [...coveredPairs].filter(
    (pair) => !requiredPairs.has(pair),
  );
  if (missingPairs.length > 0 || extraPairs.length > 0) {
    throw new Error(
      `High-risk PR review coverage does not exactly match the base diff; missing ${missingPairs.length}, extra ${extraPairs.length}.`,
    );
  }
  if (gate.largeHighRisk && reviewers.size < 2) {
    throw new Error(
      'Large high-risk PR review requires at least two independent domain reviewers.',
    );
  }

  const requiredVerification = [
    'npm run verify:ordered',
    'npm run apitest:build',
    'npm run apitest:smoke',
  ];
  if (
    !requiredVerification.every((command) => executedCommands.includes(command))
  ) {
    throw new Error(
      'High-risk PR requires gate-executed ordered, API build, and API smoke verification.',
    );
  }
  const verification = ledger.units.find(
    (unit) =>
      unit.kind === 'verification' &&
      currentCompleted(unit) &&
      requiredVerification.every((command) =>
        unit.requiredCommands.includes(command),
      ),
  );
  if (verification === undefined) {
    throw new Error(
      'High-risk PR synthesis requires an exact-source verification unit.',
    );
  }

  const synthesisUnits = ledger.units.filter(
    (unit) => unit.kind === 'synthesis' && currentCompleted(unit),
  );
  const synthesis = synthesisUnits.find(
    (unit) =>
      unit.review?.scope === 'whole-pr' &&
      unit.review.pass === 'fresh-discovery' &&
      unit.checkpoint?.verdict === 'pass' &&
      sameStringSet(unit.assignedPaths, gate.requiredPaths) &&
      sameStringSet(unit.review.domains, gate.applicableDomains),
  );
  if (synthesis === undefined) {
    throw new Error(
      'High-risk PR requires a passing exact-source whole-PR fresh-discovery synthesis.',
    );
  }
  if (
    synthesis.adjacentPaths.length === 0 ||
    synthesis.requiredCommands.length === 0
  ) {
    throw new Error(
      'Whole-PR synthesis requires adjacent-path and inspection evidence.',
    );
  }
  if (
    synthesis.checkpoint.reviewedBase !== ledger.baseHead ||
    synthesis.checkpoint.reviewedHead !== sourceState.head
  ) {
    throw new Error(
      'Whole-PR synthesis does not attest the exact base/head boundary.',
    );
  }
  const synthesisReviewer = synthesis.review.reviewer.toLowerCase();
  if (synthesisReviewer === implementer) {
    throw new Error(
      `Synthesis reviewer must be independent from implementer ${gate.implementer}.`,
    );
  }
  if (gate.largeHighRisk && reviewers.has(synthesisReviewer)) {
    throw new Error(
      'Large high-risk PR synthesis must use an unused independent reviewer.',
    );
  }
  const requiredDependencies = [
    ...validDiscovery.map((unit) => unit.id),
    verification.id,
  ];
  if (
    requiredDependencies.some(
      (dependency) => !synthesis.dependencies.includes(dependency),
    )
  ) {
    throw new Error(
      'Whole-PR synthesis must depend on every discovery review and verification unit.',
    );
  }
  return ledger;
}

function gitChangedPaths(fromHead, toHead, cwd) {
  try {
    return gitPaths(
      ['diff', '--name-only', '--no-renames', `${fromHead}..${toHead}`],
      cwd,
    );
  } catch {
    return undefined;
  }
}

function canonicalPullRequestBase(cwd) {
  const candidates = [
    process.env.GITHUB_BASE_SHA,
    process.env.STRELIT_REVIEW_BASE_REF,
    'origin/main',
    'main',
  ].filter(
    (candidate) =>
      typeof candidate === 'string' &&
      candidate.length > 0 &&
      !/^0+$/.test(candidate),
  );
  for (const candidate of candidates) {
    try {
      gitOutput(['cat-file', '-e', `${candidate}^{commit}`], cwd);
      return gitOutput(['merge-base', candidate, 'HEAD'], cwd);
    } catch {
      continue;
    }
  }
  throw new Error('Cannot resolve the trusted pull-request base.');
}

function pathsIntersect(unit, changedPaths) {
  const coverage = new Set([...unit.assignedPaths, ...unit.adjacentPaths]);
  return changedPaths.some((path) => coverage.has(path));
}

function recoverLedger(
  ledger,
  newHead,
  changedPaths,
  newFingerprint = ledger.currentFingerprint,
  newWorkingPaths = ledger.workingPaths,
) {
  const oldHead = ledger.currentHead;
  const headChanged = oldHead !== newHead;
  const sourceChanged =
    headChanged || ledger.currentFingerprint !== newFingerprint;
  const comparisonAvailable = !sourceChanged || changedPaths !== undefined;
  if (ledger.status === 'complete') {
    return {
      ledger,
      comparisonAvailable,
      changedPaths: changedPaths ?? [],
      headChanged,
      sourceChanged,
    };
  }
  for (const unit of ledger.units) {
    if (unit.status === 'running') {
      unit.status = 'interrupted';
      delete unit.owner;
      delete unit.startedAt;
    }
    if (!sourceChanged) {
      continue;
    }
    if (unit.kind === 'implementation') {
      if (unit.status !== 'completed') {
        unit.head = newHead;
      }
      continue;
    }
    if (unit.kind === 'synthesis' || unit.kind === 'verification') {
      unit.status = 'invalidated';
      unit.head = newHead;
      delete unit.carryForward;
      continue;
    }
    if (
      unit.kind === 'review' &&
      ['completed', 'carried-forward'].includes(unit.status)
    ) {
      if (comparisonAvailable && !pathsIntersect(unit, changedPaths)) {
        const previousCarryForward = unit.carryForward;
        unit.status = 'carried-forward';
        unit.carryForward = {
          fromHead: previousCarryForward?.fromHead ?? oldHead,
          toHead: newHead,
          changedPaths: normalizePaths([
            ...(previousCarryForward?.changedPaths ?? []),
            ...changedPaths,
          ]),
        };
      } else {
        unit.status = 'invalidated';
        unit.head = newHead;
        delete unit.carryForward;
      }
    } else if (unit.kind === 'review') {
      unit.status = 'invalidated';
      unit.head = newHead;
      delete unit.carryForward;
    }
  }
  let propagated = true;
  while (propagated) {
    propagated = false;
    for (const unit of ledger.units) {
      if (!['completed', 'carried-forward'].includes(unit.status)) {
        continue;
      }
      if (
        unit.dependencies.some(
          (dependency) => findUnit(ledger, dependency).status === 'invalidated',
        )
      ) {
        unit.status = 'invalidated';
        unit.head = newHead;
        delete unit.carryForward;
        propagated = true;
      }
    }
  }
  ledger.currentHead = newHead;
  ledger.currentFingerprint = newFingerprint;
  ledger.workingPaths = normalizePaths(newWorkingPaths);
  ledger.status = 'active';
  return {
    ledger,
    comparisonAvailable,
    changedPaths: changedPaths ?? [],
    headChanged,
    sourceChanged,
  };
}

function refreshReviewGate(ledger, cwd) {
  if (ledger.reviewGate === undefined || ledger.status === 'complete') {
    return;
  }
  ledger.reviewGate = createPullRequestReviewGate(
    ledger.baseHead,
    ledger.reviewGate.implementer,
    cwd,
  );
}

function executeUnlocked(
  command,
  options,
  cwd = process.cwd(),
  now = new Date(),
) {
  const root = typeof options.root === 'string' ? options.root : defaultRoot;
  if (command === 'init') {
    const fileName = ledgerPath(root, cwd);
    if (existsSync(fileName)) {
      const existing = readJson(fileName, 'ledger');
      validateLedger(existing);
      if (existing.status !== 'complete') {
        throw new Error(`An unfinished ledger already exists at ${fileName}`);
      }
    }
    const sourceState = currentSourceState(cwd);
    const requestedHead = requireOption(options, 'head');
    if (requestedHead !== sourceState.head) {
      throw new Error(
        `Declared head ${requestedHead} does not match repository HEAD ${sourceState.head}.`,
      );
    }
    const baseHead = requireOption(options, 'base');
    try {
      gitOutput(['cat-file', '-e', `${baseHead}^{commit}`], cwd);
    } catch {
      throw new Error(
        `Base head is not available in the repository: ${baseHead}`,
      );
    }
    const mode = options.mode;
    if (mode !== undefined && mode !== 'pr') {
      throw new Error(`Unsupported ledger mode: ${mode}`);
    }
    const resolvedBaseHead =
      mode === 'pr'
        ? gitOutput(['merge-base', baseHead, sourceState.head], cwd)
        : baseHead;
    if (resolvedBaseHead.length === 0) {
      throw new Error(`Cannot determine merge base for ${baseHead}.`);
    }
    if (mode === 'pr') {
      const trustedBaseHead = canonicalPullRequestBase(cwd);
      if (resolvedBaseHead !== trustedBaseHead) {
        throw new Error(
          `Declared PR base resolves to ${resolvedBaseHead}; trusted base is ${trustedBaseHead}.`,
        );
      }
    }
    const ledger = {
      schemaVersion,
      taskId: requireOption(options, 'task'),
      baseHead: resolvedBaseHead,
      currentHead: sourceState.head,
      currentFingerprint: sourceState.fingerprint,
      workingPaths: sourceState.workingPaths,
      status: 'active',
      units: [],
      updatedAt: now.toISOString(),
    };
    if (mode === 'pr') {
      ledger.reviewGate = createPullRequestReviewGate(
        resolvedBaseHead,
        requireOption(options, 'implementer'),
        cwd,
      );
    }
    return writeLedger(fileName, ledger, now);
  }

  const { fileName, ledger } = readLedger(root, cwd);
  if (command === 'validate') {
    if (ledger.status === 'active') {
      const sourceState = currentSourceState(cwd);
      if (
        sourceState.head !== ledger.currentHead ||
        sourceState.fingerprint !== ledger.currentFingerprint
      ) {
        throw new Error(
          'Active ledger is stale; run recover before verification.',
        );
      }
    }
    return ledger;
  }
  if (command === 'validate-pr') {
    throw new Error(
      'Run npm run verify:review-ready so verification and review evidence are checked in one process.',
    );
  }
  if (command === 'status') {
    return ledger;
  }
  if (command === 'add') {
    const id = requireOption(options, 'unit');
    if (ledger.units.some((unit) => unit.id === id)) {
      throw new Error(`Work unit already exists: ${id}`);
    }
    const kind = requireOption(options, 'kind');
    if (!validKinds.has(kind)) {
      throw new Error(`Invalid unit kind: ${kind}`);
    }
    const contracts = splitContracts(requireOption(options, 'contracts'));
    ledger.units.push({
      id,
      kind,
      status: 'pending',
      head: ledger.currentHead,
      assignedPaths: normalizePaths(splitList(options.paths)),
      adjacentPaths: normalizePaths(splitList(options.adjacent)),
      contracts,
      dependencies: splitList(options.dependencies),
      requiredCommands: splitList(options.commands),
      ...(options.reviewer === undefined
        ? {}
        : {
            review: {
              reviewer: requireOption(options, 'reviewer'),
              scope: requireOption(options, 'scope'),
              pass: requireOption(options, 'pass'),
              domains: splitContracts(requireOption(options, 'domains')),
            },
          }),
    });
  } else if (command === 'start') {
    const unit = findUnit(ledger, requireOption(options, 'unit'));
    if (!['pending', 'interrupted', 'invalidated'].includes(unit.status)) {
      throw new Error(`Cannot start ${unit.id} from status ${unit.status}.`);
    }
    for (const dependency of unit.dependencies) {
      const dependencyStatus = findUnit(ledger, dependency).status;
      if (!['completed', 'carried-forward'].includes(dependencyStatus)) {
        throw new Error(`${unit.id} dependency is not complete: ${dependency}`);
      }
    }
    const sourceState = currentSourceState(cwd);
    if (
      sourceState.head !== ledger.currentHead ||
      sourceState.fingerprint !== ledger.currentFingerprint
    ) {
      throw new Error(
        'Repository source changed; run recover before starting work.',
      );
    }
    unit.status = 'running';
    unit.head = ledger.currentHead;
    unit.owner = requireOption(options, 'owner');
    if (
      unit.review !== undefined &&
      unit.owner.toLowerCase() !== unit.review.reviewer.toLowerCase()
    ) {
      throw new Error(
        `${unit.id} must be run by declared reviewer ${unit.review.reviewer}.`,
      );
    }
    unit.startedAt = now.toISOString();
    unit.sourceFingerprint = sourceState.fingerprint;
    delete unit.carryForward;
  } else if (command === 'checkpoint' || command === 'complete') {
    const unit = findUnit(ledger, requireOption(options, 'unit'));
    if (unit.status !== 'running') {
      throw new Error(`${unit.id} is not running.`);
    }
    const report = loadReport(requireOption(options, 'report'), cwd);
    const sourceState = currentSourceState(cwd);
    if (
      unit.kind === 'implementation' &&
      sourceState.fingerprint !== ledger.currentFingerprint
    ) {
      const owner = unit.owner;
      const startedAt = unit.startedAt;
      const headPaths =
        sourceState.head === ledger.currentHead
          ? []
          : gitChangedPaths(ledger.currentHead, sourceState.head, cwd);
      const changedPaths =
        headPaths === undefined
          ? undefined
          : normalizePaths([
              ...headPaths,
              ...ledger.workingPaths,
              ...sourceState.workingPaths,
            ]);
      recoverLedger(
        ledger,
        sourceState.head,
        changedPaths,
        sourceState.fingerprint,
        sourceState.workingPaths,
      );
      refreshReviewGate(ledger, cwd);
      unit.status = 'running';
      unit.head = sourceState.head;
      unit.sourceFingerprint = sourceState.fingerprint;
      unit.owner = owner;
      unit.startedAt = startedAt;
    }
    if (
      report.lastVerifiedHead !== ledger.currentHead ||
      sourceState.head !== ledger.currentHead
    ) {
      throw new Error(
        `${unit.id} checkpoint does not target the current head.`,
      );
    }
    if (
      report.sourceFingerprint !== sourceState.fingerprint ||
      unit.sourceFingerprint !== sourceState.fingerprint
    ) {
      throw new Error(
        `${unit.id} checkpoint does not match the current source fingerprint.`,
      );
    }
    if (command === 'complete') {
      for (const dependency of unit.dependencies) {
        const dependencyStatus = findUnit(ledger, dependency).status;
        if (!['completed', 'carried-forward'].includes(dependencyStatus)) {
          throw new Error(
            `${unit.id} dependency is not complete: ${dependency}`,
          );
        }
      }
      validateCompletion(unit, report, sourceState);
      unit.status = 'completed';
      delete unit.owner;
      delete unit.startedAt;
    }
    unit.checkpoint = report;
  } else if (command === 'interrupt') {
    const unit = findUnit(ledger, requireOption(options, 'unit'));
    if (unit.status !== 'running') {
      throw new Error(`${unit.id} is not running.`);
    }
    unit.status = 'interrupted';
    delete unit.owner;
    delete unit.startedAt;
  } else if (command === 'recover' || command === 'enter') {
    if (command === 'enter') {
      requireRecoveryIntent(options);
    }
    const sourceState = currentSourceState(cwd);
    if (typeof options.head === 'string' && options.head !== sourceState.head) {
      throw new Error(
        'Requested recovery head does not match repository HEAD.',
      );
    }
    const headPaths =
      sourceState.head === ledger.currentHead
        ? []
        : gitChangedPaths(ledger.currentHead, sourceState.head, cwd);
    const changedPaths =
      headPaths === undefined
        ? undefined
        : normalizePaths([
            ...headPaths,
            ...ledger.workingPaths,
            ...sourceState.workingPaths,
          ]);
    recoverLedger(
      ledger,
      sourceState.head,
      changedPaths,
      sourceState.fingerprint,
      sourceState.workingPaths,
    );
    refreshReviewGate(ledger, cwd);
  } else if (command === 'finish') {
    const sourceState = currentSourceState(cwd);
    if (
      sourceState.head !== ledger.currentHead ||
      sourceState.fingerprint !== ledger.currentFingerprint
    ) {
      throw new Error(
        'Repository source changed; run recover before finishing.',
      );
    }
    const incomplete = ledger.units.filter(
      (unit) => !['completed', 'carried-forward'].includes(unit.status),
    );
    if (incomplete.length > 0) {
      throw new Error(
        `Cannot finish while units remain incomplete: ${incomplete
          .map((unit) => unit.id)
          .join(', ')}`,
      );
    }
    if (ledger.units.length === 0) {
      throw new Error('Cannot finish an empty ledger.');
    }
    for (const requiredKind of ['verification', 'synthesis']) {
      const currentGate = ledger.units.some(
        (unit) =>
          unit.kind === requiredKind &&
          unit.status === 'completed' &&
          unit.head === ledger.currentHead &&
          unit.sourceFingerprint === ledger.currentFingerprint,
      );
      if (!currentGate) {
        throw new Error(
          `Cannot finish without completed current-source ${requiredKind} evidence.`,
        );
      }
    }
    const hasCarriedForwardReview = ledger.units.some(
      (unit) => unit.status === 'carried-forward',
    );
    const hasCurrentSynthesis = ledger.units.some(
      (unit) =>
        unit.kind === 'synthesis' &&
        unit.status === 'completed' &&
        unit.head === ledger.currentHead,
    );
    if (hasCarriedForwardReview && !hasCurrentSynthesis) {
      throw new Error(
        'Cannot finish with carried-forward review evidence; complete current-head synthesis first.',
      );
    }
    ledger.status = 'complete';
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
  return writeLedger(fileName, ledger, now);
}

function execute(command, options, cwd = process.cwd(), now) {
  if (!mutatingCommands.has(command)) {
    return executeUnlocked(command, options, cwd, now);
  }
  const root = typeof options.root === 'string' ? options.root : defaultRoot;
  const fileName = ledgerPath(root, cwd);
  return withLedgerTransaction(fileName, () =>
    executeUnlocked(command, options, cwd, now),
  );
}

function summarize(ledger) {
  const counts = {};
  for (const unit of ledger.units) {
    counts[unit.status] = (counts[unit.status] ?? 0) + 1;
  }
  return {
    taskId: ledger.taskId,
    currentHead: ledger.currentHead,
    status: ledger.status,
    units: counts,
    readyUnits: ledger.units
      .filter(
        (unit) =>
          ['pending', 'interrupted', 'invalidated'].includes(unit.status) &&
          unit.dependencies.every((dependency) =>
            ['completed', 'carried-forward'].includes(
              findUnit(ledger, dependency).status,
            ),
          ),
      )
      .map((unit) => unit.id),
    work: ledger.units.map((unit) => ({
      id: unit.id,
      kind: unit.kind,
      status: unit.status,
      dependencies: unit.dependencies,
      assignedPaths: unit.assignedPaths,
      remainingPaths:
        unit.checkpoint?.remainingPaths ??
        normalizePaths([...unit.assignedPaths, ...unit.adjacentPaths]),
      adjacentPaths: unit.adjacentPaths,
      contracts: unit.contracts,
      requiredCommands: unit.requiredCommands,
      owner: unit.owner,
      review: unit.review,
    })),
  };
}

function main() {
  try {
    const { command, options } = parseArguments(process.argv.slice(2));
    const root = typeof options.root === 'string' ? options.root : defaultRoot;
    if (command === 'fingerprint') {
      process.stdout.write(
        `${JSON.stringify(currentSourceState(), null, 2)}\n`,
      );
      return;
    }
    if (command === 'enter') {
      const intent = requireRecoveryIntent(options);
      if (!existsSync(ledgerPath(root))) {
        process.stdout.write(
          `${JSON.stringify({ status: 'no-active-ledger', intent, readyUnits: [] })}\n`,
        );
        return;
      }
    }
    if (command === 'validate' && !existsSync(ledgerPath(root))) {
      process.stdout.write('{"status":"no-active-ledger"}\n');
      return;
    }
    const result = execute(command, options);
    process.stdout.write(`${JSON.stringify(summarize(result), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  acquireLedgerLock,
  currentSourceState,
  execute,
  gitChangedPaths,
  ledgerPath,
  lockOwnerState,
  moveLockBehindReclaimFence,
  normalizePath,
  parseArguments,
  publishLedgerLock,
  readLock,
  readProcessInstanceIdentity,
  reclaimStaleLock,
  removeLockDirectoryIfIdentity,
  recoverLedger,
  releaseLedgerLock,
  summarize,
  validateCompletion,
  validateLedger,
  validatePullRequestGate,
  withLedgerTransaction,
  writeLedger,
};
