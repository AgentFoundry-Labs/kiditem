#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function orchestrateLocalDevelopment({ setup, authenticate, startServices }) {
  await setup();
  await authenticate();
  await startServices();
}

export function runStage({ executable, args, cwd, failureCode }) {
  const result = spawnSync(executable, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(failureCode);
}

export async function startLocalServices({ concurrentlyImpl }) {
  const { result } = concurrentlyImpl([
    { command: 'npm run dev:core', name: 'core' },
    { command: 'npm run dev:gateway', name: 'gateway' },
  ], {
    prefix: 'name',
    prefixColors: ['cyan', 'magenta'],
    killOthersOn: ['failure', 'success'],
  });
  await result;
}

async function main() {
  if (process.argv.length > 2) throw new Error('local_development_arguments_invalid');
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const setupScript = join(repoRoot, 'scripts', 'setup-macos-development.mjs');
  const gatewayScript = join(repoRoot, 'scripts', 'local-agent-gateway.mjs');

  await orchestrateLocalDevelopment({
    setup: () => runStage({
      executable: process.execPath,
      args: [setupScript],
      cwd: repoRoot,
      failureCode: 'local_development_setup_failed',
    }),
    authenticate: () => runStage({
      executable: process.execPath,
      args: [gatewayScript, 'auth', 'codex'],
      cwd: repoRoot,
      failureCode: 'local_development_provider_auth_failed',
    }),
    startServices: async () => {
      const concurrentlyModule = await import('concurrently');
      await startLocalServices({ concurrentlyImpl: concurrentlyModule.default });
    },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    const message = error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
      ? error.message
      : 'local_development_services_failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
