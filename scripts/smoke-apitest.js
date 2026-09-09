const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const viteBin = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const host = '127.0.0.1';
const port = Number(process.env.STRELIT_SMOKE_PORT ?? 4173);
const url = `http://${host}:${port}/?smoke=1`;

/** Runs a child process and rejects when it exits unsuccessfully. */
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: false,
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${command} exited with code ${code}\n${stdout}\n${stderr}`,
          ),
        );
      }
    });
  });
}

/** Returns the first usable supported browser executable. */
function findBrowser() {
  const configured = process.env.STRELIT_BROWSER_PATH;
  const candidates = configured ? [configured] : [];

  if (process.platform === 'win32') {
    const roots = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);
    for (const root of roots) {
      candidates.push(
        path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      );
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else {
    candidates.push(
      'google-chrome',
      'google-chrome-stable',
      'chromium',
      'chromium-browser',
      'microsoft-edge',
    );
  }

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } else {
      const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
      if (probe.status === 0) {
        return candidate;
      }
    }
  }

  throw new Error(
    'Chrome or Edge was not found. Set STRELIT_BROWSER_PATH to its executable.',
  );
}

/** Observes preview process failure without allowing an unhandled error event. */
function observePreview(preview) {
  let failure;
  const onError = (error) => {
    failure = error;
  };
  const onClose = (code, signal) => {
    if (failure === undefined) {
      failure = new Error(
        `Vite preview exited before smoke validation (code ${code}, signal ${signal ?? 'none'})`,
      );
    }
  };
  preview.on('error', onError);
  preview.on('close', onClose);

  return {
    assertRunning() {
      if (failure !== undefined) {
        throw failure;
      }
      if (preview.exitCode !== null || preview.signalCode !== null) {
        throw new Error(
          `Vite preview exited before smoke validation (code ${preview.exitCode}, signal ${preview.signalCode ?? 'none'})`,
        );
      }
    },
    dispose() {
      preview.off('error', onError);
      preview.off('close', onClose);
    },
  };
}

/** Waits until the observed preview server responds successfully. */
async function waitForServer(
  previewMonitor,
  targetUrl = url,
  timeoutMs = 15_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    previewMonitor.assertRunning();
    let response;
    try {
      response = await fetch(targetUrl);
    } catch {
      // The preview process may still be binding its socket.
    }
    previewMonitor.assertRunning();
    if (response?.ok) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  previewMonitor.assertRunning();
  throw new Error(`Vite preview did not become ready at ${targetUrl}`);
}

/** Builds the API demo and verifies that Strelit renders in a real browser. */
async function main() {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid STRELIT_SMOKE_PORT: ${port}`);
  }

  await run(process.execPath, [
    viteBin,
    'build',
    '--config',
    'vite.apitest.config.ts',
  ]);

  const preview = spawn(
    process.execPath,
    [
      viteBin,
      'preview',
      '--config',
      'vite.apitest.config.ts',
      '--host',
      host,
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], shell: false },
  );
  let previewOutput = '';
  preview.stdout.on('data', (chunk) => {
    previewOutput += chunk;
  });
  preview.stderr.on('data', (chunk) => {
    previewOutput += chunk;
  });
  const previewMonitor = observePreview(preview);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'strelit-smoke-'));
  try {
    await waitForServer(previewMonitor);
    previewMonitor.assertRunning();
    const browser = findBrowser();
    const { stdout, stderr } = await run(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profile}`,
        '--virtual-time-budget=8000',
        '--dump-dom',
        url,
      ],
      { capture: true },
    );

    for (const marker of [
      'lm_strelit',
      'lm_root',
      'lm_item',
      'data-strelit-smoke="passed"',
    ]) {
      if (!stdout.includes(marker)) {
        throw new Error(`API demo did not render expected marker: ${marker}`);
      }
    }
    if (/uncaught|unhandled|error loading/i.test(stderr)) {
      throw new Error(`Browser reported a runtime failure:\n${stderr}`);
    }
    previewMonitor.assertRunning();
    process.stdout.write(`API demo browser smoke passed with ${browser}.\n`);
  } catch (error) {
    if (previewOutput.length > 0) {
      process.stderr.write(previewOutput);
    }
    throw error;
  } finally {
    previewMonitor.dispose();
    preview.kill();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { observePreview, waitForServer };
