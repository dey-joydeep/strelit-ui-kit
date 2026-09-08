const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const nodePath = require('node:path');

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

function install(cwd = process.cwd()) {
  if (runGit(['rev-parse', '--git-dir'], true, cwd).status !== 0) {
    return 'not-a-git-checkout';
  }
  const configured = runGit(
    ['config', '--local', '--get', 'core.hooksPath'],
    true,
    cwd,
  ).stdout.trim();
  if (configured.length > 0 && configured !== '.githooks') {
    throw new Error(
      `Cannot install Strelit hooks because core.hooksPath is already ${configured}. Integrate .githooks/pre-push into that hook path.`,
    );
  }
  fs.chmodSync(nodePath.resolve(cwd, '.githooks/pre-push'), 0o755);
  runGit(['config', '--local', 'core.hooksPath', '.githooks'], false, cwd);
  return 'installed';
}

if (require.main === module) {
  try {
    const result = install();
    if (result === 'installed') {
      process.stdout.write('Configured repository hooks from .githooks.\n');
    }
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { install };
