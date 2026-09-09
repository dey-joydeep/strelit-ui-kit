const { spawnSync } = require('node:child_process');
const {
  classifyChangeRisk,
  classifyFileRisk,
  collectChangedFiles,
  createPullRequestReviewGate,
  domainsForPath,
} = require('./change-review-policy.js');
const agentLedger = require('./agent-work-ledger.js');

const riskRank = {
  low: 0,
  medium: 1,
  high: 2,
};

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

function verificationScriptsForRisk(risk) {
  switch (risk) {
    case 'high':
      return [
        'verify:agent-ledger',
        'verify:ordered',
        'apitest:build',
        'apitest:smoke',
      ];
    case 'medium':
      return [
        'verify:agent-ledger',
        'typecheck',
        'typecheck:bundle:prepare',
        'typecheck:bundle',
        'test',
        'lint',
        'format:check',
      ];
    case 'low':
      return ['verify:agent-ledger', 'lint:docs', 'format:check'];
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

function requiresLocalReviewGate(risk, environment = process.env) {
  return risk === 'high' && environment.GITHUB_ACTIONS !== 'true';
}

function executedCommandNames(scripts) {
  return scripts.map((script) => `npm run ${script}`);
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
  let reviewReady = false;

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
    } else if (argument === '--review-ready') {
      reviewReady = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (reviewReady && (classifyOnly || base !== undefined)) {
    throw new Error('--review-ready rejects --classify-only and --base.');
  }
  return { base, classifyOnly, reviewReady };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const baseRef = options.reviewReady
    ? resolveBaseRef(process.env.STRELIT_REVIEW_BASE_REF)
    : resolveBaseRef(options.base);
  const changedFiles = collectChangedFiles(baseRef);
  const forcedRisk = process.env.GITHUB_FORCE_RISK;
  const risk = resolveVerificationRisk(changedFiles, forcedRisk);
  const scripts = verificationScriptsForRisk(risk);
  const localReviewGate = options.reviewReady || requiresLocalReviewGate(risk);

  process.stdout.write(
    [
      `PR verification base: ${baseRef}`,
      `Changed files: ${changedFiles.length}`,
      `Risk: ${risk}`,
      `Checks: ${scripts.map((script) => `npm run ${script}`).join(', ')}`,
      `Local definitive review gate: ${localReviewGate ? 'required' : 'not required'}`,
      '',
    ].join('\n'),
  );

  if (
    options.classifyOnly ||
    (!options.reviewReady &&
      changedFiles.length === 0 &&
      (forcedRisk === undefined || forcedRisk.length === 0))
  ) {
    return;
  }

  for (const script of scripts) {
    runNpmScript(script);
  }
  if (localReviewGate) {
    const expectedBaseHead = runGit(
      ['merge-base', baseRef, 'HEAD'],
      false,
    ).stdout.trim();
    const ledger = agentLedger.execute('status', {});
    const expectedReviewGate = createPullRequestReviewGate(
      expectedBaseHead,
      ledger.reviewGate?.implementer ?? '',
      process.cwd(),
    );
    agentLedger.validatePullRequestGate(
      ledger,
      agentLedger.currentSourceState(),
      {
        requireComplete: true,
        expectedBaseHead,
        expectedReviewGate,
        executedCommands: executedCommandNames(scripts),
      },
    );
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
  domainsForPath,
  executedCommandNames,
  parseArguments,
  resolveBaseRef,
  resolveVerificationRisk,
  requiresLocalReviewGate,
  verificationScriptsForRisk,
};
