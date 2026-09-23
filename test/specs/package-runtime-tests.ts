// @vitest-environment node

import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageRuntimeModule {
  npmCommand(
    args: string[],
    platform?: string,
    fileExists?: (fileName: string) => boolean,
  ): { command: string; args: string[] };
  run(command: string, args: string[]): string;
  parsePackOutput(output: string): Array<{ filename: string }>;
}

const require = createRequire(import.meta.url);
const packageRuntime =
  require('../../scripts/verify-package-runtime.js') as PackageRuntimeModule;

describe('package runtime verification', () => {
  it('uses bundled npm and passes Windows destinations without a command interpreter', () => {
    const bundledNpm = join(
      dirname(process.execPath),
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    );
    const poisonedNpmExecPath = process.env.npm_execpath;
    process.env.npm_execpath = resolve('.tmp/attacker-controlled.js');

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
    }
  });

  it('preserves POSIX npm invocation and diagnoses a missing Windows entrypoint', () => {
    expect(packageRuntime.npmCommand(['--version'], 'linux')).toEqual({
      command: 'npm',
      args: ['--version'],
    });
    expect(() =>
      packageRuntime.npmCommand(['--version'], 'win32', () => false),
    ).toThrow('Cannot locate npm JavaScript entrypoint');
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
