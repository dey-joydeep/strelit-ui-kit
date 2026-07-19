const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/**
 * Reproducible compatibility inventory generator. See
 * docs/architecture/compatibility-audit-maintenance.md before changing
 * mappings or refreshing tracked snapshots.
 */

const repoRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.dirname(repoRoot);
const v2Repo = path.join(workspaceRoot, 'golden-layout');
const v1Bundle = path.join(
  workspaceRoot,
  'golden-layout-v1.5.9',
  'goldenlayout.js',
);
const outputDirectory = path.join(
  repoRoot,
  'docs',
  'architecture',
  'generated',
);
const baselineCommit = 'f442a2d';

const apiOutputPath = path.join(outputDirectory, 'v2-api-disposition.json');
const v1OutputPath = path.join(outputDirectory, 'v1-api-disposition.json');
const testOutputPath = path.join(outputDirectory, 'v2-test-disposition.json');

const topLevelRenames = new Map([
  ['GoldenLayout', 'StrelitLayout'],
  ['JsonValue', 'SerializableValue'],
  ['SizeUnitEnum', 'SizeUnit'],
  ['Json', 'SerializableObject'],
  ['JsonValueArray', 'SerializableValueArray'],
]);

const qualifiedRenames = new Map([
  ['BrowserPopout.getGlInstance', 'BrowserPopout.getStrelitInstance'],
  ['EventEmitter.ALL_EVENT', 'eventEmitterAllEventName'],
  ['EventEmitter.headerClickEventName', 'eventEmitterHeaderClickEventName'],
  [
    'EventEmitter.headerTouchStartEventName',
    'eventEmitterHeaderTouchStartEventName',
  ],
  ['I18nStrings.idCount', 'i18nStringCount'],
  [
    'LayoutManager.afterFocusedItemIfPossibleLocationSelectors',
    'layoutManagerAfterFocusedItemIfPossibleLocationSelectors',
  ],
  [
    'LayoutManager.defaultLocationSelectors',
    'layoutManagerDefaultLocationSelectors',
  ],
  ['LayoutConfig.resolve', 'resolveLayoutConfig'],
  ['LayoutConfig.fromResolved', 'createLayoutConfigFromResolved'],
  ['LayoutConfig.Labels', 'LayoutConfigHeader'],
  [
    'DragSource.ComponentItemConfig.state',
    'ComponentItemConfig.componentState',
  ],
  ['DragSource.ComponentItemConfig.title', 'ComponentItemConfig.title'],
  ['DragSource.ComponentItemConfig.type', 'ComponentItemConfig.componentType'],
  ['ResolvedLayoutConfig.createDefault', 'createResolvedLayoutConfigDefault'],
  ['ResolvedLayoutConfig.createCopy', 'createResolvedLayoutConfigCopy'],
  ['ResolvedLayoutConfig.minifyConfig', 'minifyResolvedLayoutConfig'],
  ['ResolvedLayoutConfig.unminifyConfig', 'unminifyResolvedLayoutConfig'],
  [
    'ResolvedComponentItemConfig.resolveComponentTypeName',
    'resolveComponentTypeName',
  ],
  ['LayoutManager.toConfig', 'LayoutManager.saveLayout'],
  ['LayoutManager.updateSize', 'LayoutManager.setSize'],
  [
    'ResolvedComponentItemConfig.defaultReorderEnabled',
    'resolvedComponentItemConfigDefaultReorderEnabled',
  ],
  [
    'ResolvedHeaderedItemConfig.defaultMaximised',
    'resolvedHeaderedItemConfigDefaultMaximised',
  ],
  ['ResolvedItemConfig.defaults', 'resolvedItemConfigDefaults'],
  [
    'ResolvedLayoutConfig.Dimensions.defaults',
    'resolvedLayoutConfigDimensionsDefaults',
  ],
  [
    'ResolvedLayoutConfig.Header.defaults',
    'resolvedLayoutConfigHeaderDefaults',
  ],
  [
    'ResolvedLayoutConfig.Settings.defaults',
    'resolvedLayoutConfigSettingsDefaults',
  ],
  [
    'ResolvedPopoutLayoutConfig.Window.defaults',
    'resolvedPopoutLayoutConfigWindowDefaults',
  ],
  [
    'ResolvedStackItemConfig.defaultActiveItemIndex',
    'resolvedStackItemConfigDefaultActiveItemIndex',
  ],
  ['SizeUnitEnum.tryParse', 'tryParseSizeUnit'],
  ['SizeUnitEnum.format', 'formatSizeUnit'],
  ['ComponentContainer.getElement', 'ComponentContainer.element'],
  ['Stack.getActiveContentItem', 'Stack.getActiveComponentItem'],
  ['Stack.setActiveContentItem', 'Stack.setActiveComponentItem'],
  ['ComponentItemConfig.componentTypeToTitle', 'componentTypeToTitle'],
  ['EventEmitter.ClickBubblingEvent', 'ClickBubblingEvent'],
  ['EventEmitter.TouchStartBubblingEvent', 'TouchStartBubblingEvent'],
  [
    'GoldenLayout.GetComponentConstructorCallback',
    'VirtualLayoutBindComponentEventHandler',
  ],
  [
    'GoldenLayout.registerGetComponentConstructorCallback',
    'VirtualLayout.constructor',
  ],
  ['GoldenLayout.VirtuableComponent', 'StrelitLayoutVirtualComponent'],
  [
    'I18nStringId.ComponentIsNotVirtuable',
    'I18nStringId.ComponentIsNotVirtual',
  ],
  ['I18nStrings', 'i18nStrings'],
  ['I18nStrings.checkInitialise', 'checkI18nStringsInitialise'],
  ['ItemConfig.isColumn', 'isColumnItemConfig'],
  ['ItemConfig.isComponent', 'isComponentItemConfig'],
  ['ItemConfig.isGround', 'isGroundItemConfig'],
  ['ItemConfig.isRow', 'isRowItemConfig'],
  ['ItemConfig.isStack', 'isStackItemConfig'],
  ['JsonValue.isJson', 'isSerializableValue'],
  ['JsonValue.isJsonObject', 'isSerializableObject'],
  ['LayoutConfig.isPopout', 'isPopoutLayoutConfig'],
  ['LayoutConfig.isResolved', 'isResolvedLayoutConfig'],
  ['ResolvedItemConfig.isComponentItem', 'isResolvedComponentItemConfig'],
  ['ResolvedItemConfig.isStackItem', 'isResolvedStackItemConfig'],
  ['ResolvedLayoutConfig.copyOpenPopouts', 'createResolvedOpenPopoutsCopy'],
  ['ResolvedLayoutConfig.isPopout', 'isResolvedPopoutLayoutConfig'],
  ['ResolvedRootItemConfig.isRootItemConfig', 'isResolvedRootItemConfig'],
  [
    'ResolvedRowOrColumnItemConfig.isChildItemConfig',
    'isResolvedRowOrColumnItemConfigChild',
  ],
  ['RootItemConfig.isRootItemConfig', 'isRootItemConfig'],
  ['RowOrColumnItemConfig.isChildItemConfig', 'isRowOrColumnItemConfigChild'],
  [
    'VirtualLayout.BeforeVirtualRectingEvent',
    'LayoutManagerBeforeVirtualRectingEvent',
  ],
]);

const flattenedPrefixes = new Map([
  ['DragSource.ComponentItemConfig', 'ComponentItemConfig'],
  ['LayoutConfig.Settings', 'LayoutConfigSettings'],
  ['LayoutConfig.Dimensions', 'LayoutConfigDimensions'],
  ['LayoutConfig.Header', 'LayoutConfigHeader'],
  ['ResolvedLayoutConfig.Settings', 'ResolvedLayoutConfigSettings'],
  ['ResolvedLayoutConfig.Dimensions', 'ResolvedLayoutConfigDimensions'],
  ['ResolvedLayoutConfig.Header', 'ResolvedLayoutConfigHeader'],
  ['ResolvedPopoutLayoutConfig.Window', 'ResolvedPopoutLayoutConfigWindow'],
  ['ComponentContainer.Component', 'ComponentContainerComponent'],
  [
    'ComponentContainer.BindableComponent',
    'ComponentContainerBindableComponent',
  ],
  ['EventEmitter.UnknownParams', 'EventEmitterUnknownParams'],
  ['EventEmitter.BubblingEvent', 'EventEmitterBubblingEvent'],
  ['LayoutManager.Location', 'LayoutManagerLocation'],
  ['LayoutManager.LocationSelector', 'LayoutManagerLocationSelector'],
  ['LayoutManager.ConstructorParameters', 'LayoutManagerConstructorParameters'],
]);

const testFileTargets = new Map([
  ['component-state-save-tests.js', 'component-state-save-tests.ts'],
  ['create-config.tests.js', 'create-config-tests.ts'],
  ['create-from-config-tests.js', 'create-from-config-tests.ts'],
  ['disabled-selection-tests.js', 'component-focus-tests.ts'],
  ['enabled-selection-tests.js', 'component-focus-tests.ts'],
  ['event-bubble-tests.js', 'event-bubble-tests.ts'],
  ['item-creation-events-tests.js', 'component-creation-events-tests.ts'],
  ['minifier-tests.js', 'minifier-tests.ts'],
  ['popout-tests.js', 'popout-tests.ts'],
  ['selector-tests.js', 'query-helpers-tests.ts'],
  ['tab-tests.js', 'tab-tests.ts'],
  ['title-tests.js', 'title-tests.ts'],
  ['tree-manipulation-tests.js', 'tree-manipulation-tests.ts'],
  ['xss_tests.js', 'title-tests.ts'],
  ['component-creation-events-tests.ts', 'component-creation-events-tests.ts'],
  ['drag-tests.ts', 'drag-tests.ts'],
  ['empty-stack-tests.ts', 'empty-stack-tests.ts'],
  ['event-emitter-tests.ts', 'event-emitter-tests.ts'],
  ['ground-item-tests.ts', 'ground-item-tests.ts'],
  ['query-helpers-tests.ts', 'query-helpers-tests.ts'],
]);

/** Parses validate, check, and intentional snapshot-write modes. */
function parseArguments() {
  const check = process.argv.includes('--check');
  const validate = process.argv.includes('--validate');
  const write = process.argv.includes('--write') || (!check && !validate);
  return { check, validate, write };
}

function git(...args) {
  return execFileSync('git', ['-C', v2Repo, ...args], { encoding: 'utf8' });
}

function releaseMetadata(node, sourceFile) {
  const trivia = sourceFile.text.slice(
    node.getFullStart(),
    node.getStart(sourceFile),
  );
  return {
    releaseTag: /@internal/.test(trivia)
      ? 'internal'
      : /@public/.test(trivia)
        ? 'public'
        : /@beta/.test(trivia)
          ? 'beta'
          : /@alpha/.test(trivia)
            ? 'alpha'
            : 'unspecified',
    deprecated: /@deprecated/.test(trivia),
  };
}

function declarationName(node, sourceFile) {
  if (node.name === undefined) {
    return ts.isConstructorDeclaration(node) ? 'constructor' : undefined;
  }
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) {
    return node.name.text;
  }
  return node.name.getText(sourceFile);
}

function declarationKind(node) {
  return ts.SyntaxKind[node.kind];
}

/** Collects the externally relevant declarations from an API Extractor report. */
function collectApiSurface(report) {
  const match = /```ts\s*([\s\S]*?)```/.exec(report);
  if (match === null) {
    throw new Error('API report does not contain a TypeScript code block');
  }
  const sourceFile = ts.createSourceFile(
    'api-report.d.ts',
    match[1],
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const entries = new Map();

  function add(node, qualifiedName, inheritedReleaseTag) {
    const metadata = releaseMetadata(node, sourceFile);
    if (
      metadata.releaseTag === 'unspecified' &&
      inheritedReleaseTag !== undefined
    ) {
      metadata.releaseTag = inheritedReleaseTag;
    }
    const previous = entries.get(qualifiedName);
    entries.set(qualifiedName, {
      symbol: qualifiedName,
      kind: declarationKind(node),
      releaseTag:
        previous?.releaseTag === 'public' ? 'public' : metadata.releaseTag,
      deprecated: previous?.deprecated === true || metadata.deprecated,
      overloads: (previous?.overloads ?? 0) + 1,
    });
  }

  function visitDeclaration(node, prefix, inheritedReleaseTag) {
    if (ts.isVariableStatement(node)) {
      const metadata = releaseMetadata(node, sourceFile);
      const releaseTag =
        metadata.releaseTag === 'unspecified'
          ? inheritedReleaseTag
          : metadata.releaseTag;
      for (const declaration of node.declarationList.declarations) {
        visitDeclaration(declaration, prefix, releaseTag);
      }
      return;
    }
    const name = declarationName(node, sourceFile);
    if (name === undefined) {
      return;
    }
    const qualifiedName = prefix === '' ? name : `${prefix}.${name}`;
    add(node, qualifiedName, inheritedReleaseTag);
    const releaseTag = entries.get(qualifiedName).releaseTag;

    if (
      ts.isVariableDeclaration(node) &&
      node.type !== undefined &&
      ts.isTypeLiteralNode(node.type)
    ) {
      for (const member of node.type.members) {
        visitDeclaration(member, qualifiedName, releaseTag);
      }
    }
    if (node.members !== undefined) {
      for (const member of node.members) {
        visitDeclaration(member, qualifiedName, releaseTag);
      }
    }
    if (ts.isModuleDeclaration(node) && node.body !== undefined) {
      if (ts.isModuleBlock(node.body)) {
        for (const statement of node.body.statements) {
          visitDeclaration(statement, qualifiedName, releaseTag);
        }
      } else {
        visitDeclaration(node.body, qualifiedName, releaseTag);
      }
    }
  }

  for (const statement of sourceFile.statements) {
    visitDeclaration(statement, '', undefined);
  }
  return entries;
}

/** Maps a baseline qualified symbol to its Strelit module-level target. */
function mapQualifiedSymbol(symbol) {
  const exact = qualifiedRenames.get(symbol);
  if (exact !== undefined) {
    return exact;
  }
  for (const [sourcePrefix, targetPrefix] of qualifiedRenames) {
    if (symbol.startsWith(`${sourcePrefix}.`)) {
      return `${targetPrefix}${symbol.slice(sourcePrefix.length)}`;
    }
  }
  for (const [sourcePrefix, targetPrefix] of flattenedPrefixes) {
    if (symbol === sourcePrefix || symbol.startsWith(`${sourcePrefix}.`)) {
      return `${targetPrefix}${symbol.slice(sourcePrefix.length)}`;
    }
  }
  const [topLevel, ...rest] = symbol.split('.');
  const renamedTopLevel = topLevelRenames.get(topLevel) ?? topLevel;
  return [renamedTopLevel, ...rest].join('.');
}

/** Resolves a proposed mapping against the current public declaration set. */
function findCurrentTarget(mappedTarget, current) {
  if (current.has(mappedTarget)) {
    return mappedTarget;
  }

  const parts = mappedTarget.split('.');
  for (let prefixLength = 2; prefixLength <= parts.length; prefixLength++) {
    const flattened = parts.slice(0, prefixLength).join('');
    const candidate = [flattened, ...parts.slice(prefixLength)].join('.');
    if (current.has(candidate)) {
      return candidate;
    }
  }

  if (parts.length >= 2) {
    const method = parts.at(-1);
    const owner = parts.slice(0, -1).join('');
    const functionCandidates = [];
    if (method === 'resolve') {
      functionCandidates.push(`resolve${owner}`);
    } else if (method === 'createCopy') {
      functionCandidates.push(`create${owner}Copy`);
    } else if (method === 'createDefault') {
      functionCandidates.push(`create${owner}Default`);
    } else if (method === 'copyContent') {
      functionCandidates.push(`create${owner}ContentCopy`);
    } else if (method === 'copyComponentType') {
      functionCandidates.push('createComponentTypeCopy');
    }
    const match = functionCandidates.find((candidate) =>
      current.has(candidate),
    );
    if (match !== undefined) {
      return match;
    }
  }

  return undefined;
}

/** Builds a complete disposition for every Golden Layout v2 declaration. */
function createApiDisposition(baseline, current) {
  return [...baseline.values()]
    .sort((left, right) => left.symbol.localeCompare(right.symbol))
    .map((entry) => {
      const mappedTarget = mapQualifiedSymbol(entry.symbol);
      const target = findCurrentTarget(mappedTarget, current);
      if (target !== undefined) {
        return { ...entry, disposition: 'preserved-or-renamed', target };
      }
      if (entry.releaseTag === 'internal') {
        return {
          ...entry,
          disposition: 'removed-internal',
          target: null,
          rationale:
            'Internal implementation is not part of the Strelit extension contract.',
        };
      }
      if (entry.deprecated) {
        return {
          ...entry,
          disposition: 'removed-with-migration',
          target: mappedTarget,
          rationale:
            'Deprecated source form is handled by the migrator or a blocking diagnostic.',
        };
      }
      return {
        ...entry,
        disposition: 'manual-migration',
        target: mappedTarget,
        rationale:
          'No safe one-to-one declaration exists; migration documentation or diagnostics define the outcome.',
      };
    });
}

function extractBalancedObject(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Could not find v1 marker: ${marker}`);
  }
  const start = source.indexOf('{', markerIndex);
  let depth = 0;
  let quote;
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if (character === '{') {
      depth++;
    } else if (character === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error('Unterminated v1 LayoutManager prototype object');
}

/** Records decisions for selected useful or intentionally rejected v1 features. */
function createV1Disposition() {
  const source = fs.readFileSync(v1Bundle, 'utf8');
  const prototypeObject = extractBalancedObject(
    source,
    'lm.utils.copy( lm.LayoutManager.prototype,',
  );
  const methods = [
    ...prototypeObject.matchAll(
      /(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*:\s*function\b/g,
    ),
  ]
    .map((match) => match[1])
    .filter((name) => !name.startsWith('_'));
  const targetMap = new Map([
    [
      'registerComponent',
      'StrelitLayout.registerComponentConstructor or registerComponentFactoryFunction',
    ],
    ['init', 'StrelitLayout constructor initialization'],
    ['toConfig', 'LayoutManager.saveLayout'],
    ['updateSize', 'LayoutManager.setSize'],
    ['createDragSource', 'LayoutManager.newDragSource'],
    ['selectItem', 'component focus API'],
  ]);
  return [...new Set(methods)]
    .sort((left, right) => left.localeCompare(right))
    .map((method) => ({
      symbol: `GoldenLayout.${method}`,
      disposition: targetMap.has(method)
        ? 'migrated-or-redesigned'
        : 'preserved-behavior',
      target: targetMap.get(method) ?? `StrelitLayout.${method}`,
    }))
    .concat([
      {
        symbol: 'GoldenLayout.__lm',
        disposition: 'removed-internal',
        target: null,
        rationale:
          'Unrestricted internal class exposure is intentionally unsupported.',
      },
      {
        symbol: "type: 'react-component'",
        disposition: 'manual-migration',
        target: 'modern framework adapter over virtual components',
        rationale:
          'The v1 global React integration is unsafe and cannot be transformed without application framework context.',
      },
      {
        symbol: 'nested stack content',
        disposition: 'manual-migration',
        target: 'composite workspace or nested StrelitLayout boundary',
        rationale:
          'Raw nested stacks have ambiguous focus, drag, and persistence semantics.',
      },
    ]);
}

function extractTestCases(source) {
  return [...source.matchAll(/\b(x?it)\s*\(\s*(['"])(.*?)\2/g)].map(
    (match) => ({ title: match[3], disabled: match[1] === 'xit' }),
  );
}

/** Maps every baseline test case to current coverage or an explicit decision. */
function createTestDisposition() {
  const files = git('ls-tree', '-r', '--name-only', baselineCommit, 'test')
    .split(/\r?\n/)
    .filter((file) =>
      /test\/specs\/.*\.ts$|test\/disabled\/.*\.js$/.test(file),
    );
  const currentTests = new Set(
    fs.readdirSync(path.join(repoRoot, 'test', 'specs')),
  );
  const entries = [];

  for (const file of files) {
    const fileName = path.basename(file);
    const source = git('show', `${baselineCommit}:${file}`);
    const cases = extractTestCases(source);
    if (cases.length === 0) {
      continue;
    }
    const targetFile = testFileTargets.get(fileName);
    if (targetFile === undefined || !currentTests.has(targetFile)) {
      throw new Error(`No current test disposition target for ${file}`);
    }
    for (const testCase of cases) {
      entries.push({
        source: file,
        title: testCase.title,
        baselineStatus:
          file.includes('/disabled/') || testCase.disabled
            ? 'disabled'
            : 'active',
        disposition:
          fileName === 'xss_tests.js'
            ? 'replaced-by-safe-native-rendering-test'
            : fileName.includes('selection-tests')
              ? 'replaced-by-focus-model-test'
              : 'ported-or-consolidated',
        target: `test/specs/${targetFile}`,
      });
    }
  }
  return entries;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Writes an intentional refresh or fails when a tracked snapshot is stale. */
function writeOrCheck(filePath, content, options) {
  if (options.check) {
    if (
      !fs.existsSync(filePath) ||
      fs.readFileSync(filePath, 'utf8') !== content
    ) {
      throw new Error(
        `Compatibility audit output is stale: ${path.relative(repoRoot, filePath)}`,
      );
    }
  }
  if (options.write) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}

function readSnapshot(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Compatibility audit snapshot is missing: ${path.relative(repoRoot, filePath)}`,
    );
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Validates committed inventory provenance, completeness, and current targets. */
function validateSnapshots() {
  const apiSnapshot = readSnapshot(apiOutputPath);
  const v1Snapshot = readSnapshot(v1OutputPath);
  const testSnapshot = readSnapshot(testOutputPath);
  const allowedApiDispositions = new Set([
    'preserved-or-renamed',
    'removed-internal',
    'removed-with-migration',
    'manual-migration',
  ]);
  const allowedV1Dispositions = new Set([
    'migrated-or-redesigned',
    'preserved-behavior',
    'removed-internal',
    'manual-migration',
  ]);

  if (apiSnapshot.baselineCommit !== baselineCommit) {
    throw new Error(
      'The v2 API snapshot does not identify the audited baseline.',
    );
  }
  if (v1Snapshot.baselineVersion !== '1.5.9') {
    throw new Error('The v1 API snapshot does not identify version 1.5.9.');
  }
  if (testSnapshot.baselineCommit !== baselineCommit) {
    throw new Error(
      'The v2 test snapshot does not identify the audited baseline.',
    );
  }

  const apiSymbols = new Set();
  for (const entry of apiSnapshot.entries) {
    if (apiSymbols.has(entry.symbol)) {
      throw new Error(`Duplicate v2 API disposition: ${entry.symbol}`);
    }
    apiSymbols.add(entry.symbol);
    if (!allowedApiDispositions.has(entry.disposition)) {
      throw new Error(`Invalid v2 API disposition: ${entry.symbol}`);
    }
    if (entry.disposition === 'preserved-or-renamed' && !entry.target) {
      throw new Error(`Preserved v2 API symbol has no target: ${entry.symbol}`);
    }
    if (
      entry.disposition !== 'preserved-or-renamed' &&
      typeof entry.rationale !== 'string'
    ) {
      throw new Error(
        `Removed v2 API symbol has no rationale: ${entry.symbol}`,
      );
    }
  }

  for (const entry of v1Snapshot.entries) {
    if (!allowedV1Dispositions.has(entry.disposition)) {
      throw new Error(`Invalid v1 API disposition: ${entry.symbol}`);
    }
    if (entry.target === null && typeof entry.rationale !== 'string') {
      throw new Error(
        `Removed v1 API symbol has no rationale: ${entry.symbol}`,
      );
    }
  }

  for (const entry of testSnapshot.entries) {
    const target = path.join(repoRoot, entry.target);
    if (!fs.existsSync(target)) {
      throw new Error(`Mapped v2 test target does not exist: ${entry.target}`);
    }
  }

  if (
    apiSnapshot.entries.length < 800 ||
    v1Snapshot.entries.length < 10 ||
    testSnapshot.entries.length !== 80
  ) {
    throw new Error(
      'Compatibility audit snapshots are unexpectedly incomplete.',
    );
  }

  console.log(
    `Validated ${apiSnapshot.entries.length} v2 API symbols, ${v1Snapshot.entries.length} v1 entry points, and ${testSnapshot.entries.length} v2 tests.`,
  );
}

/** Generates or validates all compatibility inventories for the selected mode. */
function main() {
  const options = parseArguments();
  if (options.validate) {
    validateSnapshots();
    return;
  }
  const baselineReport = git(
    'show',
    `${baselineCommit}:etc/golden-layout.api.md`,
  );
  const currentReport = fs.readFileSync(
    path.join(repoRoot, 'etc', 'strelit-ui-kit.api.md'),
    'utf8',
  );
  const baselineApi = collectApiSurface(baselineReport);
  const currentApi = collectApiSurface(currentReport);
  const apiDisposition = createApiDisposition(baselineApi, currentApi);
  const v1Disposition = createV1Disposition();
  const testDisposition = createTestDisposition();

  writeOrCheck(
    apiOutputPath,
    serialize({ baselineCommit, entries: apiDisposition }),
    options,
  );
  writeOrCheck(
    v1OutputPath,
    serialize({ baselineVersion: '1.5.9', entries: v1Disposition }),
    options,
  );
  writeOrCheck(
    testOutputPath,
    serialize({ baselineCommit, entries: testDisposition }),
    options,
  );

  console.log(
    `Audited ${apiDisposition.length} v2 API symbols, ${v1Disposition.length} v1 entry points, and ${testDisposition.length} v2 tests.`,
  );
}

main();
