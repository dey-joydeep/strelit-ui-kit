const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { npmCommand } = require('./npm-command.js');

const repoRoot = path.resolve(__dirname, '..');

function run(command, args, cwd = repoRoot, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env,
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
  const invocation = npmCommand(args);
  return run(invocation.command, invocation.args, repoRoot, invocation.env);
}

function parsePackOutput(output) {
  const candidateOffsets = [];
  for (let offset = 0; offset < output.length; offset += 1) {
    if (
      output[offset] === '[' &&
      (offset === 0 || output[offset - 1] === '\n')
    ) {
      candidateOffsets.push(offset);
    }
  }

  for (const offset of candidateOffsets) {
    try {
      const parsed = JSON.parse(output.slice(offset));
      const filename = parsed?.[0]?.filename;
      if (
        Array.isArray(parsed) &&
        parsed.length === 1 &&
        typeof filename === 'string' &&
        filename.length > 0 &&
        filename !== '.' &&
        filename !== '..' &&
        path.basename(filename) === filename
      ) {
        return parsed;
      }
    } catch {
      // npm can emit lifecycle output before its JSON result; try the next line.
    }
  }

  throw new Error('npm pack did not produce a valid JSON package result.');
}

function verifyConsumer(consumerRoot, moduleKind) {
  const extension = moduleKind === 'require' ? 'cjs' : 'mjs';
  const source =
    moduleKind === 'require'
      ? "const packageApi = require('strelit-ui-kit');\n"
      : "import * as packageApi from 'strelit-ui-kit';\n";
  const browserBundleResolution =
    moduleKind === 'require'
      ? "require.resolve('strelit-ui-kit/dist/iife/index.global.js');\n"
      : '';
  const consumerPath = path.join(consumerRoot, `consumer.${extension}`);
  fs.writeFileSync(
    consumerPath,
    `${source}if (typeof packageApi.StrelitLayout !== 'function') throw new Error('StrelitLayout export is unavailable');\nif (Object.keys(packageApi).length < 1) throw new Error('Package API is empty');\n${browserBundleResolution}`,
  );
  run(process.execPath, [consumerPath], consumerRoot);
}

async function verifyBrowserBundle(packageRoot) {
  const bundlePath = path.join(packageRoot, 'dist', 'iife', 'index.global.js');
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Packed browser bundle is missing: ${bundlePath}`);
  }

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    chromiumSandbox: true,
    args: ['--disable-background-networking'],
    timeout: 15_000,
  });
  try {
    const context = await browser.newContext();
    await context.route('**/*', (route) => route.abort());
    await context.routeWebSocket('**/*', (route) => route.close());
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addScriptTag({ content: fs.readFileSync(bundlePath, 'utf8') });
    const hasGlobal = await page.evaluate(
      () => typeof window.strelitUIKit?.StrelitLayout === 'function',
    );
    if (!hasGlobal || pageErrors.length > 0) {
      const detail = pageErrors.length > 0 ? `: ${pageErrors.join('; ')}` : '';
      throw new Error(
        `Packed browser bundle does not expose strelitUIKit.StrelitLayout${detail}`,
      );
    }
  } finally {
    await browser.close();
  }
}

async function main() {
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
    const packResult = parsePackOutput(packOutput);
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
    await verifyBrowserBundle(path.join(modulesRoot, packageJson.name));
    fs.cpSync(
      path.join(repoRoot, 'node_modules', 'tslib'),
      path.join(modulesRoot, 'tslib'),
      { recursive: true },
    );

    verifyConsumer(consumerRoot, 'require');
    verifyConsumer(consumerRoot, 'import');
    process.stdout.write(
      'Packed package runtime imports and browser global passed.\n',
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  npmCommand,
  parsePackOutput,
  run,
  verifyBrowserBundle,
  verifyConsumer,
};
