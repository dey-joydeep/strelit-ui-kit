// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve, win32 } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

interface PackageRuntimeModule {
  npmCommand(
    args: string[],
    platform?: string,
    fileExists?: (fileName: string) => boolean,
    nodeExecutable?: string,
    environment?: NodeJS.ProcessEnv,
  ): { command: string; args: string[]; env: NodeJS.ProcessEnv };
  run(
    command: string,
    args: string[],
    cwd?: string,
    env?: NodeJS.ProcessEnv,
  ): string;
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
    const nodeExecutable = 'D:\\portable-node\\node.exe';
    const bundledNpm = win32.join(
      win32.dirname(nodeExecutable),
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    );
    const trustedShell = '\\\\.\\GLOBALROOT\\SystemRoot\\System32\\cmd.exe';
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
        const invocation = packageRuntime.npmCommand(
          args,
          'win32',
          () => true,
          nodeExecutable,
        );
        expect(invocation.command).toBe(nodeExecutable);
        expect(invocation.args).toEqual([
          bundledNpm,
          `--script-shell=${trustedShell}`,
          ...args,
        ]);
        expect(invocation.env.ComSpec).toBe(trustedShell);
        expect(invocation.env.npm_config_script_shell).toBe(trustedShell);
        expect(
          packageRuntime.run(process.execPath, [
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
    const invocation = packageRuntime.npmCommand(
      ['--version'],
      'linux',
      () => true,
    );
    expect(invocation.command).toBe('npm');
    expect(invocation.args).toEqual(['--script-shell=/bin/sh', '--version']);
    expect(invocation.env.npm_config_script_shell).toBe('/bin/sh');
    expect(() =>
      packageRuntime.npmCommand(['--version'], 'win32', () => false),
    ).toThrow('Cannot locate npm JavaScript entrypoint beside');
  });

  it('prevents inherited variables from selecting npm lifecycle shells', () => {
    const temporaryDirectory = mkdtempSync(
      join(tmpdir(), 'strelit-npm-shell-'),
    );
    writeFileSync(
      join(temporaryDirectory, 'package.json'),
      JSON.stringify({
        private: true,
        scripts: {
          check: 'node --version',
        },
      }),
    );

    try {
      for (const key of [
        'npm_config_script_shell',
        'NPM_CONFIG_SCRIPT_SHELL',
        'npm_config_script-shell',
      ]) {
        const invocation = packageRuntime.npmCommand(
          ['run', '--silent', 'check'],
          process.platform,
          undefined,
          process.execPath,
          { ...process.env, [key]: process.execPath },
        );
        expect(
          packageRuntime
            .run(
              invocation.command,
              invocation.args,
              temporaryDirectory,
              invocation.env,
            )
            .trim(),
        ).toBe(process.version);
      }

      const simulatedWindows = packageRuntime.npmCommand(
        ['run', 'check'],
        'win32',
        () => true,
        'D:\\portable-node\\node.exe',
        {
          PATH: 'preserved',
          ComSpec: 'C:\\attacker.exe',
          COMSPEC: 'C:\\alternate-attacker.exe',
          NPM_CONFIG_SCRIPT_SHELL: 'C:\\shell-attacker.exe',
          'npm_config_script-shell': 'C:\\alias-attacker.exe',
        },
      );
      expect(simulatedWindows.env).toEqual({
        PATH: 'preserved',
        ComSpec: '\\\\.\\GLOBALROOT\\SystemRoot\\System32\\cmd.exe',
        npm_config_script_shell:
          '\\\\.\\GLOBALROOT\\SystemRoot\\System32\\cmd.exe',
      });
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
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
