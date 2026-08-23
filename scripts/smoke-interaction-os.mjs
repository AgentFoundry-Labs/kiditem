#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const productionValues = new Set(['production', 'office']);
if ([process.env.NODE_ENV, process.env.KIDITEM_ENV, process.env.DEPLOYMENT_ENV]
  .some((value) => productionValues.has(value ?? ''))) {
  throw new Error('interaction smoke refuses production-like environments');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args, additionalEnv = {}) {
  execFileSync(npm, args, {
    cwd: root,
    env: {
      ...process.env,
      ...additionalEnv,
      NODE_ENV: 'test',
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4320',
      KIDITEM_PROXY_ALL_API: 'true',
    },
    stdio: 'inherit',
  });
}

run(['run', 'build', '--workspace=apps/server']);
run(['run', 'build', '--workspace=apps/web']);
run([
  'exec', '--workspace=apps/server', 'vitest', '--', 'run',
  'src/agent-os/adapter/out/runtime/attempt',
  'src/agent-os/application/service/work/__tests__/agent-attempt-admission.service.spec.ts',
  'src/agent-os/application/service/work/agent-api-startup-reconciler.service.spec.ts',
  'src/readiness/__tests__/readiness.service.spec.ts',
]);
