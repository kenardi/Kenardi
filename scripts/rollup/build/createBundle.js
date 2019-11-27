'use strict';

const rollup = require('rollup');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path')
const argv = require('minimist')(process.argv.slice(2));
const Modules = require('../modules');
const Bundles = require('../bundles');
const Packaging = require('../packaging');
const {asyncCopyTo} = require('../utils');
const {
  isProductionBundleType,
  isSkippableBundle,
  isFatBundle,
  isFacebookBundle,
  isEsmEntryGenerator,
  isWatchMode
} = require('./predicates');
const getFilename = require('./getFilename');
const getFormat = require('./getFormat');
const {
  handleRollupWarning,
  handleRollupError,
} = require('./handleRollupIssues');
const getRollupPlugins = require('./getRollupPlugins');
const {building, complete, fatal} = require('./messages');

function getRollupOutputOptions(
  outputPath,
  format,
  globals,
  globalName,
  bundleType
) {
  const isProduction = isProductionBundleType(bundleType);

  return Object.assign(
    {},
    {
      file: outputPath,
      format,
      globals,
      freeze: !isProduction,
      interop: false,
      name: globalName,
      sourcemap: false,
    }
  );
}

module.exports = async function createBundle(bundle, bundleType) {
  if (isSkippableBundle(bundle, bundleType)) {
    return;
  }

  const filename = getFilename(bundle.entry, bundle.global, bundleType);
  const logKey =
    chalk.white.bold(filename) + chalk.dim(` (${bundleType.toLowerCase()})`);
  const format = getFormat(bundleType);
  const packageName = Packaging.getPackageName(bundle.entry);
  const peerGlobals = Modules.getPeerGlobals(bundle.externals, bundleType);
  const rollupConfig = getRollupConfig(bundle, bundleType, packageName);
  const [mainOutputPath, ...otherOutputPaths] = Packaging.getBundleOutputPaths(
    bundleType,
    filename,
    packageName
  );
  const rollupOutputOptions = getRollupOutputOptions(
    mainOutputPath,
    format,
    peerGlobals,
    bundle.global,
    bundleType
  );

  if (isWatchMode()) {
    rollupConfig.output = [rollupOutputOptions];
    const watcher = rollup.watch(rollupConfig);
    watcher.on('event', async event => {
      switch (event.code) {
        case 'BUNDLE_START':
          console.log(building(logKey));
          break;
        case 'BUNDLE_END':
          for (let i = 0; i < otherOutputPaths.length; i++) {
            await asyncCopyTo(mainOutputPath, otherOutputPaths[i]);
          }
          console.log(complete(logKey));
          break;
        case 'ERROR':
        case 'FATAL':
          console.log(fatal(logKey));
          handleRollupError(event.error);
          break;
      }
    });
  } else {
    console.log(building(logKey));
    try {
      const result = await rollup.rollup(rollupConfig);
      await result.write(rollupOutputOptions);
      if (isEsmEntryGenerator(bundleType)) {
        writeEsmEntry(result, packageName)
      }
    } catch (error) {
      console.log(fatal(logKey));
      handleRollupError(error);
      throw error;
    }
    for (let i = 0; i < otherOutputPaths.length; i++) {
      await asyncCopyTo(mainOutputPath, otherOutputPaths[i]);
    }
    console.log(complete(logKey));
  }
};

function getRollupConfig(bundle, bundleType, packageName) {
  const filename = getFilename(bundle.entry, bundle.global, bundleType);
  let resolvedEntry = require.resolve(bundle.entry);
  const isFBBundle = isFacebookBundle();
  if (isFBBundle) {
    const resolvedFBEntry = resolvedEntry.replace('.js', '.fb.js');
    if (fs.existsSync(resolvedFBEntry)) {
      resolvedEntry = resolvedFBEntry;
    }
  }

  const shouldBundleDependencies = isFatBundle(bundleType);
  const peerGlobals = Modules.getPeerGlobals(bundle.externals, bundleType);
  let externals = Object.keys(peerGlobals);
  if (!shouldBundleDependencies) {
    const deps = Modules.getDependencies(bundleType, bundle.entry);
    externals = externals.concat(deps);
  }
  if (isFBBundle) {
    // Add any mapped fb bundle externals
    externals = externals.concat(Object.values(Bundles.fbBundleExternalsMap));
  }

  const importSideEffects = Modules.getImportSideEffects();
  const pureExternalModules = Object.keys(importSideEffects).filter(
    module => !importSideEffects[module]
  );

  return {
    input: resolvedEntry,
    treeshake: {
      pureExternalModules,
    },
    external(id) {
      const containsThisModule = pkg => id === pkg || id.startsWith(pkg + '/');
      const isProvidedByDependency = externals.some(containsThisModule);
      if (!shouldBundleDependencies && isProvidedByDependency) {
        return true;
      }
      return !!peerGlobals[id];
    },
    onwarn: handleRollupWarning,
    plugins: getRollupPlugins(
      bundle.entry,
      externals,
      bundle.babel,
      filename,
      packageName,
      bundleType,
      bundle.global,
      bundle.moduleType,
      pureExternalModules
    ),
    // We can't use getters in www.
    legacy: isFacebookBundle(bundleType),
  }
}

function writeEsmEntry(bundle, packageName) {
    const filepath = path.resolve(
      `build/node_modules/${packageName}`,
      'index.mjs'
    );
    // write esm entry point
    fs.writeFileSync(
      filepath,
      genererateEsmEntry(packageName, bundle.exports)
    );
}

function genererateEsmEntry(packageName, exports) {
  const exportStatements = exports.map(name => {
    const pickedBundle = `isProduction ? prod.${name} : dev.${name}`;
    if (name !== 'default') {
      return `export const ${name} = ${pickedBundle};`
    } else {
      return `
const defaultExport = ${pickedBundle};
export default defaultExport;
      `
    }
  });

  return `
import * as dev from "./esm/${packageName}.development.mjs";
import * as prod from "./esm/${packageName}.production.min.mjs";

const isProduction = process.env.NODE_ENV === 'production'
${exportStatements.join("\n")}
  `;
}
