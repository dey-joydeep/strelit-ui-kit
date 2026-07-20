const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/**
 * Consumer migration CLI. Transformations are intentionally kept in this
 * executable so tests exercise the same parsing, discovery, and write path as
 * customers. See docs/migration/migration-tool-maintenance.md.
 */

const usage = `Usage:
  npm run migrate:golden-layout -- --target <path> [--from auto|v1|v2] [--dry-run]
  npm run migrate:golden-layout -- --target <path> [--from auto|v1|v2] --write

Options:
  --target <path>   Required target directory or file to migrate
  --from <version>  Saved-layout source: auto (default), v1, or v2
  --dry-run         Show planned changes without writing files (default)
  --write           Apply changes in place
`;

const textFileExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.less',
  '.html',
]);

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  '.generated-docs',
  'temp',
  'lib',
  '.verification',
]);

const sourceFileExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

const sourceIdentifierReplacements = new Map([
  ['GoldenLayout', 'StrelitLayout'],
  ['ItemContainer', 'ComponentContainer'],
  ['AbstractContentItem', 'ContentItem'],
  ['SizeUnitEnum', 'SizeUnit'],
  ['JsonValue', 'SerializableValue'],
  ['Json', 'SerializableObject'],
  ['JsonValueArray', 'SerializableValueArray'],
]);

const dottedApiReplacements = new Map([
  ['LayoutConfig.resolve', 'resolveLayoutConfig'],
  ['LayoutConfig.fromResolved', 'createLayoutConfigFromResolved'],
  ['ResolvedLayoutConfig.createDefault', 'createResolvedLayoutConfigDefault'],
  ['ResolvedLayoutConfig.createCopy', 'createResolvedLayoutConfigCopy'],
  ['ResolvedLayoutConfig.minifyConfig', 'minifyResolvedLayoutConfig'],
  ['ResolvedLayoutConfig.unminifyConfig', 'unminifyResolvedLayoutConfig'],
  [
    'ResolvedComponentItemConfig.resolveComponentTypeName',
    'resolveComponentTypeName',
  ],
  ['ComponentItemConfig.componentTypeToTitle', 'componentTypeToTitle'],
  ['ItemConfig.isColumn', 'isColumnItemConfig'],
  ['ItemConfig.isComponent', 'isComponentItemConfig'],
  ['ItemConfig.isGround', 'isGroundItemConfig'],
  ['ItemConfig.isRow', 'isRowItemConfig'],
  ['ItemConfig.isStack', 'isStackItemConfig'],
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
  ['JsonValue.isJson', 'isSerializableValue'],
  ['JsonValue.isJsonObject', 'isSerializableObject'],
  ['SizeUnitEnum.tryParse', 'tryParseSizeUnit'],
  ['SizeUnitEnum.format', 'formatSizeUnit'],
  ['SizeUnit.tryParse', 'tryParseSizeUnit'],
  ['SizeUnit.format', 'formatSizeUnit'],
]);

const nestedTypeReplacements = new Map([
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
  [
    'ComponentContainer.StateRequestEventHandler',
    'ComponentContainerStateRequestEventHandler',
  ],
  [
    'ComponentContainer.VirtualRectingRequiredEvent',
    'ComponentContainerVirtualRectingRequiredEvent',
  ],
  [
    'ComponentContainer.VirtualVisibilityChangeRequiredEvent',
    'ComponentContainerVirtualVisibilityChangeRequiredEvent',
  ],
  [
    'ComponentContainer.VirtualZIndexChangeRequiredEvent',
    'ComponentContainerVirtualZIndexChangeRequiredEvent',
  ],
  ['ComponentItem.Component', 'ComponentItemComponent'],
  ['EventEmitter.ClickBubblingEvent', 'ClickBubblingEvent'],
  ['EventEmitter.TouchStartBubblingEvent', 'TouchStartBubblingEvent'],
  ['EventEmitter.UnknownParams', 'EventEmitterUnknownParams'],
  ['EventEmitter.BubblingEvent', 'EventEmitterBubblingEvent'],
  ['LayoutManager.Location', 'LayoutManagerLocation'],
  ['LayoutManager.LocationSelector', 'LayoutManagerLocationSelector'],
  ['LayoutManager.ConstructorParameters', 'LayoutManagerConstructorParameters'],
  ['GoldenLayout.ComponentConstructor', 'StrelitLayoutComponentConstructor'],
  [
    'GoldenLayout.ComponentFactoryFunction',
    'StrelitLayoutComponentFactoryFunction',
  ],
  ['GoldenLayout.ComponentInstantiator', 'StrelitLayoutComponentInstantiator'],
  ['GoldenLayout.VirtuableComponent', 'StrelitLayoutVirtualComponent'],
  [
    'VirtualLayout.BeforeVirtualRectingEvent',
    'LayoutManagerBeforeVirtualRectingEvent',
  ],
]);

const receiverTypeKinds = new Map([
  ['GoldenLayout', 'layout'],
  ['StrelitLayout', 'layout'],
  ['LayoutManager', 'layout'],
  ['ItemContainer', 'container'],
  ['ComponentContainer', 'container'],
  ['Stack', 'stack'],
  ['BrowserPopout', 'popout'],
]);

const receiverMethodReplacements = new Map([
  ['layout.toConfig', { name: 'saveLayout' }],
  ['layout.updateSize', { name: 'setSize' }],
  ['container.getElement', { name: 'element', property: true }],
  ['stack.getActiveContentItem', { name: 'getActiveComponentItem' }],
  ['stack.setActiveContentItem', { name: 'setActiveComponentItem' }],
]);

const receiverDependentMethodNames = new Set([
  'toConfig',
  'updateSize',
  'getElement',
  'getActiveContentItem',
  'setActiveContentItem',
]);

const replacements = [
  {
    name: 'mixed default and named import',
    pattern:
      /import\s+([A-Za-z_$][\w$]*)\s*,\s*\{([^}]*)\}\s+from\s+(['"])golden-layout\3/g,
    replacement: (_match, localName, bindings) =>
      localName === 'GoldenLayout'
        ? `import { StrelitLayout, ${bindings} } from 'strelit-ui-kit'`
        : `import { StrelitLayout as ${localName}, ${bindings} } from 'strelit-ui-kit'`,
  },
  {
    name: 'default import',
    pattern: /import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])golden-layout\2/g,
    replacement: (_match, localName) =>
      localName === 'GoldenLayout'
        ? "import { StrelitLayout } from 'strelit-ui-kit'"
        : `import { StrelitLayout as ${localName} } from 'strelit-ui-kit'`,
  },
  {
    name: 'commonjs require',
    pattern:
      /const\s+([A-Za-z_$][\w$]*)\s*=\s*require\((['"])golden-layout\2\)/g,
    replacement: "const { StrelitLayout: $1 } = require('strelit-ui-kit')",
  },
  {
    name: 'css subpath import',
    pattern:
      /(['"])golden-layout\/(?:dist|src)\/css\/((?:themes\/)?goldenlayout(?:-([a-z-]+)-theme|-base)\.css)([?#][^'"]*)?\1/g,
    replacement: (_match, quote, fileName, themeName, suffix = '') => {
      if (themeName !== undefined) {
        return `${quote}strelit-ui-kit/dist/css/themes/strelit-${themeName}-theme.css${suffix}${quote}`;
      }

      if (fileName === 'goldenlayout-base.css') {
        return `${quote}strelit-ui-kit/dist/css/strelit-base.css${suffix}${quote}`;
      }

      return `${quote}strelit-ui-kit/dist/css/${fileName}${suffix}${quote}`;
    },
  },
  {
    name: 'less subpath import',
    pattern:
      /(['"])golden-layout\/(?:dist|src)\/less\/((?:themes\/)?goldenlayout(?:-([a-z-]+)-theme|-base)\.less)([?#][^'"]*)?\1/g,
    replacement: (_match, quote, fileName, themeName, suffix = '') => {
      if (themeName !== undefined) {
        return `${quote}strelit-ui-kit/dist/less/themes/strelit-${themeName}-theme.less${suffix}${quote}`;
      }

      if (fileName === 'goldenlayout-base.less') {
        return `${quote}strelit-ui-kit/dist/less/strelit-base.less${suffix}${quote}`;
      }

      return `${quote}strelit-ui-kit/dist/less/${fileName}${suffix}${quote}`;
    },
  },
  {
    name: 'scss subpath import',
    pattern:
      /(['"])golden-layout\/(?:dist|src)\/scss\/((?:themes\/)?goldenlayout(?:-([a-z-]+)-theme|-base)\.scss)([?#][^'"]*)?\1/g,
    replacement: (_match, quote, fileName, themeName, suffix = '') => {
      if (themeName !== undefined || fileName.includes('-theme.scss')) {
        // Leave SCSS theme imports for manual review since only _strelit-var-theme.scss exists
        return _match;
      }

      if (fileName === 'goldenlayout-base.scss') {
        return `${quote}strelit-ui-kit/dist/scss/strelit-base.scss${suffix}${quote}`;
      }

      return `${quote}strelit-ui-kit/dist/scss/${fileName}${suffix}${quote}`;
    },
  },
  {
    name: 'package import',
    pattern: /(['"])golden-layout((?:\/[^'"]+)?)\1/g,
    replacement: (_match, quote, subpath) => {
      if (subpath) {
        if (
          subpath.includes('/scss/themes/') ||
          subpath.includes('/src/scss/themes/') ||
          subpath.includes('/dist/scss/themes/') ||
          (subpath.includes('/scss/') &&
            /\/?_?goldenlayout-[^/?#]+-theme\.scss(?:[?#].*)?$/.test(subpath))
        ) {
          return _match;
        }
        if (
          /^\/(?:dist\/(?:esm|cjs|browser|index)|index|src)\/?.*\.m?js(?:[?#].*)?$/.test(
            subpath,
          ) ||
          subpath === '/dist/index.js' ||
          subpath === '/index.js'
        ) {
          return `${quote}strelit-ui-kit${quote}`;
        }
        if (subpath.startsWith('/src/css/')) {
          const fileName = subpath.split('/').pop();
          if (fileName === 'goldenlayout-base.css' || fileName === 'base.css') {
            return `${quote}strelit-ui-kit/dist/css/strelit-base.css${quote}`;
          }
          if (fileName && fileName.includes('-theme')) {
            const themeName = fileName
              .replace(/^goldenlayout-/, '')
              .replace(/-theme\.css$/, '');
            return `${quote}strelit-ui-kit/dist/css/themes/strelit-${themeName}-theme.css${quote}`;
          }
          return `${quote}strelit-ui-kit/dist/css/${fileName}${quote}`;
        }
      }
      return `${quote}strelit-ui-kit${subpath}${quote}`;
    },
  },
  {
    name: 'main class',
    pattern: /\bGoldenLayout\b/g,
    replacement: 'StrelitLayout',
  },
  {
    name: 'layout config resolver',
    pattern: /\bLayoutConfig\.resolve\b/g,
    replacement: 'resolveLayoutConfig',
    importName: 'resolveLayoutConfig',
  },
  {
    name: 'layout config serializer',
    pattern: /\bLayoutConfig\.fromResolved\b/g,
    replacement: 'createLayoutConfigFromResolved',
    importName: 'createLayoutConfigFromResolved',
  },
  {
    name: 'resolved config factory',
    pattern: /\bResolvedLayoutConfig\.createDefault\b/g,
    replacement: 'createResolvedLayoutConfigDefault',
    importName: 'createResolvedLayoutConfigDefault',
  },
  {
    name: 'resolved config copier',
    pattern: /\bResolvedLayoutConfig\.createCopy\b/g,
    replacement: 'createResolvedLayoutConfigCopy',
    importName: 'createResolvedLayoutConfigCopy',
  },
  {
    name: 'resolved config minifier',
    pattern: /\bResolvedLayoutConfig\.minifyConfig\b/g,
    replacement: 'minifyResolvedLayoutConfig',
    importName: 'minifyResolvedLayoutConfig',
  },
  {
    name: 'resolved config unminifier',
    pattern: /\bResolvedLayoutConfig\.unminifyConfig\b/g,
    replacement: 'unminifyResolvedLayoutConfig',
    importName: 'unminifyResolvedLayoutConfig',
  },
  {
    name: 'component type resolver',
    pattern: /\bResolvedComponentItemConfig\.resolveComponentTypeName\b/g,
    replacement: 'resolveComponentTypeName',
    importName: 'resolveComponentTypeName',
  },
  {
    name: 'branded root selector',
    pattern: /\blm_goldenlayout\b/g,
    replacement: 'lm_strelit',
  },
  {
    name: 'config property',
    pattern: /\bcomponentName\b/g,
    replacement: 'componentType',
  },
  {
    name: 'query helper',
    pattern: /\bgetComponentsByName\b/g,
    replacement: 'getComponentItemsByType',
  },
  {
    name: 'container type',
    pattern: /\bItemContainer\b/g,
    replacement: 'ComponentContainer',
  },
  {
    name: 'content item type',
    pattern: /\bAbstractContentItem\b/g,
    replacement: 'ContentItem',
  },
  {
    name: 'save layout method',
    pattern: /\btoConfig\b/g,
    replacement: 'saveLayout',
  },
  {
    name: 'resize method',
    pattern: /\bupdateSize\b/g,
    replacement: 'setSize',
  },
  {
    name: 'container element accessor',
    pattern: /\bgetElement\(\)/g,
    replacement: 'element',
  },
  {
    name: 'active component getter',
    pattern: /\bgetActiveContentItem\b/g,
    replacement: 'getActiveComponentItem',
  },
  {
    name: 'active component setter',
    pattern: /\bsetActiveContentItem\b/g,
    replacement: 'setActiveComponentItem',
  },
];

const manualReviewPatterns = [
  {
    name: 'SCSS theme imports require a manual Strelit theme selection',
    pattern:
      /golden-layout\/(?:dist|src)\/scss\/(?:themes\/)?_?goldenlayout-[^'"\s/?#]+-theme\.scss(?:[?#][^'"\s]*)?/,
  },
  {
    name: 'legacy drag-source config fields must become componentType and componentState',
    pattern:
      /\b(?:isDragSourceComponentItemConfig|DragSource\.ComponentItemConfig)\b/,
  },
  {
    name: 'constructor config must move to loadLayout()',
    pattern:
      /new\s+StrelitLayout\s*\(\s*(?:\{|[A-Za-z_$][\w$]*(?:Config|config))/,
  },
  {
    name: 'registerComponent() must become an explicit constructor or factory registration',
    pattern: /\.registerComponent\s*\(/,
  },
  {
    name: 'state mutation APIs must move to initialState/stateRequestEvent',
    pattern: /\.(?:getState|setState|extendState)\s*\(/,
  },
  {
    name: 'removed config fields must be converted to the Strelit schema',
    pattern:
      /\b(?:hasHeaders|showPopoutIcon|showMaximiseIcon|showCloseIcon|minItemHeight|minItemWidth|minHeight|minWidth|labels)\s*:/,
  },
  {
    name: 'item width/height fields must become size strings',
    pattern: /\b(?:width|height)\s*:\s*\d+(?:\.\d+)?\s*[,}]/,
  },
  {
    name: 'computed Golden Layout API access cannot be migrated safely',
    pattern:
      /(?:GoldenLayout|LayoutConfig|ResolvedLayoutConfig|ComponentContainer|EventEmitter|LayoutManager)\s*\[/,
  },
  {
    name: 'namespace package imports require member-by-member migration',
    pattern:
      /import\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s+['"]strelit-ui-kit['"]/,
  },
];

/** Maps a supported source extension to its TypeScript parser mode. */
function scriptKindForExtension(extension) {
  switch (extension) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

/** Returns a dotted property or qualified type name when syntax is static. */
function getDottedName(node, sourceFile) {
  if (!ts.isPropertyAccessExpression(node) && !ts.isQualifiedName(node)) {
    return undefined;
  }
  return node.getText(sourceFile);
}

/** Applies non-overlapping edits from right to left to preserve source offsets. */
function applyTextEdits(content, edits) {
  const ordered = [...edits].sort((left, right) => right.start - left.start);
  let transformed = content;
  let previousStart = content.length + 1;

  for (const edit of ordered) {
    if (edit.end > previousStart) {
      continue;
    }
    transformed = `${transformed.slice(0, edit.start)}${edit.text}${transformed.slice(edit.end)}`;
    previousStart = edit.start;
  }

  return transformed;
}

function addBindingName(name, bindings) {
  if (ts.isIdentifier(name)) {
    bindings.add(name.text);
  } else {
    for (const element of name.elements) {
      if (!element.dotDotDotToken) {
        addBindingName(element.name, bindings);
      }
    }
  }
}

/** Collects local bindings and existing Strelit imports for collision avoidance. */
function collectSourceBindings(sourceFile) {
  const bindings = new Set();
  const importedNames = new Map();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const importClause = statement.importClause;
      if (importClause?.name !== undefined) {
        bindings.add(importClause.name.text);
      }
      const namedBindings = importClause?.namedBindings;
      if (namedBindings !== undefined) {
        if (ts.isNamespaceImport(namedBindings)) {
          bindings.add(namedBindings.name.text);
        } else {
          for (const element of namedBindings.elements) {
            bindings.add(element.name.text);
            if (
              ts.isStringLiteral(statement.moduleSpecifier) &&
              statement.moduleSpecifier.text === 'strelit-ui-kit'
            ) {
              importedNames.set(
                element.propertyName?.text ?? element.name.text,
                element.name.text,
              );
            }
          }
        }
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        addBindingName(declaration.name, bindings);
      }
      continue;
    }

    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name !== undefined
    ) {
      bindings.add(statement.name.text);
    }
  }

  return { bindings, importedNames };
}

function classifyReceiverType(typeNode, sourceFile) {
  if (typeNode === undefined) {
    return undefined;
  }
  const typeName = typeNode.getText(sourceFile).replace(/<.*$/, '');
  return receiverTypeKinds.get(typeName);
}

/** Classifies statically provable API receivers used by method migrations. */
function collectReceiverKinds(sourceFile) {
  const receiverKinds = new Map();

  function record(name, kind) {
    if (!ts.isIdentifier(name) || kind === undefined) {
      return;
    }
    const existing = receiverKinds.get(name.text);
    receiverKinds.set(
      name.text,
      existing === undefined || existing === kind ? kind : 'ambiguous',
    );
  }

  function visit(node) {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      let kind = classifyReceiverType(node.type, sourceFile);
      if (
        kind === undefined &&
        ts.isVariableDeclaration(node) &&
        node.initializer !== undefined &&
        ts.isNewExpression(node.initializer)
      ) {
        kind = receiverTypeKinds.get(
          node.initializer.expression.getText(sourceFile),
        );
      }
      record(node.name, kind);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return receiverKinds;
}

function findObjectProperty(objectLiteral, propertyName) {
  return objectLiteral.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) &&
        property.name.text === propertyName) ||
        (ts.isStringLiteral(property.name) &&
          property.name.text === propertyName)),
  );
}

function isLayoutItemObjectLiteral(objectLiteral) {
  const typeProperty = findObjectProperty(objectLiteral, 'type');
  if (typeProperty === undefined) {
    return false;
  }

  const typeText = typeProperty.initializer.getText();
  return /(?:^|\.)(?:row|column|stack|component)$/.test(
    typeText.replaceAll(/["']/g, ''),
  );
}

function hasLayoutConfigTypeContext(objectLiteral) {
  const parent = objectLiteral.parent;
  const typeNode =
    ts.isVariableDeclaration(parent) && parent.initializer === objectLiteral
      ? parent.type
      : (ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) &&
          parent.expression === objectLiteral
        ? parent.type
        : undefined;
  return (
    typeNode !== undefined &&
    /^(?:[A-Za-z_$][\w$]*\.)*(?:LayoutConfig|PopoutLayoutConfig)$/.test(
      typeNode.getText(),
    )
  );
}

function isLayoutConfigObjectLiteral(objectLiteral) {
  if (hasLayoutConfigTypeContext(objectLiteral)) {
    return true;
  }

  const rootProperty = findObjectProperty(objectLiteral, 'root');
  if (
    rootProperty !== undefined &&
    ts.isObjectLiteralExpression(rootProperty.initializer) &&
    isLayoutItemObjectLiteral(rootProperty.initializer)
  ) {
    return true;
  }

  const contentProperty = findObjectProperty(objectLiteral, 'content');
  return (
    contentProperty !== undefined &&
    ts.isArrayLiteralExpression(contentProperty.initializer) &&
    contentProperty.initializer.elements.some(
      (element) =>
        ts.isObjectLiteralExpression(element) &&
        isLayoutItemObjectLiteral(element),
    )
  );
}

function isLayoutDimensionsObjectLiteral(objectLiteral) {
  const parent = objectLiteral.parent;
  return (
    ts.isPropertyAssignment(parent) &&
    parent.initializer === objectLiteral &&
    ((ts.isIdentifier(parent.name) && parent.name.text === 'dimensions') ||
      (ts.isStringLiteral(parent.name) && parent.name.text === 'dimensions')) &&
    ts.isObjectLiteralExpression(parent.parent) &&
    isLayoutConfigObjectLiteral(parent.parent)
  );
}

/** Returns a modern size-property replacement for an unambiguous numeric field. */
function getNumericPropertyMigration(node) {
  if (
    !ts.isPropertyAssignment(node) ||
    !ts.isObjectLiteralExpression(node.parent) ||
    !ts.isNumericLiteral(node.initializer)
  ) {
    return undefined;
  }

  const propertyName = ts.isIdentifier(node.name)
    ? node.name.text
    : ts.isStringLiteral(node.name)
      ? node.name.text
      : undefined;
  if (propertyName === undefined) {
    return undefined;
  }

  if (propertyName === 'minItemWidth' || propertyName === 'minItemHeight') {
    if (!isLayoutDimensionsObjectLiteral(node.parent)) {
      return undefined;
    }
    const axis = propertyName === 'minItemWidth' ? 'Width' : 'Height';
    const target = `defaultMinItem${axis}`;
    if (findObjectProperty(node.parent, target) !== undefined) {
      return undefined;
    }
    return `${target}: '${node.initializer.text}px'`;
  }

  if (!isLayoutItemObjectLiteral(node.parent)) {
    return undefined;
  }

  const migration =
    propertyName === 'width' || propertyName === 'height'
      ? { target: 'size', unit: '%' }
      : propertyName === 'minWidth' || propertyName === 'minHeight'
        ? { target: 'minSize', unit: 'px' }
        : undefined;
  if (migration === undefined) {
    return undefined;
  }

  const competingProperty =
    propertyName === 'width'
      ? 'height'
      : propertyName === 'height'
        ? 'width'
        : propertyName === 'minWidth'
          ? 'minHeight'
          : 'minWidth';
  if (
    findObjectProperty(node.parent, migration.target) !== undefined ||
    findObjectProperty(node.parent, competingProperty) !== undefined
  ) {
    return undefined;
  }

  return `${migration.target}: '${node.initializer.text}${migration.unit}'`;
}

function migrateImportSpecifier(specifier) {
  const importedName = specifier.propertyName?.text ?? specifier.name.text;
  const migratedName =
    sourceIdentifierReplacements.get(importedName) ?? importedName;
  const localName =
    specifier.propertyName === undefined ? migratedName : specifier.name.text;
  const typePrefix = specifier.isTypeOnly ? 'type ' : '';
  return migratedName === localName
    ? `${typePrefix}${migratedName}`
    : `${typePrefix}${migratedName} as ${localName}`;
}

function createDefaultImportClause(importClause) {
  const defaultLocalName = importClause.name.text;
  const defaultBinding =
    defaultLocalName === 'GoldenLayout'
      ? 'StrelitLayout'
      : `StrelitLayout as ${defaultLocalName}`;
  const namedBindings = importClause.namedBindings;
  if (namedBindings === undefined) {
    return `{ ${defaultBinding} }`;
  }
  if (ts.isNamespaceImport(namedBindings)) {
    return undefined;
  }
  const named = namedBindings.elements.map(migrateImportSpecifier);
  return `{ ${[defaultBinding, ...named].join(', ')} }`;
}

function isGoldenLayoutPackageOrJsEntrySpecifier(specifier) {
  if (specifier === 'golden-layout') {
    return true;
  }
  if (!specifier.startsWith('golden-layout/')) {
    return false;
  }

  const relativePath = specifier.slice('golden-layout/'.length);
  return (
    /^(?:dist\/(?:esm|cjs|browser|index)|index|src)\/?.*\.m?js(?:[?#].*)?$/.test(
      relativePath,
    ) ||
    relativePath === 'dist/index.js' ||
    relativePath === 'index.js'
  );
}

/** Migrates one JavaScript or TypeScript source file through syntax-aware edits. */
function transformSourceContent(content, filePath) {
  const normalized = content;
  const applied = [];

  const extension = path.extname(filePath).toLowerCase();
  const sourceFile = ts.createSourceFile(
    filePath,
    normalized,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForExtension(extension),
  );
  const edits = [];
  const requiredImports = new Map();
  const { bindings, importedNames } = collectSourceBindings(sourceFile);
  const receiverKinds = collectReceiverKinds(sourceFile);
  const sourceManualReviews = new Set();

  function resolveImportName(exportName) {
    const importedName = importedNames.get(exportName);
    if (importedName !== undefined) {
      return importedName;
    }

    const existingRequiredName = requiredImports.get(exportName);
    if (existingRequiredName !== undefined) {
      return existingRequiredName;
    }

    let localName = exportName;
    if (bindings.has(localName)) {
      localName = `${exportName}FromStrelit`;
      let suffix = 2;
      while (bindings.has(localName)) {
        localName = `${exportName}FromStrelit${suffix++}`;
      }
    }
    bindings.add(localName);
    requiredImports.set(exportName, localName);
    return localName;
  }

  function addEdit(node, text, name) {
    edits.push({ start: node.getStart(sourceFile), end: node.getEnd(), text });
    applied.push(name);
  }

  function visit(node) {
    const numericPropertyMigration = getNumericPropertyMigration(node);
    if (numericPropertyMigration !== undefined) {
      addEdit(node, numericPropertyMigration, 'numeric layout item sizing');
      return;
    }

    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const migrated = migratePackagePath(node.moduleSpecifier.text);
      if (migrated !== node.moduleSpecifier.text) {
        const quote = normalized[node.moduleSpecifier.getStart(sourceFile)];
        addEdit(
          node.moduleSpecifier,
          `${quote}${migrated}${quote}`,
          'package import',
        );
      }
    }

    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isGoldenLayoutPackageOrJsEntrySpecifier(node.moduleSpecifier.text) &&
      node.importClause !== undefined
    ) {
      if (
        node.importClause.namedBindings !== undefined &&
        ts.isNamespaceImport(node.importClause.namedBindings)
      ) {
        sourceManualReviews.add(
          'namespace package imports require member-by-member migration',
        );
      }
      if (node.importClause.name !== undefined) {
        const migratedClause = createDefaultImportClause(node.importClause);
        if (migratedClause !== undefined) {
          addEdit(node.importClause, migratedClause, 'default package import');
          return;
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const moduleSpecifier = node.arguments[0];
      const migrated = migratePackagePath(moduleSpecifier.text);
      if (migrated !== moduleSpecifier.text) {
        const quote = normalized[moduleSpecifier.getStart(sourceFile)];
        addEdit(
          moduleSpecifier,
          `${quote}${migrated}${quote}`,
          'package import',
        );
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'require' &&
      node.initializer.arguments.length === 1 &&
      ts.isStringLiteral(node.initializer.arguments[0]) &&
      node.initializer.arguments[0].text === 'golden-layout'
    ) {
      const localName = node.name.text;
      const binding =
        localName === 'GoldenLayout'
          ? 'StrelitLayout'
          : `StrelitLayout: ${localName}`;
      const migratedModule = node.initializer
        .getText(sourceFile)
        .replace(/(['"])golden-layout\1/, '$1strelit-ui-kit$1');
      addEdit(
        node,
        `{ ${binding} } = ${migratedModule}`,
        'CommonJS package import',
      );
      return;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      receiverDependentMethodNames.has(node.expression.name.text)
    ) {
      const receiver = node.expression.expression;
      const receiverKind = ts.isIdentifier(receiver)
        ? receiverKinds.get(receiver.text)
        : undefined;
      const methodName = node.expression.name.text;
      const replacement = receiverMethodReplacements.get(
        `${receiverKind}.${methodName}`,
      );
      if (replacement !== undefined) {
        if (replacement.property === true) {
          addEdit(
            node,
            `${receiver.getText(sourceFile)}.${replacement.name}`,
            `receiver API ${methodName}`,
          );
          return;
        }
        addEdit(
          node.expression.name,
          replacement.name,
          `receiver API ${methodName}`,
        );
      } else if (!(receiverKind === 'popout' && methodName === 'toConfig')) {
        sourceManualReviews.add(
          `receiver type for ${node.expression.getText(sourceFile)}() could not be proven`,
        );
      }
    }

    if (ts.isPropertyAccessExpression(node) || ts.isQualifiedName(node)) {
      const dottedName = getDottedName(node, sourceFile);
      if (dottedName === 'DragSource.ComponentItemConfig') {
        sourceManualReviews.add(
          'legacy DragSource.ComponentItemConfig fields require type/state to componentType/componentState conversion',
        );
      }
      const replacement =
        dottedApiReplacements.get(dottedName) ??
        nestedTypeReplacements.get(dottedName);
      if (replacement !== undefined) {
        const localName = resolveImportName(replacement);
        addEdit(node, localName, `module API ${dottedName}`);
        return;
      }
    }

    if (
      ts.isStringLiteral(node) &&
      node.text.includes('lm_goldenlayout') &&
      !(
        (ts.isImportDeclaration(node.parent) ||
          ts.isExportDeclaration(node.parent)) &&
        node.parent.moduleSpecifier === node
      )
    ) {
      const quote = normalized[node.getStart(sourceFile)];
      addEdit(
        node,
        `${quote}${node.text.replace(/\blm_goldenlayout\b/g, 'lm_strelit')}${quote}`,
        'branded root selector',
      );
      return;
    }

    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ts.isNamespaceImport(parent) ||
        ((ts.isPropertyAssignment(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isMethodDeclaration(parent)) &&
          parent.name === node);
      if (!isPropertyName) {
        const replacement = sourceIdentifierReplacements.get(node.text);
        if (replacement !== undefined) {
          addEdit(node, replacement, `identifier ${node.text}`);
        }
      }
    }

    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'componentName'
    ) {
      addEdit(node.name, 'componentType', 'config property');
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  let transformed = applyTextEdits(normalized, edits);
  if (requiredImports.size > 0) {
    transformed = addRequiredImports(transformed, requiredImports);
  }

  return {
    transformed,
    applied: [...new Set(applied)],
    manualReviews: [...sourceManualReviews],
  };
}

/** Migrates a package or published style subpath while preserving URL suffixes. */
function migratePackagePath(specifier) {
  if (specifier === 'golden-layout') {
    return 'strelit-ui-kit';
  }
  if (!specifier.startsWith('golden-layout/')) {
    return specifier;
  }

  const relativePath = specifier.slice('golden-layout/'.length);
  const styleMatch = /^(?:dist|src)\/(css|less|scss)\/(.+)$/.exec(relativePath);
  if (styleMatch === null) {
    if (
      /^(?:dist\/(?:esm|cjs|browser|index)|index|src)\/?.*\.m?js(?:[?#].*)?$/.test(
        relativePath,
      ) ||
      relativePath === 'dist/index.js' ||
      relativePath === 'index.js'
    ) {
      return 'strelit-ui-kit';
    }
    return `strelit-ui-kit/${relativePath}`;
  }

  const [, styleType, originalFile] = styleMatch;
  if (
    styleType === 'scss' &&
    /(?:^|\/)_?goldenlayout-[^/?#]+-theme\.scss(?:[?#].*)?$/.test(originalFile)
  ) {
    return specifier;
  }

  let file = originalFile
    .replace(/^goldenlayout-base\./, 'strelit-base.')
    .replace(/(^|\/)goldenlayout-/, '$1strelit-');
  if (
    (styleType === 'css' || styleType === 'less') &&
    /(?:^|\/)strelit-[^/?#]+-theme\.(?:css|less)(?:[?#].*)?$/.test(file) &&
    !file.startsWith('themes/')
  ) {
    file = `themes/${file}`;
  }
  return `strelit-ui-kit/dist/${styleType}/${file}`;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLayoutItem(value) {
  return (
    isRecord(value) &&
    ['row', 'column', 'stack', 'component', 'react-component'].includes(
      value.type,
    )
  );
}

function isLayoutConfig(value) {
  return (
    isRecord(value) &&
    (isLayoutItem(value.root) ||
      (Array.isArray(value.content) && value.content.some(isLayoutItem)) ||
      Array.isArray(value.openPopouts))
  );
}

/** Migrates one recognized saved-layout item and records lossy cases. */
function transformLayoutItem(item, itemPath, manualReviews, sourceVersion) {
  if (!isLayoutItem(item)) {
    manualReviews.add(`${itemPath} is not a recognized layout item`);
    return;
  }

  if (item.type === 'react-component') {
    item.type = 'component';
    manualReviews.add(
      `${itemPath} requires a modern framework adapter for react-component`,
    );
    if (sourceVersion === 'v2') {
      manualReviews.add(`${itemPath} contains a v1-only item in v2 mode`);
    }
  }

  if (item.componentType === undefined && item.componentName !== undefined) {
    item.componentType = item.componentName;
  }
  delete item.componentName;

  if (item.size === undefined) {
    const legacySize = item.width ?? item.height;
    if (typeof legacySize === 'number') {
      item.size = `${legacySize}%`;
    }
  }
  delete item.width;
  delete item.height;

  if (item.minSize === undefined) {
    const legacyMinSize = item.minWidth ?? item.minHeight;
    if (typeof legacyMinSize === 'number') {
      item.minSize = `${legacyMinSize}px`;
    }
  }
  delete item.minWidth;
  delete item.minHeight;

  if (Array.isArray(item.id)) {
    const ids = item.id.filter((id) => id !== '__glMaximised');
    if (item.maximised === undefined && item.id.includes('__glMaximised')) {
      item.maximised = true;
    }
    if (ids.length > 1) {
      manualReviews.add(`${itemPath}.id contains multiple non-protocol IDs`);
    }
    item.id = ids[0] ?? '';
  }

  if (item.hasHeaders !== undefined) {
    item.header ??= {};
    if (item.header.show === undefined) {
      item.header.show = item.hasHeaders ? 'top' : false;
    }
    delete item.hasHeaders;
  }

  if (Array.isArray(item.content)) {
    item.content.forEach((child, index) => {
      if (
        item.type === 'stack' &&
        isLayoutItem(child) &&
        child.type !== 'component'
      ) {
        manualReviews.add(
          `${itemPath}.content[${index}] uses v1 nested stack content and requires redesign`,
        );
      }
      transformLayoutItem(
        child,
        `${itemPath}.content[${index}]`,
        manualReviews,
        sourceVersion,
      );
    });
    if (item.type === 'component' && item.content.length === 0) {
      delete item.content;
    }
  }
}

/** Consolidates legacy header settings into the current header schema. */
function migrateHeader(layoutConfig) {
  const settings = isRecord(layoutConfig.settings) ? layoutConfig.settings : {};
  const labels = isRecord(layoutConfig.labels) ? layoutConfig.labels : {};
  const header = isRecord(layoutConfig.header) ? layoutConfig.header : {};

  if (header.show === undefined && typeof settings.hasHeaders === 'boolean') {
    header.show = settings.hasHeaders ? 'top' : false;
  }
  if (header.popout === undefined) {
    header.popout =
      labels.popout ?? (settings.showPopoutIcon === false ? false : undefined);
  }
  if (header.popin === undefined && labels.popin !== undefined) {
    header.popin = labels.popin;
  }
  if (header.maximise === undefined) {
    header.maximise =
      labels.maximise ??
      (settings.showMaximiseIcon === false ? false : undefined);
  }
  if (header.close === undefined) {
    header.close =
      labels.close ?? (settings.showCloseIcon === false ? false : undefined);
  }
  if (header.minimise === undefined && labels.minimise !== undefined) {
    header.minimise = labels.minimise;
  }
  if (header.tabDropdown === undefined && labels.tabDropdown !== undefined) {
    header.tabDropdown = labels.tabDropdown;
  }

  for (const key of [
    'hasHeaders',
    'showPopoutIcon',
    'showMaximiseIcon',
    'showCloseIcon',
  ]) {
    delete settings[key];
  }
  delete layoutConfig.labels;
  if (Object.keys(settings).length > 0) {
    layoutConfig.settings = settings;
  } else {
    delete layoutConfig.settings;
  }
  if (Object.values(header).some((value) => value !== undefined)) {
    layoutConfig.header = Object.fromEntries(
      Object.entries(header).filter(([, value]) => value !== undefined),
    );
  }
}

/** Migrates a layout or popout config recursively into the Strelit schema. */
function transformLayoutConfig(
  layoutConfig,
  configPath,
  manualReviews,
  sourceVersion,
) {
  if (layoutConfig.root === undefined && Array.isArray(layoutConfig.content)) {
    if (layoutConfig.content.length > 1) {
      manualReviews.add(
        `${configPath}.content has multiple roots; v2.6 used only the first`,
      );
    }
    layoutConfig.root = layoutConfig.content[0];
  }
  delete layoutConfig.content;

  if (layoutConfig.root !== undefined) {
    transformLayoutItem(
      layoutConfig.root,
      `${configPath}.root`,
      manualReviews,
      sourceVersion,
    );
  }

  if (isRecord(layoutConfig.dimensions)) {
    if (
      layoutConfig.dimensions.defaultMinItemHeight === undefined &&
      typeof layoutConfig.dimensions.minItemHeight === 'number'
    ) {
      layoutConfig.dimensions.defaultMinItemHeight = `${layoutConfig.dimensions.minItemHeight}px`;
    }
    if (
      layoutConfig.dimensions.defaultMinItemWidth === undefined &&
      typeof layoutConfig.dimensions.minItemWidth === 'number'
    ) {
      layoutConfig.dimensions.defaultMinItemWidth = `${layoutConfig.dimensions.minItemWidth}px`;
    }
    delete layoutConfig.dimensions.minItemHeight;
    delete layoutConfig.dimensions.minItemWidth;
  }

  migrateHeader(layoutConfig);
  if (Array.isArray(layoutConfig.openPopouts)) {
    layoutConfig.openPopouts.forEach((popout, index) => {
      if (isRecord(popout)) {
        transformLayoutConfig(
          popout,
          `${configPath}.openPopouts[${index}]`,
          manualReviews,
          sourceVersion,
        );
        if (popout.window === undefined && isRecord(popout.dimensions)) {
          const { width, height, left, top } = popout.dimensions;
          if ([width, height, left, top].some((value) => value != null)) {
            popout.window = { width, height, left, top };
            delete popout.dimensions.width;
            delete popout.dimensions.height;
            delete popout.dimensions.left;
            delete popout.dimensions.top;
          }
        }
      }
    });
  }
}

/** Parses and migrates JSON only when it has a recognized layout shape. */
function transformJsonContent(content, sourceVersion = 'auto') {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!isLayoutConfig(parsed)) {
    return undefined;
  }

  const manualReviews = new Set();
  transformLayoutConfig(parsed, '$', manualReviews, sourceVersion);
  const indentation = /^([ \t]+)"/m.exec(content)?.[1] ?? '  ';
  return {
    transformed: `${JSON.stringify(parsed, null, indentation)}\n`,
    applied: [`saved layout schema (${sourceVersion})`],
    manualReviews: [...manualReviews],
  };
}

/** Parses CLI arguments and preserves dry-run as the safe default. */
function parseArguments(argv) {
  let target;
  let write = false;
  let sourceVersion = 'auto';

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case '--target': {
        target = argv[++index];
        break;
      }
      case '--write': {
        write = true;
        break;
      }
      case '--from': {
        sourceVersion = argv[++index];
        if (!['auto', 'v1', 'v2'].includes(sourceVersion)) {
          throw new Error(`Unsupported source version: ${sourceVersion}`);
        }
        break;
      }
      case '--dry-run': {
        write = false;
        break;
      }
      case '--help':
      case '-h': {
        console.log(usage);
        process.exit(0);
      }
      default: {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }
  }

  if (target === undefined) {
    throw new Error('Missing required --target argument');
  }

  return {
    target: path.resolve(process.cwd(), target),
    write,
    sourceVersion,
  };
}

function shouldProcessFile(filePath) {
  return textFileExtensions.has(path.extname(filePath).toLowerCase());
}

function isPathWithin(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

/** Rejects link-based escapes and verifies canonical target containment. */
function assertSafeMigrationPath(entryPath, canonicalRoot) {
  const stat = fs.lstatSync(entryPath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing symbolic link or reparse point: ${entryPath}`);
  }
  if (stat.isFile() && stat.nlink > 1) {
    throw new Error(`Refusing multiply-linked file: ${entryPath}`);
  }

  const canonicalEntry = fs.realpathSync.native(entryPath);
  if (!isPathWithin(canonicalRoot, canonicalEntry)) {
    throw new Error(`Refusing path outside migration target: ${entryPath}`);
  }
  return stat;
}

/** Discovers supported files without traversing ignored or unsafe entries. */
function walk(entryPath, result, canonicalRoot) {
  if (ignoredDirectories.has(path.basename(entryPath))) {
    return;
  }

  const stat = assertSafeMigrationPath(entryPath, canonicalRoot);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(entryPath)) {
      walk(path.join(entryPath, entry), result, canonicalRoot);
    }
  } else if (shouldProcessFile(entryPath)) {
    result.push(entryPath);
  }
}

/** Dispatches one file to its syntax-, schema-, or text-aware transformer. */
function transformContent(content, filePath, options = {}) {
  if (path.extname(filePath).toLowerCase() === '.json') {
    const jsonResult = transformJsonContent(
      content,
      options.sourceVersion ?? 'auto',
    );
    if (jsonResult !== undefined) {
      return jsonResult;
    }
  }

  if (sourceFileExtensions.has(path.extname(filePath).toLowerCase())) {
    const sourceResult = transformSourceContent(content, filePath);
    return {
      ...sourceResult,
      manualReviews: [
        ...sourceResult.manualReviews,
        ...manualReviewPatterns
          .filter(({ pattern }) => pattern.test(sourceResult.transformed))
          .map(({ name }) => name),
      ],
    };
  }

  let transformed = content;
  const applied = [];
  const requiredImports = new Set();

  for (const replacement of replacements) {
    const next = transformed.replace(
      replacement.pattern,
      replacement.replacement,
    );
    if (next !== transformed) {
      applied.push(replacement.name);
      if (replacement.importName !== undefined) {
        requiredImports.add(replacement.importName);
      }
      transformed = next;
    }
  }

  if (requiredImports.size > 0) {
    transformed = addRequiredImports(transformed, requiredImports);
  }

  return {
    transformed,
    applied,
    manualReviews: manualReviewPatterns
      .filter(({ pattern }) => pattern.test(transformed))
      .map(({ name }) => name),
  };
}

/** Adds collision-safe named imports requested by source transformations. */
function addRequiredImports(content, requiredImports) {
  const entries =
    requiredImports instanceof Map
      ? [...requiredImports]
      : [...requiredImports].map((name) => [name, name]);
  const names = entries.map(([exportName, localName]) =>
    exportName === localName ? exportName : `${exportName} as ${localName}`,
  );
  const importPattern =
    /import\s*\{([\s\S]*?)\}\s*from\s*(['"])strelit-ui-kit\2;?/;
  if (importPattern.test(content)) {
    return content.replace(importPattern, (match, bindings, quote) => {
      const missing = entries
        .filter(
          ([exportName]) => !new RegExp(`\\b${exportName}\\b`).test(bindings),
        )
        .map(([exportName, localName]) =>
          exportName === localName
            ? exportName
            : `${exportName} as ${localName}`,
        );
      if (missing.length === 0) {
        return match;
      }
      const separator = bindings.trim() === '' ? '' : ', ';
      return `import { ${bindings.trim()}${separator}${missing.join(', ')} } from ${quote}strelit-ui-kit${quote};`;
    });
  }

  const requirePattern =
    /const\s*\{([\s\S]*?)\}\s*=\s*require\((['"])strelit-ui-kit\2\);?/;
  if (requirePattern.test(content)) {
    return content.replace(requirePattern, (match, bindings, quote) => {
      const missing = entries
        .filter(
          ([exportName]) => !new RegExp(`\\b${exportName}\\b`).test(bindings),
        )
        .map(([exportName, localName]) =>
          exportName === localName ? exportName : `${exportName}: ${localName}`,
        );
      if (missing.length === 0) {
        return match;
      }
      const separator = bindings.trim() === '' ? '' : ', ';
      return `const { ${bindings.trim()}${separator}${missing.join(', ')} } = require(${quote}strelit-ui-kit${quote});`;
    });
  }

  return `import { ${names.join(', ')} } from 'strelit-ui-kit';\n${content}`;
}

/** Executes discovery, dry-run reporting, and guarded write-mode updates. */
function main() {
  const { target, write, sourceVersion } = parseArguments(
    process.argv.slice(2),
  );
  if (!fs.existsSync(target)) {
    throw new Error(`Target does not exist: ${target}`);
  }

  const targetStat = fs.lstatSync(target);
  if (targetStat.isSymbolicLink()) {
    throw new Error(`Refusing symbolic link or reparse point: ${target}`);
  }
  const canonicalTarget = fs.realpathSync.native(target);

  const files = [];
  walk(canonicalTarget, files, canonicalTarget);

  let changedFileCount = 0;
  let manualReviewFileCount = 0;
  for (const filePath of files) {
    assertSafeMigrationPath(filePath, canonicalTarget);
    const original = fs.readFileSync(filePath, 'utf8');
    const { transformed, applied, manualReviews } = transformContent(
      original,
      filePath,
      { sourceVersion },
    );
    const relativePath = path.relative(process.cwd(), filePath);
    if (transformed !== original) {
      changedFileCount++;
      console.log(
        `${write ? 'update' : 'would update'} ${relativePath} (${applied.join(', ')})`,
      );

      if (write) {
        assertSafeMigrationPath(filePath, canonicalTarget);
        fs.writeFileSync(filePath, transformed);
      }
    }
    if (manualReviews.length > 0) {
      manualReviewFileCount++;
      console.log(`manual review ${relativePath}: ${manualReviews.join('; ')}`);
    }
  }

  console.log(`${write ? 'Updated' : 'Matched'} ${changedFileCount} file(s).`);
  console.log(`Flagged ${manualReviewFileCount} file(s) for manual review.`);
  if (!write) {
    console.log(
      'Dry run only. Re-run with --write after reviewing the planned changes.',
    );
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exitCode = 1;
  }
}

module.exports = {
  migratePackagePath,
  transformContent,
  transformJsonContent,
  transformSourceContent,
};
