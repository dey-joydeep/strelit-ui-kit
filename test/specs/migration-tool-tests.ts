import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const migrationScript = resolve(
  process.cwd(),
  'scripts/migrate-golden-layout-to-strelit.js',
);
const temporaryDirectories: string[] = [];

function createFixture(content: string, fileName = 'consumer.ts'): string {
  const directory = mkdtempSync(join(tmpdir(), 'strelit-migration-'));
  temporaryDirectories.push(directory);
  const filePath = join(directory, fileName);
  writeFileSync(filePath, content);
  return filePath;
}

function migrate(filePath: string, additionalArguments: string[] = []): string {
  return execFileSync(
    process.execPath,
    [migrationScript, '--target', filePath, ...additionalArguments, '--write'],
    { encoding: 'utf8' },
  );
}

function compileFixture(fixtureName: string): void {
  const directory = mkdtempSync(join(tmpdir(), 'strelit-compile-fixture-'));
  temporaryDirectories.push(directory);
  const fixturePath = join(directory, 'consumer.ts');
  copyFileSync(
    resolve(process.cwd(), 'test/migration-fixtures', fixtureName),
    fixturePath,
  );
  migrate(fixturePath);

  const publicApiPath = resolve(process.cwd(), 'src/index.ts').replaceAll(
    '\\',
    '/',
  );
  const tsconfigPath = join(directory, 'tsconfig.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        strictPropertyInitialization: false,
        noEmit: true,
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        lib: ['ES2020', 'DOM'],
        paths: { 'strelit-ui-kit': [publicApiPath] },
      },
      files: [fixturePath.replaceAll('\\', '/')],
    }),
  );

  try {
    execFileSync(
      process.execPath,
      [
        resolve(process.cwd(), 'node_modules/typescript/bin/tsc'),
        '--project',
        tsconfigPath,
      ],
      { encoding: 'utf8' },
    );
  } catch (error) {
    const processError = error as { stdout?: string; stderr?: string };
    throw new Error(
      [processError.stdout, processError.stderr].filter(Boolean).join('\n'),
    );
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Golden Layout source migration', () => {
  it('migrates branded and namespace APIs without changing general lm_ selectors', () => {
    const filePath = createFixture(`
import GoldenLayout, { LayoutConfig, SizeUnitEnum } from 'golden-layout';
import 'golden-layout/dist/css/goldenlayout-base.css';

type Settings = LayoutConfig.Settings;
const resolved = LayoutConfig.resolve(config);
const unit = SizeUnitEnum.tryParse('%');
const selectors = 'lm_header lm_goldenlayout';
const layout = new GoldenLayout(container);
layout.updateSize(800, 600);
`);

    const output = migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain("from 'strelit-ui-kit'");
    expect(migrated).toContain(
      "import 'strelit-ui-kit/dist/css/strelit-base.css'",
    );
    expect(migrated).toContain('StrelitLayout');
    expect(migrated).toContain('LayoutConfigSettings');
    expect(migrated).toContain('resolveLayoutConfig(config)');
    expect(migrated).toContain("tryParseSizeUnit('%')");
    expect(migrated).toContain("'lm_header lm_strelit'");
    expect(migrated).toContain('layout.setSize(800, 600)');
    expect(output).not.toContain('receiver type for layout.updateSize');
  });

  it('is idempotent', () => {
    const filePath = createFixture(
      "import { GoldenLayout } from 'golden-layout';\nnew GoldenLayout();\n",
    );

    migrate(filePath);
    const firstMigration = readFileSync(filePath, 'utf8');
    const secondOutput = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toBe(firstMigration);
    expect(secondOutput).toContain('Updated 0 file(s).');
  });

  it('aliases generated imports when the target name is already bound', () => {
    const filePath = createFixture(`
import { LayoutConfig } from 'golden-layout';
const resolveLayoutConfig = () => 'application helper';
const resolved = LayoutConfig.resolve(config);
`);

    migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain(
      'resolveLayoutConfig as resolveLayoutConfigFromStrelit',
    );
    expect(migrated).toContain('resolveLayoutConfigFromStrelit(config)');
    expect(migrated).toContain(
      "const resolveLayoutConfig = () => 'application helper'",
    );
  });

  it('migrates CommonJS default-package bindings structurally', () => {
    const filePath = createFixture(
      "const GoldenLayout = require('golden-layout');\nnew GoldenLayout();\n",
      'consumer.cjs',
    );

    migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain(
      "const { StrelitLayout } = require('strelit-ui-kit')",
    );
    expect(migrated).toContain('new StrelitLayout()');
  });

  it('rewrites proven container and stack receivers and flags unknown ones', () => {
    const filePath = createFixture(`
import { ComponentContainer, Stack } from 'golden-layout';
function migrateContainer(container: ComponentContainer) {
  return container.getElement();
}
function migrateStack(stack: Stack, unknownReceiver: unknown) {
  stack.setActiveContentItem(stack.getActiveContentItem());
  (unknownReceiver as { updateSize(): void }).updateSize();
}
`);

    const output = migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain('return container.element');
    expect(migrated).toContain('stack.setActiveComponentItem');
    expect(migrated).toContain('stack.getActiveComponentItem()');
    expect(output).toContain('receiver type for');
  });

  it('flags the ambiguous deprecated drag-source callback shape', () => {
    const filePath = createFixture(`
import { DragSource } from 'golden-layout';
const config: DragSource.ComponentItemConfig = {
  type: 'editor',
  state: { text: 'hello' },
};
`);

    const output = migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain('ComponentItemConfig');
    expect(output).toContain('type/state to componentType/componentState');
  });

  it('migrates deterministic saved-layout fields and reports lossy roots', () => {
    const filePath = createFixture(
      JSON.stringify({
        content: [
          {
            type: 'component',
            componentName: 'editor',
            width: 60,
            minWidth: 120,
            id: ['editor', '__glMaximised'],
          },
          { type: 'component', componentName: 'preview' },
        ],
        settings: {
          hasHeaders: false,
          showCloseIcon: false,
        },
        labels: { popout: 'Open separately' },
        dimensions: { minItemWidth: 10, minItemHeight: 5 },
      }),
      'layout.json',
    );

    const output = migrate(filePath, ['--from', 'v2']);
    const migrated = JSON.parse(readFileSync(filePath, 'utf8')) as {
      root: Record<string, unknown>;
      header: Record<string, unknown>;
      dimensions: Record<string, unknown>;
    };

    expect(migrated.root).toMatchObject({
      type: 'component',
      componentType: 'editor',
      size: '60%',
      minSize: '120px',
      id: 'editor',
      maximised: true,
    });
    expect(migrated.header).toMatchObject({
      show: false,
      popout: 'Open separately',
      close: false,
    });
    expect(migrated.dimensions).toMatchObject({
      defaultMinItemWidth: '10px',
      defaultMinItemHeight: '5px',
    });
    expect(output).toContain('multiple roots');

    const firstMigration = readFileSync(filePath, 'utf8');
    migrate(filePath, ['--from', 'v2']);
    expect(readFileSync(filePath, 'utf8')).toBe(firstMigration);
  });

  it('flags v1-only framework and nested-stack layouts', () => {
    const filePath = createFixture(
      JSON.stringify({
        content: [
          {
            type: 'stack',
            content: [
              {
                type: 'row',
                content: [
                  {
                    type: 'react-component',
                    componentName: 'legacy-react-panel',
                  },
                ],
              },
            ],
          },
        ],
      }),
      'v1-layout.json',
    );

    const output = migrate(filePath, ['--from', 'v1']);

    expect(output).toContain('modern framework adapter');
    expect(output).toContain('nested stack content and requires redesign');
  });

  it.each(['v1-consumer.ts', 'v2-consumer.ts'])(
    'compiles the migrated %s fixture against Strelit',
    (fixtureName) => {
      compileFixture(fixtureName);
    },
    15_000,
  );
});
