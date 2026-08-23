import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface ChangeDisciplineModule {
  classifyChangeRisk(fileNames: string[]): 'low' | 'medium' | 'high';
  classifyFileRisk(fileName: string): 'low' | 'medium' | 'high';
  collectChangedFiles(baseRef: string, cwd?: string): string[];
  domainsForPath(fileName: string): string[];
  executedCommandNames(scripts: string[]): string[];
  resolveBaseRef(explicitBase?: string, cwd?: string): string;
  resolveVerificationRisk(
    fileNames: string[],
    forcedRisk?: string,
  ): 'low' | 'medium' | 'high';
  requiresLocalReviewGate(
    risk: 'low' | 'medium' | 'high',
    environment?: Record<string, string | undefined>,
  ): boolean;
  verificationScriptsForRisk(risk: 'low' | 'medium' | 'high'): string[];
}

const require = createRequire(import.meta.url);
const MarkdownIt = require('markdown-it') as new (options?: {
  html?: boolean;
}) => { render(markdown: string): string };
const markdown = new MarkdownIt({ html: true });
const changeDiscipline =
  require('../../scripts/verify-pr.js') as ChangeDisciplineModule;

interface PullRequestFile {
  readonly changes: number;
  readonly filename: string;
  readonly previous_filename?: string;
  readonly status?: string;
}

interface PullRequestReview {
  readonly commit_id: string;
  readonly state: string;
  readonly user: { readonly login: string };
}

const pullRequestHead = '0123456789abcdef0123456789abcdef01234567';

function createPullRequestBody(
  risk: 'Low' | 'Medium' | 'High',
  review: string,
): string {
  const evidence = 'Concrete evidence recorded for this required section.';
  return [
    '## Summary',
    evidence,
    '## What Changed',
    evidence,
    '## Why',
    evidence,
    '## Behavioral Contract',
    evidence,
    '## Risk Classification',
    `Risk: **${risk}**`,
    'Risk is based on the changed-file classification.',
    '## Failure and Boundary Cases',
    evidence,
    '## Test Evidence',
    evidence,
    '## Test Exception',
    'Regression tests were added for executable behavior.',
    '## Review-Finding Expansion',
    evidence,
    '## Out of Scope',
    evidence,
    '## Scope Justification',
    'The change is below the non-generated line threshold.',
    '## Independent Quality Review',
    [
      review,
      ...(risk === 'High'
        ? [
            'Coverage gaps: 0',
            'Synthesis reviewer: Not applicable',
            'Closed Critical/High findings: 0',
            'Open Medium findings: 0',
            'Closed Medium findings: 0',
            'Accepted Medium findings: 0',
            'Medium acceptance evidence: Not applicable',
          ]
        : []),
    ].join('\n'),
    '## Review Coverage Manifest',
    risk === 'High'
      ? [
          'Path: src/ts/layout-manager.ts | Contract: layout behavior | Domains: Runtime behavior, lifecycle, and ownership; Public API, compatibility, and packaging | Assignments: Runtime behavior, lifecycle, and ownership => @reviewer-user; Public API, compatibility, and packaging => @reviewer-user | Adjacent: initialization and teardown | Tests: lifecycle tests',
          'Path: test/specs/layout-lifecycle-tests.ts | Contract: lifecycle regression evidence | Domains: Tests and documentation | Assignments: Tests and documentation => @reviewer-user | Adjacent: layout lifecycle tests | Tests: self-validating governance fixture',
        ].join('\n')
      : 'Coverage manifest is not required for this non-high-risk change.',
    '## Domain Discovery Reports',
    'Domain discovery reports are not required for this non-large review.',
    '## Verification',
    '- [x] `npm run verify:pr`',
    'The command completed successfully.',
  ].join('\n\n');
}

async function runPullRequestMetadataPolicy(
  body: string,
  files: readonly PullRequestFile[],
  reviews: readonly PullRequestReview[] = [],
  riskPolicyMissingAtBase = false,
  comments: readonly {
    readonly body: string;
    readonly html_url: string;
    readonly user: { readonly login: string };
  }[] = [],
): Promise<string[]> {
  const workflow = readFileSync(
    resolve('.github/workflows/contribution-governance.yml'),
    'utf8',
  );
  const scriptMarker = '          script: |\n';
  const scriptStart = workflow.indexOf(scriptMarker);
  const scriptEnd = workflow.indexOf('\n\n  commit-messages:', scriptStart);
  expect(scriptStart).toBeGreaterThanOrEqual(0);
  expect(scriptEnd).toBeGreaterThan(scriptStart);

  const script = workflow
    .slice(scriptStart + scriptMarker.length, scriptEnd)
    .split('\n')
    .map((line) => (line.startsWith('            ') ? line.slice(12) : line))
    .join('\n');
  const failures: string[] = [];
  const context = {
    payload: {
      pull_request: {
        body,
        base: { sha: 'base-sha' },
        head: { sha: pullRequestHead },
        number: 1,
        title: 'Validate independent review evidence',
        user: { login: 'implementer-user' },
      },
    },
    repo: { owner: 'CTHub', repo: 'strelit-ui-kit' },
  };
  const listFiles = () => undefined;
  const listReviews = () => undefined;
  const listComments = () => undefined;
  const riskPolicy = readFileSync(resolve('.github/change-risk.json'), 'utf8');
  const renderGitHubMarkdown = (markdownBody: string) =>
    markdown.render(
      markdownBody
        .replace(
          /^(\s*-\s+)\[[xX]\]\s+/gm,
          '$1<input type="checkbox" checked=""> ',
        )
        .replace(/^(\s*-\s+)\[ \]\s+/gm, '$1<input type="checkbox"> '),
    );
  const github = {
    paginate: async (method: () => undefined) =>
      method === listFiles
        ? files
        : method === listReviews
          ? reviews
          : comments,
    rest: {
      markdown: {
        render: async ({ text: markdownBody }: { text: string }) => ({
          data: renderGitHubMarkdown(markdownBody),
        }),
      },
      pulls: { listFiles, listReviews },
      issues: { listComments },
      repos: {
        getContent: async () => {
          if (riskPolicyMissingAtBase) {
            throw Object.assign(new Error('Not Found'), { status: 404 });
          }
          return {
            data: { content: Buffer.from(riskPolicy).toString('base64') },
          };
        },
      },
    },
  };
  const core = {
    setFailed: (message: string) => failures.push(message),
  };

  const execution = runInNewContext(`(async () => {${script}})()`, {
    Buffer,
    context,
    core,
    github,
  }) as Promise<void>;
  await execution;
  return failures.flatMap((failure) => failure.split('\n'));
}

function createLargeHighRiskBody(manifest: string, reports: string): string {
  const review = [
    'Review mode: **Independent**',
    'Reviewer: @synthesis-user',
    'Synthesis reviewer: @synthesis-user',
    'Review scope: **Whole PR**',
    'Review pass: **Fresh discovery**',
    `Reviewed boundary: ${pullRequestHead}`,
    'Coverage gaps: 0',
    'Rubric result: **Pass**',
    'Dimensions below 2: **0**',
    'Verdict: **Pass**',
    'Findings: Critical 0; High 0; Medium 0; Low 0',
    'Open Critical/High findings: **0**',
    'Closed Critical/High findings: **0**',
    'Open Medium findings: 0',
    'Closed Medium findings: 0',
    'Accepted Medium findings: 0',
    'Review artifact: Synthesis review',
    'Finding dispositions: No findings',
    'Residual risks: No known residual risks',
  ].join('\n');

  return createPullRequestBody('High', review)
    .replace(
      'Regression tests were added for executable behavior.',
      'The governance policy harness exercises this generated runtime fixture.',
    )
    .replace(
      /## Review Coverage Manifest[\s\S]*?## Verification/,
      `## Review Coverage Manifest\n\n${manifest}\n\n## Domain Discovery Reports\n\n${reports}\n\n## Verification`,
    );
}

const runtimeDomain = 'Runtime behavior, lifecycle, and ownership';
const publicApiDomain = 'Public API, compatibility, and packaging';

function createCoverage(
  paths: readonly string[],
  domains: readonly string[] = [runtimeDomain, publicApiDomain],
): string {
  return paths
    .flatMap((path) => domains.map((domain) => `${path} => ${domain}`))
    .join('; ');
}

function createLargeHighRiskFixture(): {
  body: string;
  files: PullRequestFile[];
  manifest: string;
  reports: string[];
} {
  const files = Array.from({ length: 51 }, (_, index) => ({
    filename: `src/ts/path-${index}.ts`,
    changes: 1,
  }));
  const firstPaths = files.slice(0, 26).map((file) => file.filename);
  const secondPaths = files.slice(26).map((file) => file.filename);
  const manifest = files
    .map((file, index) => {
      const reviewer = index < 26 ? '@domain-one' : '@domain-two';
      return `Path: ${file.filename} | Contract: runtime contract ${index} | Domains: Runtime behavior, lifecycle, and ownership; Public API, compatibility, and packaging | Assignments: Runtime behavior, lifecycle, and ownership => ${reviewer}; Public API, compatibility, and packaging => ${reviewer} | Adjacent: caller and cleanup paths | Tests: runtime regression suite`;
    })
    .join('\n');
  const reports = [
    `Reviewer: @domain-one | Base: base-sha | Head: ${pullRequestHead} | Paths: ${firstPaths.join('; ')} | Domains: ${runtimeDomain}; ${publicApiDomain} | Coverage: ${createCoverage(firstPaths)} | Adjacent: callers and cleanup | Commands: source inspection | Findings: No findings discovered | Uninspected: All assigned paths inspected`,
    `Reviewer: @domain-two | Base: base-sha | Head: ${pullRequestHead} | Paths: ${secondPaths.join('; ')} | Domains: ${runtimeDomain}; ${publicApiDomain} | Coverage: ${createCoverage(secondPaths)} | Adjacent: callers and cleanup | Commands: source inspection | Findings: No findings discovered | Uninspected: All assigned paths inspected`,
  ];

  return {
    body: createLargeHighRiskBody(manifest, reports.join('\n')),
    files,
    manifest,
    reports,
  };
}

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
      '5ec1bc7259e6700197bd2d877df1fa9ba139b94e',
      '44c1b34246cd8db9c3e0bacafda27b6ae26b49da',
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

  it('requires substantive contract, risk, test, and scope evidence', () => {
    const workflow = readFileSync(
      resolve('.github/workflows/contribution-governance.yml'),
      'utf8',
    );
    const template = readFileSync(
      resolve('.github/pull_request_template.md'),
      'utf8',
    );
    const sections = [
      '## Behavioral Contract',
      '## Risk Classification',
      '## Failure and Boundary Cases',
      '## Test Evidence',
      '## Test Exception',
      '## Review-Finding Expansion',
      '## Out of Scope',
      '## Scope Justification',
      '## Independent Quality Review',
    ];

    for (const section of sections) {
      expect(workflow).toContain(`'${section}'`);
      expect(template).toContain(section);
    }

    expect(workflow).toContain('must contain substantive evidence');
    expect(workflow).toContain('Executable behavior changed without tests');
    expect(workflow).toContain('non-generated changed lines');
    expect(workflow).toContain(
      'Verification must confirm a successful npm run verify:pr',
    );
    expect(template).toContain('<!-- Describe the user-facing');
  });

  it('requires independent review evidence for high-risk changes', () => {
    const workflow = readFileSync(
      resolve('.github/workflows/contribution-governance.yml'),
      'utf8',
    );
    const template = readFileSync(
      resolve('.github/pull_request_template.md'),
      'utf8',
    );
    const agents = readFileSync(resolve('AGENTS.md'), 'utf8');
    const skill = readFileSync(
      resolve('.agents/skills/strelit-change-discipline/SKILL.md'),
      'utf8',
    );
    const rubric = readFileSync(
      resolve('docs/contributing/ai-change-quality-rubric.md'),
      'utf8',
    );

    expect(workflow).toContain(
      "if (computedRisk === 'high' && reviewMode !== 'independent')",
    );
    expect(workflow).toContain(
      'High-risk changes require Review mode: **Independent**.',
    );
    expect(workflow).toContain(
      'High-risk changes cannot have open Critical or High review findings.',
    );
    expect(workflow).toContain('Reviewed boundary');
    expect(workflow).toContain('Review scope: **Whole PR**');
    expect(workflow).toContain('Review pass: **Fresh discovery**');
    expect(workflow).toContain('Finding dispositions');
    expect(template).toContain('Review mode: **Pending**');
    expect(template).toContain('Review scope: **Pending**');
    expect(template).toContain('Review pass: **Pending**');
    expect(template).toContain('Rubric result: **Pending**');
    expect(template).toContain('Open Critical/High findings: **Pending**');
    expect(agents).toContain('A same-context role change does not qualify');
    expect(agents).toMatch(/leave the\s+high-risk change incomplete/);
    expect(skill).toContain('Independent Quality Review');
    expect(skill).toContain('reviewer the intended conclusion');
    expect(rubric).toContain('## Hard Gates');
    expect(rubric).toContain('## Measuring Quality Over Time');
    expect(rubric).toContain('score below 2');
    expect(rubric).toContain('fresh discovery pass');
  });

  it('rejects pending review evidence and requires self-review for every change', () => {
    const workflow = readFileSync(
      resolve('.github/workflows/contribution-governance.yml'),
      'utf8',
    );

    expect(workflow).toContain('Pending is not complete');
    expect(workflow).toContain(
      'Every change requires a completed self-review or independent review.',
    );
    expect(workflow).toContain(
      'A completed quality review requires Rubric result: **Pass**.',
    );
  });

  it('keeps contributor documentation aligned with the quality gate', () => {
    const workflowGuide = readFileSync(
      resolve('docs/contributing/workflow.md'),
      'utf8',
    );
    const docsIndex = readFileSync(resolve('docs/index.md'), 'utf8');

    expect(workflowGuide).toContain(
      '[AI change quality rubric](./ai-change-quality-rubric.md)',
    );
    expect(workflowGuide).toContain('npm run verify:pr');
    expect(workflowGuide).toContain('high-risk work remains');
    expect(docsIndex).toContain('./contributing/ai-change-quality-rubric.md');
  });

  it('binds compatibility decisions to an explicit product-evolution phase', () => {
    const agents = readFileSync(resolve('AGENTS.md'), 'utf8');
    const skill = readFileSync(
      resolve('.agents/skills/strelit-change-discipline/SKILL.md'),
      'utf8',
    );
    const rubric = readFileSync(
      resolve('docs/contributing/ai-change-quality-rubric.md'),
      'utf8',
    );
    const workflowGuide = readFileSync(
      resolve('docs/contributing/workflow.md'),
      'utf8',
    );
    const compatibilityGuide = readFileSync(
      resolve('docs/architecture/compatibility-audit-maintenance.md'),
      'utf8',
    );
    const evolutionPolicy = readFileSync(
      resolve('docs/architecture/product-evolution-policy.md'),
      'utf8',
    );
    const template = readFileSync(
      resolve('.github/pull_request_template.md'),
      'utf8',
    );
    const orderedVerification = readFileSync(
      resolve('scripts/verify-ordered.js'),
      'utf8',
    );

    expect(evolutionPolicy).toContain('**Phase:** Bridge');
    expect(evolutionPolicy).toContain('**Review trigger:** 2027-08-01');
    expect(evolutionPolicy).toContain('**Automatic transition:** Forbidden');
    expect(evolutionPolicy).toContain(
      'migration and regression evidence, not a permanent',
    );
    expect(evolutionPolicy).toContain('## Phase Transition Record');
    for (const precedenceRule of [
      "current task's explicitly approved product decision",
      'documented, currently supported Strelit contract',
      'active phase in this policy',
      'Golden Layout baselines and historical behavior',
    ]) {
      expect(evolutionPolicy).toContain(precedenceRule);
    }
    for (const transitionRequirement of [
      'new phase and effective release',
      'Supported and unsupported public contracts',
      'Saved-config and persistence support windows',
      'Migration-tool ownership and support status',
      'Compatibility-audit mode and verification-pipeline changes',
      'Independent-review evidence for the complete transition diff',
    ]) {
      expect(evolutionPolicy).toContain(transitionRequirement);
    }
    for (const bridgeObligation of [
      'Preserve documented Strelit behavior by default',
      'Keep Golden Layout migration tooling conservative and deterministic',
      'Keep `audit:compatibility` in high-risk verification',
      'Review this phase at the trigger date without presuming renewal or redesign',
    ]) {
      expect(evolutionPolicy).toContain(bridgeObligation);
    }
    expect(evolutionPolicy).toContain(
      'the phase changes only when the policy update and its required evidence are',
    );
    expect(orderedVerification).toContain("'audit:compatibility'");
    expect(agents).toContain(
      'product-evolution-policy.md` unless the task intentionally',
    );
    expect(agents).toContain('not a permanent design constraint');
    expect(skill).toContain('identify the active\n   compatibility phase');
    expect(skill).toContain('not permanent architecture requirements');
    expect(rubric).toContain(
      'Golden Layout parity alone is not a pass criterion',
    );
    expect(workflowGuide).toContain(
      '../architecture/product-evolution-policy.md',
    );
    expect(compatibilityGuide).toContain(
      'disposition ledger, not a permanent parity requirement',
    );
    expect(template).toContain('Active product-evolution phase reviewed');
    expect(
      changeDiscipline.classifyFileRisk(
        'docs/architecture/compatibility-audit-maintenance.md',
      ),
    ).toBe('high');
  });

  it('requires unique, ordered Markdown section headings', async () => {
    const review = [
      'Review mode: **Self-review**',
      'Reviewer: Implementer Agent',
      `Reviewed boundary: ${pullRequestHead}`,
      'Rubric: `docs/contributing/ai-change-quality-rubric.md`',
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: **0**',
      'Review artifact: Local review record',
      'Finding dispositions: No findings recorded',
      'Residual risks: No known residual risks',
    ].join('\n');
    const validBody = createPullRequestBody('Low', review);
    const files = [{ filename: 'README.md', changes: 10 }];

    const inlineHeading = validBody.replace(
      '\n\n## What Changed\n\n',
      '\n\nInline ## What Changed\n\n',
    );
    expect(await runPullRequestMetadataPolicy(inlineHeading, files)).toContain(
      'PR body must include section: ## What Changed',
    );

    const commentedHeading = validBody.replace(
      '\n\n## What Changed\n\nConcrete evidence recorded for this required section.',
      '\n\n<!--\n## What Changed\nConcrete evidence recorded for this required section.\n-->',
    );
    expect(
      await runPullRequestMetadataPolicy(commentedHeading, files),
    ).toContain('PR body must include section: ## What Changed');

    const unclosedComment = validBody.replace(
      '\n\n## What Changed\n\n',
      '\n\n<!-- unclosed comment\n## What Changed\n\n',
    );
    expect(
      await runPullRequestMetadataPolicy(unclosedComment, files),
    ).toContain('PR body must include section: ## What Changed');

    const fencedHeading = validBody.replace(
      '\n\n## What Changed\n\nConcrete evidence recorded for this required section.',
      '\n\n```markdown\n## What Changed\nConcrete evidence recorded for this required section.\n```',
    );
    expect(await runPullRequestMetadataPolicy(fencedHeading, files)).toContain(
      'PR body must include section: ## What Changed',
    );

    for (const tag of ['pre', 'script', 'div']) {
      const htmlBlockHeading = validBody.replace(
        '\n\n## What Changed\n\nConcrete evidence recorded for this required section.',
        `\n\n<${tag}>\n## What Changed\nConcrete evidence recorded for this required section.\n</${tag}>`,
      );
      expect(
        await runPullRequestMetadataPolicy(htmlBlockHeading, files),
      ).toContain('PR body must include section: ## What Changed');
    }

    for (const incompleteTag of ['<div', '</div']) {
      const htmlBlockHeading = validBody.replace(
        '\n\n## What Changed\n\nConcrete evidence recorded for this required section.',
        `\n\n${incompleteTag}\n## What Changed\nConcrete evidence recorded for this required section.`,
      );
      expect(
        await runPullRequestMetadataPolicy(htmlBlockHeading, files),
      ).toContain('PR body must include section: ## What Changed');
    }

    const commentInsideFence = validBody.replace(
      'Concrete evidence recorded for this required section.\n\n## What Changed',
      '```text\n<!-- literal unclosed comment\n```\n\nConcrete evidence recorded for this required section.\n\n## What Changed',
    );
    expect(
      await runPullRequestMetadataPolicy(commentInsideFence, files),
    ).toEqual([]);

    const invalidBacktickFence = validBody.replace(
      'Concrete evidence recorded for this required section.\n\n## What Changed',
      '```bad`info\n\nConcrete evidence recorded for this required section.\n\n## What Changed',
    );
    expect(
      await runPullRequestMetadataPolicy(invalidBacktickFence, files),
    ).toEqual([]);

    const duplicateHeading = `${validBody}\n\n## Summary\n\nDuplicate summary evidence.`;
    expect(
      await runPullRequestMetadataPolicy(duplicateHeading, files),
    ).toContain('PR body must include section exactly once: ## Summary');

    const whatChanged =
      '## What Changed\n\nConcrete evidence recorded for this required section.';
    const why =
      '## Why\n\nConcrete evidence recorded for this required section.';
    const outOfOrder = validBody
      .replace(whatChanged, '__WHAT_CHANGED__')
      .replace(why, whatChanged)
      .replace('__WHAT_CHANGED__', why);
    expect(await runPullRequestMetadataPolicy(outOfOrder, files)).toContain(
      'PR body sections are out of order at: ## Why',
    );
  });

  it('associates verification evidence with its checked task item', async () => {
    const review = [
      'Review mode: **Self-review**',
      'Reviewer: Implementer Agent',
      `Reviewed boundary: ${pullRequestHead}`,
      'Rubric: `docs/contributing/ai-change-quality-rubric.md`',
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: **0**',
      'Review artifact: Local review record',
      'Finding dispositions: No findings recorded',
      'Residual risks: No known residual risks',
    ].join('\n');
    const body = createPullRequestBody('Low', review).replace(
      '- [x] `npm run verify:pr`',
      '- [x] Documentation reviewed\n- [ ] `npm run verify:pr`',
    );

    expect(
      await runPullRequestMetadataPolicy(body, [
        { filename: 'README.md', changes: 10 },
      ]),
    ).toContain(
      'Verification must confirm a successful npm run verify:pr with a checked box.',
    );

    const nestedBody = createPullRequestBody('Low', review).replace(
      '- [x] `npm run verify:pr`',
      '- [x] Documentation reviewed\n  - [ ] `npm run verify:pr`',
    );
    expect(
      await runPullRequestMetadataPolicy(nestedBody, [
        { filename: 'README.md', changes: 10 },
      ]),
    ).toContain(
      'Verification must confirm a successful npm run verify:pr with a checked box.',
    );

    const paragraphBody = createPullRequestBody('Low', review).replace(
      '- [x] `npm run verify:pr`',
      '- [x] Documentation reviewed\n\nThe command `npm run verify:pr` was not run.',
    );
    expect(
      await runPullRequestMetadataPolicy(paragraphBody, [
        { filename: 'README.md', changes: 10 },
      ]),
    ).toContain(
      'Verification must confirm a successful npm run verify:pr with a checked box.',
    );
  });

  it('fails closed when the trusted base does not yet contain the risk policy', async () => {
    const review = [
      'Review mode: **Self-review**',
      'Reviewer: Implementer Agent',
      `Reviewed boundary: ${pullRequestHead}`,
      'Rubric: `docs/contributing/ai-change-quality-rubric.md`',
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: **0**',
      'Review artifact: Local review record',
      'Finding dispositions: No findings recorded',
      'Residual risks: No known residual risks',
    ].join('\n');

    const failures = await runPullRequestMetadataPolicy(
      createPullRequestBody('Low', review),
      [{ filename: 'README.md', changes: 10 }],
      [],
      true,
    );

    expect(failures).toContain(
      'High-risk changes require Review mode: **Independent**.',
    );
  });

  it('behaviorally blocks high-risk self-review and accepts independent evidence', async () => {
    const files = [{ filename: 'src/ts/layout-manager.ts', changes: 40 }];
    const bodyFor = (review: string) =>
      createPullRequestBody('High', review)
        .replace(
          '\nPath: test/specs/layout-lifecycle-tests.ts | Contract: lifecycle regression evidence | Domains: Tests and documentation | Assignments: Tests and documentation => @reviewer-user | Adjacent: layout lifecycle tests | Tests: self-validating governance fixture',
          '',
        )
        .replace(
          'Regression tests were added for executable behavior.',
          'The existing lifecycle suite covers this policy-only fixture.',
        );
    const selfReview = [
      'Review mode: **Self-review**',
      'Reviewer: Implementer',
      'Review scope: **Whole PR**',
      'Review pass: **Fresh discovery**',
      `Reviewed boundary: ${pullRequestHead}`,
      'Rubric: `docs/contributing/ai-change-quality-rubric.md`',
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: **0**',
      'Review artifact: Local self-review notes',
      'Finding dispositions: No findings recorded',
      'Residual risks: No known residual risks',
    ].join('\n');
    const rejected = await runPullRequestMetadataPolicy(
      bodyFor(selfReview),
      files,
    );

    expect(rejected).toContain(
      'High-risk changes require Review mode: **Independent**.',
    );

    const independentReview = selfReview
      .replace('**Self-review**', '**Independent**')
      .replace('Reviewer: Implementer', 'Reviewer: @reviewer-user')
      .replace('Local self-review notes', 'GitHub review by reviewer-user');
    const fabricated = await runPullRequestMetadataPolicy(
      bodyFor(independentReview),
      files,
    );

    expect(fabricated).toContain(
      'High-risk changes require approval on the current head from the declared reviewer, using a GitHub identity different from the PR author.',
    );

    const staleApproval = await runPullRequestMetadataPolicy(
      bodyFor(independentReview),
      files,
      [
        {
          commit_id: 'previous-head',
          state: 'APPROVED',
          user: { login: 'reviewer-user' },
        },
      ],
    );
    expect(staleApproval).toContain(
      'High-risk changes require approval on the current head from the declared reviewer, using a GitHub identity different from the PR author.',
    );

    const supersededApproval = await runPullRequestMetadataPolicy(
      bodyFor(independentReview),
      files,
      [
        {
          commit_id: pullRequestHead,
          state: 'APPROVED',
          user: { login: 'reviewer-user' },
        },
        {
          commit_id: pullRequestHead,
          state: 'CHANGES_REQUESTED',
          user: { login: 'reviewer-user' },
        },
      ],
    );
    expect(supersededApproval).toContain(
      'High-risk changes require approval on the current head from the declared reviewer, using a GitHub identity different from the PR author.',
    );

    const accepted = await runPullRequestMetadataPolicy(
      bodyFor(independentReview),
      files,
      [
        {
          commit_id: pullRequestHead,
          state: 'APPROVED',
          user: { login: 'reviewer-user' },
        },
      ],
    );

    expect(accepted).toEqual([]);
  });

  it('rejects incomplete per-path domain declarations', async () => {
    const review = [
      'Review mode: **Independent**',
      'Reviewer: @reviewer-user',
      'Review scope: **Whole PR**',
      'Review pass: **Fresh discovery**',
      `Reviewed boundary: ${pullRequestHead}`,
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: **0**',
      'Review artifact: Whole PR review',
      'Finding dispositions: No findings',
      'Residual risks: No known residual risks',
    ].join('\n');
    const body = createPullRequestBody('High', review).replace(
      /## Review Coverage Manifest[\s\S]*?## Domain Discovery Reports/,
      '## Review Coverage Manifest\n\nPath: package.json | Contract: package contract | Domains: Public API, compatibility, and packaging | Assignments: Public API, compatibility, and packaging => @reviewer-user | Adjacent: distribution metadata | Tests: package verification\n\n## Domain Discovery Reports',
    );

    const failures = await runPullRequestMetadataPolicy(
      body,
      [{ filename: 'package.json', changes: 1 }],
      [
        {
          commit_id: pullRequestHead,
          state: 'APPROVED',
          user: { login: 'reviewer-user' },
        },
      ],
    );

    expect(failures).toContain(
      'Coverage manifest path package.json must declare exactly these domains: Public API, compatibility, and packaging; Tooling, CI, and verification',
    );
  });

  it('rejects coverage assigned to the PR author', async () => {
    const review = [
      'Review mode: **Independent**',
      'Reviewer: @reviewer-user',
      'Review scope: **Whole PR**',
      'Review pass: **Fresh discovery**',
      `Reviewed boundary: ${pullRequestHead}`,
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: **0**',
      'Review artifact: Whole PR review',
      'Finding dispositions: No findings',
      'Residual risks: No known residual risks',
    ].join('\n');
    const body = createPullRequestBody('High', review).replace(
      'Runtime behavior, lifecycle, and ownership => @reviewer-user;',
      'Runtime behavior, lifecycle, and ownership => @implementer-user;',
    );

    const failures = await runPullRequestMetadataPolicy(
      body,
      [
        { filename: 'src/ts/layout-manager.ts', changes: 1 },
        { filename: 'test/specs/layout-lifecycle-tests.ts', changes: 1 },
      ],
      [
        {
          commit_id: pullRequestHead,
          state: 'APPROVED',
          user: { login: 'reviewer-user' },
        },
      ],
    );

    expect(failures).toContain(
      'Coverage manifest path src/ts/layout-manager.ts assigns review to the PR author.',
    );
  });

  it('rejects patch-only or finding-closure evidence for high-risk work', async () => {
    const files = [{ filename: 'src/ts/layout-manager.ts', changes: 12 }];
    const review = [
      'Review mode: **Independent**',
      'Reviewer: @reviewer-user',
      'Review scope: **Patch**',
      'Review pass: **Finding closure**',
      `Reviewed boundary: ${pullRequestHead}`,
      'Rubric: `docs/contributing/ai-change-quality-rubric.md`',
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: **0**',
      'Review artifact: Latest-fix review only',
      'Finding dispositions: Known findings closed',
      'Residual risks: Whole-PR discovery not performed',
    ].join('\n');

    const failures = await runPullRequestMetadataPolicy(
      createPullRequestBody('High', review),
      files,
      [
        {
          commit_id: pullRequestHead,
          state: 'APPROVED',
          user: { login: 'reviewer-user' },
        },
      ],
    );

    expect(failures).toContain(
      'High-risk changes require Review scope: **Whole PR**; a patch-only review cannot satisfy the final gate.',
    );
    expect(failures).toContain(
      'High-risk changes require Review pass: **Fresh discovery** after implementation and finding closure.',
    );
  });

  it('rejects a large high-risk PR without complete domain coverage', async () => {
    const review = [
      'Review mode: **Independent**',
      'Reviewer: @reviewer-user',
      'Review scope: **Whole PR**',
      'Review pass: **Fresh discovery**',
      `Reviewed boundary: ${pullRequestHead}`,
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: **0**',
      'Review artifact: Whole PR review',
      'Finding dispositions: No findings',
      'Residual risks: No known residual risks',
    ].join('\n');
    const files = Array.from({ length: 51 }, (_, index) => ({
      filename: `src/ts/path-${index}.ts`,
      changes: 1,
    }));

    const failures = await runPullRequestMetadataPolicy(
      createPullRequestBody('High', review),
      files,
      [
        {
          commit_id: pullRequestHead,
          state: 'APPROVED',
          user: { login: 'reviewer-user' },
        },
      ],
    );

    expect(failures).toContain(
      'Large high-risk PRs require assignments to at least two independent domain discovery reviewers.',
    );
    expect(failures).toContain(
      'Coverage manifest is missing changed path: src/ts/path-0.ts',
    );
  });

  it('accepts complete large high-risk domain and synthesis evidence', async () => {
    const { body, files } = createLargeHighRiskFixture();

    const failures = await runPullRequestMetadataPolicy(body, files, [
      {
        commit_id: pullRequestHead,
        state: 'APPROVED',
        user: { login: 'synthesis-user' },
      },
    ]);

    expect(failures).toEqual([]);
  });

  it('rejects duplicate domain discovery reports from one reviewer', async () => {
    const fixture = createLargeHighRiskFixture();
    const body = createLargeHighRiskBody(
      fixture.manifest,
      [...fixture.reports, fixture.reports[0]].join('\n'),
    );

    const failures = await runPullRequestMetadataPolicy(body, fixture.files);

    expect(failures).toContain(
      'Large high-risk PRs require exactly one domain discovery report per reviewer.',
    );
  });

  it.each([
    ['unassigned reviewer', '@unassigned-user'],
    ['PR author', '@implementer-user'],
  ])(
    'does not count a report from the %s as a qualifying large-review reviewer',
    async (_label, extraReporter) => {
      const fixture = createLargeHighRiskFixture();
      const allPaths = fixture.files.map((file) => file.filename);
      const oneReviewerManifest = fixture.manifest.replaceAll(
        '@domain-two',
        '@domain-one',
      );
      const reports = [
        `Reviewer: @domain-one | Base: base-sha | Head: ${pullRequestHead} | Paths: ${allPaths.join('; ')} | Domains: ${runtimeDomain}; ${publicApiDomain} | Coverage: ${createCoverage(allPaths)} | Adjacent: callers and cleanup | Commands: source inspection | Findings: No findings discovered | Uninspected: All assigned paths inspected`,
        `Reviewer: ${extraReporter} | Base: base-sha | Head: ${pullRequestHead} | Paths: ${allPaths.join('; ')} | Domains: ${runtimeDomain}; ${publicApiDomain} | Coverage: ${createCoverage(allPaths)} | Adjacent: callers and cleanup | Commands: source inspection | Findings: No findings discovered | Uninspected: All assigned paths inspected`,
      ].join('\n');

      const failures = await runPullRequestMetadataPolicy(
        createLargeHighRiskBody(oneReviewerManifest, reports),
        fixture.files,
        [
          {
            commit_id: pullRequestHead,
            state: 'APPROVED',
            user: { login: 'synthesis-user' },
          },
        ],
      );

      expect(failures).toContain(
        'Large high-risk PRs require assignments to at least two independent domain discovery reviewers.',
      );
      expect(failures).toContain(
        `Domain discovery report for ${extraReporter} has no non-author coverage assignment.`,
      );
    },
  );

  it.each([
    [
      'path',
      (report: string) =>
        report.replace(' | Domains:', '; src/ts/unassigned-path.ts | Domains:'),
    ],
    [
      'domain',
      (report: string) =>
        report.replace(
          'Public API, compatibility, and packaging | Coverage:',
          'Public API, compatibility, and packaging; Tests and documentation | Coverage:',
        ),
    ],
  ])(
    'rejects a domain discovery report with an extra %s',
    async (_label, alterReport) => {
      const fixture = createLargeHighRiskFixture();
      const reports = [alterReport(fixture.reports[0]), fixture.reports[1]];
      const failures = await runPullRequestMetadataPolicy(
        createLargeHighRiskBody(fixture.manifest, reports.join('\n')),
        fixture.files,
        [
          {
            commit_id: pullRequestHead,
            state: 'APPROVED',
            user: { login: 'synthesis-user' },
          },
        ],
      );

      expect(failures).toContain(
        'Domain discovery report for @domain-one must exactly match its assigned paths, domains, and coverage pairs.',
      );
    },
  );

  it('rejects crossed path-domain assignments that make report scope overclaim a cross-product', async () => {
    const fixture = createLargeHighRiskFixture();
    const crossedManifest = fixture.manifest
      .split('\n')
      .map((line, index) => {
        if (index === 0) {
          return line.replace(
            'Public API, compatibility, and packaging => @domain-one',
            'Public API, compatibility, and packaging => @domain-two',
          );
        }
        if (index === 26) {
          return line.replace(
            'Public API, compatibility, and packaging => @domain-two',
            'Public API, compatibility, and packaging => @domain-one',
          );
        }
        return line;
      })
      .join('\n');
    const firstPaths = fixture.files.slice(0, 27).map((file) => file.filename);
    const secondPaths = [
      fixture.files[0].filename,
      ...fixture.files.slice(26).map((file) => file.filename),
    ];
    const reports = [
      `Reviewer: @domain-one | Base: base-sha | Head: ${pullRequestHead} | Paths: ${firstPaths.join('; ')} | Domains: ${runtimeDomain}; ${publicApiDomain} | Coverage: ${createCoverage(firstPaths)} | Adjacent: callers and cleanup | Commands: source inspection | Findings: No findings discovered | Uninspected: All assigned paths inspected`,
      `Reviewer: @domain-two | Base: base-sha | Head: ${pullRequestHead} | Paths: ${secondPaths.join('; ')} | Domains: ${runtimeDomain}; ${publicApiDomain} | Coverage: ${createCoverage(secondPaths)} | Adjacent: callers and cleanup | Commands: source inspection | Findings: No findings discovered | Uninspected: All assigned paths inspected`,
    ].join('\n');

    const failures = await runPullRequestMetadataPolicy(
      createLargeHighRiskBody(crossedManifest, reports),
      fixture.files,
      [
        {
          commit_id: pullRequestHead,
          state: 'APPROVED',
          user: { login: 'synthesis-user' },
        },
      ],
    );

    expect(failures).toContain(
      'Domain discovery report for @domain-one must exactly match its assigned paths, domains, and coverage pairs.',
    );
    expect(failures).toContain(
      'Domain discovery report for @domain-two must exactly match its assigned paths, domains, and coverage pairs.',
    );
  });

  it('classifies src documentation with exactly tooling and test/documentation domains', async () => {
    const review = [
      'Review mode: **Independent**',
      'Reviewer: @reviewer-user',
      'Review scope: **Whole PR**',
      'Review pass: **Fresh discovery**',
      `Reviewed boundary: ${pullRequestHead}`,
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: **0**',
      'Review artifact: Whole PR review',
      'Finding dispositions: No findings',
      'Residual risks: No known residual risks',
    ].join('\n');
    const runtimeManifest =
      'Path: src/TOOLCHAIN.md | Contract: toolchain documentation | Domains: Runtime behavior, lifecycle, and ownership; Public API, compatibility, and packaging | Assignments: Runtime behavior, lifecycle, and ownership => @reviewer-user; Public API, compatibility, and packaging => @reviewer-user | Adjacent: build scripts and contributor guidance | Tests: governance policy suite';
    const exactManifest =
      'Path: src/TOOLCHAIN.md | Contract: toolchain documentation | Domains: Tooling, CI, and verification; Tests and documentation | Assignments: Tooling, CI, and verification => @reviewer-user; Tests and documentation => @reviewer-user | Adjacent: build scripts and contributor guidance | Tests: governance policy suite';
    const body = createPullRequestBody('High', review);
    const withManifest = (manifest: string) =>
      body.replace(
        /## Review Coverage Manifest[\s\S]*?## Domain Discovery Reports/,
        `## Review Coverage Manifest\n\n${manifest}\n\n## Domain Discovery Reports`,
      );
    const reviews = [
      {
        commit_id: pullRequestHead,
        state: 'APPROVED',
        user: { login: 'reviewer-user' },
      },
    ];

    const rejected = await runPullRequestMetadataPolicy(
      withManifest(runtimeManifest),
      [{ filename: 'src/TOOLCHAIN.md', changes: 5 }],
      reviews,
    );
    const accepted = await runPullRequestMetadataPolicy(
      withManifest(exactManifest),
      [{ filename: 'src/TOOLCHAIN.md', changes: 5 }],
      reviews,
    );

    expect(rejected).toContain(
      'Coverage manifest path src/TOOLCHAIN.md must declare exactly these domains: Tooling, CI, and verification; Tests and documentation',
    );
    expect(accepted).toEqual([]);
  });

  it('rejects unresolved Medium findings for high-risk work', async () => {
    const review = [
      'Review mode: **Independent**',
      'Reviewer: @reviewer-user',
      'Review scope: **Whole PR**',
      'Review pass: **Fresh discovery**',
      `Reviewed boundary: ${pullRequestHead}`,
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 1; Low 0',
      'Open Critical/High findings: **0**',
      'Open Medium findings: 1',
      'Closed Medium findings: 0',
      'Accepted Medium findings: 0',
      'Review artifact: Whole PR review',
      'Finding dispositions: One Medium remains open',
      'Residual risks: Open Medium finding',
    ].join('\n');

    const failures = await runPullRequestMetadataPolicy(
      createPullRequestBody('High', review),
      [{ filename: 'src/ts/layout-manager.ts', changes: 12 }],
    );

    expect(failures).toContain(
      'High-risk changes cannot have open Medium findings.',
    );
  });

  it.each([
    [
      'a leading-zero open Critical/High count',
      'Findings: Critical 1; High 0; Medium 0; Low 0',
      'Open Critical/High findings: 01',
      'Closed Critical/High findings: 0',
      'High-risk changes cannot have open Critical or High review findings.',
    ],
    [
      'unreconciled Critical/High totals',
      'Findings: Critical 1; High 1; Medium 0; Low 0',
      'Open Critical/High findings: 0',
      'Closed Critical/High findings: 1',
      'Critical and High finding counts must reconcile with their open and closed totals.',
    ],
  ])(
    'rejects %s',
    async (_label, findings, openFindings, closedFindings, expectedFailure) => {
      const review = [
        'Review mode: **Independent**',
        'Reviewer: @reviewer-user',
        'Review scope: **Whole PR**',
        'Review pass: **Fresh discovery**',
        `Reviewed boundary: ${pullRequestHead}`,
        'Rubric result: **Pass**',
        'Dimensions below 2: **0**',
        'Verdict: **Pass**',
        findings,
        openFindings,
        closedFindings,
        'Open Medium findings: 0',
        'Closed Medium findings: 0',
        'Accepted Medium findings: 0',
        'Review artifact: Whole PR review',
        'Finding dispositions: Recorded findings closed or open as counted',
        'Residual risks: No known residual risks',
      ].join('\n');

      const failures = await runPullRequestMetadataPolicy(
        createPullRequestBody('High', review),
        [{ filename: 'src/ts/layout-manager.ts', changes: 12 }],
      );

      expect(failures).toContain(expectedFailure);
    },
  );

  it.each([
    ['missing', [], false],
    [
      'wrong author',
      [
        {
          body: 'Accepted Medium findings: 1\nRationale: bounded risk',
          html_url: 'https://github.test/comment/1',
          user: { login: 'someone-else' },
        },
      ],
      false,
    ],
    [
      'matching author evidence',
      [
        {
          body: 'Accepted Medium findings: 1\nRationale: bounded risk',
          html_url: 'https://github.test/comment/1',
          user: { login: 'implementer-user' },
        },
      ],
      true,
    ],
  ] as const)(
    'validates %s for accepted Medium findings',
    async (_label, comments, accepted) => {
      const review = [
        'Review mode: **Independent**',
        'Reviewer: @reviewer-user',
        'Review scope: **Whole PR**',
        'Review pass: **Fresh discovery**',
        `Reviewed boundary: ${pullRequestHead}`,
        'Rubric result: **Pass**',
        'Dimensions below 2: **0**',
        'Verdict: **Pass**',
        'Findings: Critical 0; High 0; Medium 1; Low 0',
        'Open Critical/High findings: **0**',
        'Open Medium findings: 0',
        'Closed Medium findings: 0',
        'Accepted Medium findings: 1',
        'Medium acceptance evidence: https://github.test/comment/1',
        'Review artifact: Whole PR review',
        'Finding dispositions: One Medium accepted',
        'Residual risks: Accepted bounded risk',
      ].join('\n');
      const failures = await runPullRequestMetadataPolicy(
        createPullRequestBody('High', review),
        [{ filename: 'src/ts/layout-manager.ts', changes: 12 }],
        [
          {
            commit_id: pullRequestHead,
            state: 'APPROVED',
            user: { login: 'reviewer-user' },
          },
        ],
        false,
        comments,
      );

      expect(
        failures.includes(
          'Accepted Medium findings require linked acceptance evidence from the PR author with the matching count and rationale.',
        ),
      ).toBe(!accepted);
    },
  );

  it('behaviorally requires and accepts low-risk self-review', async () => {
    const review = [
      'Review mode: **Self-review**',
      'Reviewer: Implementer',
      'Reviewed boundary: working tree documentation diff',
      'Rubric: `docs/contributing/ai-change-quality-rubric.md`',
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: **0**',
      'Review artifact: Complete documentation diff self-review',
      'Finding dispositions: No findings recorded',
      'Residual risks: No executable behavior changed',
    ].join('\n');

    const failures = await runPullRequestMetadataPolicy(
      createPullRequestBody('Low', review),
      [{ filename: 'docs/index.md', changes: 12 }],
    );

    expect(failures).toEqual([]);
  });

  it('behaviorally defaults a mixed low and unmatched change to medium', async () => {
    const review = [
      'Review mode: **Self-review**',
      'Reviewer: Implementer',
      'Reviewed boundary: mixed working tree diff',
      'Rubric: `docs/contributing/ai-change-quality-rubric.md`',
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: **0**',
      'Review artifact: Complete mixed-path self-review',
      'Finding dispositions: No findings recorded',
      'Residual risks: No executable behavior changed',
    ].join('\n');

    const failures = await runPullRequestMetadataPolicy(
      createPullRequestBody('Low', review),
      [
        { filename: 'README.md', changes: 4 },
        { filename: 'tools/release-notes.txt', changes: 3 },
      ],
    );

    expect(failures).toContain(
      'Declared risk low is below computed risk medium.',
    );
  });

  it('behaviorally retains high risk when a GitHub file is renamed to docs', async () => {
    const review = [
      'Review mode: **Self-review**',
      'Reviewer: Implementer',
      'Reviewed boundary: renamed working tree path',
      'Rubric: `docs/contributing/ai-change-quality-rubric.md`',
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: **0**',
      'Review artifact: Complete rename self-review',
      'Finding dispositions: No findings recorded',
      'Residual risks: Runtime source moved into documentation',
    ].join('\n');
    const failures = await runPullRequestMetadataPolicy(
      createPullRequestBody('Low', review),
      [
        {
          changes: 5,
          filename: 'docs/critical.ts',
          previous_filename: 'src/critical.ts',
          status: 'renamed',
        },
      ],
    );

    expect(failures).toContain(
      'Declared risk low is below computed risk high.',
    );
    expect(failures).toContain(
      'High-risk changes require Review mode: **Independent**.',
    );
  });

  it('loads the shared risk policy and requires current-head external approval', () => {
    const workflow = readFileSync(
      resolve('.github/workflows/contribution-governance.yml'),
      'utf8',
    );
    const ci = readFileSync(resolve('.github/workflows/CI.yml'), 'utf8');

    expect(workflow).toContain("path: '.github/change-risk.json'");
    expect(workflow).toContain('github.rest.pulls.listReviews');
    expect(workflow).toContain('review.commit_id === pr.head.sha');
    expect(workflow).toContain('latestDecisiveReview');
    expect(workflow).toContain('review.user.login.toLowerCase() !== author');
    expect(ci).toContain('fetch-depth: 0');
    expect(ci).toContain('github.event.pull_request.base.sha ||');
    expect(ci).toContain(
      "github.ref == format('refs/heads/{0}', github.event.repository.default_branch)",
    );
    expect(ci).toContain(
      "format('origin/{0}', github.event.repository.default_branch)",
    );
    expect(ci).toContain("github.ref_type == 'tag' && 'high'");
  });
});

describe('risk-based PR verification', () => {
  it.each([
    ['docs/index.md', 'low'],
    ['test/specs/tab-tests.ts', 'medium'],
    ['src/ts/layout-manager.ts', 'high'],
    ['scripts/migrate-golden-layout-to-strelit.js', 'high'],
    ['scripts/AGENTS.md', 'high'],
    ['AGENTS.md', 'high'],
    ['.github/pull_request_template.md', 'high'],
    ['.github/change-risk.json', 'high'],
    ['docs/contributing/ai-change-quality-rubric.md', 'high'],
    ['docs/contributing/workflow.md', 'high'],
    ['docs/architecture/product-evolution-policy.md', 'high'],
    ['docs/architecture/compatibility-audit-maintenance.md', 'high'],
    ['.github/workflows/CI.yml', 'high'],
    ['.github/CODEOWNERS', 'high'],
    ['.npmignore', 'high'],
    ['.oxlintrc.json', 'high'],
    ['tools/release-notes.txt', 'medium'],
  ] as const)('classifies %s as %s risk', (fileName, expectedRisk) => {
    expect(changeDiscipline.classifyFileRisk(fileName)).toBe(expectedRisk);
  });

  it('uses the highest changed-file risk', () => {
    expect(
      changeDiscipline.classifyChangeRisk([
        'docs/index.md',
        'test/specs/tab-tests.ts',
        'src/ts/layout-manager.ts',
      ]),
    ).toBe('high');
  });

  it('maps risk to proportionate verification', () => {
    expect(changeDiscipline.verificationScriptsForRisk('low')).toEqual([
      'verify:agent-ledger',
      'lint:docs',
      'format:check',
    ]);
    expect(changeDiscipline.verificationScriptsForRisk('medium')).toEqual([
      'verify:agent-ledger',
      'typecheck',
      'typecheck:bundle:prepare',
      'typecheck:bundle',
      'test',
      'lint',
      'format:check',
    ]);
    expect(changeDiscipline.verificationScriptsForRisk('high')).toEqual([
      'verify:agent-ledger',
      'verify:ordered',
      'apitest:build',
      'apitest:smoke',
    ]);
  });

  it('requires the definitive ledger gate only for local high-risk work', () => {
    expect(
      changeDiscipline.requiresLocalReviewGate('high', {
        GITHUB_ACTIONS: 'false',
      }),
    ).toBe(true);
    expect(
      changeDiscipline.requiresLocalReviewGate('high', {
        GITHUB_ACTIONS: 'true',
      }),
    ).toBe(false);
    expect(
      changeDiscipline.requiresLocalReviewGate('medium', {
        GITHUB_ACTIONS: 'false',
      }),
    ).toBe(false);
  });

  it('binds executed npm script names to definitive gate command names', () => {
    expect(
      changeDiscipline.executedCommandNames([
        'verify:ordered',
        'apitest:build',
        'apitest:smoke',
      ]),
    ).toEqual([
      'npm run verify:ordered',
      'npm run apitest:build',
      'npm run apitest:smoke',
    ]);
  });

  it('makes review-ready mode non-bypassable by classification or base flags', () => {
    const script = resolve('scripts/verify-pr.js');
    for (const bypass of [
      ['--review-ready', '--classify-only'],
      ['--review-ready', '--base', 'HEAD'],
    ]) {
      const result = spawnSync(process.execPath, [script, ...bypass], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--review-ready rejects');
    }
  });

  it('assigns tooling review to executable governance policy', () => {
    expect(changeDiscipline.domainsForPath('AGENTS.md')).toEqual([
      'Tests and documentation',
      'Tooling, CI, and verification',
    ]);
    expect(
      changeDiscipline.domainsForPath(
        'docs/contributing/ai-change-quality-rubric.md',
      ),
    ).toEqual(['Tests and documentation', 'Tooling, CI, and verification']);
    expect(changeDiscipline.domainsForPath('LICENSE')).toEqual([
      'Tests and documentation',
    ]);
    expect(changeDiscipline.domainsForPath('COMMUNITY.md')).toEqual([
      'Tests and documentation',
    ]);
    expect(changeDiscipline.domainsForPath('.npmignore')).toEqual([
      'Public API, compatibility, and packaging',
      'Tooling, CI, and verification',
    ]);
  });

  it('classifies extensionless licenses as documentation in the workflow mirror', async () => {
    const review = [
      'Review mode: **Independent**',
      'Reviewer: @reviewer-user',
      'Review scope: **Whole PR**',
      'Review pass: **Fresh discovery**',
      `Reviewed boundary: ${pullRequestHead}`,
      'Rubric result: **Pass**',
      'Dimensions below 2: **0**',
      'Verdict: **Pass**',
      'Findings: Critical 0; High 0; Medium 0; Low 0',
      'Open Critical/High findings: 0',
      'Closed Critical/High findings: 0',
      'Review artifact: Whole PR review',
      'Finding dispositions: No findings',
      'Residual risks: No known residual risks',
    ].join('\n');
    const manifest = [
      'Path: .github/workflows/example.yml | Contract: workflow behavior | Domains: Tooling, CI, and verification | Assignments: Tooling, CI, and verification => @reviewer-user | Adjacent: governance workflow | Tests: governance policy suite',
      'Path: LICENSE | Contract: licensing documentation | Domains: Tests and documentation | Assignments: Tests and documentation => @reviewer-user | Adjacent: package metadata | Tests: governance policy suite',
    ].join('\n');
    const body = createPullRequestBody('High', review).replace(
      /## Review Coverage Manifest[\s\S]*?## Domain Discovery Reports/,
      `## Review Coverage Manifest\n\n${manifest}\n\n## Domain Discovery Reports`,
    );

    const failures = await runPullRequestMetadataPolicy(
      body,
      [
        { filename: '.github/workflows/example.yml', changes: 5 },
        { filename: 'LICENSE', changes: 5 },
      ],
      [
        {
          commit_id: pullRequestHead,
          state: 'APPROVED',
          user: { login: 'reviewer-user' },
        },
      ],
    );

    expect(failures).toEqual([]);
  });

  it('strictly compiles the documented Vue hook with its usage example', () => {
    const documentation = readFileSync(
      resolve('docs/frameworks/vue/embedding-via-events.md'),
      'utf8',
    );
    const hook = documentation.match(/```typescript\n([\s\S]*?)```/)?.[1];
    const usage = documentation.match(
      /<script lang="ts">\n([\s\S]*?)<\/script>/,
    )?.[1];
    expect(hook).toBeDefined();
    expect(usage).toBeDefined();
    if (hook === undefined || usage === undefined) return;

    const directory = mkdtempSync(join(tmpdir(), 'strelit-vue-docs-'));
    try {
      const vueTypes = [
        "declare module 'vue' {",
        '  export function defineComponent(options: unknown): unknown;',
        '  export function h(...args: unknown[]): unknown;',
        '  export function onBeforeUnmount(callback: () => void): void;',
        '  export function onMounted(callback: () => void): void;',
        '  export function ref<T>(value: T): { value: T };',
        '  export function shallowRef<T>(value: T): { value: T };',
        '}',
      ].join('\n');
      const hookPath = join(directory, 'use-strelit-layout.ts');
      const sourcePath = join(directory, 'example.ts');
      const vueTypesPath = join(directory, 'vue.d.ts');
      const configPath = join(directory, 'tsconfig.json');
      writeFileSync(hookPath, hook);
      writeFileSync(sourcePath, usage);
      writeFileSync(vueTypesPath, vueTypes);
      writeFileSync(
        configPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            lib: ['ES2022', 'DOM'],
            baseUrl: process.cwd(),
            paths: {
              'strelit-ui-kit': ['./src/index.ts'],
              vue: [vueTypesPath.replaceAll('\\', '/')],
              '@/use-strelit-layout': [hookPath.replaceAll('\\', '/')],
            },
          },
          files: [hookPath, sourcePath, vueTypesPath],
        }),
      );

      const result = spawnSync(
        process.execPath,
        [require.resolve('typescript/bin/tsc'), '--project', configPath],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(result.stdout + result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it('forces high verification for tag and release-style CI runs', () => {
    expect(changeDiscipline.resolveVerificationRisk([], 'high')).toBe('high');
    expect(
      changeDiscipline.resolveVerificationRisk(
        ['src/ts/layout-manager.ts'],
        'low',
      ),
    ).toBe('high');
    expect(
      changeDiscipline.resolveVerificationRisk(
        ['test/specs/tab-tests.ts'],
        'low',
      ),
    ).toBe('medium');
    expect(() =>
      changeDiscipline.resolveVerificationRisk([], 'unsupported'),
    ).toThrow('Unknown forced risk');
  });

  it('includes deleted files when collecting changed paths', () => {
    const repository = mkdtempSync(join(tmpdir(), 'strelit-risk-deletion-'));
    try {
      execFileSync('git', ['init'], { cwd: repository });
      execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], {
        cwd: repository,
      });
      execFileSync('git', ['config', 'user.name', 'Strelit Tests'], {
        cwd: repository,
      });
      execFileSync('git', ['config', 'core.autocrlf', 'false'], {
        cwd: repository,
      });
      mkdirSync(join(repository, 'src'));
      const removedFile = join(repository, 'src', 'removed.ts');
      writeFileSync(removedFile, 'export const removed = true;\n');
      execFileSync('git', ['add', '.'], { cwd: repository });
      execFileSync('git', ['commit', '-m', 'Add removable source.'], {
        cwd: repository,
      });
      const base = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();
      unlinkSync(removedFile);

      expect(changeDiscipline.collectChangedFiles(base, repository)).toContain(
        'src/removed.ts',
      );
    } finally {
      rmSync(repository, { force: true, recursive: true });
    }
  });

  it('includes both risk boundaries when a high-risk file is renamed', () => {
    const repository = mkdtempSync(join(tmpdir(), 'strelit-risk-rename-'));
    try {
      execFileSync('git', ['init'], { cwd: repository });
      execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], {
        cwd: repository,
      });
      execFileSync('git', ['config', 'user.name', 'Strelit Tests'], {
        cwd: repository,
      });
      execFileSync('git', ['config', 'core.autocrlf', 'false'], {
        cwd: repository,
      });
      mkdirSync(join(repository, 'src'));
      const sourceFile = join(repository, 'src', 'critical.ts');
      writeFileSync(sourceFile, 'export const critical = true;\n');
      execFileSync('git', ['add', '.'], { cwd: repository });
      execFileSync('git', ['commit', '-m', 'Add high-risk source.'], {
        cwd: repository,
      });
      const base = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();
      mkdirSync(join(repository, 'docs'));
      execFileSync('git', ['mv', 'src/critical.ts', 'docs/critical.ts'], {
        cwd: repository,
      });

      expect(changeDiscipline.collectChangedFiles(base, repository)).toEqual(
        expect.arrayContaining(['src/critical.ts', 'docs/critical.ts']),
      );
    } finally {
      rmSync(repository, { force: true, recursive: true });
    }
  });

  it('fails closed when the declared CI base was not fetched', () => {
    const previousBase = process.env.GITHUB_BASE_SHA;
    process.env.GITHUB_BASE_SHA = 'ffffffffffffffffffffffffffffffffffffffff';
    try {
      expect(() => changeDiscipline.resolveBaseRef()).toThrow(
        'GITHUB_BASE_SHA is not available locally',
      );
    } finally {
      if (previousBase === undefined) {
        delete process.env.GITHUB_BASE_SHA;
      } else {
        process.env.GITHUB_BASE_SHA = previousBase;
      }
    }
  });

  it('fails closed in GitHub Actions when the base is absent', () => {
    const previousActions = process.env.GITHUB_ACTIONS;
    const previousBase = process.env.GITHUB_BASE_SHA;
    process.env.GITHUB_ACTIONS = 'true';
    delete process.env.GITHUB_BASE_SHA;
    try {
      expect(() => changeDiscipline.resolveBaseRef()).toThrow(
        'GITHUB_BASE_SHA must be provided',
      );
    } finally {
      if (previousActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = previousActions;
      }
      if (previousBase === undefined) {
        delete process.env.GITHUB_BASE_SHA;
      } else {
        process.env.GITHUB_BASE_SHA = previousBase;
      }
    }
  });

  it('uses the default-branch merge base for a new branch push', () => {
    const repository = mkdtempSync(join(tmpdir(), 'strelit-new-branch-'));
    const previousActions = process.env.GITHUB_ACTIONS;
    const previousBase = process.env.GITHUB_BASE_SHA;
    const previousDefault = process.env.GITHUB_DEFAULT_BRANCH;
    try {
      execFileSync('git', ['init'], { cwd: repository });
      execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], {
        cwd: repository,
      });
      execFileSync('git', ['config', 'user.name', 'Strelit Tests'], {
        cwd: repository,
      });
      execFileSync('git', ['config', 'core.autocrlf', 'false'], {
        cwd: repository,
      });
      writeFileSync(join(repository, 'README.md'), 'base\n');
      execFileSync('git', ['add', '.'], { cwd: repository });
      execFileSync('git', ['commit', '-m', 'Create base commit.'], {
        cwd: repository,
      });
      execFileSync('git', ['branch', '-M', 'main'], { cwd: repository });
      const base = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim();
      execFileSync('git', ['switch', '-c', 'feature'], { cwd: repository });
      writeFileSync(join(repository, 'feature.md'), 'feature\n');
      execFileSync('git', ['add', '.'], { cwd: repository });
      execFileSync('git', ['commit', '-m', 'Add feature commit.'], {
        cwd: repository,
      });
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_BASE_SHA = '0000000000000000000000000000000000000000';
      process.env.GITHUB_DEFAULT_BRANCH = 'main';

      expect(changeDiscipline.resolveBaseRef(undefined, repository)).toBe(base);
    } finally {
      rmSync(repository, { force: true, recursive: true });
      if (previousActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = previousActions;
      }
      if (previousBase === undefined) {
        delete process.env.GITHUB_BASE_SHA;
      } else {
        process.env.GITHUB_BASE_SHA = previousBase;
      }
      if (previousDefault === undefined) {
        delete process.env.GITHUB_DEFAULT_BRANCH;
      } else {
        process.env.GITHUB_DEFAULT_BRANCH = previousDefault;
      }
    }
  });
});
