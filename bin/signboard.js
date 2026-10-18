#!/usr/bin/env node

const { main } = require('../lib/sprintCli');

main(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = Number.isInteger(exitCode) ? exitCode : 0;
  })
  .catch((error) => {
    process.stderr.write(`${error.message || error}\n`);
    process.exitCode = 1;
  });
