const fs = require('node:fs');
const path = require('node:path');

/**
 * Resolves npm without allowing inherited environment variables to select an
 * executable or command interpreter.
 */
function npmCommand(
  args,
  platform = process.platform,
  fileExists = fs.existsSync,
  nodeExecutable = process.execPath,
) {
  if (platform !== 'win32') {
    return { command: 'npm', args };
  }

  const cli = path.join(
    path.dirname(nodeExecutable),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  if (!fileExists(cli)) {
    throw new Error(
      'Cannot locate npm JavaScript entrypoint beside the active Node executable.',
    );
  }
  return { command: nodeExecutable, args: [cli, ...args] };
}

module.exports = { npmCommand };
