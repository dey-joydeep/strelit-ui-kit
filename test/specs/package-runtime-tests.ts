import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageRuntimeModule {
  npmCommand(
    args: string[],
    platform?: string,
    npmExecPath?: string,
  ): { command: string; args: string[] };
  run(command: string, args: string[]): string;
  parsePackOutput(output: string): Array<{ filename: string }>;
}

const require = createRequire(import.meta.url);
const packageRuntime =
  require('../../scripts/verify-package-runtime.js') as PackageRuntimeModule;

describe('package runtime verification', () => {
  it('passes Windows pack destinations literally without a command interpreter', () => {
    for (const destination of [
      'E:/temp/a&ver&rem',
      'E:/temp/with spaces',
      'E:/temp/%PATH%',
    ]) {
      const args = ['pack', '--pack-destination', destination];
      const cli = resolve('node_modules/vitest/vitest.mjs');
      const invocation = packageRuntime.npmCommand(args, 'win32', cli);
      expect(invocation).toEqual({
        command: process.execPath,
        args: [cli, ...args],
      });
      expect(
        packageRuntime.run(invocation.command, [
          '-e',
          'process.stdout.write(process.argv[1])',
          destination,
        ]),
      ).toBe(destination);
    }
  });

  it('preserves POSIX npm invocation and diagnoses a missing Windows entrypoint', () => {
    expect(packageRuntime.npmCommand(['--version'], 'linux')).toEqual({
      command: 'npm',
      args: ['--version'],
    });
    expect(() =>
      packageRuntime.npmCommand(
        ['--version'],
        'win32',
        resolve('.tmp/nonexistent-npm-cli.js'),
      ),
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
