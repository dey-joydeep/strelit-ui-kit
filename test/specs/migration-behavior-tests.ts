import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ComponentContainer,
  ComponentItem,
  createLayoutConfigFromResolved,
  LayoutConfig,
  SerializableValue,
  StrelitLayout,
} from '../../src';

interface JsonMigrationResult {
  transformed: string;
  manualReviews: string[];
}

interface MigrationModule {
  transformJsonContent(
    content: string,
    sourceVersion: 'v1' | 'v2' | 'auto',
  ): JsonMigrationResult;
}

const require = createRequire(import.meta.url);
const migrationModule =
  require('../../scripts/migrate-golden-layout-to-strelit.js') as MigrationModule;
const fixturePath = resolve(
  process.cwd(),
  'test/migration-fixtures/v1-layout.json',
);

describe('migrated layout behavior', () => {
  const layouts: StrelitLayout[] = [];

  afterEach(() => {
    for (const layout of layouts) {
      layout.destroy();
    }
  });

  it('loads and round-trips a migrated v1 layout without losing behavior', () => {
    const source = readFileSync(fixturePath, 'utf8');
    const migration = migrationModule.transformJsonContent(source, 'v1');
    expect(migration.manualReviews).toEqual([]);

    const config = JSON.parse(migration.transformed) as LayoutConfig;
    let initialState: SerializableValue | undefined;
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction(
      'editor',
      (
        _container: ComponentContainer,
        state: SerializableValue | undefined,
      ) => {
        initialState = state;
      },
    );
    layout.loadLayout(config);

    expect(initialState).toEqual({ text: 'hello' });
    expect(layout.rootItem?.isStack).toBe(true);
    const editorItem = layout.rootItem?.contentItems[0];
    expect((editorItem as ComponentItem | undefined)?.title).toBe('Editor');
    expect(layout.rootItem?.contentItems[0].id).toBe('editor-pane');
    expect(layout.maximisedStack).toBe(layout.rootItem);

    const saved = layout.saveLayout();
    const reloaded = new StrelitLayout();
    layouts.push(reloaded);
    reloaded.registerComponentFactoryFunction('editor', () => undefined);
    reloaded.loadLayout(createLayoutConfigFromResolved(saved));

    expect(reloaded.saveLayout()).toEqual(saved);
  });
});
