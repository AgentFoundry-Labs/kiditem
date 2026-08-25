import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(import.meta.url);
const launcher = require(`${root}/deploy/office/runner-launcher.cjs`);
process.exitCode = 0;

async function fixture() {
  const runnerRoot = await mkdtemp(join(tmpdir(), 'kiditem-office-runner-launcher-'));
  const gitSha = 'a'.repeat(40);
  const releaseRoot = join(runnerRoot, 'releases', gitSha);
  const runtimeRoot = join(releaseRoot, 'package');
  const entryPoint = join(runtimeRoot, 'dist', 'main.cjs');
  const configPath = join(releaseRoot, 'runner-config.json');
  const pointerPath = join(runnerRoot, 'current.json');
  await mkdir(dirname(entryPoint), { recursive: true });
  await writeFile(entryPoint, 'module.exports = {};', 'utf8');
  await writeFile(configPath, '{}', 'utf8');
  await writeFile(pointerPath, JSON.stringify({
    gitSha,
    releaseRoot,
    runnerArtifactSha256: 'b'.repeat(64),
  }), 'utf8');
  return { runnerRoot, gitSha, releaseRoot, runtimeRoot, entryPoint, configPath, pointerPath };
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

test('Office Runner launcher accepts only its exact current-pointer argv and resolves one immutable release', async () => {
  const value = await fixture();
  const resolved = launcher.resolveRunnerLaunch({
    argv: ['node', 'runner-launcher.cjs', '--current', value.pointerPath],
    runnerRoot: value.runnerRoot,
    platform: 'darwin',
  });

  assert.deepEqual(resolved, {
    runtimeRoot: value.runtimeRoot,
    entryPoint: value.entryPoint,
    configPath: value.configPath,
  });
  assert.throws(
    () => launcher.resolveRunnerLaunch({
      argv: ['node', 'runner-launcher.cjs', '--current', value.pointerPath, '--arbitrary-command'],
      runnerRoot: value.runnerRoot,
      platform: 'darwin',
    }),
    /arguments_invalid/,
  );
  assert.throws(
    () => launcher.resolveRunnerLaunch({
      argv: ['node', 'runner-launcher.cjs', '--current', join(value.runnerRoot, 'other.json')],
      runnerRoot: value.runnerRoot,
      platform: 'darwin',
    }),
    /arguments_invalid/,
  );
});

test('Office Runner launcher rejects pointer shape and release-root drift before loading code', async () => {
  const value = await fixture();
  await writeFile(value.pointerPath, JSON.stringify({
    gitSha: value.gitSha,
    releaseRoot: value.releaseRoot,
    runnerArtifactSha256: 'b'.repeat(64),
    unexpected: true,
  }), 'utf8');
  assert.throws(
    () => launcher.resolveRunnerLaunch({
      argv: ['node', 'runner-launcher.cjs', '--current', value.pointerPath],
      runnerRoot: value.runnerRoot,
      platform: 'darwin',
    }),
    /current_pointer_invalid/,
  );

  await writeFile(value.pointerPath, JSON.stringify({
    gitSha: value.gitSha,
    releaseRoot: join(value.runnerRoot, 'untrusted-release'),
    runnerArtifactSha256: 'b'.repeat(64),
  }), 'utf8');
  assert.throws(
    () => launcher.resolveRunnerLaunch({
      argv: ['node', 'runner-launcher.cjs', '--current', value.pointerPath],
      runnerRoot: value.runnerRoot,
      platform: 'darwin',
    }),
    /release_pointer_invalid/,
  );
});

test('Office Runner launcher rejects symlinked pointer, release, entrypoint, and config files', async (t) => {
  const pointer = await fixture();
  const pointerTarget = join(pointer.runnerRoot, 'current-target.json');
  await writeFile(pointerTarget, await readFile(pointer.pointerPath));
  await rm(pointer.pointerPath);
  if (!await createFixtureSymlink(t, pointerTarget, pointer.pointerPath, 'file')) return;
  assert.throws(
    () => launcher.resolveRunnerLaunch({
      argv: ['node', 'runner-launcher.cjs', '--current', pointer.pointerPath],
      runnerRoot: pointer.runnerRoot,
      platform: 'darwin',
    }),
    /current_pointer_invalid/,
  );

  const release = await fixture();
  const releaseTarget = join(release.runnerRoot, 'release-target');
  await rename(release.releaseRoot, releaseTarget);
  if (!await createFixtureSymlink(t, releaseTarget, release.releaseRoot, 'dir')) return;
  assert.throws(
    () => launcher.resolveRunnerLaunch({
      argv: ['node', 'runner-launcher.cjs', '--current', release.pointerPath],
      runnerRoot: release.runnerRoot,
      platform: 'darwin',
    }),
    /release_incomplete/,
  );

  const entry = await fixture();
  const entryTarget = `${entry.entryPoint}.target`;
  await rename(entry.entryPoint, entryTarget);
  if (!await createFixtureSymlink(t, entryTarget, entry.entryPoint, 'file')) return;
  assert.throws(
    () => launcher.resolveRunnerLaunch({
      argv: ['node', 'runner-launcher.cjs', '--current', entry.pointerPath],
      runnerRoot: entry.runnerRoot,
      platform: 'darwin',
    }),
    /release_incomplete/,
  );

  const config = await fixture();
  const configTarget = `${config.configPath}.target`;
  await rename(config.configPath, configTarget);
  if (!await createFixtureSymlink(t, configTarget, config.configPath, 'file')) return;
  assert.throws(
    () => launcher.resolveRunnerLaunch({
      argv: ['node', 'runner-launcher.cjs', '--current', config.pointerPath],
      runnerRoot: config.runnerRoot,
      platform: 'darwin',
    }),
    /release_incomplete/,
  );
});

test('Office Runner launcher changes only to the immutable package root and forwards only strict config argv', async () => {
  const value = await fixture();
  const calls = [];
  const argv = ['node', 'runner-launcher.cjs', '--current', value.pointerPath];
  const result = launcher.runRunnerLaunch({
    argv,
    runnerRoot: value.runnerRoot,
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
