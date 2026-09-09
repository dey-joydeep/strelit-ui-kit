const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const nodePath = require('node:path');

const managedMarker = '# strelit-managed-pre-push';

function installDefaultPrePush(cwd) {
  const hooksDirectory = nodePath.join(
    runGit(
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      false,
      cwd,
    ).stdout.trim(),
    'hooks',
  );
  const hookPath = nodePath.join(hooksDirectory, 'pre-push');
  const previousHookPath = nodePath.join(
    hooksDirectory,
    'pre-push.strelit-existing',
  );
  fs.mkdirSync(hooksDirectory, { recursive: true });
  if (
    fs.existsSync(hookPath) &&
    fs.readFileSync(hookPath, 'utf8').includes(managedMarker)
  ) {
    fs.chmodSync(hookPath, 0o755);
    return;
  }
  let preservedExisting = false;
  if (fs.existsSync(hookPath)) {
    if (fs.existsSync(previousHookPath)) {
      throw new Error(
        `Cannot preserve ${hookPath} because ${previousHookPath} already exists.`,
      );
    }
    fs.renameSync(hookPath, previousHookPath);
    preservedExisting = true;
  }
  const candidate = `${hookPath}.${randomUUID()}.tmp`;
  const wrapper = `#!/bin/sh
${managedMarker}
hook_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
previous_hook="$hook_dir/pre-push.strelit-existing"
if [ -f "$previous_hook" ]; then
  "$previous_hook" "$@" || exit $?
fi
repo_root=$(git rev-parse --show-toplevel) || exit $?
exec "$repo_root/.githooks/pre-push" "$@"
`;
  try {
    fs.writeFileSync(candidate, wrapper, { encoding: 'utf8', flag: 'wx' });
    fs.chmodSync(candidate, 0o755);
    fs.renameSync(candidate, hookPath);
  } catch (error) {
    fs.rmSync(candidate, { force: true });
    if (preservedExisting && !fs.existsSync(hookPath)) {
      fs.renameSync(previousHookPath, hookPath);
    }
    throw error;
  }
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
  installDefaultPrePush(cwd);
  if (configured === '.githooks') {
    runGit(['config', '--local', '--unset', 'core.hooksPath'], false, cwd);
  }
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
