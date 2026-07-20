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
    'golden-layout/dist/index.js',
    'golden-layout/dist/cjs/index.js',
    'golden-layout/index.js',
  ])('migrates CommonJS entry binding %s structurally', (legacyPath) => {
    const filePath = createFixture(
      `const GoldenLayout = require('${legacyPath}');\nnew GoldenLayout();\n`,
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

  it('preserves query/hash suffixes when migrating SCSS base imports', () => {
    const legacyImport =
      '@import "golden-layout/dist/scss/goldenlayout-base.scss?inline";';
    const filePath = createFixture(`${legacyImport}\n`, 'consumer.scss');

    migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toContain(
      '@import "strelit-ui-kit/dist/scss/strelit-base.scss?inline";',
    );
  });

  it('collapses supported JS entries and preserves unsupported deep imports', () => {
    const filePath = createFixture(`
import GoldenLayout from 'golden-layout/dist/esm/index.js';
import { LayoutConfig } from 'golden-layout/dist/cjs/index.js';
import 'golden-layout/dist/index.js';
import 'golden-layout/index.js';
import GoldenLayoutInternal, { ItemContainer, LayoutConfig as InternalLayoutConfig } from 'golden-layout/src/utils/helper.js';
import GoldenLayoutWorker from 'golden-layout/dist/index.js?worker';
const internal = new GoldenLayoutInternal();
const container: ItemContainer = internal.container;
const element = container.getElement();
const resolved = InternalLayoutConfig.resolve(config);
`);

    const output = migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');
    expect(migrated).toContain(
      "import { StrelitLayout } from 'strelit-ui-kit';",
    );
    expect(migrated).toContain(
      "import { LayoutConfig } from 'strelit-ui-kit';",
    );
    expect(migrated).toContain("import 'strelit-ui-kit';");
    expect(migrated).toContain(
      "import GoldenLayoutInternal, { ItemContainer, LayoutConfig as InternalLayoutConfig } from 'golden-layout/src/utils/helper.js';",
    );
    expect(migrated).toContain('new GoldenLayoutInternal()');
    expect(migrated).toContain('container: ItemContainer');
    expect(migrated).toContain('container.getElement()');
    expect(migrated).toContain('InternalLayoutConfig.resolve(config)');
    expect(migrated).toContain(
      "import GoldenLayoutWorker from 'golden-layout/dist/index.js?worker';",
    );
    expect(output).toContain(
      'unsupported Golden Layout JavaScript deep import requires manual migration',
    );
  });

  it('preserves namespace imports and their bindings for manual review', () => {
    const filePath = createFixture(
      `import GoldenLayout, * as GL from 'golden-layout';\nconst layout = new GoldenLayout();\nconst config: GL.LayoutConfig = {};\n`,
    );

    const output = migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain(
      "import GoldenLayout, * as GL from 'golden-layout';",
    );
    expect(migrated).toContain('new GoldenLayout()');
    expect(migrated).toContain('GL.LayoutConfig');
    expect(output).toContain(
      'namespace package imports require member-by-member migration',
    );
  });

  it('preserves unsupported CommonJS deep-import bindings', () => {
    const filePath = createFixture(
      `const GoldenLayout = require('golden-layout/src/js/legacy.js');\nnew GoldenLayout();\n`,
      'consumer.cjs',
    );

    const output = migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain(
      "const GoldenLayout = require('golden-layout/src/js/legacy.js')",
    );
    expect(migrated).toContain('new GoldenLayout()');
    expect(output).toContain(
      'unsupported Golden Layout JavaScript deep import requires manual migration',
    );
  });

  it('preserves aliased destructuring from unsupported CommonJS imports', () => {
    const source = `const { GoldenLayout: LegacyLayout } = require('golden-layout/src/internal.js');\nnew LegacyLayout();\n`;
    const filePath = createFixture(source, 'consumer.cjs');

    const output = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toBe(source);
    expect(output).toContain(
      'unsupported Golden Layout JavaScript deep import requires manual migration',
    );
  });

  it('preserves bindings from nested unsupported CommonJS imports', () => {
    const source = `const GoldenLayout = require('golden-layout/src/internal.js').GoldenLayout;\nnew GoldenLayout();\n`;
    const filePath = createFixture(source, 'consumer.cjs');

    const output = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toBe(source);
    expect(output).toContain(
      'unsupported Golden Layout JavaScript deep import requires manual migration',
    );
  });

  it('preserves assignment bindings from nested unsupported requires', () => {
    const source = `GoldenLayout = require('golden-layout/src/internal.js').GoldenLayout;\nnew GoldenLayout();\n`;
    const filePath = createFixture(source, 'consumer.cjs');

    const output = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toBe(source);
    expect(output).toContain(
      'unsupported Golden Layout JavaScript deep import requires manual migration',
    );
  });

  it('preserves unsupported deep re-exports', () => {
    const source = `export { ItemContainer, GoldenLayout } from 'golden-layout/src/internal.js';\n`;
    const filePath = createFixture(source);

    const output = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toBe(source);
    expect(output).toContain(
      'unsupported Golden Layout JavaScript deep import requires manual migration',
    );
  });

  it('preserves dynamic and TypeScript import-equals forms for manual review', () => {
    const filePath = createFixture(`
import GoldenLayoutModule = require('golden-layout');
const modulePromise = import('golden-layout');
const GoldenLayout = await import('golden-layout');
type LegacyModule = typeof import('golden-layout');
const layout = new GoldenLayoutModule.GoldenLayout();
const dynamicLayout = new GoldenLayout.GoldenLayout();
`);

    const output = migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain(
      "import GoldenLayoutModule = require('golden-layout')",
    );
    expect(migrated).toContain("import('golden-layout')");
    expect(migrated).toContain('GoldenLayoutModule.GoldenLayout');
    expect(migrated).toContain('const GoldenLayout = await import');
    expect(migrated).toContain('GoldenLayout.GoldenLayout');
    expect(output).toContain(
      'TypeScript import-equals declarations require manual migration',
    );
    expect(output).toContain('dynamic imports require manual migration');
    expect(output).toContain('import types require manual migration');
  });

  it('preserves chained dynamic-import callbacks as one manual-only unit', () => {
    const source = `import('golden-layout').then(({ GoldenLayout }) => new GoldenLayout());\n`;
    const filePath = createFixture(source);

    const output = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toBe(source);
    expect(output).toContain('dynamic imports require manual migration');
  });

  it('preserves import-type aliases and their references', () => {
    const source = `type GoldenLayout = import('golden-layout').GoldenLayout;\nlet layout: GoldenLayout;\n`;
    const filePath = createFixture(source);

    const output = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toBe(source);
    expect(output).toContain('import types require manual migration');
  });

  it('migrates unrelated APIs outside a preserved import type', () => {
    const filePath = createFixture(
      `import { LayoutConfig } from 'golden-layout';\nfunction f(x: import('golden-layout').GoldenLayout) { return LayoutConfig.resolve(config); }\n`,
    );

    const output = migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain(
      "import { LayoutConfig, resolveLayoutConfig } from 'strelit-ui-kit';",
    );
    expect(migrated).toContain("x: import('golden-layout').GoldenLayout");
    expect(migrated).toContain('return resolveLayoutConfig(config)');
    expect(output).toContain('import types require manual migration');
  });

  it('handles import types in non-binding property declarations', () => {
    const filePath = createFixture(
      `class Consumer { 'legacy': import('golden-layout').GoldenLayout; }\n`,
    );

    const output = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toContain(
      "'legacy': import('golden-layout').GoldenLayout",
    );
    expect(output).toContain('import types require manual migration');
  });

  it.each([
    {
      fileName: 'consumer.html',
      content: `<script type="importmap">
{"imports":{"golden-layout":"golden-layout","helper":"golden-layout/src/utils/helper.js"}}
</script>
<p>GoldenLayout ItemContainer LayoutConfig.resolve</p>
`,
      unrelatedText: '<p>GoldenLayout ItemContainer LayoutConfig.resolve</p>',
    },
    {
      fileName: 'import-map.json',
      content: JSON.stringify({
        imports: {
          'golden-layout': 'golden-layout',
          helper: 'golden-layout/src/utils/helper.js',
        },
        label: 'GoldenLayout ItemContainer LayoutConfig.resolve',
      }),
      unrelatedText: 'GoldenLayout ItemContainer LayoutConfig.resolve',
    },
  ])(
    'uses conservative package migration in $fileName',
    ({ fileName, content, unrelatedText }) => {
      const filePath = createFixture(content, fileName);

      const output = migrate(filePath);
      const migrated = readFileSync(filePath, 'utf8');

      expect(migrated).toContain('"strelit-ui-kit":"strelit-ui-kit"');
      expect(migrated).toContain(
        '"helper":"golden-layout/src/utils/helper.js"',
      );
      expect(migrated).toContain(unrelatedText);
      expect(output).toContain(
        'unsupported Golden Layout JavaScript deep import requires manual migration',
      );
      expect(output).toContain(
        'embedded Golden Layout source APIs require manual migration',
      );

      const firstMigration = readFileSync(filePath, 'utf8');
      migrate(filePath);
      expect(readFileSync(filePath, 'utf8')).toBe(firstMigration);
    },
  );

  it('preserves unknown package subpaths and reports them', () => {
    const filePath = createFixture(
      `import metadata from 'golden-layout/dist/internal/metadata.json';\n`,
    );

    const output = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toContain(
      "from 'golden-layout/dist/internal/metadata.json'",
    );
    expect(output).toContain(
      'unsupported Golden Layout package subpath requires manual migration',
    );
  });

  it('uses CommonJS syntax for generated imports in .cjs files', () => {
    const filePath = createFixture(
      `const { LayoutConfig } = require('golden-layout');\nconst resolved = LayoutConfig.resolve(config);\n`,
      'consumer.cjs',
    );

    migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain(
      "const { LayoutConfig, resolveLayoutConfig } = require('strelit-ui-kit')",
    );
    expect(migrated).toContain('resolveLayoutConfig(config)');
    expect(migrated).not.toContain('import {');
  });

  it('preserves unbound legacy-looking identifiers for manual review', () => {
    const source = `class GoldenLayout {}\nconst Json = { local: true };\nnew GoldenLayout();\n`;
    const filePath = createFixture(source);

    const output = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toBe(source);
    expect(output).toContain(
      'unbound Golden Layout-like identifiers require manual migration',
    );
  });

  it('does not rewrite a local that shadows a proven package binding', () => {
    const filePath = createFixture(
      `import { GoldenLayout } from 'golden-layout';\nfunction create(GoldenLayout: new () => object) { return new GoldenLayout(); }\nconst layout = new GoldenLayout();\n`,
    );

    const output = migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain(
      'function create(GoldenLayout: new () => object)',
    );
    expect(migrated).toContain('return new GoldenLayout()');
    expect(migrated).toContain('const layout = new StrelitLayout()');
    expect(output).toContain(
      'unbound Golden Layout-like identifiers require manual migration',
    );
  });

  it('migrates aliased APIs using their proven import symbols', () => {
    const filePath = createFixture(
      `import { GoldenLayout as GL, LayoutConfig as LC } from 'golden-layout';\nconst resolved = LC.resolve(config);\nnew GL();\n`,
    );

    migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');

    expect(migrated).toContain('StrelitLayout as GL');
    expect(migrated).toContain('resolveLayoutConfig(config)');
    expect(migrated).toContain('new GL()');
  });

  it('preserves malformed source for manual migration', () => {
    const source = `import GoldenLayout from 'golden-layout';\nconst layout = new GoldenLayout(;\n`;
    const filePath = createFixture(source);

    const output = migrate(filePath);

    expect(readFileSync(filePath, 'utf8')).toBe(source);
    expect(output).toContain(
      'source file contains syntax errors and requires manual migration',
    );
  });

  it('places migrated source theme imports under themes directory', () => {
    const filePath = createFixture(`
import 'golden-layout/dist/css/goldenlayout-dark-theme.css';
import 'golden-layout/src/css/goldenlayout-light-theme.css';
`);

    migrate(filePath);
    const migrated = readFileSync(filePath, 'utf8');
    expect(migrated).toContain(
      "import 'strelit-ui-kit/dist/css/themes/strelit-dark-theme.css';",
    );
    expect(migrated).toContain(
      "import 'strelit-ui-kit/dist/css/themes/strelit-light-theme.css';",
    );
  });

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
    writeFileSync(
      selectedFile,
      "import { GoldenLayout } from 'golden-layout';\nconst layout = new GoldenLayout();\n",
    );
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
    writeFileSync(
      legacyFile,
      "import { GoldenLayout } from 'golden-layout';\nconst layout = new GoldenLayout();\n",
    );

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

  it('migrates standalone item JSON without dropping its wrapper or children', () => {
    const filePath = createFixture(
      JSON.stringify({
        type: 'row',
        width: 75,
        content: [
          { type: 'component', componentName: 'editor' },
          { type: 'component', componentName: 'preview' },
        ],
      }),
      'item.json',
    );

    migrate(filePath, ['--from', 'v1']);
    const migrated = JSON.parse(readFileSync(filePath, 'utf8')) as {
      type: string;
      size: string;
      content: Array<{ componentType: string }>;
    };

    expect(migrated.type).toBe('row');
    expect(migrated.size).toBe('75%');
    expect(migrated.content.map((item) => item.componentType)).toEqual([
      'editor',
      'preview',
    ]);
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
