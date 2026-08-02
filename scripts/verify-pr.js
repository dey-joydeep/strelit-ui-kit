const { spawnSync } = require('node:child_process');
const riskPolicy = require('../.github/change-risk.json');

const riskRank = {
  low: 0,
  medium: 1,
  high: 2,
};

const highRiskPatterns = riskPolicy.high.map((pattern) => new RegExp(pattern));
const mediumRiskPatterns = riskPolicy.medium.map(
  (pattern) => new RegExp(pattern),
);

function normalizeFileName(fileName) {
  return fileName.replaceAll('\\', '/');
}

function classifyFileRisk(fileName) {
  const normalized = normalizeFileName(fileName);

  if (highRiskPatterns.some((pattern) => pattern.test(normalized))) {
    return 'high';
  }

  if (mediumRiskPatterns.some((pattern) => pattern.test(normalized))) {
    return 'medium';
  }

  return 'low';
}

function classifyChangeRisk(fileNames) {
  return fileNames.reduce((highestRisk, fileName) => {
    const fileRisk = classifyFileRisk(fileName);
    return riskRank[fileRisk] > riskRank[highestRisk] ? fileRisk : highestRisk;
  }, 'low');
}

function runGit(args, allowFailure = false, cwd = process.cwd()) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`,
    );
  }

  return result;
}

function refExists(ref, cwd = process.cwd()) {
  return runGit(['cat-file', '-e', `${ref}^{commit}`], true, cwd).status === 0;
}

function resolveBaseRef(explicitBase, cwd = process.cwd()) {
  if (explicitBase !== undefined) {
    if (!refExists(explicitBase, cwd)) {
      throw new Error(`Base ref does not exist: ${explicitBase}`);
    }
    return explicitBase;
  }

  const ciBase = process.env.GITHUB_BASE_SHA;
  if (process.env.GITHUB_ACTIONS === 'true' && ciBase === undefined) {
    throw new Error('GITHUB_BASE_SHA must be provided in GitHub Actions.');
  }
  if (process.env.GITHUB_ACTIONS === 'true' && /^0+$/.test(ciBase)) {
    const defaultBranch = process.env.GITHUB_DEFAULT_BRANCH;
    if (defaultBranch === undefined || !refExists(defaultBranch, cwd)) {
      throw new Error(
        'A new-ref push requires a fetched GITHUB_DEFAULT_BRANCH in GitHub Actions.',
      );
    }
    const mergeBase = runGit(
      ['merge-base', 'HEAD', defaultBranch],
      false,
      cwd,
    ).stdout.trim();
    if (mergeBase.length === 0) {
      throw new Error(
        `Could not determine a merge base between HEAD and ${defaultBranch}.`,
      );
    }
    return mergeBase;
  }
  if (ciBase !== undefined && !/^0+$/.test(ciBase)) {
    if (!refExists(ciBase, cwd)) {
      throw new Error(
        `GITHUB_BASE_SHA is not available locally: ${ciBase}. Fetch the CI base history before verification.`,
      );
    }
    return ciBase;
  }

  const candidates = ['origin/main', 'main'];
  const baseRef = candidates.find((candidate) => refExists(candidate, cwd));

  if (baseRef === undefined) {
    throw new Error(
      'Could not determine a base ref. Pass --base <ref> or set GITHUB_BASE_SHA.',
    );
  }

  return baseRef;
}

function collectChangedFiles(baseRef, cwd = process.cwd()) {
  const tracked = runGit(
    [
      'diff',
      '--name-only',
      '--no-renames',
      '--diff-filter=ACDMRTUXB',
      baseRef,
      '--',
    ],
    false,
    cwd,
  ).stdout;
  const untracked = runGit(
    ['ls-files', '--others', '--exclude-standard'],
    false,
    cwd,
  ).stdout;

  return [
    ...new Set(
      `${tracked}\n${untracked}`
        .split(/\r?\n/)
        .map((fileName) => fileName.trim())
        .filter(Boolean)
        .map(normalizeFileName),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function verificationScriptsForRisk(risk) {
  switch (risk) {
    case 'high':
      return ['verify:ordered', 'apitest:build'];
    case 'medium':
      return ['typecheck', 'test', 'lint', 'format:check'];
    case 'low':
      return ['lint:docs', 'format:check'];
    default:
      throw new Error(`Unknown risk: ${risk}`);
  }
}

function resolveVerificationRisk(fileNames, forcedRisk) {
  const computedRisk = classifyChangeRisk(fileNames);
  if (forcedRisk === undefined || forcedRisk.length === 0) {
    return computedRisk;
  }
  if (!Object.hasOwn(riskRank, forcedRisk)) {
    throw new Error(`Unknown forced risk: ${forcedRisk}`);
  }
  return riskRank[forcedRisk] > riskRank[computedRisk]
    ? forcedRisk
    : computedRisk;
}

function runNpmScript(script) {
  const invocation =
    process.platform === 'win32'
      ? {
          command: process.env.ComSpec || 'cmd.exe',
          args: ['/d', '/s', '/c', 'npm', 'run', script],
        }
      : {
          command: 'npm',
          args: ['run', script],
        };
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`npm run ${script} failed with exit code ${result.status}`);
  }
}

function parseArguments(args) {
  let base;
  let classifyOnly = false;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];

    if (argument === '--base') {
      base = args[index + 1];
      if (base === undefined) {
        throw new Error('--base requires a ref');
      }
      index++;
    } else if (argument === '--classify-only') {
      classifyOnly = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { base, classifyOnly };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const baseRef = resolveBaseRef(options.base);
  const changedFiles = collectChangedFiles(baseRef);
  const forcedRisk = process.env.GITHUB_FORCE_RISK;
  const risk = resolveVerificationRisk(changedFiles, forcedRisk);
  const scripts = verificationScriptsForRisk(risk);

  process.stdout.write(
    [
      `PR verification base: ${baseRef}`,
      `Changed files: ${changedFiles.length}`,
      `Risk: ${risk}`,
      `Checks: ${scripts.map((script) => `npm run ${script}`).join(', ')}`,
      '',
    ].join('\n'),
  );

  if (
    options.classifyOnly ||
    (changedFiles.length === 0 &&
      (forcedRisk === undefined || forcedRisk.length === 0))
  ) {
    return;
  }

  for (const script of scripts) {
    runNpmScript(script);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  classifyChangeRisk,
  classifyFileRisk,
  collectChangedFiles,
  parseArguments,
  resolveBaseRef,
  resolveVerificationRisk,
  verificationScriptsForRisk,
};
