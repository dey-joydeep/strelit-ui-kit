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
  '.mts',
  '.cts',
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
  '.tmp',
  'temp',
  'lib',
  '.verification',
]);

const sourceFileExtensions = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
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
  ['LayoutConfig.Labels', 'LayoutConfigHeader'],
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
  [
    'LayoutManager.LocationSelector.TypeId',
    'LayoutManagerLocationSelectorTypeId',
  ],
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

const textReplacements = [
  {
    name: 'package import',
    pattern: /(['"])(golden-layout(?:\/[^'"]+)?)\1/g,
    replacement: (_match, quote, specifier) =>
      `${quote}${migratePackagePath(specifier)}${quote}`,
  },
  {
    name: 'branded root selector',
    pattern: /\blm_goldenlayout\b/g,
    replacement: 'lm_strelit',
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

const textManualReviewPatterns = [
  {
    name: 'embedded Golden Layout source APIs require manual migration',
    pattern:
      /\b(?:GoldenLayout|ItemContainer|AbstractContentItem|LayoutConfig\.(?:resolve|fromResolved))\b/,
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
  const nonImportBindings = new Set();
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
  }

  function addNonImportBindingName(name) {
    addBindingName(name, bindings);
    addBindingName(name, nonImportBindings);
  }

  function visit(node) {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      addNonImportBindingName(node.name);
    } else if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node) ||
        ts.isTypeParameterDeclaration(node)) &&
      node.name !== undefined
    ) {
      nonImportBindings.add(node.name.text);
      bindings.add(node.name.text);
    } else if (ts.isImportEqualsDeclaration(node)) {
      bindings.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return { bindings, importedNames, nonImportBindings };
}

function createSourceAnalysis(content, filePath, extension) {
  const compilerOptions = {
    allowJs: true,
    checkJs: false,
    module: ts.ModuleKind.ESNext,
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  };
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForExtension(extension),
  );
  const resolvedFilePath = path.resolve(filePath);
  const host = ts.createCompilerHost(compilerOptions, true);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (candidate) =>
    path.resolve(candidate) === resolvedFilePath ||
    ts.sys.fileExists(candidate);
  host.readFile = (candidate) =>
    path.resolve(candidate) === resolvedFilePath
      ? content
      : ts.sys.readFile(candidate);
  host.getSourceFile = (
    candidate,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    path.resolve(candidate) === resolvedFilePath
      ? sourceFile
      : defaultGetSourceFile(
          candidate,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );
  const program = ts.createProgram([filePath], compilerOptions, host);
  return {
    checker: program.getTypeChecker(),
    sourceFile: program.getSourceFile(filePath) ?? sourceFile,
  };
}

function collectGoldenLayoutBindingSymbols(sourceFile, checker) {
  const bindings = new Map();

  function record(identifier, exportName, replacementName) {
    const symbol = checker.getSymbolAtLocation(identifier);
    if (symbol !== undefined) {
      bindings.set(symbol, { exportName, replacementName });
    }
  }

  function recordImportClause(importClause) {
    if (importClause?.name !== undefined) {
      const localName = importClause.name.text;
      record(
        importClause.name,
        'GoldenLayout',
        localName === 'GoldenLayout' ? 'StrelitLayout' : localName,
      );
    }
    const namedBindings = importClause?.namedBindings;
    if (namedBindings === undefined || ts.isNamespaceImport(namedBindings)) {
      return;
    }
    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      const exportName =
        importedName === 'default' ? 'GoldenLayout' : importedName;
      const migratedName =
        sourceIdentifierReplacements.get(exportName) ?? exportName;
      record(
        element.name,
        exportName,
        element.propertyName === undefined || element.name.text === exportName
          ? migratedName
          : element.name.text,
      );
    }
  }

  function recordRequireBinding(name) {
    if (ts.isIdentifier(name)) {
      record(
        name,
        'GoldenLayout',
        name.text === 'GoldenLayout' ? 'StrelitLayout' : name.text,
      );
      return;
    }
    if (!ts.isObjectBindingPattern(name)) {
      return;
    }
    for (const element of name.elements) {
      if (!ts.isIdentifier(element.name)) {
        continue;
      }
      const importedName = element.propertyName?.text ?? element.name.text;
      const exportName =
        importedName === 'default' ? 'GoldenLayout' : importedName;
      const migratedName =
        sourceIdentifierReplacements.get(exportName) ?? exportName;
      record(
        element.name,
        exportName,
        element.propertyName === undefined || element.name.text === exportName
          ? migratedName
          : element.name.text,
      );
    }
  }

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isGoldenLayoutPackageOrJsEntrySpecifier(node.moduleSpecifier.text)
    ) {
      recordImportClause(node.importClause);
      return;
    }
    if (ts.isVariableDeclaration(node)) {
      const requireMember =
        node.initializer === undefined
          ? undefined
          : getStaticRequireMember(node.initializer);
      if (
        requireMember !== undefined &&
        isGoldenLayoutPackageOrJsEntrySpecifier(requireMember.specifier) &&
        ts.isIdentifier(node.name)
      ) {
        const exportName =
          requireMember.memberName === 'default'
            ? 'GoldenLayout'
            : requireMember.memberName;
        const replacementName =
          sourceIdentifierReplacements.get(exportName) ?? exportName;
        record(
          node.name,
          exportName,
          node.name.text === exportName ? replacementName : node.name.text,
        );
        return;
      }
      const specifier =
        node.initializer === undefined
          ? undefined
          : getStaticRequireSpecifier(node.initializer);
      if (
        specifier !== undefined &&
        isGoldenLayoutPackageOrJsEntrySpecifier(specifier)
      ) {
        recordRequireBinding(node.name);
        return;
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      ts.isIdentifier(node.left)
    ) {
      const requireMember = getStaticRequireMember(node.right);
      const specifier =
        getStaticRequireSpecifier(node.right) ?? requireMember?.specifier;
      if (
        specifier !== undefined &&
        isGoldenLayoutPackageOrJsEntrySpecifier(specifier)
      ) {
        const exportName =
          requireMember === undefined || requireMember.memberName === 'default'
            ? 'GoldenLayout'
            : requireMember.memberName;
        const replacementName =
          sourceIdentifierReplacements.get(exportName) ?? exportName;
        record(
          node.left,
          exportName,
          node.left.text === exportName ? replacementName : node.left.text,
        );
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return bindings;
}

function getStaticRequireSpecifier(node) {
  if (
    ts.isCallExpression(node) &&
    node.arguments.length === 1 &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require' &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return undefined;
}

function getStaticRequireMember(node) {
  if (
    !ts.isPropertyAccessExpression(node) &&
    !ts.isElementAccessExpression(node)
  ) {
    return undefined;
  }
  const specifier = getStaticRequireSpecifier(node.expression);
  if (specifier === undefined) {
    return undefined;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return { memberName: node.name.text, memberNode: node.name, specifier };
  }
  return ts.isStringLiteral(node.argumentExpression)
    ? {
        memberName: node.argumentExpression.text,
        memberNode: node.argumentExpression,
        specifier,
      }
    : undefined;
}

function isDynamicRequireMember(node) {
  return (
    ts.isElementAccessExpression(node) &&
    getStaticRequireSpecifier(node.expression) !== undefined &&
    !ts.isStringLiteral(node.argumentExpression)
  );
}

function getStaticDynamicImportSpecifier(node) {
  const expression = ts.isAwaitExpression(node) ? node.expression : node;
  if (
    ts.isCallExpression(expression) &&
    expression.expression.kind === ts.SyntaxKind.ImportKeyword &&
    expression.arguments.length === 1 &&
    ts.isStringLiteral(expression.arguments[0])
  ) {
    return expression.arguments[0].text;
  }
  return undefined;
}

function isNamespacePackageImport(node) {
  return (
    ts.isImportDeclaration(node) &&
    node.importClause?.namedBindings !== undefined &&
    ts.isNamespaceImport(node.importClause.namedBindings) &&
    ts.isStringLiteral(node.moduleSpecifier) &&
    isGoldenLayoutPackageOrJsEntrySpecifier(node.moduleSpecifier.text)
  );
}

function addImportClauseBindings(importClause, bindings) {
  if (importClause?.name !== undefined) {
    bindings.add(importClause.name.text);
  }
  const namedBindings = importClause?.namedBindings;
  if (namedBindings === undefined) {
    return;
  }
  if (ts.isNamespaceImport(namedBindings)) {
    bindings.add(namedBindings.name.text);
  } else {
    for (const element of namedBindings.elements) {
      bindings.add(element.name.text);
    }
  }
}

function findContainingVariableDeclaration(node) {
  let current = node.parent;
  while (current !== undefined && !ts.isStatement(current)) {
    if (ts.isVariableDeclaration(current)) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function findContainingAssignment(node) {
  let current = node;
  while (current.parent !== undefined && !ts.isStatement(current.parent)) {
    const parent = current.parent;
    if (
      ts.isBinaryExpression(parent) &&
      parent.right === current &&
      parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      return parent;
    }
    current = parent;
  }
  return undefined;
}

function addAssignmentTargetBindings(target, bindings) {
  if (ts.isIdentifier(target)) {
    bindings.add(target.text);
  } else if (ts.isArrayLiteralExpression(target)) {
    for (const element of target.elements) {
      if (ts.isSpreadElement(element)) {
        addAssignmentTargetBindings(element.expression, bindings);
      } else if (!ts.isOmittedExpression(element)) {
        addAssignmentTargetBindings(element, bindings);
      }
    }
  } else if (ts.isObjectLiteralExpression(target)) {
    for (const property of target.properties) {
      if (ts.isShorthandPropertyAssignment(property)) {
        bindings.add(property.name.text);
      } else if (ts.isPropertyAssignment(property)) {
        addAssignmentTargetBindings(property.initializer, bindings);
      } else if (ts.isSpreadAssignment(property)) {
        addAssignmentTargetBindings(property.expression, bindings);
      }
    }
  }
}

function addImportTypeBinding(node, bindings) {
  let current = node.parent;
  while (current !== undefined) {
    if (
      ts.isVariableDeclaration(current) ||
      ts.isParameter(current) ||
      ts.isTypeAliasDeclaration(current) ||
      ts.isTypeParameterDeclaration(current)
    ) {
      addBindingName(current.name, bindings);
      return;
    }
    if (ts.isStatement(current)) {
      return;
    }
    current = current.parent;
  }
}

function findOwnedModuleExpression(node) {
  let current = node;
  while (current.parent !== undefined) {
    const parent = current.parent;
    const ownsCurrent =
      ((ts.isPropertyAccessExpression(parent) ||
        ts.isElementAccessExpression(parent) ||
        ts.isCallExpression(parent) ||
        ts.isTaggedTemplateExpression(parent)) &&
        parent.expression === current) ||
      ((ts.isAwaitExpression(parent) ||
        ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isNonNullExpression(parent)) &&
        parent.expression === current);
    if (!ownsCurrent) {
      break;
    }
    current = parent;
  }
  return current;
}

function collectManualOnlySourceContext(sourceFile) {
  const bindings = new Set();
  const nodes = new Set();
  const reviews = new Set();

  function preserveNode(node, review) {
    nodes.add(node);
    reviews.add(review);
  }

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      (isManualOnlyGoldenLayoutSpecifier(node.moduleSpecifier.text) ||
        isNamespacePackageImport(node))
    ) {
      addImportClauseBindings(node.importClause, bindings);
      const classification = classifyGoldenLayoutPackageSpecifier(
        node.moduleSpecifier.text,
      );
      preserveNode(
        node,
        classification.manualReview ??
          'namespace package imports require member-by-member migration',
      );
      return;
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const classification = classifyGoldenLayoutPackageSpecifier(
        node.moduleSpecifier.text,
      );
      if (classification.manualReview !== undefined) {
        preserveNode(node, classification.manualReview);
        return;
      }
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal) &&
      isGoldenLayoutPackageSpecifier(node.argument.literal.text)
    ) {
      addImportTypeBinding(node, bindings);
      preserveNode(node, 'import types require manual migration');
      return;
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteral(node.moduleReference.expression) &&
      isGoldenLayoutPackageSpecifier(node.moduleReference.expression.text)
    ) {
      bindings.add(node.name.text);
      preserveNode(
        node,
        'TypeScript import-equals declarations require manual migration',
      );
      return;
    }
    if (ts.isVariableDeclaration(node)) {
      const requireSpecifier =
        node.initializer === undefined
          ? undefined
          : getStaticRequireSpecifier(node.initializer);
      const dynamicImportSpecifier =
        node.initializer === undefined
          ? undefined
          : getStaticDynamicImportSpecifier(node.initializer);
      if (
        requireSpecifier !== undefined &&
        isManualOnlyGoldenLayoutSpecifier(requireSpecifier)
      ) {
        addBindingName(node.name, bindings);
        const classification =
          classifyGoldenLayoutPackageSpecifier(requireSpecifier);
        preserveNode(node, classification.manualReview);
        return;
      }
      if (
        dynamicImportSpecifier !== undefined &&
        isGoldenLayoutPackageSpecifier(dynamicImportSpecifier)
      ) {
        addBindingName(node.name, bindings);
        preserveNode(node, 'dynamic imports require manual migration');
        return;
      }
    }
    const requireSpecifier = getStaticRequireSpecifier(node);
    if (
      requireSpecifier !== undefined &&
      isManualOnlyGoldenLayoutSpecifier(requireSpecifier)
    ) {
      const classification =
        classifyGoldenLayoutPackageSpecifier(requireSpecifier);
      const declaration = findContainingVariableDeclaration(node);
      if (declaration !== undefined) {
        addBindingName(declaration.name, bindings);
      }
      const assignment = findContainingAssignment(node);
      if (assignment !== undefined) {
        addAssignmentTargetBindings(assignment.left, bindings);
      }
      const ownedExpression = findOwnedModuleExpression(node);
      preserveNode(
        declaration !== undefined && !ts.isIdentifier(declaration.name)
          ? declaration
          : assignment !== undefined &&
              (ts.isArrayLiteralExpression(assignment.left) ||
                ts.isObjectLiteralExpression(assignment.left))
            ? assignment
            : ownedExpression,
        classification.manualReview,
      );
      return;
    }
    const dynamicImportSpecifier = getStaticDynamicImportSpecifier(node);
    if (
      dynamicImportSpecifier !== undefined &&
      isGoldenLayoutPackageSpecifier(dynamicImportSpecifier)
    ) {
      const declaration = findContainingVariableDeclaration(node);
      if (declaration !== undefined) {
        addBindingName(declaration.name, bindings);
      }
      const assignment = findContainingAssignment(node);
      if (assignment !== undefined) {
        addAssignmentTargetBindings(assignment.left, bindings);
      }
      preserveNode(
        assignment !== undefined &&
          (ts.isArrayLiteralExpression(assignment.left) ||
            ts.isObjectLiteralExpression(assignment.left))
          ? assignment
          : findOwnedModuleExpression(node),
        'dynamic imports require manual migration',
      );
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { bindings, nodes, reviews };
}

function getRootIdentifier(node) {
  let current = node;
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isQualifiedName(current)
  ) {
    current = ts.isPropertyAccessExpression(current)
      ? current.expression
      : current.left;
  }
  return ts.isIdentifier(current) ? current : undefined;
}

function classifyReceiverType(typeNode, checker, goldenLayoutBindings) {
  if (typeNode === undefined) {
    return undefined;
  }
  let typeName;
  if (ts.isTypeReferenceNode(typeNode)) {
    typeName = typeNode.typeName;
  } else if (ts.isTypeQueryNode(typeNode)) {
    typeName = typeNode.exprName;
  } else {
    return undefined;
  }
  const root = getRootIdentifier(typeName);
  const symbol =
    root === undefined ? undefined : checker.getSymbolAtLocation(root);
  const binding =
    symbol === undefined ? undefined : goldenLayoutBindings.get(symbol);
  return binding === undefined
    ? undefined
    : receiverTypeKinds.get(binding.exportName);
}

/** Classifies statically provable API receivers used by method migrations. */
function collectReceiverKinds(sourceFile, checker, goldenLayoutBindings) {
  const receiverKinds = new Map();

  function record(name, kind) {
    if (!ts.isIdentifier(name) || kind === undefined) {
      return;
    }
    const symbol = checker.getSymbolAtLocation(name);
    if (symbol === undefined) {
      return;
    }
    const existing = receiverKinds.get(symbol);
    receiverKinds.set(
      symbol,
      existing === undefined || existing === kind ? kind : 'ambiguous',
    );
  }

  function visit(node) {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      let kind = classifyReceiverType(node.type, checker, goldenLayoutBindings);
      if (
        kind === undefined &&
        ts.isVariableDeclaration(node) &&
        node.initializer !== undefined &&
        ts.isNewExpression(node.initializer)
      ) {
        const root = getRootIdentifier(node.initializer.expression);
        const symbol =
          root === undefined ? undefined : checker.getSymbolAtLocation(root);
        const binding =
          symbol === undefined ? undefined : goldenLayoutBindings.get(symbol);
        kind =
          binding === undefined
            ? undefined
            : receiverTypeKinds.get(binding.exportName);
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
  return /(?:^|\.)(?:row|column|stack|component|react-component)$/.test(
    typeText.replaceAll(/["']/g, ''),
  );
}

function isLayoutDimensionsObjectLiteral(
  objectLiteral,
  isProvenLayoutConfigObjectLiteral,
) {
  const parent = objectLiteral.parent;
  return (
    ts.isPropertyAssignment(parent) &&
    parent.initializer === objectLiteral &&
    ((ts.isIdentifier(parent.name) && parent.name.text === 'dimensions') ||
      (ts.isStringLiteral(parent.name) && parent.name.text === 'dimensions')) &&
    ts.isObjectLiteralExpression(parent.parent) &&
    isProvenLayoutConfigObjectLiteral(parent.parent)
  );
}

/** Returns a modern size-property replacement for an unambiguous numeric field. */
function getNumericPropertyMigration(
  node,
  isProvenLayoutItemObjectLiteral,
  isProvenLayoutConfigObjectLiteral,
) {
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
    if (
      !isLayoutDimensionsObjectLiteral(
        node.parent,
        isProvenLayoutConfigObjectLiteral,
      )
    ) {
      return undefined;
    }
    const axis = propertyName === 'minItemWidth' ? 'Width' : 'Height';
    const target = `defaultMinItem${axis}`;
    if (findObjectProperty(node.parent, target) !== undefined) {
      return undefined;
    }
    return `${target}: '${node.initializer.text}px'`;
  }

  if (!isProvenLayoutItemObjectLiteral(node.parent)) {
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

function migrateImportSpecifier(specifier, reserveRenamedLocalName) {
  const importedName = specifier.propertyName?.text ?? specifier.name.text;
  const migratedName =
    importedName === 'default'
      ? 'StrelitLayout'
      : (sourceIdentifierReplacements.get(importedName) ?? importedName);
  const originalLocalName = specifier.name.text;
  const importsLayoutConstructor =
    importedName === 'default' || importedName === 'GoldenLayout';
  let localName =
    specifier.propertyName === undefined ||
    originalLocalName === importedName ||
    (importsLayoutConstructor && originalLocalName === 'GoldenLayout')
      ? migratedName
      : originalLocalName;
  if (localName === migratedName && originalLocalName !== migratedName) {
    localName = reserveRenamedLocalName(migratedName);
  }
  const typePrefix = specifier.isTypeOnly ? 'type ' : '';
  return migratedName === localName
    ? `${typePrefix}${migratedName}`
    : `${typePrefix}${migratedName} as ${localName}`;
}

function migrateExportSpecifier(specifier) {
  const importedName = specifier.propertyName?.text ?? specifier.name.text;
  const migratedName =
    importedName === 'default'
      ? 'StrelitLayout'
      : (sourceIdentifierReplacements.get(importedName) ?? importedName);
  const originalExportedName = specifier.name.text;
  const exportedName =
    originalExportedName === 'default'
      ? 'default'
      : originalExportedName === importedName ||
          originalExportedName === 'GoldenLayout'
        ? migratedName
        : originalExportedName;
  const typePrefix = specifier.isTypeOnly ? 'type ' : '';
  return migratedName === exportedName
    ? `${typePrefix}${migratedName}`
    : `${typePrefix}${migratedName} as ${exportedName}`;
}

function createDefaultImportClause(importClause, reserveRenamedBinding) {
  const defaultLocalName = importClause.name.text;
  const migratedDefaultLocalName =
    defaultLocalName === 'GoldenLayout'
      ? reserveRenamedBinding(importClause.name, 'StrelitLayout')
      : defaultLocalName;
  const defaultBinding =
    migratedDefaultLocalName === 'StrelitLayout'
      ? 'StrelitLayout'
      : `StrelitLayout as ${migratedDefaultLocalName}`;
  const typePrefix = importClause.isTypeOnly ? 'type ' : '';
  const namedBindings = importClause.namedBindings;
  if (namedBindings === undefined) {
    return `${typePrefix}{ ${defaultBinding} }`;
  }
  if (ts.isNamespaceImport(namedBindings)) {
    return undefined;
  }
  const named = namedBindings.elements.map((specifier) =>
    migrateImportSpecifier(specifier, (migratedName) =>
      reserveRenamedBinding(specifier.name, migratedName),
    ),
  );
  return `${typePrefix}{ ${[defaultBinding, ...named].join(', ')} }`;
}

function isGoldenLayoutPackageOrJsEntrySpecifier(specifier) {
  if (specifier === 'golden-layout') {
    return true;
  }
  if (!specifier.startsWith('golden-layout/')) {
    return false;
  }

  const relativePath = specifier.slice('golden-layout/'.length);
  return isGoldenLayoutJsEntryRelativePath(relativePath);
}

function isGoldenLayoutPackageSpecifier(specifier) {
  return (
    specifier === 'golden-layout' || specifier.startsWith('golden-layout/')
  );
}

function isGoldenLayoutJsEntryRelativePath(relativePath) {
  return /^(?:(?:dist(?:\/(?:esm|cjs|browser))?|src)\/)?index\.m?js$/.test(
    relativePath,
  );
}

const unsupportedJsDeepImportReview =
  'unsupported Golden Layout JavaScript deep import requires manual migration';
const unsupportedPackageSubpathReview =
  'unsupported Golden Layout package subpath requires manual migration';
const scssThemeImportReview =
  'SCSS theme imports require a manual Strelit theme selection';

function classifyGoldenLayoutPackageSpecifier(specifier) {
  if (specifier === 'golden-layout') {
    return { migrated: 'strelit-ui-kit' };
  }
  if (!specifier.startsWith('golden-layout/')) {
    return { migrated: specifier };
  }

  const relativePath = specifier.slice('golden-layout/'.length);
  if (isGoldenLayoutJsEntryRelativePath(relativePath)) {
    return { migrated: 'strelit-ui-kit' };
  }
  if (/^package\.json(?:[?#].*)?$/.test(relativePath)) {
    return {
      migrated: relativePath.replace(
        /^package\.json/,
        'strelit-ui-kit/package.json',
      ),
    };
  }

  const styleMatch = /^(?:dist|src)\/(css|less|scss)\/(.+)$/.exec(relativePath);
  if (styleMatch !== null) {
    const [, styleType, originalFile] = styleMatch;
    if (
      styleType === 'scss' &&
      /(?:^|\/)_?goldenlayout-[^/?#]+-theme\.scss(?:[?#].*)?$/.test(
        originalFile,
      )
    ) {
      return { migrated: specifier, manualReview: scssThemeImportReview };
    }

    let file = originalFile
      .replace(/(^|\/)(?:goldenlayout-)?base\./, '$1strelit-base.')
      .replace(/(^|\/)goldenlayout-/, '$1strelit-');
    if (
      (styleType === 'css' || styleType === 'less') &&
      /(?:^|\/)strelit-[^/?#]+-theme\.(?:css|less)(?:[?#].*)?$/.test(file) &&
      !file.startsWith('themes/')
    ) {
      file = `themes/${file}`;
    }
    return { migrated: `strelit-ui-kit/dist/${styleType}/${file}` };
  }

  return {
    migrated: specifier,
    manualReview: /\.m?js(?:[?#].*)?$/.test(relativePath)
      ? unsupportedJsDeepImportReview
      : unsupportedPackageSubpathReview,
  };
}

function isManualOnlyGoldenLayoutSpecifier(specifier) {
  return (
    classifyGoldenLayoutPackageSpecifier(specifier).manualReview !== undefined
  );
}

/** Migrates one JavaScript or TypeScript source file through syntax-aware edits. */
function replaceSelectorTokens(value) {
  return value.replace(
    /(?<![A-Za-z0-9_])lm_goldenlayout(?![A-Za-z0-9_])/g,
    'lm_strelit',
  );
}

function replaceRawSelectorTokens(rawLiteral, cookedValue) {
  if (rawLiteral.includes('\\')) {
    return JSON.stringify(replaceSelectorTokens(cookedValue));
  }

  const rawPattern = /(^|[^A-Za-z0-9_])lm_goldenlayout(?![A-Za-z0-9_])/g;
  return rawLiteral.replace(rawPattern, '$1lm_strelit');
}

function replaceSelectorLiteral(node, sourceFile) {
  const rawLiteral = node.getText(sourceFile);
  if (ts.isJsxAttribute(node.parent) && node.parent.initializer === node) {
    return rawLiteral.replace(
      /(^|[^A-Za-z0-9_])lm_goldenlayout(?![A-Za-z0-9_])/g,
      '$1lm_strelit',
    );
  }

  return replaceRawSelectorTokens(rawLiteral, node.text);
}

function replaceTemplateSelectorLiteral(node, sourceFile) {
  const rawLiteral = node.getText(sourceFile);
  if (!rawLiteral.includes('\\')) {
    return rawLiteral.replace(
      /(^|[^A-Za-z0-9_])lm_goldenlayout(?![A-Za-z0-9_])/g,
      '$1lm_strelit',
    );
  }

  const migratedText = replaceSelectorTokens(node.text);
  const escapedText = JSON.stringify(migratedText)
    .slice(1, -1)
    .replaceAll('`', '\\`')
    .replaceAll('${', '\\${');
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return `\`${escapedText}\``;
  } else if (ts.isTemplateHead(node)) {
    return `\`${escapedText}\${`;
  } else if (ts.isTemplateMiddle(node)) {
    return `}${escapedText}\${`;
  } else {
    return `}${escapedText}\``;
  }
}

function transformSourceContent(content, filePath) {
  const normalized = content;
  const applied = [];

  const extension = path.extname(filePath).toLowerCase();
  const { checker, sourceFile } = createSourceAnalysis(
    normalized,
    filePath,
    extension,
  );
  const preferRequire =
    extension === '.cjs' ||
    extension === '.cts' ||
    (extension === '.js' && containsCommonJsRequire(sourceFile));
  if (sourceFile.parseDiagnostics.length > 0) {
    return {
      transformed: content,
      applied: [],
      manualReviews: [
        'source file contains syntax errors and requires manual migration',
      ],
    };
  }
  const edits = [];
  const requiredImports = new Map();
  const { bindings, importedNames, nonImportBindings } =
    collectSourceBindings(sourceFile);
  const goldenLayoutBindings = collectGoldenLayoutBindingSymbols(
    sourceFile,
    checker,
  );
  const manualOnly = collectManualOnlySourceContext(sourceFile);
  const manualOnlyBindings = manualOnly.bindings;
  const receiverKinds = collectReceiverKinds(
    sourceFile,
    checker,
    goldenLayoutBindings,
  );
  const sourceManualReviews = new Set(manualOnly.reviews);
  const layoutConfigTypeNames = new Set([
    'LayoutConfig',
    'PopoutLayoutConfig',
    'ResolvedLayoutConfig',
    'ResolvedPopoutLayoutConfig',
  ]);
  const layoutItemTypeNames = new Set([
    'ItemConfig',
    'RootItemConfig',
    'RowOrColumnItemConfig',
    'StackItemConfig',
    'ComponentItemConfig',
    'ResolvedItemConfig',
    'ResolvedRootItemConfig',
    'ResolvedRowOrColumnItemConfig',
    'ResolvedStackItemConfig',
    'ResolvedComponentItemConfig',
  ]);

  function getImportedExportName(identifier) {
    const symbol = checker.getSymbolAtLocation(identifier);
    const goldenBinding =
      symbol === undefined ? undefined : goldenLayoutBindings.get(symbol);
    if (goldenBinding !== undefined) {
      return goldenBinding.exportName;
    }
    for (const declaration of symbol?.declarations ?? []) {
      if (
        ts.isImportSpecifier(declaration) &&
        ts.isNamedImports(declaration.parent) &&
        ts.isImportClause(declaration.parent.parent) &&
        ts.isImportDeclaration(declaration.parent.parent.parent) &&
        ts.isStringLiteral(declaration.parent.parent.parent.moduleSpecifier) &&
        declaration.parent.parent.parent.moduleSpecifier.text ===
          'strelit-ui-kit'
      ) {
        return declaration.propertyName?.text ?? declaration.name.text;
      }
    }
    return undefined;
  }

  function getContextTypeNode(objectLiteral) {
    const parent = objectLiteral.parent;
    if (
      ts.isVariableDeclaration(parent) &&
      parent.initializer === objectLiteral
    ) {
      return parent.type;
    }
    if (
      (ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) &&
      parent.expression === objectLiteral
    ) {
      return parent.type;
    }
    return undefined;
  }

  function hasImportedTypeContext(objectLiteral, expectedNames) {
    const typeNode = getContextTypeNode(objectLiteral);
    function containsImportedType(node) {
      if (ts.isParenthesizedTypeNode(node)) {
        return containsImportedType(node.type);
      }
      if (ts.isUnionTypeNode(node)) {
        return node.types.some(
          (member) =>
            member.kind !== ts.SyntaxKind.UndefinedKeyword &&
            member.kind !== ts.SyntaxKind.NullKeyword &&
            containsImportedType(member),
        );
      }
      if (!ts.isTypeReferenceNode(node)) {
        return false;
      }
      const root = getRootIdentifier(node.typeName);
      const exportName =
        root === undefined ? undefined : getImportedExportName(root);
      if (exportName !== undefined && expectedNames.has(exportName)) {
        return true;
      }
      return (
        ts.isIdentifier(node.typeName) &&
        ['Readonly', 'Required', 'Partial'].includes(node.typeName.text) &&
        node.typeArguments?.some(containsImportedType) === true
      );
    }
    return typeNode !== undefined && containsImportedType(typeNode);
  }

  function usesImportedItemType(objectLiteral) {
    const typeProperty = findObjectProperty(objectLiteral, 'type');
    if (
      typeProperty === undefined ||
      !ts.isPropertyAccessExpression(typeProperty.initializer)
    ) {
      return false;
    }
    const root = getRootIdentifier(typeProperty.initializer);
    return root !== undefined && getImportedExportName(root) === 'ItemType';
  }

  function isRecognizedLayoutCallArgument(objectLiteral, methodNames) {
    let expression = objectLiteral;
    while (
      (ts.isAsExpression(expression.parent) ||
        ts.isSatisfiesExpression(expression.parent) ||
        ts.isParenthesizedExpression(expression.parent)) &&
      expression.parent.expression === expression
    ) {
      expression = expression.parent;
    }
    const call = expression.parent;
    if (
      !ts.isCallExpression(call) ||
      !call.arguments.includes(expression) ||
      !ts.isPropertyAccessExpression(call.expression) ||
      !methodNames.has(call.expression.name.text)
    ) {
      return false;
    }
    const receiver = call.expression.expression;
    const receiverSymbol = ts.isIdentifier(receiver)
      ? checker.getSymbolAtLocation(receiver)
      : undefined;
    return (
      receiverSymbol !== undefined &&
      receiverKinds.get(receiverSymbol) === 'layout'
    );
  }

  function isOpenPopoutOfProvenConfig(objectLiteral) {
    const array = objectLiteral.parent;
    if (!ts.isArrayLiteralExpression(array)) {
      return false;
    }
    const property = array.parent;
    if (
      !ts.isPropertyAssignment(property) ||
      property.initializer !== array ||
      !(
        (ts.isIdentifier(property.name) &&
          property.name.text === 'openPopouts') ||
        (ts.isStringLiteral(property.name) &&
          property.name.text === 'openPopouts')
      ) ||
      !ts.isObjectLiteralExpression(property.parent)
    ) {
      return false;
    }
    return isProvenLayoutConfigObjectLiteral(property.parent);
  }

  function isProvenLayoutConfigObjectLiteral(objectLiteral) {
    return (
      hasImportedTypeContext(objectLiteral, layoutConfigTypeNames) ||
      isOpenPopoutOfProvenConfig(objectLiteral) ||
      isRecognizedLayoutCallArgument(
        objectLiteral,
        new Set(['loadLayout', 'createPopoutFromPopoutLayoutConfig']),
      )
    );
  }

  function isProvenLayoutItemObjectLiteral(objectLiteral) {
    if (!isLayoutItemObjectLiteral(objectLiteral)) {
      return false;
    }
    if (
      hasImportedTypeContext(objectLiteral, layoutItemTypeNames) ||
      usesImportedItemType(objectLiteral) ||
      isRecognizedLayoutCallArgument(
        objectLiteral,
        new Set(['addItem', 'loadComponentAsRoot']),
      )
    ) {
      return true;
    }

    const parent = objectLiteral.parent;
    if (
      ts.isPropertyAssignment(parent) &&
      parent.initializer === objectLiteral &&
      ((ts.isIdentifier(parent.name) && parent.name.text === 'root') ||
        (ts.isStringLiteral(parent.name) && parent.name.text === 'root')) &&
      ts.isObjectLiteralExpression(parent.parent)
    ) {
      return isProvenLayoutConfigObjectLiteral(parent.parent);
    }
    if (ts.isArrayLiteralExpression(parent)) {
      const property = parent.parent;
      if (
        ts.isPropertyAssignment(property) &&
        property.initializer === parent &&
        ((ts.isIdentifier(property.name) && property.name.text === 'content') ||
          (ts.isStringLiteral(property.name) &&
            property.name.text === 'content')) &&
        ts.isObjectLiteralExpression(property.parent)
      ) {
        return (
          isProvenLayoutItemObjectLiteral(property.parent) ||
          isProvenLayoutConfigObjectLiteral(property.parent)
        );
      }
    }
    return false;
  }

  function resolveImportName(exportName) {
    const importedName = importedNames.get(exportName);
    if (importedName !== undefined && !nonImportBindings.has(importedName)) {
      return importedName;
    }

    const existingRequiredName = requiredImports.get(exportName);
    if (existingRequiredName !== undefined) {
      return existingRequiredName;
    }

    const localName = reserveCollisionSafeName(exportName);
    requiredImports.set(exportName, localName);
    return localName;
  }

  function reserveCollisionSafeName(exportName) {
    let localName = exportName;
    if (bindings.has(localName)) {
      localName = `${exportName}FromStrelit`;
      let suffix = 2;
      while (bindings.has(localName)) {
        localName = `${exportName}FromStrelit${suffix++}`;
      }
    }
    bindings.add(localName);
    return localName;
  }

  function reserveRenamedBinding(identifier, migratedName) {
    const localName = reserveCollisionSafeName(migratedName);
    const symbol = checker.getSymbolAtLocation(identifier);
    if (symbol !== undefined) {
      const binding = goldenLayoutBindings.get(symbol);
      if (binding !== undefined) {
        binding.replacementName = localName;
      }
    }
    return localName;
  }

  function addEdit(node, text, name) {
    edits.push({ start: node.getStart(sourceFile), end: node.getEnd(), text });
    applied.push(name);
  }

  function visit(node) {
    if (manualOnly.nodes.has(node)) {
      return;
    }
    const numericPropertyMigration = getNumericPropertyMigration(
      node,
      isProvenLayoutItemObjectLiteral,
      isProvenLayoutConfigObjectLiteral,
    );
    if (numericPropertyMigration !== undefined) {
      addEdit(node, numericPropertyMigration, 'numeric layout item sizing');
      return;
    }

    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const classification = classifyGoldenLayoutPackageSpecifier(
        node.moduleSpecifier.text,
      );
      if (classification.manualReview !== undefined) {
        sourceManualReviews.add(classification.manualReview);
        return;
      }
      if (isNamespacePackageImport(node)) {
        sourceManualReviews.add(
          'namespace package imports require member-by-member migration',
        );
        return;
      }
      const migrated = classification.migrated;
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
      if (node.importClause.name !== undefined) {
        const migratedClause = createDefaultImportClause(
          node.importClause,
          reserveRenamedBinding,
        );
        if (migratedClause !== undefined) {
          addEdit(node.importClause, migratedClause, 'default package import');
          return;
        }
      }
    }

    if (
      ts.isImportSpecifier(node) &&
      ts.isNamedImports(node.parent) &&
      ts.isImportClause(node.parent.parent) &&
      ts.isImportDeclaration(node.parent.parent.parent) &&
      ts.isStringLiteral(node.parent.parent.parent.moduleSpecifier) &&
      isGoldenLayoutPackageOrJsEntrySpecifier(
        node.parent.parent.parent.moduleSpecifier.text,
      )
    ) {
      const migrated = migrateImportSpecifier(node, (migratedName) =>
        reserveRenamedBinding(node.name, migratedName),
      );
      if (migrated !== node.getText(sourceFile)) {
        addEdit(node, migrated, 'named package import');
      }
      return;
    }

    if (
      ts.isExportSpecifier(node) &&
      ts.isNamedExports(node.parent) &&
      ts.isExportDeclaration(node.parent.parent) &&
      node.parent.parent.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.parent.parent.moduleSpecifier) &&
      isGoldenLayoutPackageOrJsEntrySpecifier(
        node.parent.parent.moduleSpecifier.text,
      )
    ) {
      const migrated = migrateExportSpecifier(node);
      if (migrated !== node.getText(sourceFile)) {
        addEdit(node, migrated, 'named package re-export');
      }
      return;
    }

    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const requireMember = getStaticRequireMember(node);
      if (requireMember !== undefined) {
        const classification = classifyGoldenLayoutPackageSpecifier(
          requireMember.specifier,
        );
        if (classification.manualReview !== undefined) {
          sourceManualReviews.add(classification.manualReview);
          return;
        }
        if (isGoldenLayoutPackageOrJsEntrySpecifier(requireMember.specifier)) {
          const moduleSpecifier = node.expression.arguments[0];
          const quote = normalized[moduleSpecifier.getStart(sourceFile)];
          addEdit(
            moduleSpecifier,
            `${quote}strelit-ui-kit${quote}`,
            'CommonJS package member import',
          );
          const exportName =
            requireMember.memberName === 'default'
              ? 'GoldenLayout'
              : requireMember.memberName;
          const migratedName =
            sourceIdentifierReplacements.get(exportName) ?? exportName;
          if (migratedName !== requireMember.memberName) {
            const replacement = ts.isStringLiteral(requireMember.memberNode)
              ? `${requireMember.memberNode.getText(sourceFile)[0]}${migratedName}${requireMember.memberNode.getText(sourceFile)[0]}`
              : migratedName;
            addEdit(
              requireMember.memberNode,
              replacement,
              'CommonJS package member',
            );
          }
        }
        return;
      }
      if (isDynamicRequireMember(node)) {
        const specifier = getStaticRequireSpecifier(node.expression);
        const classification = classifyGoldenLayoutPackageSpecifier(specifier);
        if (
          classification.manualReview !== undefined ||
          isGoldenLayoutPackageOrJsEntrySpecifier(specifier)
        ) {
          sourceManualReviews.add(
            classification.manualReview ??
              'dynamic CommonJS package member requires manual migration',
          );
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
      const classification = classifyGoldenLayoutPackageSpecifier(
        moduleSpecifier.text,
      );
      if (classification.manualReview !== undefined) {
        sourceManualReviews.add(classification.manualReview);
        return;
      }
      const parent = node.parent;
      const isObjectBindingInitializer =
        ts.isVariableDeclaration(parent) &&
        ts.isObjectBindingPattern(parent.name) &&
        parent.initializer === node;
      const isDestructuringAssignment =
        ts.isBinaryExpression(parent) &&
        parent.right === node &&
        (ts.isObjectLiteralExpression(parent.left) ||
          ts.isArrayLiteralExpression(parent.left));
      const isStaticMemberExpression =
        (ts.isPropertyAccessExpression(parent) ||
          ts.isElementAccessExpression(parent)) &&
        parent.expression === node;
      if (
        ts.isBinaryExpression(parent) &&
        parent.right === node &&
        parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        ts.isIdentifier(parent.left) &&
        isGoldenLayoutPackageOrJsEntrySpecifier(moduleSpecifier.text)
      ) {
        const quote = normalized[moduleSpecifier.getStart(sourceFile)];
        addEdit(
          node,
          `require(${quote}strelit-ui-kit${quote}).StrelitLayout`,
          'CommonJS package assignment',
        );
        return;
      }
      if (
        isGoldenLayoutPackageOrJsEntrySpecifier(moduleSpecifier.text) &&
        isDestructuringAssignment
      ) {
        sourceManualReviews.add(
          'CommonJS destructuring assignments require manual migration',
        );
        return;
      }
      if (
        isGoldenLayoutPackageOrJsEntrySpecifier(moduleSpecifier.text) &&
        !isObjectBindingInitializer &&
        !isStaticMemberExpression
      ) {
        const quote = normalized[moduleSpecifier.getStart(sourceFile)];
        addEdit(
          node,
          `require(${quote}strelit-ui-kit${quote}).StrelitLayout`,
          'CommonJS default package expression',
        );
        return;
      }
      const migrated = classification.migrated;
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
      isGoldenLayoutPackageOrJsEntrySpecifier(
        node.initializer.arguments[0].text,
      )
    ) {
      const localName = node.name.text;
      const binding =
        localName === 'GoldenLayout'
          ? 'StrelitLayout'
          : `StrelitLayout: ${localName}`;
      const moduleSpecifier = node.initializer.arguments[0];
      const quote = normalized[moduleSpecifier.getStart(sourceFile)];
      const migratedModule = `require(${quote}strelit-ui-kit${quote})`;
      addEdit(
        node,
        `{ ${binding} } = ${migratedModule}`,
        'CommonJS package import',
      );
      return;
    }

    if (
      ts.isBindingElement(node) &&
      ts.isIdentifier(node.name) &&
      ts.isObjectBindingPattern(node.parent) &&
      ts.isVariableDeclaration(node.parent.parent) &&
      node.parent.parent.initializer !== undefined
    ) {
      const specifier = getStaticRequireSpecifier(
        node.parent.parent.initializer,
      );
      if (
        specifier !== undefined &&
        isGoldenLayoutPackageOrJsEntrySpecifier(specifier)
      ) {
        const importedName =
          node.propertyName?.getText(sourceFile) ?? node.name.text;
        const exportName =
          importedName === 'default' ? 'GoldenLayout' : importedName;
        const migratedName =
          sourceIdentifierReplacements.get(exportName) ?? exportName;
        const localName =
          node.name.text === exportName ? migratedName : node.name.text;
        const migratedBinding =
          migratedName === localName
            ? migratedName
            : `${migratedName}: ${localName}`;
        const initializer =
          node.initializer === undefined
            ? ''
            : ` = ${node.initializer.getText(sourceFile)}`;
        const migratedBindingWithInitializer = `${migratedBinding}${initializer}`;
        if (migratedBindingWithInitializer !== node.getText(sourceFile)) {
          addEdit(
            node,
            migratedBindingWithInitializer,
            'CommonJS named binding',
          );
        }
        return;
      }
    }

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal) &&
      isGoldenLayoutPackageSpecifier(node.argument.literal.text)
    ) {
      sourceManualReviews.add('import types require manual migration');
      return;
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteral(node.moduleReference.expression) &&
      isGoldenLayoutPackageSpecifier(node.moduleReference.expression.text)
    ) {
      sourceManualReviews.add(
        'TypeScript import-equals declarations require manual migration',
      );
      return;
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      isGoldenLayoutPackageSpecifier(node.arguments[0].text)
    ) {
      sourceManualReviews.add('dynamic imports require manual migration');
      return;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      receiverDependentMethodNames.has(node.expression.name.text)
    ) {
      const receiver = node.expression.expression;
      const receiverSymbol = ts.isIdentifier(receiver)
        ? checker.getSymbolAtLocation(receiver)
        : undefined;
      const receiverKind =
        receiverSymbol === undefined
          ? undefined
          : receiverKinds.get(receiverSymbol);
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
      const root = getRootIdentifier(node);
      const rootName = root?.text;
      if (rootName !== undefined && manualOnlyBindings.has(rootName)) {
        return;
      }
      const rootSymbol =
        root === undefined ? undefined : checker.getSymbolAtLocation(root);
      const rootBinding =
        rootSymbol === undefined
          ? undefined
          : goldenLayoutBindings.get(rootSymbol);
      const localDottedName = getDottedName(node, sourceFile);
      const dottedName =
        rootBinding === undefined || rootName === undefined
          ? localDottedName
          : `${rootBinding.exportName}${localDottedName.slice(rootName.length)}`;
      if (dottedName === 'DragSource.ComponentItemConfig') {
        sourceManualReviews.add(
          'legacy DragSource.ComponentItemConfig fields require type/state to componentType/componentState conversion',
        );
      }
      const replacement =
        rootBinding === undefined
          ? undefined
          : (dottedApiReplacements.get(dottedName) ??
            nestedTypeReplacements.get(dottedName));
      if (replacement !== undefined) {
        const localName = resolveImportName(replacement);
        addEdit(node, localName, `module API ${dottedName}`);
        return;
      } else if (
        rootBinding === undefined &&
        (dottedApiReplacements.has(localDottedName) ||
          nestedTypeReplacements.has(localDottedName))
      ) {
        sourceManualReviews.add(
          'unbound Golden Layout-like source APIs require manual migration',
        );
      }
    }

    if (
      ts.isStringLiteral(node) &&
      /(?<![A-Za-z0-9_])lm_goldenlayout(?![A-Za-z0-9_])/.test(node.text) &&
      !(
        (ts.isImportDeclaration(node.parent) ||
          ts.isExportDeclaration(node.parent)) &&
        node.parent.moduleSpecifier === node
      )
    ) {
      addEdit(
        node,
        replaceSelectorLiteral(node, sourceFile),
        'branded root selector',
      );
      return;
    }

    if (
      (ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
      /(?<![A-Za-z0-9_])lm_goldenlayout(?![A-Za-z0-9_])/.test(node.text)
    ) {
      addEdit(
        node,
        replaceTemplateSelectorLiteral(node, sourceFile),
        'branded root selector',
      );
      return;
    }

    if (ts.isIdentifier(node)) {
      if (manualOnlyBindings.has(node.text)) {
        return;
      }
      const parent = node.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ts.isNamespaceImport(parent) ||
        ((ts.isPropertyAssignment(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isMethodDeclaration(parent)) &&
          parent.name === node);
      if (!isPropertyName) {
        const symbol = checker.getSymbolAtLocation(node);
        const binding =
          symbol === undefined ? undefined : goldenLayoutBindings.get(symbol);
        if (binding !== undefined && binding.replacementName !== node.text) {
          addEdit(node, binding.replacementName, `identifier ${node.text}`);
        } else if (
          binding === undefined &&
          sourceIdentifierReplacements.has(node.text)
        ) {
          sourceManualReviews.add(
            'unbound Golden Layout-like identifiers require manual migration',
          );
        }
      }
    }

    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === 'type') ||
        (ts.isStringLiteral(node.name) && node.name.text === 'type')) &&
      ts.isStringLiteral(node.initializer) &&
      node.initializer.text === 'react-component' &&
      ts.isObjectLiteralExpression(node.parent) &&
      isProvenLayoutItemObjectLiteral(node.parent)
    ) {
      const quote = node.initializer.getText(sourceFile)[0];
      addEdit(
        node.initializer,
        `${quote}component${quote}`,
        'v1 react-component item type',
      );
      sourceManualReviews.add(
        'react-component items require a modern framework adapter',
      );
    }

    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === 'componentName') ||
        (ts.isStringLiteral(node.name) &&
          node.name.text === 'componentName')) &&
      ts.isObjectLiteralExpression(node.parent) &&
      isProvenLayoutItemObjectLiteral(node.parent)
    ) {
      const migratedName = ts.isStringLiteral(node.name)
        ? `${node.name.getText(sourceFile)[0]}componentType${node.name.getText(sourceFile)[0]}`
        : 'componentType';
      addEdit(node.name, migratedName, 'config property');
    }

    if (
      ts.isShorthandPropertyAssignment(node) &&
      node.name.text === 'componentName' &&
      ts.isObjectLiteralExpression(node.parent) &&
      isProvenLayoutItemObjectLiteral(node.parent)
    ) {
      addEdit(node, 'componentType: componentName', 'config property');
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  let transformed = applyTextEdits(normalized, edits);
  if (requiredImports.size > 0) {
    transformed = addRequiredImports(
      transformed,
      requiredImports,
      preferRequire,
    );
  }

  return {
    transformed,
    applied: [...new Set(applied)],
    manualReviews: [...sourceManualReviews],
  };
}

function containsCommonJsRequire(sourceFile) {
  let found = false;
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require'
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

/** Migrates a package or published style subpath while preserving URL suffixes. */
function migratePackagePath(specifier) {
  return classifyGoldenLayoutPackageSpecifier(specifier).migrated;
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

function isStandaloneLayoutItem(value, sourceVersion) {
  if (!isLayoutItem(value)) {
    return false;
  }
  if (['row', 'column', 'stack'].includes(value.type)) {
    return Array.isArray(value.content);
  }
  const hasUnambiguousLayoutShape =
    value.componentType !== undefined ||
    value.componentState !== undefined ||
    value.isClosable !== undefined ||
    value.reorderEnabled !== undefined ||
    value.header !== undefined ||
    value.maximised !== undefined;
  if (hasUnambiguousLayoutShape) {
    return true;
  }
  return (
    sourceVersion === 'v1' &&
    value.componentName !== undefined &&
    Object.keys(value).every((key) => ['type', 'componentName'].includes(key))
  );
}

function isLayoutConfig(value) {
  return (
    isRecord(value) &&
    !isLayoutItem(value) &&
    (isLayoutItem(value.root) ||
      (Array.isArray(value.content) && value.content.some(isLayoutItem)) ||
      (Array.isArray(value.openPopouts) &&
        value.openPopouts.some(
          (popout) =>
            isRecord(popout) &&
            (isLayoutItem(popout.root) ||
              (Array.isArray(popout.content) &&
                popout.content.some(isLayoutItem))),
        )))
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

  if (
    item.width !== undefined &&
    item.height !== undefined &&
    item.size === undefined
  ) {
    manualReviews.add(
      `${itemPath} defines both width and height; size requires manual selection`,
    );
  }
  let legacySizeMigrated = item.size !== undefined;
  if (
    item.size === undefined &&
    !(item.width !== undefined && item.height !== undefined)
  ) {
    const legacySize = item.width ?? item.height;
    if (typeof legacySize === 'number') {
      item.size = `${legacySize}%`;
      legacySizeMigrated = true;
    } else if (legacySize !== undefined) {
      manualReviews.add(`${itemPath} has a non-numeric legacy size`);
    }
  }
  if (legacySizeMigrated) {
    delete item.width;
    delete item.height;
  }

  if (
    item.minWidth !== undefined &&
    item.minHeight !== undefined &&
    item.minSize === undefined
  ) {
    manualReviews.add(
      `${itemPath} defines both minWidth and minHeight; minSize requires manual selection`,
    );
  }
  let legacyMinSizeMigrated = item.minSize !== undefined;
  if (
    item.minSize === undefined &&
    !(item.minWidth !== undefined && item.minHeight !== undefined)
  ) {
    const legacyMinSize = item.minWidth ?? item.minHeight;
    if (typeof legacyMinSize === 'number') {
      item.minSize = `${legacyMinSize}px`;
      legacyMinSizeMigrated = true;
    } else if (legacyMinSize !== undefined) {
      manualReviews.add(`${itemPath} has a non-numeric legacy minimum size`);
    }
  }
  if (legacyMinSizeMigrated) {
    delete item.minWidth;
    delete item.minHeight;
  }

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
    if (item.header !== undefined && !isRecord(item.header)) {
      manualReviews.add(`${itemPath}.header is not an object`);
    } else {
      item.header ??= {};
      if (item.header.show === undefined) {
        item.header.show = item.hasHeaders ? 'top' : false;
      }
      delete item.hasHeaders;
    }
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
function migrateHeader(layoutConfig, configPath, manualReviews) {
  for (const propertyName of ['settings', 'labels', 'header']) {
    const value = layoutConfig[propertyName];
    if (value !== undefined && !isRecord(value)) {
      manualReviews.add(`${configPath}.${propertyName} is not an object`);
      return;
    }
  }
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

  migrateHeader(layoutConfig, configPath, manualReviews);
  if (
    layoutConfig.openPopouts !== undefined &&
    !Array.isArray(layoutConfig.openPopouts)
  ) {
    manualReviews.add(`${configPath}.openPopouts is not an array`);
  } else if (Array.isArray(layoutConfig.openPopouts)) {
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
      } else {
        manualReviews.add(
          `${configPath}.openPopouts[${index}] is not an object`,
        );
      }
    });
  }
}

/** Parses and migrates JSON only when it has a recognized layout shape. */
function transformJsonContent(content, sourceVersion = 'auto') {
  let parsed;
  const jsonContent =
    content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    return undefined;
  }
  if (
    !isLayoutConfig(parsed) &&
    !isStandaloneLayoutItem(parsed, sourceVersion)
  ) {
    return undefined;
  }

  const manualReviews = new Set();
  if (isLayoutItem(parsed)) {
    transformLayoutItem(parsed, '$', manualReviews, sourceVersion);
  } else {
    transformLayoutConfig(parsed, '$', manualReviews, sourceVersion);
  }
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
  let writeRequested = false;
  let dryRunRequested = false;
  let sourceVersion = 'auto';

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case '--target': {
        target = argv[++index];
        break;
      }
      case '--write': {
        writeRequested = true;
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
        dryRunRequested = true;
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
  if (writeRequested && dryRunRequested) {
    throw new Error('Cannot combine --write and --dry-run');
  }

  return {
    target: path.resolve(process.cwd(), target),
    write: writeRequested,
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
    for (const entry of fs.readdirSync(entryPath).sort()) {
      walk(path.join(entryPath, entry), result, canonicalRoot);
    }
  } else if (shouldProcessFile(entryPath)) {
    result.push(entryPath);
  }
}

function collectTextPackageManualReviews(content) {
  const manualReviews = new Set();
  const packagePattern = /(['"])(golden-layout(?:\/[^'"]+)?)\1/g;
  for (const match of content.matchAll(packagePattern)) {
    const classification = classifyGoldenLayoutPackageSpecifier(match[2]);
    if (classification.manualReview !== undefined) {
      manualReviews.add(classification.manualReview);
    }
  }
  return manualReviews;
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
        ...new Set([
          ...sourceResult.manualReviews,
          ...manualReviewPatterns
            .filter(({ pattern }) => pattern.test(sourceResult.transformed))
            .map(({ name }) => name),
        ]),
      ],
    };
  }

  let transformed = content;
  const applied = [];
  const manualReviews = collectTextPackageManualReviews(content);

  for (const replacement of textReplacements) {
    const next = transformed.replace(
      replacement.pattern,
      replacement.replacement,
    );
    if (next !== transformed) {
      applied.push(replacement.name);
      transformed = next;
    }
  }

  return {
    transformed,
    applied,
    manualReviews: [
      ...new Set([
        ...manualReviews,
        ...manualReviewPatterns
          .filter(({ pattern }) => pattern.test(transformed))
          .map(({ name }) => name),
        ...textManualReviewPatterns
          .filter(({ pattern }) => pattern.test(transformed))
          .map(({ name }) => name),
      ]),
    ],
  };
}

function hasRequiredBinding(bindings, exportName, localName, aliasToken) {
  const directPattern = new RegExp(
    `(?:^|,)\\s*(?:type\\s+)?${exportName}\\s*(?=,|$)`,
  );
  if (exportName === localName) {
    return directPattern.test(bindings);
  }

  const aliasPattern = new RegExp(
    `(?:^|,)\\s*(?:type\\s+)?${exportName}\\s*${aliasToken}\\s*${localName}\\s*(?=,|$)`,
  );
  return aliasPattern.test(bindings);
}

/** Adds collision-safe named imports requested by source transformations. */
function addRequiredImports(content, requiredImports, preferRequire = false) {
  const entries =
    requiredImports instanceof Map
      ? [...requiredImports]
      : [...requiredImports].map((name) => [name, name]);
  const names = entries.map(([exportName, localName]) =>
    exportName === localName ? exportName : `${exportName} as ${localName}`,
  );
  const sourceFile = ts.createSourceFile(
    'required-imports.ts',
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const existingImport = sourceFile.statements.find(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'strelit-ui-kit' &&
      statement.importClause !== undefined &&
      !statement.importClause.isTypeOnly &&
      statement.importClause.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings),
  );
  if (
    existingImport !== undefined &&
    ts.isImportDeclaration(existingImport) &&
    existingImport.importClause?.namedBindings !== undefined &&
    ts.isNamedImports(existingImport.importClause.namedBindings)
  ) {
    const namedBindings = existingImport.importClause.namedBindings;
    const bindings = content.slice(
      namedBindings.getStart(sourceFile) + 1,
      namedBindings.getEnd() - 1,
    );
    const missing = entries
      .filter(
        ([exportName, localName]) =>
          !hasRequiredBinding(bindings, exportName, localName, 'as'),
      )
      .map(([exportName, localName]) =>
        exportName === localName ? exportName : `${exportName} as ${localName}`,
      );
    if (missing.length === 0) {
      return content;
    }
    const separator = bindings.trim() === '' ? '' : ', ';
    const replacement = `{ ${bindings.trim()}${separator}${missing.join(', ')} }`;
    return `${content.slice(0, namedBindings.getStart(sourceFile))}${replacement}${content.slice(namedBindings.getEnd())}`;
  }

  let existingRequire;
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    const declaration = statement.declarationList.declarations.find(
      (candidate) =>
        ts.isObjectBindingPattern(candidate.name) &&
        candidate.initializer !== undefined &&
        getStaticRequireSpecifier(candidate.initializer) === 'strelit-ui-kit',
    );
    if (
      declaration !== undefined &&
      ts.isObjectBindingPattern(declaration.name)
    ) {
      existingRequire = declaration.name;
      break;
    }
  }
  if (existingRequire !== undefined) {
    const bindings = content.slice(
      existingRequire.getStart(sourceFile) + 1,
      existingRequire.getEnd() - 1,
    );
    const missing = entries
      .filter(
        ([exportName, localName]) =>
          !hasRequiredBinding(bindings, exportName, localName, ':'),
      )
      .map(([exportName, localName]) =>
        exportName === localName ? exportName : `${exportName}: ${localName}`,
      );
    if (missing.length === 0) {
      return content;
    }
    const separator = bindings.trim() === '' ? '' : ', ';
    const replacement = `{ ${bindings.trim()}${separator}${missing.join(', ')} }`;
    return `${content.slice(0, existingRequire.getStart(sourceFile))}${replacement}${content.slice(existingRequire.getEnd())}`;
  }

  if (preferRequire) {
    const bindings = entries.map(([exportName, localName]) =>
      exportName === localName ? exportName : `${exportName}: ${localName}`,
    );
    return insertAfterDirectivePrologue(
      content,
      `const { ${bindings.join(', ')} } = require('strelit-ui-kit');`,
      sourceFile,
    );
  }
  return insertAfterDirectivePrologue(
    content,
    `import { ${names.join(', ')} } from 'strelit-ui-kit';`,
    sourceFile,
  );
}

function insertAfterDirectivePrologue(content, statement, sourceFile) {
  const shebang = content.match(/^#![^\r\n]*(?:\r?\n|$)/)?.[0];
  let insertionPosition = shebang?.length ?? 0;
  for (const sourceStatement of sourceFile.statements) {
    if (
      ts.isExpressionStatement(sourceStatement) &&
      ts.isStringLiteral(sourceStatement.expression)
    ) {
      insertionPosition = sourceStatement.getEnd();
    } else {
      break;
    }
  }
  const prefix = content.slice(0, insertionPosition);
  const suffix = content.slice(insertionPosition);
  const beforeStatement =
    prefix.length === 0 || prefix.endsWith('\n') ? '' : '\n';
  const afterStatement = suffix.startsWith('\n') ? '' : '\n';
  return `${prefix}${beforeStatement}${statement}${afterStatement}${suffix}`;
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
