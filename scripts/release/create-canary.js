#!/usr/bin/env node

'use strict';

const {tmpdir} = require('os');
const {join} = require('path');
const {getBuildInfo, handleError} = require('./utils');

// This script is an escape hatch!
// It exists for special case manual builds.
// The typical suggesgted release process is to create a canary from a CI artifact.
// This build script is optimized for speed and simplicity.
// It doesn't run all of the tests that the CI environment runs.
// You're expected to run those manually before publishing a release.

const addBuildInfoJSON = require('./create-canary-commands/add-build-info-json');
const buildArtifacts = require('./create-canary-commands/build-artifacts');
const copyRepoToTempDirectory = require('./create-canary-commands/copy-repo-to-temp-directory');
const npmPackAndUnpack = require('./create-canary-commands/npm-pack-and-unpack');
const printPrereleaseSummary = require('./shared-commands/print-prerelease-summary');
const updateVersionNumbers = require('./create-canary-commands/update-version-numbers');

const run = async () => {
  try {
    const cwd = join(__dirname, '..', '..');
    const {branch, checksum, commit, version} = await getBuildInfo();
    const tempDirectory = join(tmpdir(), `react-${commit}`);
    const params = {branch, checksum, commit, cwd, tempDirectory, version};

    await copyRepoToTempDirectory(params);
    await updateVersionNumbers(params);
    await addBuildInfoJSON(params);
    await buildArtifacts(params);
    await npmPackAndUnpack(params);
    await printPrereleaseSummary(params);
  } catch (error) {
    handleError(error);
  }
};

run();
