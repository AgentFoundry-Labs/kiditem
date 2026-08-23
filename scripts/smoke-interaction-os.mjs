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
  'exec', '--', 'playwright', 'test',
  'apps/web/e2e/agent-session-interaction.spec.ts',
  'apps/web/e2e/interaction-os/durable-session.spec.ts',
], { KIDITEM_E2E_SKIP_WEB_BUILD: '1' });
run([
  'run', 'test:integration', '--workspace=apps/server', '--',
  'src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts',
]);
