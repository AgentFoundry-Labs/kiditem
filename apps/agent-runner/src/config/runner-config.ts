import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const ConfigSchema = z.object({
  controlOrigin: z.string().min(1),
  tokenFile: z.string().min(1),
  attemptRoot: z.string().min(1),
}).strict();

type ProtectedPathKind = 'file' | 'directory' | 'other';

export type RunnerProtectedPathIdentity = Readonly<{
  device: string;
  inode: string;
}>;

export type RunnerProtectedPathInspection = Readonly<{
  kind: ProtectedPathKind;
  isSymbolicLink: boolean;
  uid?: number;
  mode?: number;
  identity?: RunnerProtectedPathIdentity;
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

export type RunnerProtectedPathFilesystem = Readonly<{
  openReadOnly: (path: string) => Promise<Readonly<{
    readFile: () => Promise<string | Buffer>;
    stat: () => Promise<Readonly<{ dev?: number | bigint; ino?: number | bigint }>>;
    close: () => Promise<void>;
  }>>;
}>;

export type RunnerProtectedPathPolicy =
  | Readonly<{ platform: 'macos'; currentUid: number }>
  | Readonly<{ platform: 'windows'; currentServiceIdentity: string }>;

export type RunnerProtectedAttemptRootGuard = Readonly<{
  canonicalPath: string;
  /** Rechecks the original ancestor/object snapshot immediately before workspace mutation. */
  revalidate: () => Promise<string>;
}>;

export type RunnerProtectedPathOptions = Readonly<{
  /** Injected only for platform verification; production uses the native fail-closed inspector. */
  protectedPathInspector?: RunnerProtectedPathInspector;
  /** Injected only for deterministic protected-path race tests. */
  protectedPathFilesystem?: RunnerProtectedPathFilesystem;
}>;

export type RunnerConfig = Readonly<{
  controlOrigin: string;
  tokenFile: string;
  attemptRoot: string;
  attemptRootGuard: RunnerProtectedAttemptRootGuard;
  runtimeRoot: string;
  loginRoot: string;
}>;

export type RunnerConfigOptions = RunnerProtectedPathOptions & Readonly<{
  entrypoint?: string;
  loginRoot?: string;
}>;

/** Parses the only Runner ingress: `--config <absolute protected JSON path>`. */
export async function loadRunnerConfig(argv: readonly string[], options: RunnerConfigOptions = {}): Promise<RunnerConfig> {
  if (argv.length !== 2 || argv[0] !== '--config' || !isAbsolute(argv[1]!)) {
    throw new Error('runner_arguments_invalid');
  }
  const protection = protectedPathOptions(options);
  const configPath = await snapshotProtectedPath(argv[1]!, 'runner_config', 'file', protection.inspector);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readProtectedText(configPath, protection.filesystem));
  } catch (error) {
    if (isProtectedPathError(error)) throw error;
    throw new Error('runner_config_invalid');
  }
  const config = ConfigSchema.safeParse(parsed);
  if (!config.success) throw new Error('runner_config_invalid');
  const origin = normalizeControlOrigin(config.data.controlOrigin);
  const tokenPath = await snapshotProtectedPath(config.data.tokenFile, 'runner_token', 'file', protection.inspector);
  const attemptRootGuard = await createProtectedAttemptRootGuardFromProtection(config.data.attemptRoot, protection);
  const entrypoint = options.entrypoint ?? __filename;
  const realEntrypoint = await realpath(entrypoint).catch(() => resolve(entrypoint));
  const runtimeRoot = dirname(dirname(realEntrypoint));
  return Object.freeze({
    controlOrigin: origin,
    tokenFile: tokenPath.path,
    attemptRoot: attemptRootGuard.canonicalPath,
    attemptRootGuard,
    runtimeRoot,
    loginRoot: options.loginRoot ?? homedir(),
  });
}

export async function readInstallationToken(tokenFile: string, options: RunnerProtectedPathOptions = {}): Promise<string> {
  const protection = protectedPathOptions(options);
  const tokenPath = await snapshotProtectedPath(tokenFile, 'runner_token', 'file', protection.inspector);
  const token = (await readProtectedText(tokenPath, protection.filesystem)).trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('runner_installation_token_invalid');
  return token;
}

/**
 * Node does not expose an openat-style API to bind an operation to already-open
 * ancestor directory descriptors. We therefore require a non-symlink, private
 * chain from filesystem root and compare snapshots around every descriptor read.
 * The Runner service identity and root/SYSTEM remain the explicit trusted writers.
 */
export async function createProtectedAttemptRootGuard(
  value: string,
  options: RunnerProtectedPathOptions = {},
): Promise<RunnerProtectedAttemptRootGuard> {
  const protection = protectedPathOptions(options);
  return createProtectedAttemptRootGuardFromProtection(value, protection);
}

async function createProtectedAttemptRootGuardFromProtection(
  value: string,
  protection: Readonly<{ inspector: RunnerProtectedPathInspector; filesystem: RunnerProtectedPathFilesystem }>,
): Promise<RunnerProtectedAttemptRootGuard> {
  const snapshot = await snapshotProtectedPath(value, 'runner_attempt_root', 'directory', protection.inspector);
  return Object.freeze({
    canonicalPath: snapshot.path,
    revalidate: async () => {
      await assertProtectedPathSnapshotIntact(snapshot);
      return snapshot.path;
    },
  });
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

type ProtectedPathComponent = Readonly<{
  path: string;
  kind: ProtectedPathKind;
  identity: RunnerProtectedPathIdentity;
}>;

type ProtectedPathSnapshot = Readonly<{
  path: string;
  policy: RunnerProtectedPathPolicy;
  inspector: RunnerProtectedPathInspector;
  components: readonly ProtectedPathComponent[];
}>;

function protectedPathOptions(options: RunnerProtectedPathOptions): Readonly<{
  inspector: RunnerProtectedPathInspector;
  filesystem: RunnerProtectedPathFilesystem;
}> {
  return Object.freeze({
    inspector: options.protectedPathInspector ?? defaultProtectedPathInspector(),
    filesystem: options.protectedPathFilesystem ?? defaultProtectedPathFilesystem(),
  });
}

async function snapshotProtectedPath(
  value: string,
  label: string,
  expectedKind: 'file' | 'directory',
  inspector: RunnerProtectedPathInspector,
): Promise<ProtectedPathSnapshot> {
  if (!isAbsolute(value)) throw new Error(`${label}_path_invalid`);
  const path = resolve(value);
  const policy = await protectedPathPolicy(inspector);
  const components: ProtectedPathComponent[] = [];
  for (const componentPath of protectedPathComponents(path)) {
    const inspection = await inspectProtectedPath(inspector, componentPath);
    if (!inspection) throw new Error(`${label}_missing`);
    const target = componentPath === path;
    if (inspection.isSymbolicLink) {
      throw new Error(target ? `${label}_symlink_rejected` : 'runner_protected_path_ancestor_symlink_rejected');
    }
    if (target) {
      if (inspection.kind !== expectedKind) throw new Error(`${label}_missing`);
      assertProtectedPathPolicy(inspection, policy);
    } else {
      assertProtectedAncestorPolicy(inspection, policy);
    }
    components.push(Object.freeze({
      path: componentPath,
      kind: inspection.kind,
      identity: protectedPathIdentity(inspection),
    }));
  }
  return Object.freeze({ path, policy, inspector, components: Object.freeze(components) });
}

function protectedPathComponents(value: string): readonly string[] {
  const root = parse(value).root;
  const parts = value.slice(root.length).split(sep).filter(Boolean);
  const components = [root];
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    components.push(current);
  }
  return components;
}

async function assertProtectedPathSnapshotIntact(snapshot: ProtectedPathSnapshot): Promise<void> {
  for (const component of snapshot.components) {
    let inspection: RunnerProtectedPathInspection | null;
    try { inspection = await snapshot.inspector.inspect(component.path); }
    catch { throw new Error('runner_protected_path_changed'); }
    if (!inspection || inspection.isSymbolicLink || inspection.kind !== component.kind || !sameIdentity(protectedPathIdentityOrNull(inspection), component.identity)) {
      throw new Error('runner_protected_path_changed');
    }
    try {
      if (component.path === snapshot.path) assertProtectedPathPolicy(inspection, snapshot.policy);
      else assertProtectedAncestorPolicy(inspection, snapshot.policy);
    } catch {
      throw new Error('runner_protected_path_changed');
    }
  }
}

async function readProtectedText(snapshot: ProtectedPathSnapshot, filesystem: RunnerProtectedPathFilesystem): Promise<string> {
  const handle = await filesystem.openReadOnly(snapshot.path).catch(() => { throw new Error('runner_protected_path_changed'); });
  try {
    await assertProtectedFileHandleMatches(handle, snapshot);
    await assertProtectedPathSnapshotIntact(snapshot);
    const content = await handle.readFile();
    await assertProtectedFileHandleMatches(handle, snapshot);
    await assertProtectedPathSnapshotIntact(snapshot);
    return typeof content === 'string' ? content : content.toString('utf8');
  } catch (error) {
    if (isProtectedPathError(error)) throw error;
    throw new Error('runner_protected_path_changed');
  } finally {
    try { await handle.close(); }
    catch { throw new Error('runner_protected_path_io_failed'); }
  }
}

async function assertProtectedFileHandleMatches(
  handle: Awaited<ReturnType<RunnerProtectedPathFilesystem['openReadOnly']>>,
  snapshot: ProtectedPathSnapshot,
): Promise<void> {
  const identity = protectedPathIdentity(await handle.stat());
  const target = snapshot.components[snapshot.components.length - 1]!;
  if (!sameIdentity(identity, target.identity)) throw new Error('runner_protected_path_changed');
}

function inspectProtectedPath(inspector: RunnerProtectedPathInspector, value: string): Promise<RunnerProtectedPathInspection | null> {
  return inspector.inspect(value).catch(() => { throw new Error('runner_protected_path_inspection_failed'); });
}

async function protectedPathPolicy(inspector: RunnerProtectedPathInspector): Promise<RunnerProtectedPathPolicy> {
  if (inspector.platform === 'macos') {
    const uid = inspector.currentUid?.();
    if (uid === undefined) throw new Error('runner_protected_path_owner_invalid');
    return Object.freeze({ platform: 'macos', currentUid: uid });
  }
  let identity: string | undefined;
  try { identity = await inspector.currentServiceIdentity?.(); }
  catch { throw new Error('runner_protected_path_acl_invalid'); }
  if (!identity) throw new Error('runner_protected_path_acl_invalid');
  return Object.freeze({ platform: 'windows', currentServiceIdentity: identity });
}

function assertProtectedAncestorPolicy(inspection: RunnerProtectedPathInspection, policy: RunnerProtectedPathPolicy): void {
  if (inspection.kind !== 'directory') throw new Error('runner_protected_path_ancestor_invalid');
  if (policy.platform === 'windows') {
    assertProtectedPathPolicy(inspection, policy);
    return;
  }
  if (inspection.uid === undefined || (inspection.uid !== policy.currentUid && inspection.uid !== 0)) {
    throw new Error('runner_protected_path_owner_invalid');
  }
  if (inspection.mode === undefined || (inspection.mode & 0o022) !== 0) {
    throw new Error('runner_protected_path_permissions_invalid');
  }
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

function protectedPathIdentity(inspection: Readonly<{
  identity?: Readonly<{ device: string | number | bigint; inode: string | number | bigint }>;
  dev?: number | bigint;
  ino?: number | bigint;
}>): RunnerProtectedPathIdentity {
  const identity = inspection.identity ?? (inspection.dev === undefined || inspection.ino === undefined
    ? undefined
    : { device: filesystemIdentityPart(inspection.dev), inode: filesystemIdentityPart(inspection.ino) });
  if (!identity || identity.device === null || identity.inode === null) {
    throw new Error('runner_protected_path_identity_unavailable');
  }
  const device = filesystemIdentityPart(identity.device);
  const inode = filesystemIdentityPart(identity.inode);
  if (!device || !inode) {
    throw new Error('runner_protected_path_identity_unavailable');
  }
  return Object.freeze({ device, inode });
}

function filesystemIdentityPart(value: string | number | bigint): string | null {
  if (typeof value === 'string') return /^\d+$/.test(value) ? value : null;
  if (typeof value === 'bigint') return value < 0n ? null : value.toString();
  return Number.isInteger(value) && value >= 0 ? String(value) : null;
}

function protectedPathIdentityOrNull(inspection: RunnerProtectedPathInspection): RunnerProtectedPathIdentity | null {
  try { return protectedPathIdentity(inspection); }
  catch { return null; }
}

function sameIdentity(left: RunnerProtectedPathIdentity | null, right: RunnerProtectedPathIdentity): boolean {
  return !!left && left.device === right.device && left.inode === right.inode;
}

function isProtectedPathError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith('runner_protected_path_');
}

function defaultProtectedPathInspector(): RunnerProtectedPathInspector {
  const platform = runnerConfigPlatform();
  let serviceIdentity: Promise<string> | undefined;
  return Object.freeze({
    platform,
    inspect: async (value: string): Promise<RunnerProtectedPathInspection | null> => {
      const info = await lstat(value, { bigint: true }).catch(() => null);
      if (!info) return null;
      const common = Object.freeze({
        kind: info.isFile() ? 'file' as const : info.isDirectory() ? 'directory' as const : 'other' as const,
        isSymbolicLink: info.isSymbolicLink(),
        identity: protectedPathIdentity({ dev: info.dev, ino: info.ino }),
      });
      if (common.isSymbolicLink) return common;
      if (platform === 'macos') return Object.freeze({ ...common, uid: Number(info.uid), mode: Number(info.mode) });
      return Object.freeze({ ...common, windowsAcl: await readWindowsAcl(value) });
    },
    ...(platform === 'macos'
      ? { currentUid: () => process.getuid?.() }
      : { currentServiceIdentity: () => serviceIdentity ??= currentWindowsServiceIdentity() }),
  });
}

function defaultProtectedPathFilesystem(): RunnerProtectedPathFilesystem {
  const noFollow = process.platform === 'win32' ? 0 : (constants.O_NOFOLLOW ?? 0);
  return Object.freeze({
    openReadOnly: async (value: string) => {
      const handle = await open(value, constants.O_RDONLY | noFollow);
      return Object.freeze({
        readFile: () => handle.readFile({ encoding: 'utf8' }),
        stat: () => handle.stat({ bigint: true }),
        close: () => handle.close(),
      });
    },
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
