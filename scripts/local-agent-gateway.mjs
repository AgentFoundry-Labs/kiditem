#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_KEYS = Object.freeze([
  'controlOrigin', 'tokenFile', 'stateRoot', 'runtimeRoot', 'workspace', 'loginRoot',
]);

export function defaultMacosGatewayConfigPath(home = homedir()) {
  return join(resolve(home), 'Library', 'Application Support', 'KidItem', 'AgentGateway', 'gateway-config.json');
}

export async function loadLocalGatewayConfig(configFile) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configFile, 'utf8'));
  } catch {
    throw new Error('gateway_config_invalid');
  }
  if (
    !parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
    Object.keys(parsed).sort().join('\0') !== [...CONFIG_KEYS].sort().join('\0') ||
    CONFIG_KEYS.some((key) => typeof parsed[key] !== 'string' || !parsed[key].trim()) ||
    parsed.controlOrigin !== 'http://127.0.0.1:4000' ||
    CONFIG_KEYS.slice(1).some((key) => !isAbsolute(parsed[key]))
  ) {
    throw new Error('gateway_config_invalid');
  }
  return Object.freeze({
    controlOrigin: parsed.controlOrigin,
    tokenFile: resolve(parsed.tokenFile),
    stateRoot: resolve(parsed.stateRoot),
    runtimeRoot: resolve(parsed.runtimeRoot),
    workspace: resolve(parsed.workspace),
    loginRoot: resolve(parsed.loginRoot),
  });
}

export function buildProviderLoginCommand({
  provider,
  config,
  platform = process.platform,
  processExecPath = process.execPath,
  environment = process.env,
}) {
  if (provider !== 'codex' && provider !== 'claude') throw new Error('gateway_provider_invalid');
  const candidates = provider === 'codex'
    ? ['node_modules/@openai/codex/bin/codex.js']
    : ['node_modules/@anthropic-ai/claude-code/bin/claude.exe', 'node_modules/@anthropic-ai/claude-code/cli.js'];
  const entrypoint = candidates.map((value) => resolve(config.runtimeRoot, value)).find(existsSync);
  if (!entrypoint) throw new Error('gateway_provider_package_missing');
  const javascript = extname(entrypoint).toLowerCase() === '.js';
  const env = providerLoginEnvironment({ provider, loginRoot: config.loginRoot, platform, environment });
  return Object.freeze({
    executable: javascript ? resolve(processExecPath) : entrypoint,
    args: Object.freeze([
      ...(javascript ? [entrypoint] : []),
      ...(provider === 'codex' ? ['login'] : ['auth', 'login']),
    ]),
    cwd: config.runtimeRoot,
    env,
  });
}

export function buildProviderAuthStatusCommand(input) {
  const login = buildProviderLoginCommand(input);
  const argsPrefix = input.provider === 'codex'
    ? login.args.slice(0, -1)
    : login.args.slice(0, -2);
  return Object.freeze({
    ...login,
    args: Object.freeze(input.provider === 'codex'
      ? [...argsPrefix, 'login', 'status']
      : [...argsPrefix, 'auth', 'status', '--json']),
  });
}

export function ensureProviderAuthentication({ status, login, interactive }) {
  if (status()) return Object.freeze({ loginStarted: false });
  if (!interactive) throw new Error('gateway_provider_unauthenticated');
  login();
  if (!status()) throw new Error('gateway_provider_auth_failed');
  return Object.freeze({ loginStarted: true });
}

export function buildLocalGatewayStartCommand({
  configFile,
  config,
  processExecPath = process.execPath,
  environment = process.env,
}) {
  const entrypoint = resolve(config.runtimeRoot, 'apps/agent-gateway/dist/main.cjs');
  if (!existsSync(entrypoint)) throw new Error('gateway_build_missing');
  return Object.freeze({
    executable: resolve(processExecPath),
    args: Object.freeze([entrypoint, '--config', resolve(configFile)]),
    cwd: config.runtimeRoot,
    env: Object.freeze({ ...environment }),
  });
}

function providerLoginEnvironment({ provider, loginRoot, platform, environment }) {
  const user = environment.USER?.trim();
  if (platform === 'darwin' && !user) throw new Error('provider_user_identity_required');
  const optional = (key) => environment[key] ? { [key]: environment[key] } : {};
  return Object.freeze({
    PATH: environment.PATH ?? '',
    HOME: loginRoot,
    ...(provider === 'codex' ? { CODEX_HOME: join(loginRoot, '.codex') } : {}),
    ...(platform === 'darwin' ? { USER: user } : {}),
    ...optional('TERM'),
    ...optional('LANG'),
    ...optional('LC_ALL'),
    CODEX_DISABLE_AUTO_UPDATE: '1',
    DISABLE_AUTOUPDATER: '1',
  });
}

function commandSucceeds(command) {
  const result = spawnSync(command.executable, command.args, {
    cwd: command.cwd,
    env: command.env,
    stdio: 'ignore',
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

function run(command, failureCode = 'gateway_command_failed') {
  const result = spawnSync(command.executable, command.args, {
    cwd: command.cwd,
    env: command.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(failureCode);
}

async function main() {
  const [command, provider, extra] = process.argv.slice(2);
  if (command === '--help' || command === '-h') {
    process.stdout.write('Usage: local-agent-gateway <start | auth codex | auth claude | login codex | login claude>\n');
    return;
  }
  if (extra || !['start', 'auth', 'login'].includes(command)) throw new Error('gateway_arguments_invalid');
  if (command === 'start' && provider) throw new Error('gateway_arguments_invalid');
  if ((command === 'auth' || command === 'login') && provider !== 'codex' && provider !== 'claude') {
    throw new Error('gateway_arguments_invalid');
  }
  const configFile = process.env.KIDITEM_AGENT_GATEWAY_CONFIG_FILE?.trim()
    || defaultMacosGatewayConfigPath();
  if (!isAbsolute(configFile)) throw new Error('gateway_config_path_invalid');
  const config = await loadLocalGatewayConfig(configFile);
  if (command === 'login') {
    run(buildProviderLoginCommand({ provider, config }));
    return;
  }
  const selectedProvider = command === 'start' ? 'codex' : provider;
  const statusCommand = buildProviderAuthStatusCommand({ provider: selectedProvider, config });
  ensureProviderAuthentication({
    status: () => commandSucceeds(statusCommand),
    login: () => run(
      buildProviderLoginCommand({ provider: selectedProvider, config }),
      'gateway_provider_auth_failed',
    ),
    interactive: command === 'auth',
  });
  if (command === 'start') run(buildLocalGatewayStartCommand({ configFile, config }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    const message = error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
      ? error.message
      : 'gateway_command_failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
