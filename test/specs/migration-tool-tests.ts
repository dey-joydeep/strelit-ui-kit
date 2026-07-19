import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
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

  it.each([
    'golden-layout/dist/scss/goldenlayout-dark-theme.scss',
    'golden-layout/dist/scss/themes/goldenlayout-dark-theme.scss',
    'golden-layout/dist/scss/_goldenlayout-var-theme.scss',
    'golden-layout/dist/scss/themes/_goldenlayout-var-theme.scss',
    'golden-layout/dist/scss/_goldenlayout-var-theme.scss?inline',
    'golden-layout/dist/scss/themes/goldenlayout-dark-theme.scss#asset',
  ])('preserves unavailable SCSS theme import %s', (legacyPath) => {
    const legacyImport = `import '${legacyPath}';`;
    const filePath = createFixture(`${legacyImport}\n`);

    const output = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toContain(legacyImport);
    expect(output).toContain(
      'SCSS theme imports require a manual Strelit theme selection',
    );
  });

  it('preserves query-suffixed SCSS theme imports in text files', () => {
    const legacyImport =
      '@import "golden-layout/dist/scss/_goldenlayout-var-theme.scss?inline";';
    const filePath = createFixture(`${legacyImport}\n`, 'consumer.scss');

    const output = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toContain(legacyImport);
    expect(output).toContain(
      'SCSS theme imports require a manual Strelit theme selection',
    );
  });

  it.each([
    {
      fileName: 'consumer.css',
      legacyPath: 'golden-layout/src/css/goldenlayout-dark-theme.css?inline',
      migratedPath:
        'strelit-ui-kit/dist/css/themes/strelit-dark-theme.css?inline',
    },
    {
      fileName: 'consumer.less',
      legacyPath:
        'golden-layout/dist/less/themes/goldenlayout-dark-theme.less#asset',
      migratedPath:
        'strelit-ui-kit/dist/less/themes/strelit-dark-theme.less#asset',
    },
  ])(
    'preserves resource suffixes when migrating $fileName theme imports',
    ({ fileName, legacyPath, migratedPath }) => {
      const filePath = createFixture(`@import "${legacyPath}";\n`, fileName);

      migrate(filePath);

      expect(readFileSync(filePath, 'utf8')).toContain(
        `@import "${migratedPath}";`,
      );
    },
  );

  it('rejects directory links and junctions before traversing outside the target', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'strelit-migration-link-'));
    temporaryDirectories.push(fixture);
    const selected = join(fixture, 'target');
    const outside = join(fixture, 'target-two');
    const outsideFile = join(outside, 'legacy.js');
    mkdirSync(selected);
    mkdirSync(outside);
    writeFileSync(outsideFile, 'const layout = new GoldenLayout();\n');
    symlinkSync(
      outside,
      join(selected, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    expect(() => migrate(selected)).toThrow(
      /Refusing symbolic link or reparse point/,
    );
    expect(readFileSync(outsideFile, 'utf8')).toContain('GoldenLayout');
  });

  it('skips ignored directory links without inspecting their targets', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'strelit-migration-ignored-'));
    temporaryDirectories.push(fixture);
    const selected = join(fixture, 'target');
    const outside = join(fixture, 'outside');
    const outsideFile = join(outside, 'legacy.js');
    const selectedFile = join(selected, 'legacy.js');
    mkdirSync(selected);
    mkdirSync(outside);
    writeFileSync(outsideFile, 'const layout = new GoldenLayout();\n');
    writeFileSync(selectedFile, 'const layout = new GoldenLayout();\n');
    symlinkSync(
      outside,
      join(selected, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    expect(() => migrate(selected)).not.toThrow();
    expect(readFileSync(selectedFile, 'utf8')).toContain('StrelitLayout');
    expect(readFileSync(outsideFile, 'utf8')).toContain('GoldenLayout');
  });

  it('rejects multiply-linked files before writing through them', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'strelit-migration-hardlink-'));
    temporaryDirectories.push(fixture);
    const selected = join(fixture, 'target');
    const outside = join(fixture, 'outside');
    const outsideFile = join(outside, 'legacy.js');
    mkdirSync(selected);
    mkdirSync(outside);
    writeFileSync(outsideFile, 'const layout = new GoldenLayout();\n');
    linkSync(outsideFile, join(selected, 'legacy.js'));

    expect(() => migrate(selected)).toThrow(/Refusing multiply-linked file/);
    expect(readFileSync(outsideFile, 'utf8')).toContain('GoldenLayout');
  });

  it('keeps regular nested targets contained and dry runs non-writing', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'strelit-migration-regular-'));
    temporaryDirectories.push(fixture);
    const selected = join(fixture, 'target');
    const nested = join(selected, 'nested');
    const legacyFile = join(nested, 'legacy.js');
    mkdirSync(nested, { recursive: true });
    writeFileSync(legacyFile, 'const layout = new GoldenLayout();\n');

    const dryRunOutput = execFileSync(
      process.execPath,
      [migrationScript, '--target', selected],
      { encoding: 'utf8' },
    );
    expect(dryRunOutput).toContain('would update');
    expect(readFileSync(legacyFile, 'utf8')).toContain('GoldenLayout');

    migrate(selected);
    expect(readFileSync(legacyFile, 'utf8')).toContain('StrelitLayout');
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

  it('migrates numeric sizing from the original v2 demo layout pattern', () => {
    const filePath = createFixture(`
import { ItemType, LayoutConfig } from 'golden-layout';

const demoLayout: LayoutConfig = {
  dimensions: { minItemWidth: 250 },
  root: {
    type: ItemType.row,
    content: [
      {
        type: ItemType.component,
        componentType: 'editor',
        width: 30,
        minWidth: 120,
      },
      {
        type: ItemType.column,
        height: 70,
        content: [],
      },
    ],
  },
};

const componentState = { minItemWidth: 12 };
`);

    const output = migrate(filePath, ['--from', 'v2']);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain("from 'strelit-ui-kit'");
    expect(migrated).toContain("size: '30%'");
    expect(migrated).toContain("minSize: '120px'");
    expect(migrated).toContain("defaultMinItemWidth: '250px'");
    expect(migrated).toContain("size: '70%'");
    expect(migrated).not.toContain('dimensions: { minItemWidth:');
    expect(migrated).not.toContain('width: 30');
    expect(migrated).not.toContain('minWidth: 120');
    expect(migrated).not.toContain('height: 70');
    expect(migrated).toContain('componentState = { minItemWidth: 12 }');
    expect(output).not.toContain(
      'item width/height fields must become size strings',
    );
  });

  it('does not rewrite unrelated dimensions or duplicate modern defaults', () => {
    const filePath = createFixture(`
import { LayoutConfig } from 'golden-layout';

const chart = {
  dimensions: { minItemWidth: 12 },
};
const layout: LayoutConfig = {
  dimensions: { defaultMinItemWidth: '30px', minItemWidth: 10 },
  root: { type: 'component', componentType: 'editor' },
};
`);

    const output = migrate(filePath, ['--from', 'v2']);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain('dimensions: { minItemWidth: 12 }');
    expect(migrated).toContain(
      "dimensions: { defaultMinItemWidth: '30px', minItemWidth: 10 }",
    );
    expect(migrated.match(/defaultMinItemWidth/g)).toHaveLength(1);
    expect(output).toContain('removed config fields must be converted');
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

  it.each(['v1-consumer.ts', 'v2-consumer.ts', 'v2-api-demo.ts'])(
    'compiles the migrated %s fixture against Strelit',
    (fixtureName) => {
      compileFixture(fixtureName);
    },
    180_000,
  );
});
