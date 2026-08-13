const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
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
    ['diff', '--name-only', '--find-renames', 'HEAD'],
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

function writeLedger(fileName, ledger, now = new Date()) {
  const nextLedger = { ...ledger, updatedAt: now.toISOString() };
  validateLedger(nextLedger);
  mkdirSync(dirname(fileName), { recursive: true });
  const temporary = `${fileName}.${process.pid}.tmp`;
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
    ]),
    label,
  );
  validateString(report.lastVerifiedHead, `${label}.lastVerifiedHead`);
  validateString(report.sourceFingerprint, `${label}.sourceFingerprint`);
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
      new Set(['severity', 'status', 'summary', 'acceptanceEvidence']),
      `${label}.finding`,
    );
    if (!['critical', 'high', 'medium', 'low'].includes(finding.severity)) {
      throw new Error(
        `${label}.finding has invalid severity: ${finding.severity}`,
      );
    }
    if (!['open', 'closed', 'accepted'].includes(finding.status)) {
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
  }
  validateStringArray(report.uninspected, `${label}.uninspected`);
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

function gitChangedPaths(fromHead, toHead, cwd) {
  try {
    return gitPaths(
      ['diff', '--name-only', '--find-renames', `${fromHead}..${toHead}`],
      cwd,
    );
  } catch {
    return undefined;
  }
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

function execute(command, options, cwd = process.cwd(), now = new Date()) {
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
    const ledger = {
      schemaVersion,
      taskId: requireOption(options, 'task'),
      baseHead,
      currentHead: sourceState.head,
      currentFingerprint: sourceState.fingerprint,
      workingPaths: sourceState.workingPaths,
      status: 'active',
      units: [],
      updatedAt: now.toISOString(),
    };
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
  } else if (command === 'recover') {
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
  currentSourceState,
  execute,
  gitChangedPaths,
  ledgerPath,
  normalizePath,
  parseArguments,
  recoverLedger,
  summarize,
  validateCompletion,
  validateLedger,
};
