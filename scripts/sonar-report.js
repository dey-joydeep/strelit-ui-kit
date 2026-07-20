#!/usr/bin/env node

/**
 * Fetches open SonarQube issues via REST API and outputs them in a clean,
 * line-by-line lint format right in the terminal.
 */

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

const SONAR_URL = process.env.SONAR_HOST_URL || 'http://localhost:9000';
let SONAR_TOKEN = process.env.SONAR_TOKEN || process.env.SONARQUBE_TOKEN;
if (!SONAR_TOKEN && process.platform === 'win32') {
  try {
    SONAR_TOKEN = execSync(
      "powershell -NoProfile -Command \"[System.Environment]::GetEnvironmentVariable('SONAR_TOKEN', 'User')\"",
    )
      .toString()
      .trim();
  } catch {
    // Environment fallback is best-effort; the explicit validation below reports missing tokens.
  }
}

const PROJECT_KEY = process.env.SONAR_PROJECT_KEY || 'strelit-ui-kit';

if (!SONAR_TOKEN) {
  console.error('Error: SONAR_TOKEN environment variable is not set.');
  console.error('Please set SONAR_TOKEN before running this script.');
  process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${SONAR_TOKEN}:`).toString('base64');
const baseUrl = new URL(SONAR_URL);
if (!baseUrl.pathname.endsWith('/')) {
  baseUrl.pathname += '/';
}
const url = new URL(
  `api/issues/search?componentKeys=${encodeURIComponent(
    PROJECT_KEY,
  )}&statuses=OPEN,CONFIRMED,REOPENED&ps=100`,
  baseUrl,
);
const transport = url.protocol === 'https:' ? https : http;

console.log(
  `Fetching SonarQube issues for project [${PROJECT_KEY}] from ${SONAR_URL}...\n`,
);

const req = transport.request(
  url,
  {
    headers: {
      Authorization: authHeader,
    },
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.error(`API Error (${res.statusCode}): ${data}`);
        process.exit(1);
      }

      try {
        const parsed = JSON.parse(data);
        console.log(`Total Open Issues: ${parsed.total}\n`);
        console.log(
          '--------------------------------------------------------------------------------',
        );

        if (!parsed.issues || parsed.issues.length === 0) {
          console.log('No open issues found.');
          return;
        }

        parsed.issues.forEach((issue) => {
          const projectPrefix = `${PROJECT_KEY}:`;
          const filePath = issue.component.startsWith(projectPrefix)
            ? issue.component.slice(projectPrefix.length)
            : issue.component;
          const line = issue.line || 1;
          const severity = issue.severity.padEnd(8, ' ');
          const type = issue.type;
          console.log(`[${severity} | ${type}] ${filePath}:${line}`);
          console.log(`  -> ${issue.message} (${issue.rule})\n`);
        });

        if (parsed.total > parsed.issues.length) {
          console.log(
            `... and ${
              parsed.total - parsed.issues.length
            } more issues shown on the web dashboard at ${SONAR_URL}/dashboard?id=${PROJECT_KEY}`,
          );
        }
      } catch (err) {
        console.error('Failed to parse API response:', err.message);
        process.exit(1);
      }
    });
  },
);

req.on('error', (err) => {
  console.error(`Request failed: ${err.message}`);
  process.exit(1);
});

req.end();
