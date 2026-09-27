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
  environment = process.env,
) {
  let command;
  let commandArgs;

  if (platform !== 'win32') {
    command = 'npm';
    commandArgs = args;
  } else {
    const cli = path.win32.join(
      path.win32.dirname(nodeExecutable),
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
    command = nodeExecutable;
    commandArgs = [cli, ...args];
  }

  const scriptShell =
    platform === 'win32'
      ? '\\\\.\\GLOBALROOT\\SystemRoot\\System32\\cmd.exe'
      : '/bin/sh';
  if (!fileExists(scriptShell)) {
    throw new Error(`Cannot locate trusted npm script shell: ${scriptShell}`);
  }

  const env = Object.fromEntries(
    Object.entries(environment).filter(([key]) => {
      const normalized = key.toLowerCase().replaceAll('_', '-');
      return (
        normalized !== 'npm-config-script-shell' && normalized !== 'comspec'
      );
    }),
  );
  env.npm_config_script_shell = scriptShell;
  if (platform === 'win32') {
    env.ComSpec = scriptShell;
  }

  return {
    command,
    args:
      platform === 'win32'
        ? [
            commandArgs[0],
            `--script-shell=${scriptShell}`,
            ...commandArgs.slice(1),
          ]
        : [`--script-shell=${scriptShell}`, ...commandArgs],
    env,
  };
}

module.exports = { npmCommand };
