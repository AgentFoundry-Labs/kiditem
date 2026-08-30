import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(import.meta.url);
const launcher = require(`${root}/deploy/office/gateway-launcher.cjs`);
process.exitCode = 0;

async function fixture() {
  const gatewayRoot = await mkdtemp(join(tmpdir(), 'kiditem-office-gateway-launcher-'));
  const gitSha = 'a'.repeat(40);
  const releaseRoot = join(gatewayRoot, 'releases', gitSha);
  const runtimeRoot = join(releaseRoot, 'package');
  const entryPoint = join(runtimeRoot, 'dist', 'main.cjs');
  const configPath = join(releaseRoot, 'gateway-config.json');
  const pointerPath = join(gatewayRoot, 'current.json');
  await mkdir(dirname(entryPoint), { recursive: true });
  await writeFile(entryPoint, 'module.exports = {};', 'utf8');
  await writeFile(configPath, '{}', 'utf8');
  await writeFile(pointerPath, JSON.stringify({
    gitSha,
    releaseRoot,
    gatewayArtifactSha256: 'b'.repeat(64),
  }), 'utf8');
  return { gatewayRoot, gitSha, releaseRoot, runtimeRoot, entryPoint, configPath, pointerPath };
}

async function createFixtureSymlink(t, target, linkPath, type) {
  try {
    await symlink(target, linkPath, type);
    return true;
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.skip('host does not permit test symlink creation');
      return false;
    }
    throw error;
  }
}

test('Office Gateway launcher accepts only its exact current-pointer argv and resolves one immutable release', async () => {
  const value = await fixture();
  const resolved = launcher.resolveGatewayLaunch({
    argv: ['node', 'gateway-launcher.cjs', '--current', value.pointerPath],
    gatewayRoot: value.gatewayRoot,
    platform: 'darwin',
  });

  assert.deepEqual(resolved, {
    runtimeRoot: value.runtimeRoot,
    entryPoint: value.entryPoint,
    configPath: value.configPath,
  });
  assert.throws(
    () => launcher.resolveGatewayLaunch({
      argv: ['node', 'gateway-launcher.cjs', '--current', value.pointerPath, '--arbitrary-command'],
      gatewayRoot: value.gatewayRoot,
      platform: 'darwin',
    }),
    /arguments_invalid/,
  );
  assert.throws(
    () => launcher.resolveGatewayLaunch({
      argv: ['node', 'gateway-launcher.cjs', '--current', join(value.gatewayRoot, 'other.json')],
      gatewayRoot: value.gatewayRoot,
      platform: 'darwin',
    }),
    /arguments_invalid/,
  );
});

test('Office Gateway launcher rejects pointer shape and release-root drift before loading code', async () => {
  const value = await fixture();
  await writeFile(value.pointerPath, JSON.stringify({
    gitSha: value.gitSha,
    releaseRoot: value.releaseRoot,
    gatewayArtifactSha256: 'b'.repeat(64),
    unexpected: true,
  }), 'utf8');
  assert.throws(
    () => launcher.resolveGatewayLaunch({
      argv: ['node', 'gateway-launcher.cjs', '--current', value.pointerPath],
      gatewayRoot: value.gatewayRoot,
      platform: 'darwin',
    }),
    /current_pointer_invalid/,
  );

  await writeFile(value.pointerPath, JSON.stringify({
    gitSha: value.gitSha,
    releaseRoot: join(value.gatewayRoot, 'untrusted-release'),
    gatewayArtifactSha256: 'b'.repeat(64),
  }), 'utf8');
  assert.throws(
    () => launcher.resolveGatewayLaunch({
      argv: ['node', 'gateway-launcher.cjs', '--current', value.pointerPath],
      gatewayRoot: value.gatewayRoot,
      platform: 'darwin',
    }),
    /release_pointer_invalid/,
  );
});

test('Office Gateway launcher rejects symlinked pointer, release, entrypoint, and config files', async (t) => {
  const pointer = await fixture();
  const pointerTarget = join(pointer.gatewayRoot, 'current-target.json');
  await writeFile(pointerTarget, await readFile(pointer.pointerPath));
  await rm(pointer.pointerPath);
  if (!await createFixtureSymlink(t, pointerTarget, pointer.pointerPath, 'file')) return;
  assert.throws(
    () => launcher.resolveGatewayLaunch({
      argv: ['node', 'gateway-launcher.cjs', '--current', pointer.pointerPath],
      gatewayRoot: pointer.gatewayRoot,
      platform: 'darwin',
    }),
    /current_pointer_invalid/,
  );

  const release = await fixture();
  const releaseTarget = join(release.gatewayRoot, 'release-target');
  await rename(release.releaseRoot, releaseTarget);
  if (!await createFixtureSymlink(t, releaseTarget, release.releaseRoot, 'dir')) return;
  assert.throws(
    () => launcher.resolveGatewayLaunch({
      argv: ['node', 'gateway-launcher.cjs', '--current', release.pointerPath],
      gatewayRoot: release.gatewayRoot,
      platform: 'darwin',
    }),
    /release_incomplete/,
  );

  const entry = await fixture();
  const entryTarget = `${entry.entryPoint}.target`;
  await rename(entry.entryPoint, entryTarget);
  if (!await createFixtureSymlink(t, entryTarget, entry.entryPoint, 'file')) return;
  assert.throws(
    () => launcher.resolveGatewayLaunch({
      argv: ['node', 'gateway-launcher.cjs', '--current', entry.pointerPath],
      gatewayRoot: entry.gatewayRoot,
      platform: 'darwin',
    }),
    /release_incomplete/,
  );

  const config = await fixture();
  const configTarget = `${config.configPath}.target`;
  await rename(config.configPath, configTarget);
  if (!await createFixtureSymlink(t, configTarget, config.configPath, 'file')) return;
  assert.throws(
    () => launcher.resolveGatewayLaunch({
      argv: ['node', 'gateway-launcher.cjs', '--current', config.pointerPath],
      gatewayRoot: config.gatewayRoot,
      platform: 'darwin',
    }),
    /release_incomplete/,
  );
});

test('Office Gateway launcher changes only to the immutable package root and forwards only strict config argv', async () => {
  const value = await fixture();
  const calls = [];
  const argv = ['node', 'gateway-launcher.cjs', '--current', value.pointerPath];
  const result = launcher.runGatewayLaunch({
    argv,
    gatewayRoot: value.gatewayRoot,
    platform: 'darwin',
    chdir: (target) => calls.push(['chdir', target]),
    loadEntrypoint: (target) => calls.push(['require', target]),
  });

  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['chdir', value.runtimeRoot],
    ['require', value.entryPoint],
  ]);
  assert.deepEqual(argv, ['node', value.entryPoint, '--config', value.configPath]);
});
