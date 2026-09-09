import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface PackageRuntimeModule {
  parsePackOutput(output: string): Array<{ filename: string }>;
}

const require = createRequire(import.meta.url);
const packageRuntime =
  require('../../scripts/verify-package-runtime.js') as PackageRuntimeModule;

describe('package runtime verification', () => {
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
    expect(() =>
      packageRuntime.parsePackOutput(
        '[{"filename":"first.tgz"},{"filename":"second.tgz"}]',
      ),
    ).toThrow('npm pack did not produce a valid JSON package result.');
  });
});
