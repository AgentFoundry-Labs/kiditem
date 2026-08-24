import { homedir } from 'node:os';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';

const ConfigSchema = z.object({
  controlOrigin: z.string().min(1),
  tokenFile: z.string().min(1),
  attemptRoot: z.string().min(1),
}).strict();

export type RunnerConfig = Readonly<{
  controlOrigin: string;
  tokenFile: string;
  attemptRoot: string;
  runtimeRoot: string;
  loginRoot: string;
}>;

export type RunnerConfigOptions = Readonly<{
  entrypoint?: string;
  loginRoot?: string;
}>;

/** Parses the only Runner ingress: `--config <absolute protected JSON path>`. */
export async function loadRunnerConfig(argv: readonly string[], options: RunnerConfigOptions = {}): Promise<RunnerConfig> {
  if (argv.length !== 2 || argv[0] !== '--config' || !isAbsolute(argv[1]!)) {
    throw new Error('runner_arguments_invalid');
  }
  const configPath = await safeRealFile(argv[1]!, 'runner_config');
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(configPath, 'utf8')); } catch { throw new Error('runner_config_invalid'); }
  const config = ConfigSchema.safeParse(parsed);
  if (!config.success) throw new Error('runner_config_invalid');
  const origin = normalizeControlOrigin(config.data.controlOrigin);
  const tokenFile = await safeRealFile(config.data.tokenFile, 'runner_token');
  const attemptRoot = await safeRealDirectory(config.data.attemptRoot, 'runner_attempt_root');
  const entrypoint = options.entrypoint ?? __filename;
  const realEntrypoint = await realpath(entrypoint).catch(() => resolve(entrypoint));
  const runtimeRoot = dirname(dirname(realEntrypoint));
  return Object.freeze({
    controlOrigin: origin,
    tokenFile,
    attemptRoot,
    runtimeRoot,
    loginRoot: options.loginRoot ?? homedir(),
  });
}

export async function readInstallationToken(tokenFile: string): Promise<string> {
  const token = (await readFile(tokenFile, 'utf8')).trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('runner_installation_token_invalid');
  return token;
}

function normalizeControlOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('runner_control_origin_invalid'); }
  if (
    url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '4000' ||
    url.pathname !== '/' || url.search || url.hash || url.username || url.password
  ) throw new Error('runner_control_origin_invalid');
  return url.origin;
}

async function safeRealFile(value: string, label: string): Promise<string> {
  if (!isAbsolute(value)) throw new Error(`${label}_path_invalid`);
  const info = await lstat(value).catch(() => null);
  if (!info) throw new Error(`${label}_missing`);
  if (info.isSymbolicLink()) throw new Error(`${label}_symlink_rejected`);
  if (!info.isFile()) throw new Error(`${label}_missing`);
  return realpath(value);
}

async function safeRealDirectory(value: string, label: string): Promise<string> {
  if (!isAbsolute(value)) throw new Error(`${label}_path_invalid`);
  const info = await lstat(value).catch(() => null);
  if (!info) throw new Error(`${label}_missing`);
  if (info.isSymbolicLink()) throw new Error(`${label}_symlink_rejected`);
  if (!info.isDirectory()) throw new Error(`${label}_missing`);
  return realpath(value);
}
