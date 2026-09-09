const fs = require('node:fs');
const path = require('node:path');
const less = require('less');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');

// This script performs three tasks:
// 1. Copy LESS and SCSS stylesheets to dist
// 2. Render LESS to CSS and copy it to dist
// 3. Copy shared LESS helpers to dist

// Helper function to ensure a directory exists.
// Won't do anything if the directory already exists
const ensureFolder = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

// Helper function to build a single less file and write the output to a css file.
// It additionally copies the raw less file to dist
// Must be called for every .less file in src folder.
const buildFile = async (filePath) => {
  console.log(`[INFO] Processing file: ${filePath}`);
  const outputPath = filePath
    .replace('less', 'css')
    .replace('src', 'dist')
    .replace('.less', '.css');
  const lessRawOutputFile = filePath.replace('src', 'dist');
  console.log(`[INFO] ${filePath} => render => ${outputPath}`);
  console.log(`[INFO] ${filePath} => copy => ${lessRawOutputFile}`);

  const lessFile = fs.readFileSync(filePath, 'utf8');
  const lessOutput = await less.render(lessFile, { filename: filePath });
  const prefixedOutput = await postcss([autoprefixer]).process(lessOutput.css, {
    from: filePath,
  });
  prefixedOutput.warnings().forEach((warn) => {
    console.warn(`[${filePath}] [WARN]: ${String(warn)}`);
  });
  // Write the CSS file
  fs.writeFileSync(outputPath, prefixedOutput.css);
  // Copy the less file
  fs.writeFileSync(lessRawOutputFile, lessFile);
};

async function main() {
  console.log('[INFO] Creating directories');
  for (const directory of [
    './dist/css/themes',
    './dist/less/themes',
    './dist/scss/themes',
  ]) {
    ensureFolder(directory);
  }

  await buildFile('./src/less/strelit-base.less');
  fs.copyFileSync(
    './src/less/strelit-icons.less',
    './dist/less/strelit-icons.less',
  );
  fs.copyFileSync(
    './src/scss/strelit-base.scss',
    './dist/scss/strelit-base.scss',
  );

  await Promise.all(
    fs
      .readdirSync('./src/less/themes')
      .map((file) => buildFile(path.join('./src/less/themes', file))),
  );

  for (const file of fs.readdirSync('./src/scss/themes')) {
    const srcPath = path.join('./src/scss/themes', file);
    const dstPath = path.join('./dist/scss/themes', file);
    console.log(`[INFO] ${srcPath} => copy => ${dstPath}`);
    fs.copyFileSync(srcPath, dstPath);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
