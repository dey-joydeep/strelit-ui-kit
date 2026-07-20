#!/usr/bin/env node

/**
 * Runs SonarQube analysis while supporting user-level SONAR_TOKEN on Windows.
 */

const { execSync, spawnSync } = require('child_process');

function readUserEnvironmentToken() {
  if (process.platform !== 'win32') {
    return undefined;
  }

  try {
    return execSync(
      "powershell -NoProfile -Command \"[System.Environment]::GetEnvironmentVariable('SONAR_TOKEN', 'User')\"",
    )
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

const sonarToken =
  process.env.SONAR_TOKEN ||
  process.env.SONARQUBE_TOKEN ||
  readUserEnvironmentToken();

if (!sonarToken) {
  console.error('Error: SONAR_TOKEN environment variable is not set.');
  console.error('Please set SONAR_TOKEN before running this script.');
  process.exit(1);
}

const command =
  process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npx';
const args =
  process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npx sonarqube-scanner']
    : ['sonarqube-scanner'];
const result = spawnSync(command, args, {
  env: {
    ...process.env,
    SONAR_TOKEN: sonarToken,
  },
  stdio: 'inherit',
});

if (result.error !== undefined) {
  console.error(result.error.message);
}

process.exitCode = result.status ?? 1;
