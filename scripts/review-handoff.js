const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const nodePath = require('node:path');
const agentLedger = require('./agent-work-ledger.js');
const reviewPolicy = require('./change-review-policy.js');
const changeDiscipline = require('./verify-pr.js');
const { npmCommand } = require('./npm-command.js');

const receiptVersion = 2;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    env: options.env ?? process.env,
    shell: false,
    stdio: options.inherit ? 'inherit' : 'pipe',
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout?.trim() ?? '';
}

function runNpmScript(script, args = [], cwd = process.cwd()) {
  const invocation = npmCommand(['run', script, ...args]);
  run(invocation.command, invocation.args, {
    cwd,
    env: invocation.env,
    inherit: true,
  });
}

function gitOutput(args, cwd = process.cwd()) {
  return run('git', args, { cwd });
}

function receiptPath(cwd = process.cwd()) {
  return nodePath.join(
    gitOutput(['rev-parse', '--absolute-git-dir'], cwd),
    'strelit',
    'review-ready.json',
  );
}

function readReceipt(cwd = process.cwd()) {
  try {
    return JSON.parse(readFileSync(receiptPath(cwd), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function writeReceipt(receipt, cwd = process.cwd()) {
  const target = receiptPath(cwd);
  mkdirSync(nodePath.dirname(target), { recursive: true });
  const candidate = `${target}.${randomUUID()}.tmp`;
  try {
    writeFileSync(candidate, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    renameSync(candidate, target);
  } finally {
    rmSync(candidate, { force: true });
  }
}

function assertCleanCommittedHead(cwd = process.cwd()) {
  const source = agentLedger.currentSourceState(cwd);
  if (source.workingPaths.length > 0) {
    throw new Error(
      'Review handoff requires a clean committed candidate. Commit the intended changes first.',
    );
  }
  return source;
}

function createReceipt(cwd = process.cwd()) {
  const source = assertCleanCommittedHead(cwd);
  const baseRef = changeDiscipline.resolveBaseRef(
    process.env.STRELIT_REVIEW_BASE_REF,
    cwd,
  );
  return {
    version: receiptVersion,
    head: source.head,
    fingerprint: source.fingerprint,
    baseHead: gitOutput(['merge-base', baseRef, 'HEAD'], cwd),
    baseTip: gitOutput(['rev-parse', `${baseRef}^{commit}`], cwd),
    createdAt: new Date().toISOString(),
  };
}

function validateReceipt(receipt, source, expectedBaseHead, expectedBaseTip) {
  const errors = [];
  if (receipt === undefined) {
    return ['No review-ready receipt exists for this checkout.'];
  }
  if (receipt.version !== receiptVersion) {
    errors.push('The review-ready receipt version is unsupported.');
  }
  if (receipt.head !== source.head) {
    errors.push('The review-ready receipt targets a different commit.');
  }
  if (receipt.fingerprint !== source.fingerprint) {
    errors.push(
      'The review-ready receipt is stale for the current source state.',
    );
  }
  if (receipt.baseHead !== expectedBaseHead) {
    errors.push(
      'The review-ready receipt targets a different pull-request base.',
    );
  }
  if (receipt.baseTip !== expectedBaseTip) {
    errors.push(
      'The review-ready receipt targets a different pull-request base tip.',
    );
  }
  return errors;
}

function checkReceipt(cwd = process.cwd()) {
  const source = assertCleanCommittedHead(cwd);
  const baseRef = changeDiscipline.resolveBaseRef(
    process.env.STRELIT_REVIEW_BASE_REF,
    cwd,
  );
  const expectedBaseHead = gitOutput(['merge-base', baseRef, 'HEAD'], cwd);
  const expectedBaseTip = gitOutput(['rev-parse', `${baseRef}^{commit}`], cwd);
  const errors = validateReceipt(
    readReceipt(cwd),
    source,
    expectedBaseHead,
    expectedBaseTip,
  );
  if (errors.length > 0) {
    throw new Error(
      `${errors.join('\n')} Run npm run review:prepare after exact-head reviews are complete.`,
    );
  }
  return source;
}

function requiresReceiptForHead(head, cwd = process.cwd()) {
  const baseRef = changeDiscipline.resolveBaseRef(
    process.env.STRELIT_REVIEW_BASE_REF,
    cwd,
  );
  const mergeBase = gitOutput(['merge-base', baseRef, head], cwd);
  const paths = reviewPolicy.collectCommittedChangedFiles(mergeBase, head, cwd);
  const risk = reviewPolicy.classifyTrustedChange(paths, mergeBase, cwd).risk;
  return changeDiscipline.requiresLocalReviewGate(risk, {});
}

function parsePushUpdates(input) {
  return input
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line
        .trim()
        .split(/\s+/u);
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

function prePush(input, cwd = process.cwd()) {
  const head = gitOutput(['rev-parse', 'HEAD'], cwd);
  const pushesHead = parsePushUpdates(input).some(
    ({ localSha }) => localSha === head,
  );
  if (!pushesHead || !requiresReceiptForHead(head, cwd)) {
    return;
  }
  checkReceipt(cwd);
}

function parseArguments(args) {
  const [command = 'check', ...rest] = args;
  const options = {};
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      options[token.slice(2)] = true;
    } else {
      options[token.slice(2)] = value;
      index++;
    }
  }
  return { command, options };
}

function requirePullRequest(options) {
  if (typeof options.pr !== 'string' || !/^\d+$/u.test(options.pr)) {
    throw new Error('Pass the pull request number with --pr <number>.');
  }
  return options.pr;
}

function closedClassIds(ledger, head) {
  if (ledger.currentHead !== head) {
    throw new Error(
      `Review ledger targets ${ledger.currentHead}, not cloud handoff head ${head}.`,
    );
  }
  if (ledger.reviewGate?.mode !== 'pull-request') {
    throw new Error('Cloud handoff requires a pull-request review gate.');
  }
  const sameStringSet = (left, right) =>
    left.length === right.length &&
    left.every((value) => right.includes(value));
  const reviews = ledger.units.filter(
    (unit) =>
      unit.kind === 'review' &&
      unit.status === 'completed' &&
      unit.head === head &&
      unit.sourceFingerprint === ledger.currentFingerprint &&
      unit.review?.scope === 'whole-pr' &&
      unit.review.pass === 'fresh-discovery' &&
      unit.checkpoint?.verdict === 'pass' &&
      unit.checkpoint.reviewedBase === ledger.baseHead &&
      unit.checkpoint.reviewedHead === head &&
      sameStringSet(unit.assignedPaths, ledger.reviewGate.requiredPaths) &&
      sameStringSet(unit.review.domains, ledger.reviewGate.applicableDomains),
  );
  if (reviews.length !== 1) {
    throw new Error(
      `Expected one gate-qualified final review for cloud handoff; found ${reviews.length}.`,
    );
  }
  const [review] = reviews;
  const closureReviews = ledger.units.filter((unit) => {
    if (
      unit.kind !== 'review' ||
      unit.checkpoint?.verdict !== 'pass' ||
      unit.review?.pass !== 'finding-closure'
    ) {
      return false;
    }
    if (
      unit.status === 'completed' &&
      unit.head === head &&
      unit.sourceFingerprint === ledger.currentFingerprint
    ) {
      return true;
    }
    if (
      unit.status !== 'carried-forward' ||
      unit.carryForward?.toHead !== head
    ) {
      return false;
    }
    const coveredPaths = new Set([
      ...unit.assignedPaths,
      ...unit.adjacentPaths,
    ]);
    return !unit.carryForward.changedPaths.some((path) =>
      coveredPaths.has(path),
    );
  });
  return [
    ...new Set(
      [review, ...closureReviews].flatMap((unit) =>
        (unit.checkpoint.classClosures ?? []).map(({ id }) => id),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function reviewRequestMarker(pullRequest, head, baseTip, classIds = []) {
  if (classIds.some((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id))) {
    throw new Error(
      'Closed defect-class IDs must be lowercase hyphenated slugs.',
    );
  }
  const classes = classIds.length === 0 ? 'none' : classIds.join(',');
  return `<!-- strelit-codex-review-request pr=${pullRequest} head=${head} base=${baseTip} classes=${classes} -->`;
}

function parsePullRequestRepository(pullRequestUrl) {
  const pathParts = new URL(pullRequestUrl).pathname.split('/').filter(Boolean);
  if (pathParts.length < 4 || pathParts[2] !== 'pull') {
    throw new Error(`Unexpected pull request URL: ${pullRequestUrl}`);
  }
  return { owner: pathParts[0], repository: pathParts[1] };
}

function hasReviewRequest(marker, comments) {
  return comments.some(
    (comment) =>
      typeof comment?.body === 'string' && comment.body.includes(marker),
  );
}

function validatePullRequestBoundary(
  pullRequest,
  remotePullRequest,
  source,
  receipt,
) {
  const errors = [];
  if (remotePullRequest.headRefOid !== source.head) {
    errors.push(
      `Pull request #${pullRequest} targets ${remotePullRequest.headRefOid}, not local HEAD ${source.head}. Push first.`,
    );
  }
  if (remotePullRequest.baseRefOid !== receipt.baseTip) {
    errors.push(
      `Pull request #${pullRequest} base ${remotePullRequest.baseRefOid} does not match reviewed base ${receipt.baseTip}.`,
    );
  }
  return errors;
}

function requestCloudReview(options, cwd = process.cwd()) {
  const pullRequest = requirePullRequest(options);
  const source = checkReceipt(cwd);
  const remotePullRequest = JSON.parse(
    run(
      'gh',
      ['pr', 'view', pullRequest, '--json', 'headRefOid,baseRefOid,url'],
      { cwd },
    ),
  );
  const receipt = readReceipt(cwd);
  const boundaryErrors = validatePullRequestBoundary(
    pullRequest,
    remotePullRequest,
    source,
    receipt,
  );
  if (boundaryErrors.length > 0) {
    throw new Error(boundaryErrors.join('\n'));
  }
  const classIds = closedClassIds(
    agentLedger.execute('status', {}, cwd),
    source.head,
  );
  const marker = reviewRequestMarker(
    pullRequest,
    source.head,
    receipt.baseTip,
    classIds,
  );
  const { owner, repository } = parsePullRequestRepository(
    remotePullRequest.url,
  );
  const commentPages = JSON.parse(
    run(
      'gh',
      [
        'api',
        '--paginate',
        '--slurp',
        `repos/${owner}/${repository}/issues/${pullRequest}/comments`,
      ],
      { cwd },
    ),
  );
  if (
    options.reopen !== true &&
    hasReviewRequest(marker, commentPages.flat())
  ) {
    process.stdout.write(
      `Codex review was already requested for PR #${pullRequest} at ${source.head}.\n`,
    );
    return;
  }
  const classSummary = classIds.length === 0 ? 'none' : classIds.join(', ');
  const body = `@codex review exact commit ${source.head}\n\nClosed defect classes: ${classSummary}\n\n${marker}`;
  run('gh', ['pr', 'comment', pullRequest, '--body', body], {
    cwd,
    inherit: true,
  });
}

function prepare(cwd = process.cwd()) {
  assertCleanCommittedHead(cwd);
  runNpmScript('verify:review-ready', [], cwd);
  const receipt = createReceipt(cwd);
  writeReceipt(receipt, cwd);
  process.stdout.write(`Review-ready receipt recorded for ${receipt.head}.\n`);
}

function finalize(options, cwd = process.cwd()) {
  requirePullRequest(options);
  prepare(cwd);
  run('git', ['push'], { cwd, inherit: true });
  requestCloudReview(options, cwd);
}

function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'prepare') {
    prepare();
  } else if (command === 'check') {
    checkReceipt();
  } else if (command === 'pre-push') {
    const input = readFileSync(0, 'utf8');
    prePush(input);
  } else if (command === 'request') {
    requestCloudReview(options);
  } else if (command === 'finalize') {
    finalize(options);
  } else {
    throw new Error(`Unknown review handoff command: ${command}`);
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
  closedClassIds,
  createReceipt,
  hasReviewRequest,
  parseArguments,
  parsePullRequestRepository,
  parsePushUpdates,
  prePush,
  receiptPath,
  requiresReceiptForHead,
  reviewRequestMarker,
  validatePullRequestBoundary,
  validateReceipt,
};
