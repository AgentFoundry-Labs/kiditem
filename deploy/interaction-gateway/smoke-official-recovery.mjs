#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const productionValues = new Set(['production', 'office']);
if (
  productionValues.has(process.env.NODE_ENV ?? '') ||
  productionValues.has(process.env.KIDITEM_ENV ?? '') ||
  productionValues.has(process.env.DEPLOYMENT_ENV ?? '')
) {
  throw new Error('official recovery smoke refuses production-like environments');
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

run([
  'run',
  'test:integration',
  '--workspace=apps/server',
  '--',
  'src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts',
]);
run([
  'test',
  '--workspace=apps/interaction-gateway',
  '--',
  'src/__tests__/runtime.spec.ts',
]);

function run(args) {
  execFileSync(npm, args, {
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit',
  });
}
