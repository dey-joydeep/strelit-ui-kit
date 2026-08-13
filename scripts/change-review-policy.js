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
    /^(?:src\/index\.ts|src\/ts\/(?:config\/|utils\/types\.ts)|etc\/|package(?:-lock)?\.json)/.test(
      normalized,
    )
  ) {
    domains.add('Public API, compatibility, and packaging');
  }
  if (
    sourceDocumentation ||
    governancePolicy ||
    /^(?:\.github\/|scripts\/|tsconfig|vite|vitest|typedoc|api-extractor|oxlint|package(?:-lock)?\.json)/.test(
      normalized,
    )
  ) {
    domains.add('Tooling, CI, and verification');
  }
  if (
    sourceDocumentation ||
    /^(?:test\/|apitest\/|docs\/|README|AGENTS\.md|\.code-review\/)/.test(
      normalized,
    )
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
  collectNonGeneratedLines,
  createPullRequestReviewGate,
  domainsForPath,
  normalizeFileName,
};
