const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  verifyBrowserBundle,
} = require('../../scripts/verify-package-runtime.js');

void test('packed browser global is checked in an isolated browser', async () => {
  const packageRoot = mkdtempSync(
    path.join(tmpdir(), 'strelit-browser-bundle-'),
  );
  const bundleDirectory = path.join(packageRoot, 'dist', 'iife');
  const bundlePath = path.join(bundleDirectory, 'index.global.js');

  try {
    mkdirSync(bundleDirectory, { recursive: true });
    writeFileSync(bundlePath, 'var strelitUIKit = {};');
    await assert.rejects(
      verifyBrowserBundle(packageRoot),
      /does not expose strelitUIKit\.StrelitLayout/,
    );

    writeFileSync(
      bundlePath,
      'document.body.insertAdjacentHTML("beforeend", "<div data-strelit-bundle=\\"passed\\"></div>");',
    );
    await assert.rejects(
      verifyBrowserBundle(packageRoot),
      /does not expose strelitUIKit\.StrelitLayout/,
    );

    writeFileSync(
      bundlePath,
      'document.insertBefore(document.createComment("<html data-strelit-bundle=\\"passed\\">"), document.documentElement);',
    );
    await assert.rejects(
      verifyBrowserBundle(packageRoot),
      /does not expose strelitUIKit\.StrelitLayout/,
    );

    writeFileSync(
      bundlePath,
      'var strelitUIKit = { StrelitLayout: function StrelitLayout() {} };',
    );
    await assert.doesNotReject(verifyBrowserBundle(packageRoot));

    writeFileSync(
      bundlePath,
      'var hostReachable = false; try { hostReachable = Boolean(this.constructor.constructor("return process")()); } catch {} if (hostReachable) throw new Error("verifier process exposed"); var strelitUIKit = { StrelitLayout: function StrelitLayout() {} };',
    );
    await assert.doesNotReject(verifyBrowserBundle(packageRoot));
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
  }
});
