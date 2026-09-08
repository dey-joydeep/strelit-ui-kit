const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, '.verification');
const summaryPath = path.join(outputDir, 'summary.json');
const latestPath = path.join(outputDir, 'latest.txt');

const npmCommand =
  process.platform === 'win32'
    ? {
        command: process.env.ComSpec || 'cmd.exe',
        argsPrefix: ['/d', '/s', '/c', 'npm'],
      }
    : {
        command: 'npm',
        argsPrefix: [],
      };

const steps = [
  {
    id: 'typecheck',
    command: npmCommand.command,
    args: [...npmCommand.argsPrefix, 'run', 'typecheck'],
    logFile: '01-typecheck.log',
  },
  {
    id: 'build',
    command: npmCommand.command,
    args: [...npmCommand.argsPrefix, 'run', 'build'],
    logFile: '02-build.log',
  },
  {
    id: 'package-runtime',
    command: npmCommand.command,
    args: [...npmCommand.argsPrefix, 'run', 'verify:package-runtime'],
    logFile: '03-package-runtime.log',
  },
  {
    id: 'test',
    command: npmCommand.command,
    args: [...npmCommand.argsPrefix, 'run', 'test'],
    logFile: '04-test.log',
  },
  {
    id: 'compatibility-audit',
    command: npmCommand.command,
    args: [...npmCommand.argsPrefix, 'run', 'audit:compatibility'],
    logFile: '05-compatibility-audit.log',
  },
  {
    id: 'lint',
    command: npmCommand.command,
    args: [...npmCommand.argsPrefix, 'run', 'lint'],
    logFile: '06-lint.log',
  },
  {
    id: 'format-check',
    command: npmCommand.command,
    args: [...npmCommand.argsPrefix, 'run', 'format:check'],
    logFile: '07-format-check.log',
  },
];

/** Recreates the disposable verification output directory for each run. */
function resetOutputDir() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
}

/** Overwrites machine-readable and concise human-readable run summaries. */
function writeSummary(results) {
  const hasFailure = results.some((result) => result.status === 'failed');
  const isComplete = results.length === steps.length;
  const summary = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    overallStatus: hasFailure ? 'failed' : isComplete ? 'passed' : 'running',
    steps: results,
  };

  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

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

  fs.writeFileSync(latestPath, latestLines.join('\n'));
}

/** Runs one verification stage while mirroring output to its dedicated log. */
function runStep(step) {
  return new Promise((resolve) => {
    const logPath = path.join(outputDir, step.logFile);
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
async function main() {
  resetOutputDir();

  const results = [];

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const result = await runStep(step);
    results.push(result);
    writeSummary(results);

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
          logPath: path.join(outputDir, skippedStep.logFile),
        });
      }

      writeSummary(results);
      process.exitCode = 1;
      return;
    }
  }
}

main().catch((error) => {
  resetOutputDir();
  const fatalLogPath = path.join(outputDir, 'fatal.log');
  const message = `${error.stack ?? error.message}\n`;
  fs.writeFileSync(fatalLogPath, message);
  writeSummary([
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
  ]);
  process.stderr.write(message);
  process.exitCode = 1;
});
