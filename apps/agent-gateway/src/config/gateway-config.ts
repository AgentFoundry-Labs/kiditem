import { readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';

const GatewayConfigSchema = z.object({
  controlOrigin: z.string().min(1),
  tokenFile: z.string().min(1),
  stateRoot: z.string().min(1),
  runtimeRoot: z.string().min(1),
  workspace: z.string().min(1),
  loginRoot: z.string().min(1).optional(),
}).strict();

export type GatewayConfig = Readonly<{
  controlOrigin: string;
  tokenFile: string;
  stateRoot: string;
  runtimeRoot: string;
  workspace: string;
  loginRoot: string;
}>;

/** Parses the sole native ingress. Nest never controls provider-local paths. */
export async function loadGatewayConfig(argv: readonly string[]): Promise<GatewayConfig> {
  if (argv.length !== 2 || argv[0] !== '--config' || !isAbsolute(argv[1]!)) throw new Error('gateway_arguments_invalid');
  let raw: unknown;
  try { raw = JSON.parse(await readFile(argv[1]!, 'utf8')); } catch { throw new Error('gateway_config_invalid'); }
  const parsed = GatewayConfigSchema.safeParse(raw);
  if (!parsed.success) throw new Error('gateway_config_invalid');
  const origin = normalizeControlOrigin(parsed.data.controlOrigin);
  const paths = [parsed.data.tokenFile, parsed.data.stateRoot, parsed.data.runtimeRoot, parsed.data.workspace, parsed.data.loginRoot ?? homedir()];
  if (paths.some((path) => !isAbsolute(path))) throw new Error('gateway_config_invalid');
  const runtimeRoot = await realpath(parsed.data.runtimeRoot).catch(() => resolve(parsed.data.runtimeRoot));
  return Object.freeze({
    controlOrigin: origin,
    tokenFile: resolve(parsed.data.tokenFile),
    stateRoot: resolve(parsed.data.stateRoot),
    runtimeRoot,
    workspace: resolve(parsed.data.workspace),
    loginRoot: resolve(parsed.data.loginRoot ?? homedir()),
  });
}

export async function readGatewayInstallationToken(tokenFile: string): Promise<string> {
  let token: string;
  try { token = (await readFile(tokenFile, 'utf8')).trim(); } catch { throw new Error('gateway_installation_token_unreadable'); }
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('gateway_installation_token_invalid');
  return token;
}

function normalizeControlOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('gateway_control_origin_invalid'); }
  if (
    url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '4000' ||
    url.pathname !== '/' || url.search || url.hash || url.username || url.password
  ) throw new Error('gateway_control_origin_invalid');
  return url.origin;
}
