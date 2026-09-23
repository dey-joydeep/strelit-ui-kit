const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { npmCommand } = require('./npm-command.js');

const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, '.verification');

const stepDefinitions = [
  {
    id: 'typecheck',
    script: 'typecheck',
    logFile: '01-typecheck.log',
  },
  {
    id: 'build',
    script: 'build',
    logFile: '02-build.log',
  },
  {
    id: 'package-runtime',
    script: 'verify:package-runtime',
    logFile: '03-package-runtime.log',
  },
  {
    id: 'test',
    script: 'test',
    logFile: '04-test.log',
  },
  {
    id: 'compatibility-audit',
    script: 'audit:compatibility',
    logFile: '05-compatibility-audit.log',
  },
  {
    id: 'lint',
    script: 'lint',
    logFile: '06-lint.log',
  },
  {
    id: 'format-check',
    script: 'format:check',
    logFile: '07-format-check.log',
  },
];

function createOutputPaths(directory = outputDir) {
  return {
    outputDir: directory,
    summaryPath: path.join(directory, 'summary.json'),
    latestPath: path.join(directory, 'latest.txt'),
  };
}

function createSteps(
  platform = process.platform,
  fileExists = fs.existsSync,
  nodeExecutable = process.execPath,
) {
  return stepDefinitions.map(({ script, ...step }) => ({
    ...step,
    ...npmCommand(['run', script], platform, fileExists, nodeExecutable),
  }));
}

/** Recreates the disposable verification output directory for each run. */
function resetOutputDir(paths) {
  fs.rmSync(paths.outputDir, { recursive: true, force: true });
  fs.mkdirSync(paths.outputDir, { recursive: true });
}

/** Overwrites machine-readable and concise human-readable run summaries. */
function writeSummary(results, paths) {
  const hasFailure = results.some((result) => result.status === 'failed');
  const isComplete = results.length === stepDefinitions.length;
  const summary = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    overallStatus: hasFailure ? 'failed' : isComplete ? 'passed' : 'running',
    steps: results,
  };

  fs.writeFileSync(paths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  const latestLines = [
    `Verification run: ${summary.generatedAt}`,
    `Overall status: ${summary.overallStatus}`,
    '',
  ];

  for (const result of results) {
    latestLines.push(
      `${result.id}: ${result.status} (${result.durationMs} ms)`,
      `log: ${result.logPath}`,
      '',
    );
  }

  fs.writeFileSync(paths.latestPath, latestLines.join('\n'));
}

/** Runs one verification stage while mirroring output to its dedicated log. */
function runStep(step, paths) {
  return new Promise((resolve) => {
    const logPath = path.join(paths.outputDir, step.logFile);
    const logStream = fs.createWriteStream(logPath, { flags: 'w' });
    const startedAt = new Date();
    const startedMs = Date.now();

    logStream.write(`Command: ${step.command} ${step.args.join(' ')}\n`);
    logStream.write(`Started: ${startedAt.toISOString()}\n\n`);

    const child = spawn(step.command, step.args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
    });

    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });

    child.on('error', (error) => {
      logStream.write(`\nProcess error: ${error.stack ?? error.message}\n`);
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - startedMs;
      const finishedAt = new Date();
      const status = code === 0 ? 'passed' : 'failed';

      logStream.write(`\nFinished: ${finishedAt.toISOString()}\n`);
      logStream.write(`Exit code: ${code ?? 'null'}\n`);
      logStream.write(`Status: ${status}\n`);
      logStream.write(`DurationMs: ${durationMs}\n`);
      logStream.end();

      resolve({
        id: step.id,
        command: `${step.command} ${step.args.join(' ')}`,
        status,
        exitCode: code,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
        logPath,
      });
    });
  });
}

/** Runs verification sequentially and marks all later stages skipped on failure. */
async function main(options = {}) {
  const paths = options.paths ?? createOutputPaths();
  const setExitCode =
    options.setExitCode ?? ((code) => (process.exitCode = code));

  resetOutputDir(paths);
  const steps = (options.createVerificationSteps ?? createSteps)();

  const results = [];

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const result = await runStep(step, paths);
    results.push(result);
    writeSummary(results, paths);

    if (result.status !== 'passed') {
      for (
        let skippedIndex = index + 1;
        skippedIndex < steps.length;
        skippedIndex++
      ) {
        const skippedStep = steps[skippedIndex];
        results.push({
          id: skippedStep.id,
          command: `${skippedStep.command} ${skippedStep.args.join(' ')}`,
          status: 'skipped',
          exitCode: null,
          startedAt: null,
          finishedAt: null,
          durationMs: 0,
          logPath: path.join(paths.outputDir, skippedStep.logFile),
        });
      }

      writeSummary(results, paths);
      setExitCode(1);
      return;
    }
  }
}

async function run(options = {}) {
  const paths = options.paths ?? createOutputPaths();
  const setExitCode =
    options.setExitCode ?? ((code) => (process.exitCode = code));
  const writeError =
    options.writeError ?? ((message) => process.stderr.write(message));

  try {
    await main({ ...options, paths, setExitCode });
  } catch (error) {
    resetOutputDir(paths);
    const fatalLogPath = path.join(paths.outputDir, 'fatal.log');
    const message = `${error.stack ?? error.message}\n`;
    fs.writeFileSync(fatalLogPath, message);
    writeSummary(
      [
        {
          id: 'fatal',
          command: 'node ./scripts/verify-ordered.js',
          status: 'failed',
          exitCode: 1,
          startedAt: null,
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          logPath: fatalLogPath,
        },
      ],
      paths,
    );
    writeError(message);
    setExitCode(1);
  }
}

if (require.main === module) {
  void run();
}

module.exports = { createOutputPaths, createSteps, run };
