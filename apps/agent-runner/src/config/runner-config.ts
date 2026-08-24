import { homedir } from 'node:os';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const ConfigSchema = z.object({
  controlOrigin: z.string().min(1),
  tokenFile: z.string().min(1),
  attemptRoot: z.string().min(1),
}).strict();

type ProtectedPathKind = 'file' | 'directory' | 'other';

export type RunnerProtectedPathInspection = Readonly<{
  kind: ProtectedPathKind;
  isSymbolicLink: boolean;
  uid?: number;
  mode?: number;
  windowsAcl?: Readonly<{
    owner: string;
    entries: readonly Readonly<{
      identity: string;
      access: 'allow' | 'deny' | 'other';
      rights: 'full' | 'other';
    }>[];
  }>;
}>;

export type RunnerProtectedPathInspector = Readonly<{
  platform: 'macos' | 'windows';
  inspect: (path: string) => Promise<RunnerProtectedPathInspection | null>;
  currentUid?: () => number | undefined;
  currentServiceIdentity?: () => Promise<string>;
}>;

export type RunnerProtectedPathPolicy =
  | Readonly<{ platform: 'macos'; currentUid: number }>
  | Readonly<{ platform: 'windows'; currentServiceIdentity: string }>;

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
  /** Injected only for platform verification; production uses the native fail-closed inspector. */
  protectedPathInspector?: RunnerProtectedPathInspector;
}>;

/** Parses the only Runner ingress: `--config <absolute protected JSON path>`. */
export async function loadRunnerConfig(argv: readonly string[], options: RunnerConfigOptions = {}): Promise<RunnerConfig> {
  if (argv.length !== 2 || argv[0] !== '--config' || !isAbsolute(argv[1]!)) {
    throw new Error('runner_arguments_invalid');
  }
  const protectedPaths = options.protectedPathInspector ?? defaultProtectedPathInspector();
  const configPath = await safeRealFile(argv[1]!, 'runner_config', protectedPaths);
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(configPath, 'utf8')); } catch { throw new Error('runner_config_invalid'); }
  const config = ConfigSchema.safeParse(parsed);
  if (!config.success) throw new Error('runner_config_invalid');
  const origin = normalizeControlOrigin(config.data.controlOrigin);
  const tokenFile = await safeRealFile(config.data.tokenFile, 'runner_token', protectedPaths);
  const attemptRoot = await safeRealDirectory(config.data.attemptRoot, 'runner_attempt_root', protectedPaths);
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

async function safeRealFile(value: string, label: string, inspector: RunnerProtectedPathInspector): Promise<string> {
  return safeRealProtectedPath(value, label, 'file', inspector);
}

async function safeRealDirectory(value: string, label: string, inspector: RunnerProtectedPathInspector): Promise<string> {
  return safeRealProtectedPath(value, label, 'directory', inspector);
}

async function safeRealProtectedPath(
  value: string,
  label: string,
  expectedKind: 'file' | 'directory',
  inspector: RunnerProtectedPathInspector,
): Promise<string> {
  if (!isAbsolute(value)) throw new Error(`${label}_path_invalid`);
  const inspection = await inspectProtectedPath(inspector, value);
  if (!inspection) throw new Error(`${label}_missing`);
  if (inspection.isSymbolicLink) throw new Error(`${label}_symlink_rejected`);
  if (inspection.kind !== expectedKind) throw new Error(`${label}_missing`);
  await assertProtectedPathPolicyForInspector(inspection, inspector);
  return realpath(value).catch(() => { throw new Error(`${label}_missing`); });
}

async function inspectProtectedPath(inspector: RunnerProtectedPathInspector, value: string): Promise<RunnerProtectedPathInspection | null> {
  try { return await inspector.inspect(value); }
  catch { throw new Error('runner_protected_path_inspection_failed'); }
}

async function assertProtectedPathPolicyForInspector(
  inspection: RunnerProtectedPathInspection,
  inspector: RunnerProtectedPathInspector,
): Promise<void> {
  if (inspector.platform === 'macos') {
    const uid = inspector.currentUid?.();
    if (uid === undefined) throw new Error('runner_protected_path_owner_invalid');
    assertProtectedPathPolicy(inspection, { platform: 'macos', currentUid: uid });
    return;
  }
  let identity: string | undefined;
  try { identity = await inspector.currentServiceIdentity?.(); }
  catch { throw new Error('runner_protected_path_acl_invalid'); }
  if (!identity) throw new Error('runner_protected_path_acl_invalid');
  assertProtectedPathPolicy(inspection, { platform: 'windows', currentServiceIdentity: identity });
}

/** Pure protected-path policy so Windows ACL behavior is unit-testable from macOS. */
export function assertProtectedPathPolicy(inspection: RunnerProtectedPathInspection, policy: RunnerProtectedPathPolicy): void {
  if (inspection.isSymbolicLink) throw new Error('runner_protected_path_symlink_rejected');
  if (policy.platform === 'macos') {
    if (inspection.uid === undefined || inspection.uid !== policy.currentUid) throw new Error('runner_protected_path_owner_invalid');
    if (inspection.mode === undefined || (inspection.mode & 0o077) !== 0) throw new Error('runner_protected_path_permissions_invalid');
    return;
  }
  const acl = inspection.windowsAcl;
  const serviceIdentity = normalizeWindowsIdentity(policy.currentServiceIdentity);
  if (!acl || !serviceIdentity) throw new Error('runner_protected_path_acl_invalid');
  const permitted = new Set([serviceIdentity, 'BA', 'SY']);
  if (!permitted.has(normalizeWindowsIdentity(acl.owner))) throw new Error('runner_protected_path_owner_invalid');
  const granted = new Set<string>();
  for (const entry of acl.entries) {
    const identity = normalizeWindowsIdentity(entry.identity);
    if (!permitted.has(identity) || entry.access !== 'allow' || entry.rights !== 'full') {
      throw new Error('runner_protected_path_acl_invalid');
    }
    granted.add(identity);
  }
  for (const identity of permitted) {
    if (!granted.has(identity)) throw new Error('runner_protected_path_acl_invalid');
  }
}

function defaultProtectedPathInspector(): RunnerProtectedPathInspector {
  const platform = runnerConfigPlatform();
  let serviceIdentity: Promise<string> | undefined;
  return Object.freeze({
    platform,
    inspect: async (value: string): Promise<RunnerProtectedPathInspection | null> => {
      const info = await lstat(value).catch(() => null);
      if (!info) return null;
      const common = Object.freeze({
        kind: info.isFile() ? 'file' as const : info.isDirectory() ? 'directory' as const : 'other' as const,
        isSymbolicLink: info.isSymbolicLink(),
      });
      if (common.isSymbolicLink) return common;
      if (platform === 'macos') return Object.freeze({ ...common, uid: info.uid, mode: info.mode });
      return Object.freeze({ ...common, windowsAcl: await readWindowsAcl(value) });
    },
    ...(platform === 'macos'
      ? { currentUid: () => process.getuid?.() }
      : { currentServiceIdentity: () => serviceIdentity ??= currentWindowsServiceIdentity() }),
  });
}

function runnerConfigPlatform(): 'macos' | 'windows' {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  throw new Error('runner_platform_unsupported');
}

const execFileAsync = promisify(execFile);
const WINDOWS_ACL_SDDL_COMMAND = "$ErrorActionPreference = 'Stop'; $acl = Get-Acl -LiteralPath $args[0]; [Console]::Out.Write($acl.Sddl)";

async function currentWindowsServiceIdentity(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 8 * 1024 });
    const identity = /S-\d+(?:-\d+)+/i.exec(String(stdout))?.[0];
    if (!identity) throw new Error('windows_identity_missing');
    return identity;
  } catch {
    throw new Error('runner_protected_path_acl_unreadable');
  }
}

async function readWindowsAcl(value: string): Promise<NonNullable<RunnerProtectedPathInspection['windowsAcl']>> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_ACL_SDDL_COMMAND, value],
      { windowsHide: true, maxBuffer: 32 * 1024 },
    );
    return parseWindowsAclSddl(String(stdout));
  } catch {
    throw new Error('runner_protected_path_acl_unreadable');
  }
}

function parseWindowsAclSddl(value: string): NonNullable<RunnerProtectedPathInspection['windowsAcl']> {
  const owner = sddlSection(value, 'O');
  const dacl = sddlSection(value, 'D');
  if (!owner || !dacl) throw new Error('windows_acl_sddl_invalid');
  const entries = [...dacl.matchAll(/\(([^()]*)\)/g)].map((match) => {
    const fields = match[1]!.split(';');
    if (fields.length < 6 || !fields[5]) throw new Error('windows_acl_sddl_invalid');
    return Object.freeze({
      identity: fields[5]!,
      access: fields[0] === 'A' ? 'allow' as const : fields[0] === 'D' ? 'deny' as const : 'other' as const,
      rights: fields[2] === 'FA' ? 'full' as const : 'other' as const,
    });
  });
  if (!entries.length) throw new Error('windows_acl_sddl_invalid');
  return Object.freeze({ owner, entries });
}

function sddlSection(value: string, marker: 'O' | 'D'): string | null {
  const start = value.indexOf(`${marker}:`);
  if (start < 0) return null;
  const remainder = value.slice(start + 2);
  const ends = ['O:', 'G:', 'D:', 'S:']
    .filter((candidate) => candidate !== `${marker}:`)
    .map((candidate) => remainder.indexOf(candidate))
    .filter((index) => index >= 0);
  const end = ends.length ? Math.min(...ends) : remainder.length;
  return remainder.slice(0, end).trim() || null;
}

function normalizeWindowsIdentity(value: string): string {
  const identity = value.trim().toUpperCase();
  if (identity === 'S-1-5-18') return 'SY';
  if (identity === 'S-1-5-32-544') return 'BA';
  return identity;
}
