#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const label = `kiditem-agent-session-deletion-${randomUUID()}`;
const container = `kiditem-delete-proof-${process.pid}-${Date.now()}`;
const proofOrganizationId = '00000000-0000-4000-8000-000000000001';
const children = [];

function baseEnv(databaseUrl) {
  return {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    WEB_ORIGIN: 'http://127.0.0.1:4310',
    PORT: '4340',
    AGENT_DEFAULT_MODEL: 'deletion-process-proof',
    AGENT_RUNTIME_CREDENTIAL_HMAC_KEY: 'd'.repeat(48),
    INTERACTION_GATEWAY_SHARED_SECRET: 'g'.repeat(48),
    INTERACTION_PRINCIPAL_HMAC_KEY: 'p'.repeat(48),
    INTERACTION_RUN_INTENT_HMAC_KEY: 'i'.repeat(48),
    INTERACTION_REPLAY_CURSOR_HMAC_KEY: 'r'.repeat(48),
    INTERACTION_ANALYTICS_HMAC_KEY: 'a'.repeat(48),
    OPERATION_RUNTIME_WORKER_ENABLED: '1',
    OPERATION_SCHEDULER_ENABLED: '0',
    AI_DIRECT_JOB_WORKER_ENABLED: '0',
  };
}

async function command(file, args, options = {}) {
  return exec(file, args, { cwd: root, ...options });
}

async function waitFor(predicate, description) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function start(name, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const output = [];
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));
  children.push({ name, child, output });
  return children.at(-1);
}

async function stop(record) {
  if (exited(record)) return;
  record.child.kill('SIGTERM');
  await waitForExit(record, 5_000);
  if (!exited(record)) {
    // This PID was spawned and recorded by this verifier; never use a name,
    // port, process-group, or broad kill pattern.
    record.child.kill('SIGKILL');
    await waitForExit(record, 5_000);
  }
  if (!exited(record)) {
    throw new Error(`owned ${record.name} PID did not exit`);
  }
}

async function waitForExit(record, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!exited(record) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function exited(record) {
  return record.child.exitCode !== null || record.child.signalCode !== null;
}

async function main() {
  if (!process.env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION?.trim()) {
    throw new Error('fresh disposable db push requires explicit user consent');
  }
  const password = `proof-${randomUUID()}`;
  let databaseUrl;
  let containerStarted = false;
  try {
    await command('docker', [
      'run', '--detach', '--rm', '--name', container,
      '--label', `kiditem.deletion-process-proof=${label}`,
      '--env', 'POSTGRES_USER=kiditem_task10',
      '--env', `POSTGRES_PASSWORD=${password}`,
      '--env', 'POSTGRES_DB=kiditem_task10',
      '--publish', '127.0.0.1::5432', 'postgres:17',
    ]);
    containerStarted = true;
    const inspected = await command('docker', [
      'inspect', '--format', '{{index .Config.Labels "kiditem.deletion-process-proof"}} {{.State.Running}} {{.Config.Image}}', container,
    ]);
    if (inspected.stdout.trim() !== `${label} true postgres:17`) {
      throw new Error('disposable PostgreSQL image/label identity check failed');
    }
    const port = (await command('docker', ['port', container, '5432/tcp'])).stdout.trim().split(':').at(-1);
    if (!port || !/^\d+$/.test(port)) throw new Error('disposable PostgreSQL port was not assigned');
    databaseUrl = `postgresql://kiditem_task10:${encodeURIComponent(password)}@127.0.0.1:${port}/kiditem_task10`;
    await waitFor(async () => command('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'kiditem_task10', '-d', 'kiditem_task10'])
      .then(({ stdout }) => stdout.includes('accepting connections'))
      .catch(() => false), 'owned PostgreSQL 17');
    const identity = await command('docker', ['exec', container, 'psql', '-h', '127.0.0.1', '-U', 'kiditem_task10', '-d', 'kiditem_task10', '-Atc', 'select current_user || \'/\' || current_database()']);
    if (identity.stdout.trim() !== 'kiditem_task10/kiditem_task10') throw new Error('refusing db push against non-owned database');

    const env = baseEnv(databaseUrl);
    await command('npx', ['prisma', 'db', 'push', '--accept-data-loss'], { env });
    await command('docker', [
      'exec', container, 'psql', '-h', '127.0.0.1', '-U', 'kiditem_task10',
      '-d', 'kiditem_task10', '-c',
      `insert into organizations (id, name, slug, is_active) values ('${proofOrganizationId}', 'Deletion proof', 'deletion-proof', true)`,
    ]);
    await command('npx', ['tsx', 'scripts/seed-agent-os.ts'], {
      env: { ...env, AGENT_SEED_ORG_IDS: proofOrganizationId },
    });

    const api = start('api', ['apps/server/dist/main.js'], env);
    await waitFor(() => api.output.join('').includes('Server running'), 'API root')
      .catch((error) => { throw new Error(`${error.message}: ${api.output.join('')}`); });
    await stop(api);

    const worker = start('worker', ['apps/server/dist/worker.js'], {
      ...env,
      OPERATION_RUNTIME_WORKER_ENABLED: '0',
      AGENT_RUNTIME_WORKER_ENABLED: '0',
    });
    await waitFor(() => worker.output.join('').includes('Worker running with Nest application context'), 'worker root')
      .catch((error) => { throw new Error(`${error.message}: ${worker.output.join('')}`); });
    await stop(worker);

    const mcp = start('mcp', ['apps/server/dist/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.js'], {
      ...env,
      OPERATION_RUNTIME_WORKER_ENABLED: '0',
      AGENT_RUNTIME_WORKER_ENABLED: '0',
      KIDITEM_AGENT_OS_ENV_ROOT: root,
      KIDITEM_AGENT_OS_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000001',
      KIDITEM_AGENT_OS_CONVERSATION_ID: 'proof-conversation',
      KIDITEM_AGENT_OS_REQUEST_ID: 'proof-request',
      KIDITEM_AGENT_OS_RUN_ID: 'proof-run',
      KIDITEM_AGENT_OS_AGENT_INSTANCE_ID: 'proof-instance',
    });
    mcp.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'proof', version: '1' } } })}\n`);
    await waitFor(() => mcp.output.join('').includes('"id":1'), 'MCP initialize response')
      .catch((error) => { throw new Error(`${error.message}: ${mcp.output.join('')}`); });
    await stop(mcp);

    // The test-only probe creates the three real Nest roots and resolves their
    // providers directly. Log text is used above only for bounded process
    // readiness, never as dependency-injection evidence.
    await command(process.execPath, ['apps/server/dist/__tests__/agent-session-deletion-root-probe.js'], { env });
    console.log('verify-agent-session-deletion-process-roots PASS');
  } finally {
    for (const child of children.reverse()) await stop(child);
    if (containerStarted) await command('docker', ['rm', '--force', container]).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
