#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function assertSafeDbPushArgs(args) {
  if (args.some((arg) => arg === '--force-reset' || arg.startsWith('--force-reset='))) {
    throw new Error(
      'Prisma db push --force-reset is blocked for local development. Use a targeted migration instead.',
    );
  }
}

export function main(args = process.argv.slice(2)) {
  assertSafeDbPushArgs(args);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const prismaExecutable = path.join(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
  const result = spawnSync(prismaExecutable, ['db', 'push', ...args], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`Prisma db push terminated by signal ${result.signal}`);
  }
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
