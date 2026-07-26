import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('contribution governance workflow', () => {
  it('grandfathers only the known pre-policy commit subjects', () => {
    const workflow = readFileSync(
      resolve('.github/workflows/contribution-governance.yml'),
      'utf8',
    );
    const grandfatheredCommits = [
      '6e934e6f1af4b8c0ace9c199cb5008b16a16f592',
      'f23a006a99634a5aa9920b935ce5e35a880d9b9e',
      '17a5c0821aefcef62e9aa703b9fcb52bfb9d8d5d',
      'ce374cc1b27507057c8122fd25050f9e629b0480',
    ];

    for (const commit of grandfatheredCommits) {
      expect(workflow).toContain(`'${commit}'`);
    }
    expect(workflow).toContain(
      'filter((commit) => !grandfatheredCommits.has(commit.sha))',
    );
    expect(workflow).toContain(
      'const commitPattern = /^(?:[A-Z][^.\\n]{4,100}\\.|(?:build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)',
    );
  });
});
