#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  access,
  chmod,
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RECOMMENDED_NODE_VERSION = '22.23.2';
const INSTALLATION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function assertMacosDevelopmentRuntime({
  platform = process.platform,
  nodeVersion = process.versions.node,
} = {}) {
  if (platform !== 'darwin') throw new Error('setup_macos_platform_required');
  const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(nodeVersion);
  // Nest 12 schematics require Node 22.22.3+; .nvmrc remains the recommended patch.
  if (!version || Number(version[1]) !== 22
    || Number(version[2]) < 22
    || (Number(version[2]) === 22 && Number(version[3]) < 3)) {
    throw new Error('setup_node_version_mismatch');
  }
}

export function macosGatewayPaths(home = homedir()) {
  const root = join(resolve(home), 'Library', 'Application Support', 'KidItem', 'AgentGateway');
  return Object.freeze({
    root,
    configFile: join(root, 'gateway-config.json'),
    tokenFile: join(root, 'secrets', 'installation-token'),
    stateRoot: join(root, 'state'),
    loginRoot: join(root, 'provider-home'),
  });
}

export async function setupMacosDevelopmentFiles({
  repoRoot,
  home = homedir(),
  includePythonAgents = false,
  fromCheckout,
}) {
  const canonicalRepo = resolve(repoRoot);
  if (!isAbsolute(canonicalRepo)) throw new Error('setup_repo_root_invalid');
  const gateway = macosGatewayPaths(home);
  const envFiles = [
    ['.env', '.env.example'],
    ['apps/server/.env', 'apps/server/.env.example'],
    ['apps/web/.env.local', 'apps/web/.env.example'],
    ...(includePythonAgents ? [['agents/.env', 'agents/.env.example']] : []),
  ];
  const createdEnvFiles = [];
  for (const [targetRelative, exampleRelative] of envFiles) {
    const target = join(canonicalRepo, targetRelative);
    if (await exists(target)) continue;
    const explicitSource = fromCheckout ? join(resolve(fromCheckout), targetRelative) : null;
    const source = explicitSource && await exists(explicitSource)
      ? explicitSource
      : join(canonicalRepo, exampleRelative);
    if (!await exists(source)) throw new Error('setup_env_example_missing');
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    await chmod(target, 0o600);
    createdEnvFiles.push(targetRelative);
  }

  for (const directory of [
    gateway.root,
    dirname(gateway.tokenFile),
    gateway.stateRoot,
    gateway.loginRoot,
    join(gateway.loginRoot, '.codex'),
  ]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  }

  let token;
  if (await exists(gateway.tokenFile)) {
    token = (await readFile(gateway.tokenFile, 'utf8')).trim();
    if (!INSTALLATION_TOKEN.test(token)) throw new Error('gateway_installation_token_invalid');
  } else {
    token = randomBytes(32).toString('base64url');
    await writeFile(gateway.tokenFile, `${token}\n`, { mode: 0o600, flag: 'wx' });
  }
  await chmod(gateway.tokenFile, 0o600);

  const config = {
    controlOrigin: 'http://127.0.0.1:4000',
    tokenFile: gateway.tokenFile,
    stateRoot: gateway.stateRoot,
    runtimeRoot: canonicalRepo,
    workspace: canonicalRepo,
    loginRoot: gateway.loginRoot,
  };
  await writeFile(gateway.configFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(gateway.configFile, 0o600);

  const serverEnvPath = join(canonicalRepo, 'apps/server/.env');
  const serverEnv = await readFile(serverEnvPath, 'utf8');
  const nextServerEnv = upsertDotenvValue(
    serverEnv,
    'KIDITEM_AGENT_GATEWAY_TOKEN_FILE',
    gateway.tokenFile,
  );
  if (nextServerEnv !== serverEnv) await writeFile(serverEnvPath, nextServerEnv);

  return Object.freeze({
    gateway,
    createdEnvFiles: Object.freeze(createdEnvFiles),
  });
}

export function upsertDotenvValue(source, key, value) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n]/.test(value)) {
    throw new Error('setup_env_value_invalid');
  }
  const escaped = value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  const line = `${key}="${escaped}"`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(source)) return source.replace(pattern, line);
  return `${source.replace(/\s*$/, '\n')}${line}\n`;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const options = { skipInstall: false, includePythonAgents: false, fromCheckout: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--skip-install') options.skipInstall = true;
    else if (value === '--with-python-agents') options.includePythonAgents = true;
    else if (value === '--from-checkout') {
      const path = argv[index + 1];
      if (!path || path.startsWith('--')) throw new Error('setup_from_checkout_required');
      options.fromCheckout = path;
      index += 1;
    } else if (value === '--help' || value === '-h') {
      options.help = true;
    } else {
      throw new Error('setup_arguments_invalid');
    }
  }
  return options;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('setup_command_failed');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write([
      'Usage: npm run setup:macos -- [--skip-install] [--with-python-agents]',
      '       [--from-checkout /absolute/path]',
      '',
    ].join('\n'));
    return;
  }
  assertMacosDevelopmentRuntime();
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = await setupMacosDevelopmentFiles({
    repoRoot,
    includePythonAgents: options.includePythonAgents,
    fromCheckout: options.fromCheckout,
  });

  run('git', ['config', 'core.hooksPath', '.githooks'], repoRoot);
  if (!options.skipInstall && !await exists(join(repoRoot, 'node_modules'))) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    run(npm, ['ci', '--legacy-peer-deps'], repoRoot);
  }

  process.stdout.write([
    'macOS development files ready',
    `Gateway config: ${result.gateway.configFile}`,
    'Next: docker compose up -d --wait',
    'Then: npm run db:push',
    'Then: npm run dev:bootstrap-user -- --email <email>',
    'Run: npm run dev:all',
    '',
  ].join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    const message = error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
      ? error.message
      : 'setup_macos_failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
