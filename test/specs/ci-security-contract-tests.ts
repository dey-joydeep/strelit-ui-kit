import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

describe('CI security contracts', () => {
  it('limits both verification jobs to a read-only contents token', () => {
    const workflow = readFileSync(resolve('.github/workflows/CI.yml'), 'utf8');
    const parsed = parse(workflow) as {
      permissions?: unknown;
      jobs: Record<string, { permissions?: unknown }>;
    };
    expect(parsed.permissions).toEqual({ contents: 'read' });
    expect(Object.keys(parsed.jobs).sort()).toEqual([
      'browser-smoke',
      'verify',
    ]);
    for (const job of Object.values(parsed.jobs)) {
      // Quoted keys and flow mappings must obey the same token contract.
      expect(job.permissions ?? parsed.permissions).toEqual({
        contents: 'read',
      });
    }
  });

  it('runs every CI verification path on the supported Node 24 baseline', () => {
    const workflow = parse(
      readFileSync(resolve('.github/workflows/CI.yml'), 'utf8'),
    ) as {
      jobs: Record<
        string,
        {
          steps: Array<{
            uses?: string;
            with?: { 'node-version'?: number | string };
          }>;
          strategy?: { matrix?: { node_version?: number[] } };
        }
      >;
    };
    const packageJson = JSON.parse(
      readFileSync(resolve('package.json'), 'utf8'),
    ) as { engines: { node: string } };

    expect(packageJson.engines.node).toBe('^24.0.0');
    expect(workflow.jobs.verify.strategy?.matrix?.node_version).toEqual([24]);
    const nodeVersionFor = (jobName: string) =>
      workflow.jobs[jobName].steps.find(
        (step) => step.uses === 'actions/setup-node@v4',
      )?.with?.['node-version'];
    expect(nodeVersionFor('verify')).toBe('${{ matrix.node_version }}');
    expect(nodeVersionFor('browser-smoke')).toBe(24);
  });
});
