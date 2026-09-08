const { execFileSync } = require('node:child_process');
const { lstatSync, readFileSync, realpathSync } = require('node:fs');
const nodePath = require('node:path');
const riskPolicy = require('../.github/change-risk.json');

const canonicalDomains = Object.freeze([
  'Migration, configuration, and persistence',
  'Public API, compatibility, and packaging',
  'Runtime behavior, lifecycle, and ownership',
  'Tests and documentation',
  'Tooling, CI, and verification',
]);

const riskRank = { low: 0, medium: 1, high: 2 };
const riskPatterns = Object.fromEntries(
  Object.entries(riskPolicy).map(([risk, patterns]) => [
    risk,
    patterns.map((pattern) => new RegExp(pattern)),
  ]),
);

function normalizeFileName(fileName) {
  return fileName.replaceAll('\\', '/');
}

function normalizeFileNames(fileNames) {
  return [...new Set(fileNames.map(normalizeFileName))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function reviewFieldValues(review, label) {
  const prefix = `${label}:`;
  return review
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.slice(0, prefix.length).localeCompare(prefix, undefined, {
          sensitivity: 'accent',
        }) === 0,
    )
    .map((line) => line.slice(prefix.length).trim());
}

function canonicalReviewCount(review, label) {
  const values = reviewFieldValues(review, label);
  return values.length === 1 && /^(?:0|[1-9]\d*)$/.test(values[0])
    ? Number(values[0])
    : undefined;
}

const evidencePlaceholder =
  /^(?:n\/a|none|pending|todo|tbd|not applicable|done)\.?$/i;

function isIdentifiableHttpUrl(reference) {
  if (!/^https?:\/\/\S+$/i.test(reference)) {
    return false;
  }
  try {
    const url = new URL(reference);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function isSafeRepositoryEvidencePath(reference) {
  const pathMatch = reference.match(/^(.*?)(?::([1-9]\d*))?$/);
  const repositoryPath = pathMatch?.[1] ?? '';
  const segments = repositoryPath.split('/');
  if (
    repositoryPath.length === 0 ||
    evidencePlaceholder.test(repositoryPath) ||
    segments.some(
      (segment) =>
        segment === '' ||
        /^\.+$/.test(segment) ||
        !/^[A-Za-z0-9._-]+$/.test(segment),
    )
  ) {
    return false;
  }

  return true;
}

function isIdentifiableEvidenceReference(reference) {
  const markdownLink = reference.match(
    /^\[([^\]\r\n]+)\]\((https?:\/\/\S+)\)$/i,
  );
  const renderedLink = reference.match(/^(.+?) \((https?:\/\/\S+)\)$/i);
  const linkedEvidence = markdownLink ?? renderedLink;
  return (
    isIdentifiableHttpUrl(reference) ||
    (linkedEvidence !== null &&
      !evidencePlaceholder.test(linkedEvidence[1]) &&
      isIdentifiableHttpUrl(linkedEvidence[2])) ||
    /^#[1-9]\d*$/.test(reference) ||
    /^[0-9a-f]{7,40}$/i.test(reference) ||
    isSafeRepositoryEvidencePath(reference) ||
    /^artifact:[A-Za-z0-9][A-Za-z0-9._/#-]*$/i.test(reference)
  );
}

function validateFindingDispositionEvidence(
  review,
  requireStatusReconciliation = true,
) {
  const errors = [];
  const findingsValues = reviewFieldValues(review, 'Findings');
  if (findingsValues.length !== 1) {
    errors.push('A quality review must provide exactly one Findings line.');
    return errors;
  }
  const findingsMatch = findingsValues[0].match(
    /^Critical (0|[1-9]\d*); High (0|[1-9]\d*); Medium (0|[1-9]\d*); Low (0|[1-9]\d*)$/,
  );
  if (findingsMatch === null) {
    errors.push(
      'Findings must report canonical nonnegative counts for Critical, High, Medium, and Low severities.',
    );
    return errors;
  }

  const severities = ['Critical', 'High', 'Medium', 'Low'];
  const reportedBySeverity = new Map(
    severities.map((severity, index) => [
      severity,
      Number(findingsMatch[index + 1]),
    ]),
  );
  const totalReported = [...reportedBySeverity.values()].reduce(
    (total, count) => total + count,
    0,
  );
  const dispositionValues = reviewFieldValues(review, 'Finding dispositions');
  if (dispositionValues.length !== 1) {
    errors.push(
      'A quality review must provide exactly one Finding dispositions line.',
    );
    return errors;
  }

  const dispositionValue = dispositionValues[0];
  const noFindingsDisposition = /^No findings(?: recorded)?\.?$/i.test(
    dispositionValue,
  );
  if (noFindingsDisposition) {
    if (totalReported !== 0) {
      errors.push(
        'Finding dispositions may state "No findings" only when all reported finding totals are zero.',
      );
      return errors;
    }
  }

  const records = noFindingsDisposition
    ? []
    : dispositionValue.split(';').map((record) => record.trim());
  const parsedRecords = [];
  const identifiers = new Set();
  let invalidRecord = false;
  for (const record of records) {
    const match = record.match(
      /^(Critical|High|Medium|Low) ([A-Za-z0-9][A-Za-z0-9._/#-]*)\s*=>\s*(Open|Closed|Accepted|Deferred):\s*(.+)$/i,
    );
    if (match === null) {
      invalidRecord = true;
      continue;
    }
    const severity =
      severities.find(
        (candidate) => candidate.toLowerCase() === match[1].toLowerCase(),
      ) ?? match[1];
    const identifier = match[2].toLowerCase();
    const disposition = match[3].toLowerCase();
    const evidence = match[4].trim();
    const evidenceReferences = evidence
      .split(',')
      .map((reference) => reference.trim());
    const identifiableEvidence =
      evidenceReferences.length > 0 &&
      evidenceReferences.every(isIdentifiableEvidenceReference);
    if (identifiers.has(identifier)) {
      errors.push(`Finding disposition ID must be unique: ${match[2]}.`);
    }
    identifiers.add(identifier);
    if (!identifiableEvidence) {
      errors.push(
        `Finding disposition ${match[2]} evidence must contain only comma-separated repository paths, URLs, issues, commits, or artifacts.`,
      );
    }
    const allowedDispositions = {
      Critical: ['open', 'closed'],
      High: ['open', 'closed'],
      Medium: ['open', 'closed', 'accepted'],
      Low: ['open', 'closed', 'deferred'],
    };
    if (!allowedDispositions[severity].includes(disposition)) {
      errors.push(
        `Finding disposition ${match[2]} uses invalid ${match[3]} status for ${severity} severity.`,
      );
    }
    parsedRecords.push({ disposition, severity });
  }
  if (invalidRecord) {
    errors.push(
      'Each finding disposition must use "<Severity> <ID> => <Disposition>: <evidence>" and entries must be separated by semicolons.',
    );
  }

  const actualBySeverity = new Map(
    severities.map((severity) => [
      severity,
      parsedRecords.filter((record) => record.severity === severity).length,
    ]),
  );
  if (
    severities.some(
      (severity) =>
        actualBySeverity.get(severity) !== reportedBySeverity.get(severity),
    )
  ) {
    errors.push(
      'Finding disposition records must reconcile with reported finding totals by severity.',
    );
  }

  const criticalHighRecords = parsedRecords.filter(
    (record) => record.severity === 'Critical' || record.severity === 'High',
  );
  const openCriticalHigh = canonicalReviewCount(
    review,
    'Open Critical/High findings',
  );
  const closedCriticalHigh = canonicalReviewCount(
    review,
    'Closed Critical/High findings',
  );
  if (
    requireStatusReconciliation &&
    (openCriticalHigh === undefined ||
      closedCriticalHigh === undefined ||
      criticalHighRecords.filter((record) => record.disposition === 'open')
        .length !== openCriticalHigh ||
      criticalHighRecords.filter((record) => record.disposition === 'closed')
        .length !== closedCriticalHigh ||
      criticalHighRecords.some(
        (record) => !['open', 'closed'].includes(record.disposition),
      ))
  ) {
    errors.push(
      'Critical and High finding dispositions must reconcile with their open and closed totals.',
    );
  }

  const mediumRecords = parsedRecords.filter(
    (record) => record.severity === 'Medium',
  );
  const openMedium = canonicalReviewCount(review, 'Open Medium findings');
  const closedMedium = canonicalReviewCount(review, 'Closed Medium findings');
  const acceptedMedium = canonicalReviewCount(
    review,
    'Accepted Medium findings',
  );
  if (
    requireStatusReconciliation &&
    (openMedium === undefined ||
      closedMedium === undefined ||
      acceptedMedium === undefined ||
      mediumRecords.filter((record) => record.disposition === 'open').length !==
        openMedium ||
      mediumRecords.filter((record) => record.disposition === 'closed')
        .length !== closedMedium ||
      mediumRecords.filter((record) => record.disposition === 'accepted')
        .length !== acceptedMedium ||
      mediumRecords.some(
        (record) =>
          !['open', 'closed', 'accepted'].includes(record.disposition),
      ))
  ) {
    errors.push(
      'Medium finding dispositions must reconcile with their open, closed, and accepted totals.',
    );
  }

  return errors;
}

function classifyFileRisk(fileName) {
  const normalized = normalizeFileName(fileName);
  for (const risk of ['high', 'medium', 'low']) {
    if (riskPatterns[risk].some((pattern) => pattern.test(normalized))) {
      return risk;
    }
  }
  return 'medium';
}

function classifyChangeRisk(fileNames) {
  return fileNames.reduce((highestRisk, fileName) => {
    const fileRisk = classifyFileRisk(fileName);
    return riskRank[fileRisk] > riskRank[highestRisk] ? fileRisk : highestRisk;
  }, 'low');
}

function gitBuffer(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitText(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function nulPaths(args, cwd) {
  const nulArgs = [...args];
  const separator = nulArgs.indexOf('--');
  nulArgs.splice(separator < 0 ? nulArgs.length : separator, 0, '-z');
  return gitBuffer(nulArgs, cwd).toString('utf8').split('\0').filter(Boolean);
}

function collectChangedFiles(baseRef, cwd = process.cwd()) {
  const tracked = nulPaths(
    [
      'diff',
      '--name-only',
      '--no-renames',
      '--diff-filter=ACDMRTUXB',
      baseRef,
      '--',
    ],
    cwd,
  );
  const untracked = nulPaths(
    ['ls-files', '--others', '--exclude-standard'],
    cwd,
  );
  return normalizeFileNames([...tracked, ...untracked]);
}

function collectCommittedChangedFiles(baseRef, headRef, cwd = process.cwd()) {
  return normalizeFileNames(
    nulPaths(
      [
        'diff',
        '--name-only',
        '--no-renames',
        '--diff-filter=ACDMRTUXB',
        `${baseRef}...${headRef}`,
        '--',
      ],
      cwd,
    ),
  );
}

function isGeneratedPath(fileName) {
  return (
    fileName === 'package-lock.json' ||
    /^etc\/.*\.api\.md$/.test(fileName) ||
    fileName.startsWith('docs/architecture/generated/')
  );
}

function countBufferLines(content) {
  if (content.includes(0)) {
    return 0;
  }
  let lines = 0;
  for (const byte of content) {
    if (byte === 10) {
      lines++;
    }
  }
  return content.length > 0 && content.at(-1) !== 10 ? lines + 1 : lines;
}

function readContainedRegularFile(fileName, cwd) {
  const repository = realpathSync(cwd);
  const candidate = nodePath.resolve(repository, ...fileName.split('/'));
  const relative = nodePath.relative(repository, candidate);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${nodePath.sep}`)
  ) {
    throw new Error(`Changed path escapes the repository: ${fileName}`);
  }
  const stat = lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return Buffer.alloc(0);
  }
  return readFileSync(candidate);
}

function collectNonGeneratedLines(baseRef, cwd = process.cwd()) {
  const entries = gitBuffer(
    ['diff', '--numstat', '--no-renames', '-z', baseRef, '--'],
    cwd,
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  let total = 0;
  const tracked = new Set();
  for (const entry of entries) {
    const first = entry.indexOf('\t');
    const second = entry.indexOf('\t', first + 1);
    if (first < 0 || second < 0) {
      throw new Error('Git returned malformed --numstat output.');
    }
    const added = entry.slice(0, first);
    const deleted = entry.slice(first + 1, second);
    const fileName = normalizeFileName(entry.slice(second + 1));
    tracked.add(fileName);
    if (!isGeneratedPath(fileName) && added !== '-' && deleted !== '-') {
      total += Number(added) + Number(deleted);
    }
  }
  const untracked = normalizeFileNames(
    nulPaths(['ls-files', '--others', '--exclude-standard'], cwd),
  );
  for (const fileName of untracked) {
    if (!tracked.has(fileName) && !isGeneratedPath(fileName)) {
      total += countBufferLines(readContainedRegularFile(fileName, cwd));
    }
  }
  return total;
}

function domainsForPath(fileName) {
  const normalized = normalizeFileName(fileName);
  const domains = new Set();
  const repositoryProse =
    /(?:^|\/)(?:(?:README|CHANGELOG|CONTRIBUTING|COMMUNITY|SECURITY|SUPPORT|VERSIONING|LICENSE|LICENSING|NOTICE|AUTHORS)(?:\.[^/]*)?|AGENTS\.md|[^/]+\.(?:md|mdx|txt|adoc|rst))$/i.test(
      normalized,
    );
  const sourceDocumentation = /^src\/.*\.md$/i.test(normalized);
  const governancePolicy =
    /(?:^|\/)AGENTS\.md$/.test(normalized) ||
    normalized.startsWith('docs/contributing/') ||
    normalized === 'docs/architecture/product-evolution-policy.md' ||
    normalized === 'docs/architecture/compatibility-audit-maintenance.md';
  if (normalized.startsWith('src/') && !sourceDocumentation) {
    domains.add('Runtime behavior, lifecycle, and ownership');
    domains.add('Public API, compatibility, and packaging');
  }
  if (
    /^(?:src\/ts\/config\/|scripts\/migrate-|test\/.*(?:migration|create-config))/.test(
      normalized,
    )
  ) {
    domains.add('Migration, configuration, and persistence');
  }
  if (
    /^(?:src\/index\.ts|src\/ts\/(?:config\/|utils\/types\.ts)|etc\/|\.npmignore$|package(?:-lock)?\.json)/.test(
      normalized,
    )
  ) {
    domains.add('Public API, compatibility, and packaging');
  }
  if (
    sourceDocumentation ||
    governancePolicy ||
    /^(?:\.github\/|scripts\/|tsconfig|vite|vitest|typedoc|api-extractor|oxlint|\.npmignore$|package(?:-lock)?\.json)/.test(
      normalized,
    )
  ) {
    domains.add('Tooling, CI, and verification');
  }
  if (
    repositoryProse ||
    /^(?:test\/|apitest\/|docs\/|README|\.code-review\/)/.test(normalized)
  ) {
    domains.add('Tests and documentation');
  }
  if (domains.size === 0) {
    domains.add('Tooling, CI, and verification');
  }
  return [...domains].sort((left, right) => left.localeCompare(right));
}

function createPullRequestReviewGate(baseHead, implementer, cwd) {
  const mergeBase = gitText(['merge-base', baseHead, 'HEAD'], cwd);
  if (mergeBase.length === 0) {
    throw new Error(`Cannot determine merge base for ${baseHead}.`);
  }
  const requiredPaths = collectChangedFiles(mergeBase, cwd);
  const requiredCoverage = requiredPaths.map((path) => ({
    path,
    domains: domainsForPath(path),
  }));
  const applicableDomains = [
    ...new Set(requiredCoverage.flatMap((entry) => entry.domains)),
  ].sort((left, right) => left.localeCompare(right));
  const nonGeneratedLines = collectNonGeneratedLines(mergeBase, cwd);
  const risk = classifyChangeRisk(requiredPaths);
  return {
    mode: 'pull-request',
    implementer,
    risk,
    requiredPaths,
    requiredCoverage,
    applicableDomains,
    nonGeneratedLines,
    largeHighRisk:
      risk === 'high' &&
      (requiredPaths.length > 50 ||
        nonGeneratedLines > 1000 ||
        applicableDomains.length >= 3),
  };
}

module.exports = {
  canonicalDomains,
  classifyChangeRisk,
  classifyFileRisk,
  collectChangedFiles,
  collectCommittedChangedFiles,
  collectNonGeneratedLines,
  createPullRequestReviewGate,
  domainsForPath,
  normalizeFileName,
  validateFindingDispositionEvidence,
};
