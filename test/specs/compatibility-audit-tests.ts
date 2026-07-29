import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const compatibilityAudit = require('../../scripts/audit-compatibility.js') as {
  validatePreservedApiTargets(
    entries: { disposition: string; target: string }[],
    currentApi: Map<string, unknown>,
  ): void;
};
const validatePreservedApiTargets = (
  entries: { disposition: string; target: string }[],
  currentApi: Map<string, unknown>,
) => compatibilityAudit.validatePreservedApiTargets(entries, currentApi);

describe('compatibility audit validation', () => {
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
