const { main } = require('./verify-package-runtime.js');

main({ verifyBrowser: true }).catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
