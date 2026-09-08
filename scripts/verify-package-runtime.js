const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
      { cause: result.error },
    );
  }
  return result.stdout;
}

function npmInvocation(args) {
  if (process.platform === 'win32') {
    return run(process.env.ComSpec || 'cmd.exe', [
      '/d',
      '/s',
      '/c',
      'npm',
      ...args,
    ]);
  }
  return run('npm', args);
}

function verifyConsumer(consumerRoot, moduleKind) {
  const extension = moduleKind === 'require' ? 'cjs' : 'mjs';
  const source =
    moduleKind === 'require'
      ? "const packageApi = require('strelit-ui-kit');\n"
      : "import * as packageApi from 'strelit-ui-kit';\n";
  const consumerPath = path.join(consumerRoot, `consumer.${extension}`);
  fs.writeFileSync(
    consumerPath,
    `${source}if (typeof packageApi.StrelitLayout !== 'function') throw new Error('StrelitLayout export is unavailable');\nif (Object.keys(packageApi).length < 1) throw new Error('Package API is empty');\n`,
  );
  run(process.execPath, [consumerPath], consumerRoot);
}

function main() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  );
  for (const target of [
    packageJson.exports?.['.']?.require,
    packageJson.exports?.['.']?.import,
  ]) {
    if (
      typeof target !== 'string' ||
      !fs.existsSync(path.join(repoRoot, target))
    ) {
      throw new Error(`Built package entry is missing: ${String(target)}`);
    }
  }

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'strelit-package-runtime-'),
  );
  try {
    const packOutput = npmInvocation([
      'pack',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      temporaryRoot,
    ]);
    const packResult = JSON.parse(packOutput);
    const archivePath = path.join(temporaryRoot, packResult[0].filename);
    const extractedRoot = path.join(temporaryRoot, 'extracted');
    fs.mkdirSync(extractedRoot);
    run('tar', ['-xzf', archivePath, '-C', extractedRoot]);

    const consumerRoot = path.join(temporaryRoot, 'consumer');
    const modulesRoot = path.join(consumerRoot, 'node_modules');
    fs.mkdirSync(modulesRoot, { recursive: true });
    fs.renameSync(
      path.join(extractedRoot, 'package'),
      path.join(modulesRoot, packageJson.name),
    );
    fs.cpSync(
      path.join(repoRoot, 'node_modules', 'tslib'),
      path.join(modulesRoot, 'tslib'),
      { recursive: true },
    );

    verifyConsumer(consumerRoot, 'require');
    verifyConsumer(consumerRoot, 'import');
    process.stdout.write(
      'Packed package runtime imports passed for CommonJS and ES modules.\n',
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
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

module.exports = { main, run, verifyConsumer };
