'use strict';

// The scheduled task invokes this stable, ACL-protected launcher rather than
// a versioned Gateway path. It accepts only the fixed Office current pointer,
// validates that pointer, and loads the selected immutable Gateway in-process.
// It intentionally has no general command/argument forwarding surface.
const fs = require('node:fs');
const path = require('node:path');

const officeRoot = String.raw`C:\ProgramData\KidItem`;
const defaultGatewayRoot = path.join(officeRoot, 'agent-gateway');

function launchError(code) {
  return new Error(code);
}

function samePath(left, right, pathApi, platform) {
  const a = pathApi.resolve(left);
  const b = pathApi.resolve(right);
  return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function readRegularFile(filePath, fsApi) {
  const stat = fsApi.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw launchError('not_regular_file');
  return fsApi.readFileSync(filePath, 'utf8');
}

function assertRegularDirectory(directoryPath, fsApi) {
  const stat = fsApi.lstatSync(directoryPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw launchError('not_regular_directory');
}

/**
 * Resolves the only permitted launch: the stable task's exact current pointer
 * to one immutable `releases/<gitSha>` package. The optional inputs exist for
 * portable filesystem-contract tests; production does not expose them.
 */
function resolveGatewayLaunch(input = {}) {
  const argv = input.argv ?? process.argv;
  const gatewayRoot = input.gatewayRoot ?? defaultGatewayRoot;
  const fsApi = input.fsApi ?? fs;
  const pathApi = input.pathApi ?? path;
  const platform = input.platform ?? process.platform;
  const currentPointerPath = pathApi.join(gatewayRoot, 'current.json');
  if (
    argv.length !== 4 ||
    argv[2] !== '--current' ||
    !samePath(argv[3], currentPointerPath, pathApi, platform)
  ) {
    throw launchError('arguments_invalid');
  }

  let pointer;
  try {
    // A previous Windows PowerShell deployment may have written this JSON with
    // a UTF-8 BOM. Remove only that encoding marker, never arbitrary input.
    pointer = JSON.parse(readRegularFile(currentPointerPath, fsApi).replace(/^\uFEFF/, ''));
  } catch {
    throw launchError('current_pointer_invalid');
  }
  if (
    pointer === null ||
    typeof pointer !== 'object' ||
    Array.isArray(pointer) ||
    Object.keys(pointer).length !== 3 ||
    !Object.prototype.hasOwnProperty.call(pointer, 'gitSha') ||
    !Object.prototype.hasOwnProperty.call(pointer, 'releaseRoot') ||
    !Object.prototype.hasOwnProperty.call(pointer, 'gatewayArtifactSha256') ||
    typeof pointer.gitSha !== 'string' ||
    !/^[0-9a-f]{40}$/.test(pointer.gitSha) ||
    typeof pointer.releaseRoot !== 'string' ||
    typeof pointer.gatewayArtifactSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(pointer.gatewayArtifactSha256)
  ) {
    throw launchError('current_pointer_invalid');
  }

  const releaseRoot = pathApi.resolve(pointer.releaseRoot);
  const expectedReleaseRoot = pathApi.resolve(gatewayRoot, 'releases', pointer.gitSha);
  if (!samePath(releaseRoot, expectedReleaseRoot, pathApi, platform)) {
    throw launchError('release_pointer_invalid');
  }

  const runtimeRoot = pathApi.join(releaseRoot, 'package');
  const entryPoint = pathApi.join(runtimeRoot, 'dist', 'main.cjs');
  const configPath = pathApi.join(releaseRoot, 'gateway-config.json');
  try {
    assertRegularDirectory(releaseRoot, fsApi);
    assertRegularDirectory(runtimeRoot, fsApi);
    readRegularFile(entryPoint, fsApi);
    readRegularFile(configPath, fsApi);
  } catch {
    throw launchError('release_incomplete');
  }
  return { runtimeRoot, entryPoint, configPath };
}

function runGatewayLaunch(input = {}) {
  const argv = input.argv ?? process.argv;
  const resolved = resolveGatewayLaunch({ ...input, argv });
  const chdir = input.chdir ?? process.chdir;
  const loadEntrypoint = input.loadEntrypoint ?? require;
  chdir(resolved.runtimeRoot);
  argv.splice(0, argv.length, argv[0], resolved.entryPoint, '--config', resolved.configPath);
  loadEntrypoint(resolved.entryPoint);
  return true;
}

function runProductionLauncher() {
  try {
    runGatewayLaunch();
  } catch (error) {
    const code = error instanceof Error && /^[a-z_]+$/.test(error.message)
      ? error.message
      : 'startup_failed';
    process.stderr.write(`kiditem_gateway_launcher_${code}\n`);
    process.exitCode = 1;
  }
}

module.exports = { resolveGatewayLaunch, runGatewayLaunch };

if (require.main === module) runProductionLauncher();
