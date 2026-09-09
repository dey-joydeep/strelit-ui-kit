import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const compatibilityAudit = require('../../scripts/audit-compatibility.js') as {
  parseArguments(args: string[]): {
    check: boolean;
    validate: boolean;
    write: boolean;
  };
  validateExactInventory(
    label: string,
    actualEntries: Record<string, unknown>[],
    expectedEntries: Record<string, unknown>[],
    identity?: (entry: Record<string, unknown>) => string,
  ): void;
  validateInventoryDigest(
    label: string,
    entries: Record<string, unknown>[],
    expectedDigest: string,
    identity?: (entry: Record<string, unknown>) => string,
  ): void;
  validatePreservedApiTargets(
    entries: { disposition: string; target: string }[],
    currentApi: Map<string, unknown>,
  ): void;
};
const validateExactInventory = (
  label: string,
  actualEntries: Record<string, unknown>[],
  expectedEntries: Record<string, unknown>[],
  identity?: (entry: Record<string, unknown>) => string,
) =>
  compatibilityAudit.validateExactInventory(
    label,
    actualEntries,
    expectedEntries,
    identity,
  );
const validatePreservedApiTargets = (
  entries: { disposition: string; target: string }[],
  currentApi: Map<string, unknown>,
) => compatibilityAudit.validatePreservedApiTargets(entries, currentApi);

describe('compatibility audit validation', () => {
  it('requires exactly one supported audit mode', () => {
    expect(compatibilityAudit.parseArguments(['--validate'])).toEqual({
      check: false,
      validate: true,
      write: false,
    });
    for (const args of [
      [],
      ['--unknown'],
      ['--validate', '--unknown'],
      ['--validate', '--write'],
    ]) {
      expect(() => compatibilityAudit.parseArguments(args)).toThrow(
        'requires exactly one mode',
      );
    }
  });

  it('rejects replacement entries that only preserve the inventory count', () => {
    expect(() =>
      validateExactInventory(
        'v2 API',
        [{ symbol: 'retained' }, { symbol: 'replacement' }],
        [{ symbol: 'retained' }, { symbol: 'baseline' }],
      ),
    ).toThrow('missing baseline; unexpected replacement');
  });

  it('compares test inventories by source and title', () => {
    const identity = (entry: Record<string, unknown>) =>
      `${String(entry.source)}\0${String(entry.title)}`;
    expect(() =>
      compatibilityAudit.validateExactInventory(
        'v2 test',
        [{ source: 'test/a.ts', title: 'replacement' }],
        [{ source: 'test/a.ts', title: 'baseline' }],
        identity,
      ),
    ).toThrow('test/a.ts');
  });

  it('rejects a changed inventory with the same entry count', () => {
    expect(() =>
      compatibilityAudit.validateInventoryDigest(
        'v2 API',
        [{ symbol: 'retained' }, { symbol: 'replacement' }],
        '49f581b214f1affd1140a45f54cf057fba75905ed69722a75f6942fbf84c9d0e',
      ),
    ).toThrow('canonical baseline digest');
  });

  it('rejects preserved targets missing from the current API report', () => {
    const entries = [
      {
        disposition: 'preserved-or-renamed',
        target: 'RemovedCurrentSymbol',
      },
    ];

    expect(() => validatePreservedApiTargets(entries, new Map())).toThrow(
      'RemovedCurrentSymbol',
    );
  });

  it('accepts preserved targets present in the current API report', () => {
    const entries = [
      {
        disposition: 'preserved-or-renamed',
        target: 'CurrentSymbol',
      },
    ];

    expect(() =>
      validatePreservedApiTargets(entries, new Map([['CurrentSymbol', {}]])),
    ).not.toThrow();
  });
});
