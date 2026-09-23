// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

interface PackageRuntimeModule {
  npmCommand(
    args: string[],
    platform?: string,
    fileExists?: (fileName: string) => boolean,
  ): { command: string; args: string[] };
  run(command: string, args: string[]): string;
  parsePackOutput(output: string): Array<{ filename: string }>;
}

interface VerifyOrderedModule {
  createOutputPaths(directory: string): {
    outputDir: string;
    summaryPath: string;
    latestPath: string;
  };
  createSteps(
    platform?: string,
    fileExists?: (fileName: string) => boolean,
    nodeExecutable?: string,
  ): unknown[];
  run(options?: {
    paths?: ReturnType<VerifyOrderedModule['createOutputPaths']>;
    createVerificationSteps?: () => unknown[];
    setExitCode?: (code: number) => void;
    writeError?: (message: string) => void;
  }): Promise<void>;
}

const require = createRequire(import.meta.url);
const packageRuntime =
  require('../../scripts/verify-package-runtime.js') as PackageRuntimeModule;
const verifyOrdered =
  require('../../scripts/verify-ordered.js') as VerifyOrderedModule;

describe('package runtime verification', () => {
  it('keeps repository npm launchers independent of executable-selecting environment variables', () => {
    for (const script of [
      'scripts/review-handoff.js',
      'scripts/verify-ordered.js',
      'scripts/verify-package-runtime.js',
      'scripts/verify-pr.js',
    ]) {
      const source = readFileSync(resolve(script), 'utf8');
      expect(source).toContain("require('./npm-command.js')");
      expect(source).not.toMatch(/process\.env\.(?:ComSpec|npm_execpath)/u);
    }
  });

  it('uses bundled npm and passes Windows destinations without a command interpreter', () => {
    const bundledNpm = join(
      dirname(process.execPath),
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    );
    const poisonedNpmExecPath = process.env.npm_execpath;
    const poisonedComSpec = process.env.ComSpec;
    process.env.npm_execpath = resolve('.tmp/attacker-controlled.js');
    process.env.ComSpec = resolve('.tmp/attacker-controlled.exe');

    try {
      for (const destination of [
        'E:/temp/a&ver&rem',
        'E:/temp/with spaces',
        'E:/temp/%PATH%',
      ]) {
        const args = ['pack', '--pack-destination', destination];
        const invocation = packageRuntime.npmCommand(args, 'win32', () => true);
        expect(invocation).toEqual({
          command: process.execPath,
          args: [bundledNpm, ...args],
        });
        expect(
          packageRuntime.run(invocation.command, [
            '-e',
            'process.stdout.write(process.argv[1])',
            destination,
          ]),
        ).toBe(destination);
      }
    } finally {
      if (poisonedNpmExecPath === undefined) {
        delete process.env.npm_execpath;
      } else {
        process.env.npm_execpath = poisonedNpmExecPath;
      }
      if (poisonedComSpec === undefined) {
        delete process.env.ComSpec;
      } else {
        process.env.ComSpec = poisonedComSpec;
      }
    }
  });

  it('preserves POSIX npm invocation and diagnoses a missing Windows entrypoint', () => {
    expect(packageRuntime.npmCommand(['--version'], 'linux')).toEqual({
      command: 'npm',
      args: ['--version'],
    });
    expect(() =>
      packageRuntime.npmCommand(['--version'], 'win32', () => false),
    ).toThrow('Cannot locate npm JavaScript entrypoint beside');
  });

  it('replaces stale verification evidence when npm resolution fails', async () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'strelit-verify-'));
    const paths = verifyOrdered.createOutputPaths(temporaryDirectory);
    const setExitCode = vi.fn();

    writeFileSync(paths.summaryPath, '{"overallStatus":"passed"}\n');
    writeFileSync(paths.latestPath, 'Overall status: passed\n');

    try {
      await verifyOrdered.run({
        paths,
        createVerificationSteps: () =>
          verifyOrdered.createSteps('win32', () => false, 'C:/node/node.exe'),
        setExitCode,
        writeError: vi.fn(),
      });

      const summary = JSON.parse(readFileSync(paths.summaryPath, 'utf8')) as {
        overallStatus: string;
        steps: Array<{ id: string; status: string }>;
      };
      expect(summary.overallStatus).toBe('failed');
      expect(summary.steps).toEqual([
        expect.objectContaining({ id: 'fatal', status: 'failed' }),
      ]);
      expect(readFileSync(paths.latestPath, 'utf8')).toContain(
        'Overall status: failed',
      );
      expect(
        readFileSync(join(temporaryDirectory, 'fatal.log'), 'utf8'),
      ).toContain('Cannot locate npm JavaScript entrypoint beside');
      expect(setExitCode).toHaveBeenCalledWith(1);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('parses npm pack JSON after lifecycle output', () => {
    expect(
      packageRuntime.parsePackOutput(
        'Configured repository hooks in .githooks.\n[{"filename":"strelit-ui-kit-0.1.0.tgz"}]\n',
      ),
    ).toEqual([{ filename: 'strelit-ui-kit-0.1.0.tgz' }]);
  });

  it('rejects missing, malformed, or unsafe package results', () => {
    expect(() => packageRuntime.parsePackOutput('Configured hooks.\n')).toThrow(
      'npm pack did not produce a valid JSON package result.',
    );
    expect(() =>
      packageRuntime.parsePackOutput('[{"filename":"../outside.tgz"}]'),
    ).toThrow('npm pack did not produce a valid JSON package result.');
    for (const filename of ['.', '..']) {
      expect(() =>
        packageRuntime.parsePackOutput(JSON.stringify([{ filename }])),
      ).toThrow('npm pack did not produce a valid JSON package result.');
    }
    expect(() =>
      packageRuntime.parsePackOutput(
        '[{"filename":"first.tgz"},{"filename":"second.tgz"}]',
      ),
    ).toThrow('npm pack did not produce a valid JSON package result.');
  });
});
