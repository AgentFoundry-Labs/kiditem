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
const acceptanceWebEnv = {
  // NEXT_PUBLIC_* values are compiled into the browser bundle. The real
  // acceptance harness owns this disposable Nest endpoint, so building with
  // the generic local default (localhost:4000) would exercise a different
  // application than the server it starts below.
  NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4320',
  KIDITEM_PROXY_ALL_API: 'true',
  INTERACTION_GATEWAY_URL: 'http://127.0.0.1:4330',
};

// The browser harness starts a real Nest app, production gateway process, and
// production Next server against disposable PostgreSQL. It restarts the
// gateway, reconnects the same opaque thread, resolves an approval, and proves
// the resulting canonical graph without using an external runtime.
run(['run', 'build', '--workspace=apps/server']);
run(['run', 'build', '--workspace=apps/interaction-gateway']);
run(['run', 'build', '--workspace=apps/web'], acceptanceWebEnv);
run([
  'exec',
  '--',
  'playwright',
  'test',
  'apps/web/e2e/interaction-os/durable-session.spec.ts',
], { KIDITEM_E2E_SKIP_WEB_BUILD: '1' });

// This suite starts an Operations worker, persists a detached handle, recreates
// the worker and runtime adapter, then approves/reconnects/terminalizes one
// canonical OperationRun. It is deliberately isolated from the browser process.
run([
  'run',
  'test:integration',
  '--workspace=apps/server',
  '--',
  'src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts',
]);

function run(args, additionalEnv = {}) {
  execFileSync(npm, args, {
    cwd: repoRoot,
    env: { ...process.env, ...additionalEnv, NODE_ENV: 'test' },
    stdio: 'inherit',
  });
}
