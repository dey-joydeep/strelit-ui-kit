const fs = require('node:fs');
const path = require('node:path');

const usage = `Usage:
  npm run migrate:golden-layout -- --target <path> [--dry-run]
  npm run migrate:golden-layout -- --target <path> --write

Options:
  --target <path>   Required target directory or file to migrate
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

const replacements = [
  {
    name: 'default import',
    pattern: /import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])golden-layout\2/g,
    replacement: "import { StrelitLayout as $1 } from 'strelit-ui-kit'",
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
      /(['"])golden-layout\/(?:dist|src)\/css\/((?:themes\/)?goldenlayout(?:-([a-z-]+)-theme|-base)\.css)\1/g,
    replacement: (_match, quote, fileName, themeName) => {
      if (themeName !== undefined) {
        return `${quote}strelit-ui-kit/dist/css/themes/strelit-${themeName}-theme.css${quote}`;
      }

      if (fileName === 'goldenlayout-base.css') {
        return `${quote}strelit-ui-kit/dist/css/strelit-base.css${quote}`;
      }

      return `${quote}strelit-ui-kit/dist/css/${fileName}${quote}`;
    },
  },
  {
    name: 'less subpath import',
    pattern:
      /(['"])golden-layout\/(?:dist|src)\/less\/((?:themes\/)?goldenlayout(?:-([a-z-]+)-theme|-base)\.less)\1/g,
    replacement: (_match, quote, fileName, themeName) => {
      if (themeName !== undefined) {
        return `${quote}strelit-ui-kit/dist/less/themes/strelit-${themeName}-theme.less${quote}`;
      }

      if (fileName === 'goldenlayout-base.less') {
        return `${quote}strelit-ui-kit/dist/less/strelit-base.less${quote}`;
      }

      return `${quote}strelit-ui-kit/dist/less/${fileName}${quote}`;
    },
  },
  {
    name: 'scss subpath import',
    pattern:
      /(['"])golden-layout\/(?:dist|src)\/scss\/((?:themes\/)?goldenlayout(?:-([a-z-]+)-theme|-base)\.scss)\1/g,
    replacement: (_match, quote, fileName, themeName) => {
      if (themeName !== undefined) {
        // Leave SCSS theme imports for manual review since only _strelit-var-theme.scss exists
        return _match;
      }

      if (fileName === 'goldenlayout-base.scss') {
        return `${quote}strelit-ui-kit/dist/scss/strelit-base.scss${quote}`;
      }

      return `${quote}strelit-ui-kit/dist/scss/${fileName}${quote}`;
    },
  },
  {
    name: 'package import',
    pattern: /(['"])golden-layout((?:\/[^'"]+)?)\1/g,
    replacement: '$1strelit-ui-kit$2$1',
  },
  {
    name: 'main class',
    pattern: /\bGoldenLayout\b/g,
    replacement: 'StrelitLayout',
  },
  {
    name: 'css namespace',
    pattern: /\blm_/g,
    replacement: 'strelit_',
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
];

function parseArguments(argv) {
  let target;
  let write = false;

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
  };
}

function shouldProcessFile(filePath) {
  return textFileExtensions.has(path.extname(filePath).toLowerCase());
}

function walk(entryPath, result) {
  const stat = fs.statSync(entryPath);
  if (stat.isDirectory()) {
    const name = path.basename(entryPath);
    if (ignoredDirectories.has(name)) {
      return;
    }

    for (const entry of fs.readdirSync(entryPath)) {
      walk(path.join(entryPath, entry), result);
    }
  } else if (shouldProcessFile(entryPath)) {
    result.push(entryPath);
  }
}

function transformContent(content) {
  let transformed = content;
  const applied = [];

  for (const replacement of replacements) {
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
  };
}

function main() {
  const { target, write } = parseArguments(process.argv.slice(2));
  if (!fs.existsSync(target)) {
    throw new Error(`Target does not exist: ${target}`);
  }

  const files = [];
  walk(target, files);

  let changedFileCount = 0;
  for (const filePath of files) {
    const original = fs.readFileSync(filePath, 'utf8');
    const { transformed, applied } = transformContent(original);
    if (transformed !== original) {
      changedFileCount++;
      const relativePath = path.relative(process.cwd(), filePath);
      console.log(
        `${write ? 'update' : 'would update'} ${relativePath} (${applied.join(', ')})`,
      );

      if (write) {
        fs.writeFileSync(filePath, transformed);
      }
    }
  }

  console.log(`${write ? 'Updated' : 'Matched'} ${changedFileCount} file(s).`);
  if (!write) {
    console.log(
      'Dry run only. Re-run with --write after reviewing the planned changes.',
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage);
  process.exitCode = 1;
}
