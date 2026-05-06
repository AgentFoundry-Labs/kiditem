import 'dotenv/config';

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { runCoupangDevData } from './dev-data-coupang';

const PACKAGE_SCHEMA_VERSION = 'kiditem.dev-data.package.v1';
const PROFILE_SCHEMA_VERSION = 'kiditem.dev-data.profile.v1';
const LOCAL_DATA_ROOT = path.join('.data', 'dev');
const LOCAL_PACKAGE_DIR = 'packages';
const DRIVE_PACKAGE_DIR = 'bundles';
const DRIVE_PROFILE_DIR = 'profiles';
const DRIVE_REFERENCE_DIR = 'references';
const CANONICAL_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1sIuAiZAX6wAFOoEmmJGe6p0b5xwey1AO?usp=drive_link';

const execFileAsync = promisify(execFile);

type Command = 'status' | 'setup' | 'pull' | 'sync' | 'pack' | 'publish' | 'export' | 'sanitize' | 'replay';
type AdapterCommand = 'export' | 'sanitize' | 'replay';
type Lane = 'real' | 'demo';
type ReplayMode = 'upsert' | 'scoped-replace' | 'full-reset' | 'replace' | 'pull-only';

type Args = {
  command: Command;
  values: Map<string, string[]>;
  flags: Set<string>;
};

type BundlePayload = {
  path: string;
  type: string;
  source?: string;
  description?: string;
  sha256?: string;
  rowCount?: number;
};

type BundleReference = {
  path: string;
  type: string;
  description?: string;
  sha256?: string;
  bytes?: number;
};

type BundleManifest = {
  schemaVersion: string;
  datasetId: string;
  lane: Lane;
  createdAt: string;
  defaultImportMode?: ReplayMode;
  payloads?: BundlePayload[];
  references?: BundleReference[];
  checksums?: Record<string, string>;
};

type BundlePackageIndex = {
  schemaVersion: string;
  domain: string;
  datasetId: string;
  lane: Lane;
  archiveFileName: string;
  archivePath: string;
  sha256: string;
  bytes: number;
  manifestSha256: string;
  createdAt: string;
  publishedAt?: string;
  canonicalDriveFolderUrl?: string;
};

type DevDataProfile = {
  schemaVersion: string;
  profileId: string;
  description?: string;
  steps: DevDataProfileStep[];
};

type DevDataProfileStep = {
  domain: string;
  lane?: Lane;
  dataset?: string;
  mode?: ReplayMode;
  replay?: boolean;
};

type PullResult = {
  domain: string;
  lane: Lane;
  datasetId: string;
  format: 'archive' | 'directory';
  from: string;
  to: string;
  manifest: BundleManifest;
};

const DEFAULT_PROFILES: Record<string, DevDataProfile> = {
  workspace: {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profileId: 'workspace',
    description: 'Default local workspace data from real Coupang scraper payloads',
    steps: [
      { domain: 'coupang', dataset: 'latest', mode: 'scoped-replace' },
    ],
  },
  coupang: {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profileId: 'coupang',
    description: 'Real Coupang scraper payload replay profile',
    steps: [
      { domain: 'coupang', dataset: 'latest', mode: 'scoped-replace' },
    ],
  },
};

const PROJECT_REFERENCE_FILES = [
  'kiditem_list.xlsx',
  'wing-inventory-matched.xlsx',
] as const;

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const command = (raw.shift() ?? 'status') as Command;
  if (!['status', 'setup', 'pull', 'sync', 'pack', 'publish', 'export', 'sanitize', 'replay'].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let i = 0; i < raw.length; i += 1) {
    const token = raw[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const stripped = token.slice(2);
    const eq = stripped.indexOf('=');
    if (eq >= 0) {
      pushValue(values, stripped.slice(0, eq), stripped.slice(eq + 1));
      continue;
    }
    const next = raw[i + 1];
    if (!next || next.startsWith('--')) {
      flags.add(stripped);
      continue;
    }
    pushValue(values, stripped, next);
    i += 1;
  }
  return { command, values, flags };
}

function pushValue(values: Map<string, string[]>, key: string, item: string): void {
  values.set(key, [...(values.get(key) ?? []), item]);
}

function value(args: Args, key: string): string | undefined {
  return args.values.get(key)?.at(-1);
}

function values(args: Args, key: string): string[] {
  return args.values.get(key) ?? [];
}

function bool(args: Args, key: string): boolean {
  return args.flags.has(key) || value(args, key) === 'true';
}

function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function repoPath(...parts: string[]): string {
  return path.resolve(process.cwd(), ...parts);
}

function localDataRoot(args: Args): string {
  return path.resolve(expandHome(value(args, 'data-root') ?? repoPath(LOCAL_DATA_ROOT)));
}

function driveRoot(args: Args): string {
  const root = configuredDriveRoot(args);
  if (!root) {
    throw new Error(
      `Google Drive root is required. Open ${CANONICAL_DRIVE_FOLDER_URL}, sync it locally, then set KIDITEM_DEV_DATA_DRIVE_DIR or pass --drive-root.`,
    );
  }
  return root;
}

function requiredValue(args: Args, key: string): string {
  const item = value(args, key);
  if (!item) throw new Error(`--${key} is required`);
  return item;
}

function safeId(input: string, label: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(input)) {
    throw new Error(`Unsafe ${label}: ${input}`);
  }
  return input;
}

function safeDomain(input: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(input)) {
    throw new Error(`Unsafe domain: ${input}`);
  }
  return input;
}

function laneFrom(raw: string | undefined): Lane {
  const lane = raw ?? 'real';
  if (lane !== 'real' && lane !== 'demo') throw new Error(`Invalid lane: ${lane}`);
  return lane;
}

function replayModeFrom(raw: string | undefined): ReplayMode | undefined {
  if (raw === undefined) return undefined;
  if (!['upsert', 'scoped-replace', 'full-reset', 'replace', 'pull-only'].includes(raw)) {
    throw new Error(`Invalid replay mode: ${raw}`);
  }
  return raw as ReplayMode;
}

function assertSafeRelativePath(relativePath: string): void {
  if (path.isAbsolute(relativePath) || relativePath.includes('..')) {
    throw new Error(`Unsafe bundle path: ${relativePath}`);
  }
}

function archiveFileName(domain: string, _lane: Lane, datasetId: string): string {
  return `kiditem-${safeDomain(domain)}-${safeId(datasetId, 'dataset id')}.zip`;
}

function archiveShaFileName(fileName: string): string {
  return `${fileName}.sha256`;
}

function driveLaneDir(root: string, domain: string, lane: Lane): string {
  void lane;
  return path.join(root, safeDomain(domain));
}

function driveBundleDir(root: string, domain: string, lane: Lane, datasetId: string): string {
  return path.join(driveLaneDir(root, domain, lane), safeId(datasetId, 'dataset id'));
}

function localDomainRoot(args: Args, domain: string): string {
  return path.join(localDataRoot(args), safeDomain(domain));
}

function localBundleDir(args: Args, domain: string, datasetId: string): string {
  return path.join(localDomainRoot(args, domain), safeId(datasetId, 'dataset id'));
}

function localPackageDir(args: Args, domain: string): string {
  return path.join(localDataRoot(args), LOCAL_PACKAGE_DIR, safeDomain(domain));
}

async function readTextIfExists(file: string): Promise<string | null> {
  if (!existsSync(file)) return null;
  return (await readFile(file, 'utf8')).trim();
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function sha256(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function fileSize(file: string): Promise<number> {
  return (await stat(file)).size;
}

async function loadManifest(bundleDir: string): Promise<BundleManifest> {
  const manifest = await readJson<BundleManifest>(path.join(bundleDir, 'manifest.json'));
  if (!manifest.schemaVersion?.startsWith('kiditem.dev-data.')) {
    throw new Error(`Unsupported manifest schemaVersion: ${manifest.schemaVersion}`);
  }
  if (!manifest.datasetId) throw new Error('manifest.datasetId is required');
  safeId(manifest.datasetId, 'dataset id');
  if (manifest.lane !== 'real' && manifest.lane !== 'demo') {
    throw new Error(`Invalid manifest.lane: ${manifest.lane}`);
  }
  if (manifest.payloads !== undefined && !Array.isArray(manifest.payloads)) {
    throw new Error('manifest.payloads must be an array when provided');
  }
  return manifest;
}

async function verifyBundle(bundleDir: string, manifest: BundleManifest): Promise<void> {
  for (const artifact of [...(manifest.payloads ?? []), ...(manifest.references ?? [])]) {
    assertSafeRelativePath(artifact.path);
    const file = path.join(bundleDir, artifact.path);
    const expected = artifact.sha256 ?? manifest.checksums?.[artifact.path];
    if (!existsSync(file)) throw new Error(`Missing bundle artifact: ${artifact.path}`);
    if (!expected) continue;
    const actual = await sha256(file);
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${artifact.path}: ${actual} != ${expected}`);
    }
  }
}

async function readLatestPackageIndex(
  laneDir: string,
  domain: string,
): Promise<BundlePackageIndex | null> {
  const latestPath = path.join(laneDir, 'latest.json');
  if (!existsSync(latestPath)) return null;
  const latest = await readJson<BundlePackageIndex & { domain?: string }>(latestPath);
  const legacySchemaVersion = `kiditem.dev-data.${domain}.package.v1`;
  if (latest.schemaVersion !== PACKAGE_SCHEMA_VERSION && latest.schemaVersion !== legacySchemaVersion) {
    throw new Error(
      `Unsupported latest.json schemaVersion ${latest.schemaVersion}. Expected ${PACKAGE_SCHEMA_VERSION}.`,
    );
  }
  const latestDomain = safeDomain(latest.domain ?? domain);
  if (latestDomain !== domain) throw new Error(`latest.json domain mismatch: ${latestDomain} != ${domain}`);
  if (latest.lane !== 'real' && latest.lane !== 'demo') {
    throw new Error(`Invalid latest.json lane: ${latest.lane}`);
  }
  safeId(latest.datasetId, 'dataset id');
  assertSafeRelativePath(latest.archivePath);
  return { ...latest, domain: latestDomain };
}

async function createZipArchive(sourceDir: string, archivePath: string): Promise<void> {
  await mkdir(path.dirname(archivePath), { recursive: true });
  await rm(archivePath, { force: true });
  try {
    await execFileAsync('zip', [
      '-X',
      '-q',
      '-r',
      archivePath,
      '.',
      '-x',
      '*.DS_Store',
      '__MACOSX/*',
    ], { cwd: sourceDir });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create zip archive. Ensure the zip command is installed. ${message}`);
  }
}

async function extractZipArchive(archivePath: string, targetDir: string): Promise<void> {
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  try {
    await execFileAsync('unzip', ['-q', archivePath, '-d', targetDir]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract zip archive. Ensure the unzip command is installed. ${message}`);
  }
}

async function writeShaFile(shaFilePath: string, digest: string, fileName: string): Promise<void> {
  await writeFile(shaFilePath, `${digest}  ${fileName}\n`, 'utf8');
}

async function packBundle(
  args: Args,
  domain: string,
  datasetId: string,
): Promise<BundlePackageIndex & { archivePath: string; shaFilePath: string }> {
  const bundleDir = localBundleDir(args, domain, datasetId);
  const manifest = await loadManifest(bundleDir);
  await verifyBundle(bundleDir, manifest);

  const lane = laneFrom(value(args, 'lane') ?? manifest.lane);
  if (lane !== manifest.lane) throw new Error(`Manifest lane mismatch: ${manifest.lane} != ${lane}`);

  const fileName = archiveFileName(domain, lane, datasetId);
  const packageDir = localPackageDir(args, domain);
  const archivePath = path.join(packageDir, fileName);
  const shaFilePath = path.join(packageDir, archiveShaFileName(fileName));

  await createZipArchive(bundleDir, archivePath);
  const digest = await sha256(archivePath);
  await writeShaFile(shaFilePath, digest, fileName);

  const index: BundlePackageIndex & { archivePath: string; shaFilePath: string } = {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    domain,
    datasetId,
    lane,
    archiveFileName: fileName,
    archivePath,
    shaFilePath,
    sha256: digest,
    bytes: await fileSize(archivePath),
    manifestSha256: await sha256(path.join(bundleDir, 'manifest.json')),
    createdAt: new Date().toISOString(),
  };
  await writeJson(path.join(packageDir, `${fileName}.json`), index);
  return index;
}

async function pullBundle(
  args: Args,
  domain: string,
  lane: Lane,
  requestedDataset: string | undefined,
): Promise<PullResult> {
  const root = driveRoot(args);
  const laneDir = driveLaneDir(root, domain, lane);
  const latestPackage = await readLatestPackageIndex(laneDir, domain);
  if (latestPackage && latestPackage.lane !== lane) {
    throw new Error(`latest.json lane mismatch: ${latestPackage.lane} != ${lane}`);
  }

  const latestTxt = await readTextIfExists(path.join(laneDir, 'latest.txt'));
  const datasetId =
    requestedDataset && requestedDataset !== 'latest'
      ? safeId(requestedDataset, 'dataset id')
      : latestPackage?.datasetId ?? (latestTxt ? safeId(latestTxt, 'dataset id') : '');
  if (!datasetId) throw new Error(`No dataset provided and no latest bundle for ${domain}`);

  const archivePath =
    latestPackage?.datasetId === datasetId
      ? path.join(laneDir, latestPackage.archivePath)
      : path.join(laneDir, DRIVE_PACKAGE_DIR, archiveFileName(domain, lane, datasetId));

  const target = localBundleDir(args, domain, datasetId);
  let source = archivePath;
  let format: 'archive' | 'directory' = 'archive';
  if (existsSync(archivePath)) {
    const expectedSha = latestPackage?.datasetId === datasetId ? latestPackage.sha256 : null;
    if (expectedSha) {
      const actualSha = await sha256(archivePath);
      if (actualSha !== expectedSha) {
        throw new Error(`Archive checksum mismatch for ${archivePath}: ${actualSha} != ${expectedSha}`);
      }
    }
    await extractZipArchive(archivePath, target);
  } else {
    source = driveBundleDir(root, domain, lane, datasetId);
    format = 'directory';
    if (!existsSync(source)) throw new Error(`Drive bundle not found: ${source}`);
    await rm(target, { recursive: true, force: true });
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
  }

  const manifest = await loadManifest(target);
  await verifyBundle(target, manifest);
  await writeFile(path.join(localDomainRoot(args, domain), 'latest.txt'), `${datasetId}\n`, 'utf8');
  return { domain, lane, datasetId, format, from: source, to: target, manifest };
}

async function loadProfile(args: Args): Promise<DevDataProfile> {
  const profileId = safeId(requiredValue(args, 'profile'), 'profile id');
  const profilePath = path.join(driveRoot(args), DRIVE_PROFILE_DIR, `${profileId}.json`);
  const profile = await readJson<DevDataProfile>(profilePath);
  validateProfile(profile, profileId);
  return profile;
}

function validateProfile(profile: DevDataProfile, expectedProfileId?: string): void {
  if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw new Error(`Unsupported profile schemaVersion ${profile.schemaVersion}`);
  }
  const profileId = safeId(profile.profileId, 'profile id');
  if (expectedProfileId && profileId !== expectedProfileId) {
    throw new Error(`profileId mismatch: ${profile.profileId} != ${expectedProfileId}`);
  }
  if (!Array.isArray(profile.steps) || profile.steps.length === 0) {
    throw new Error('profile.steps must contain at least one step');
  }
  for (const step of profile.steps) {
    safeDomain(step.domain);
    laneFrom(step.lane);
    replayModeFrom(step.mode);
    if (step.dataset && step.dataset !== 'latest') safeId(step.dataset, 'dataset id');
  }
}

function requireCoupangDomain(args: Args, command: AdapterCommand): void {
  const domain = safeDomain(requiredValue(args, 'domain'));
  if (domain !== 'coupang') {
    throw new Error(`data:dev:${command} currently supports --domain coupang only.`);
  }
}

function appendOption(target: string[], args: Args, key: string): void {
  const item = value(args, key);
  if (item) target.push(`--${key}`, item);
}

function appendValues(target: string[], args: Args, key: string): void {
  for (const item of values(args, key)) target.push(`--${key}`, item);
}

function appendFlag(target: string[], args: Args, key: string): void {
  if (bool(args, key)) target.push(`--${key}`);
}

function configuredDriveRoot(args: Args): string | null {
  const root = value(args, 'drive-root') ?? process.env.KIDITEM_DEV_DATA_DRIVE_DIR;
  if (root) return path.resolve(expandHome(root));
  const candidates = findDriveRootCandidatesSync();
  return candidates.length === 1 ? candidates[0]! : null;
}

function cloudStorageRoot(): string {
  return path.resolve(
    expandHome(
      process.env.KIDITEM_DEV_DATA_CLOUD_STORAGE_ROOT ??
        path.join(os.homedir(), 'Library', 'CloudStorage'),
    ),
  );
}

function isIgnoredDriveCandidatePath(candidate: string): boolean {
  return candidate.split(path.sep).includes('.Encrypted');
}

function findDriveRootCandidatesSync(): string[] {
  const cloudStorage = cloudStorageRoot();
  if (!existsSync(cloudStorage)) return [];

  const candidates: string[] = [];
  function walk(dir: string, depth: number): void {
    if (depth < 0 || isIgnoredDriveCandidatePath(dir)) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      if (isIgnoredDriveCandidatePath(child)) continue;
      if (entry.name === 'KidItem Dev Data') {
        candidates.push(child);
        continue;
      }
      walk(child, depth - 1);
    }
  }

  walk(cloudStorage, 6);
  return candidates.sort();
}

async function findDriveRootCandidates(): Promise<string[]> {
  const cloudStorage = cloudStorageRoot();
  if (!existsSync(cloudStorage)) return [];

  const candidates: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth < 0 || isIgnoredDriveCandidatePath(dir)) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      if (isIgnoredDriveCandidatePath(child)) continue;
      if (entry.name === 'KidItem Dev Data') {
        candidates.push(child);
        continue;
      }
      await walk(child, depth - 1);
    }
  }

  await walk(cloudStorage, 6);
  return candidates.sort();
}

async function setupDriveRoot(args: Args): Promise<string> {
  const configured = configuredDriveRoot(args);
  if (configured) return configured;

  const candidates = await findDriveRootCandidates();
  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length > 1) {
    throw new Error(
      `Multiple KidItem Dev Data folders found. Pass --drive-root explicitly:\n${candidates.join('\n')}`,
    );
  }
  throw new Error(
    `KidItem Dev Data folder not found. Open ${CANONICAL_DRIVE_FOLDER_URL}, sync it with Google Drive Desktop, then pass --drive-root or set KIDITEM_DEV_DATA_DRIVE_DIR.`,
  );
}

async function ensureDirectory(dir: string): Promise<'created' | 'existing'> {
  const status = existsSync(dir) ? 'existing' : 'created';
  await mkdir(dir, { recursive: true });
  return status;
}

async function ensureProfile(root: string, profileId: string): Promise<{ profileId: string; path: string; status: 'created' | 'existing' }> {
  const template = DEFAULT_PROFILES[profileId];
  if (!template) throw new Error(`Unknown default profile: ${profileId}`);

  const profilePath = path.join(root, DRIVE_PROFILE_DIR, `${profileId}.json`);
  if (existsSync(profilePath)) {
    validateProfile(await readJson<DevDataProfile>(profilePath), profileId);
    return { profileId, path: profilePath, status: 'existing' };
  }

  await writeJson(profilePath, template);
  return { profileId, path: profilePath, status: 'created' };
}

async function ensureProjectReference(
  root: string,
  sourceRoot: string,
  fileName: string,
): Promise<{ fileName: string; path: string; status: 'existing' | 'copied' | 'missing-source' }> {
  const target = path.join(root, DRIVE_REFERENCE_DIR, fileName);
  if (existsSync(target)) return { fileName, path: target, status: 'existing' };

  const source = path.join(sourceRoot, fileName);
  if (!existsSync(source)) return { fileName, path: target, status: 'missing-source' };

  await cp(source, target);
  return { fileName, path: target, status: 'copied' };
}

function appendProjectReferenceDefaults(target: string[], args: Args): void {
  const root = configuredDriveRoot(args);
  if (!root) return;

  const referenceRoot = path.join(root, DRIVE_REFERENCE_DIR);
  for (const [option, fileName] of [
    ['kiditem-list', PROJECT_REFERENCE_FILES[0]],
    ['wing-inventory-matched', PROJECT_REFERENCE_FILES[1]],
  ] as const) {
    if (value(args, option)) continue;
    const file = path.join(referenceRoot, fileName);
    if (existsSync(file)) target.push(`--${option}`, file);
  }
}

async function runCoupangAdapter(
  args: Args,
  commandName: AdapterCommand,
  forwardedArgs: string[],
): Promise<unknown> {
  return runCoupangDevData([
    commandName,
    '--data-root',
    localDomainRoot(args, 'coupang'),
    ...forwardedArgs,
  ]);
}

async function runCoupangReplay(
  args: Args,
  datasetId: string,
  mode: ReplayMode,
): Promise<unknown> {
  if (mode === 'replace' || mode === 'pull-only') {
    return { skipped: true, reason: `Coupang replay mode ${mode} does not call the ingest adapter.` };
  }
  const replayArgs = ['--dataset', datasetId, '--mode', mode];
  appendFlag(replayArgs, args, 'dry-run');
  appendFlag(replayArgs, args, 'yes');
  for (const option of ['organization-id', 'dev-user-id', 'api-url']) {
    appendOption(replayArgs, args, option);
  }
  return runCoupangAdapter(args, 'replay', replayArgs);
}

async function replayStep(
  args: Args,
  step: DevDataProfileStep,
  pull: PullResult,
  mode: ReplayMode,
): Promise<unknown> {
  if (step.replay === false || mode === 'pull-only') {
    return { skipped: true, reason: 'Profile step is pull-only.' };
  }
  if (step.domain === 'coupang') return runCoupangReplay(args, pull.datasetId, mode);
  if (bool(args, 'dry-run')) {
    return { skipped: true, reason: `No replay adapter registered for ${step.domain}.` };
  }
  throw new Error(`No replay adapter registered for ${step.domain}. Set replay=false for pull-only steps.`);
}

async function commandStatus(args: Args): Promise<void> {
  const root = localDataRoot(args);
  await mkdir(root, { recursive: true });
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== LOCAL_PACKAGE_DIR)
    .sort();
  const driveRootValue = configuredDriveRoot(args);
  const profiles =
    driveRootValue && existsSync(path.join(driveRootValue, DRIVE_PROFILE_DIR))
      ? (await readdir(path.join(driveRootValue, DRIVE_PROFILE_DIR)))
        .filter((entry) => entry.endsWith('.json'))
        .sort()
      : [];
  const references =
    driveRootValue && existsSync(path.join(driveRootValue, DRIVE_REFERENCE_DIR))
      ? (await readdir(path.join(driveRootValue, DRIVE_REFERENCE_DIR)))
        .filter((entry) => PROJECT_REFERENCE_FILES.includes(entry as typeof PROJECT_REFERENCE_FILES[number]))
        .sort()
      : [];
  console.log(JSON.stringify({
    root,
    domains: entries,
    profiles,
    references,
    canonicalDriveFolderUrl: CANONICAL_DRIVE_FOLDER_URL,
    configuredDriveRoot: driveRootValue,
  }, null, 2));
}

async function commandSetup(args: Args): Promise<void> {
  const root = await setupDriveRoot(args);
  const sourceRoot = path.resolve(expandHome(value(args, 'reference-source-root') ?? process.cwd()));

  const directories = [
    {
      name: 'profiles',
      path: path.join(root, DRIVE_PROFILE_DIR),
      status: await ensureDirectory(path.join(root, DRIVE_PROFILE_DIR)),
    },
    {
      name: 'references',
      path: path.join(root, DRIVE_REFERENCE_DIR),
      status: await ensureDirectory(path.join(root, DRIVE_REFERENCE_DIR)),
    },
    {
      name: 'coupang/bundles',
      path: path.join(root, 'coupang', DRIVE_PACKAGE_DIR),
      status: await ensureDirectory(path.join(root, 'coupang', DRIVE_PACKAGE_DIR)),
    },
  ];

  const profiles = [
    await ensureProfile(root, 'workspace'),
    await ensureProfile(root, 'coupang'),
  ];

  const references = [];
  for (const fileName of PROJECT_REFERENCE_FILES) {
    references.push(await ensureProjectReference(root, sourceRoot, fileName));
  }

  const latestJsonPath = path.join(root, 'coupang', 'latest.json');
  const latestBundle = existsSync(latestJsonPath)
    ? await readJson<BundlePackageIndex>(latestJsonPath)
    : null;
  const blockers = references
    .filter((reference) => reference.status === 'missing-source')
    .map((reference) => `Missing project reference: ${reference.fileName}`);

  console.log(JSON.stringify({
    driveRoot: root,
    directories,
    profiles,
    references,
    coupangBundlesDir: path.join(root, 'coupang', DRIVE_PACKAGE_DIR),
    latestBundle: latestBundle
      ? {
        datasetId: latestBundle.datasetId,
        archiveFileName: latestBundle.archiveFileName,
      }
      : null,
    env: {
      KIDITEM_DEV_DATA_DRIVE_DIR: root,
    },
    ok: blockers.length === 0,
    blockers,
  }, null, 2));
}

async function commandPack(args: Args): Promise<void> {
  const domain = safeDomain(requiredValue(args, 'domain'));
  const datasetId = safeId(requiredValue(args, 'dataset'), 'dataset id');
  const index = await packBundle(args, domain, datasetId);
  console.log(JSON.stringify({
    packed: index.datasetId,
    domain: index.domain,
    lane: index.lane,
    archiveFileName: index.archiveFileName,
    archivePath: index.archivePath,
    shaFilePath: index.shaFilePath,
    sha256: index.sha256,
    bytes: index.bytes,
  }, null, 2));
}

async function commandPublish(args: Args): Promise<void> {
  const domain = safeDomain(requiredValue(args, 'domain'));
  const datasetId = safeId(requiredValue(args, 'dataset'), 'dataset id');
  const index = await packBundle(args, domain, datasetId);
  const laneDir = driveLaneDir(driveRoot(args), index.domain, index.lane);
  const drivePackageDir = path.join(laneDir, DRIVE_PACKAGE_DIR);
  await mkdir(drivePackageDir, { recursive: true });

  const archiveTarget = path.join(drivePackageDir, index.archiveFileName);
  const shaTarget = path.join(drivePackageDir, archiveShaFileName(index.archiveFileName));
  await cp(index.archivePath, archiveTarget);
  await cp(index.shaFilePath, shaTarget);

  const latest: BundlePackageIndex = {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    domain: index.domain,
    datasetId: index.datasetId,
    lane: index.lane,
    archiveFileName: index.archiveFileName,
    archivePath: path.posix.join(DRIVE_PACKAGE_DIR, index.archiveFileName),
    sha256: index.sha256,
    bytes: index.bytes,
    manifestSha256: index.manifestSha256,
    createdAt: index.createdAt,
    publishedAt: new Date().toISOString(),
    canonicalDriveFolderUrl: CANONICAL_DRIVE_FOLDER_URL,
  };

  await writeJson(path.join(laneDir, 'latest.json'), latest);
  await writeJson(path.join(drivePackageDir, `${index.archiveFileName}.json`), latest);
  await writeFile(path.join(laneDir, 'latest.txt'), `${index.datasetId}\n`, 'utf8');

  console.log(JSON.stringify({
    published: index.datasetId,
    domain: index.domain,
    lane: index.lane,
    archiveFileName: index.archiveFileName,
    archivePath: archiveTarget,
    shaFilePath: shaTarget,
    latestJsonPath: path.join(laneDir, 'latest.json'),
    sha256: index.sha256,
    bytes: index.bytes,
  }, null, 2));
}

async function commandPull(args: Args): Promise<void> {
  const domain = safeDomain(requiredValue(args, 'domain'));
  const lane = laneFrom(value(args, 'lane'));
  const pull = await pullBundle(args, domain, lane, value(args, 'dataset'));
  console.log(JSON.stringify({
    pulled: pull.datasetId,
    domain: pull.domain,
    lane: pull.lane,
    format: pull.format,
    from: pull.from,
    to: pull.to,
  }, null, 2));
}

async function commandSync(args: Args): Promise<void> {
  const profile = await loadProfile(args);
  const steps = [];
  for (const step of profile.steps) {
    const domain = safeDomain(step.domain);
    const lane = laneFrom(step.lane);
    const pull = await pullBundle(args, domain, lane, step.dataset);
    const mode = replayModeFrom(step.mode ?? pull.manifest.defaultImportMode) ?? 'upsert';
    const replay = await replayStep(args, step, pull, mode);
    steps.push({
      domain,
      lane,
      datasetId: pull.datasetId,
      mode,
      format: pull.format,
      from: pull.from,
      to: pull.to,
      replay,
    });
  }

  const report = {
    profileId: profile.profileId,
    dryRun: bool(args, 'dry-run'),
    steps,
    syncedAt: new Date().toISOString(),
  };
  await writeJson(path.join(localDataRoot(args), `sync-report-${profile.profileId}.json`), report);
  console.log(JSON.stringify(report, null, 2));
}

async function commandExport(args: Args): Promise<void> {
  requireCoupangDomain(args, 'export');
  const forwardedArgs: string[] = [];
  for (const option of [
    'dataset',
    'lane',
    'payload-dir',
    'type',
    'from',
    'to',
    'reference-dir',
    'references-dir',
    'kiditem-list',
    'wing-inventory-matched',
    'organization-id',
    'dev-user-id',
  ]) {
    appendOption(forwardedArgs, args, option);
  }
  appendValues(forwardedArgs, args, 'payload');
  appendValues(forwardedArgs, args, 'reference');
  appendValues(forwardedArgs, args, 'references');
  appendFlag(forwardedArgs, args, 'image-sync-from-db');
  appendFlag(forwardedArgs, args, 'include-image-sync-from-db');
  appendFlag(forwardedArgs, args, 'allow-empty-image-sync');
  appendProjectReferenceDefaults(forwardedArgs, args);
  console.log(JSON.stringify(await runCoupangAdapter(args, 'export', forwardedArgs), null, 2));
}

async function commandSanitize(args: Args): Promise<void> {
  requireCoupangDomain(args, 'sanitize');
  const forwardedArgs: string[] = [];
  for (const option of ['dataset', 'target-dataset']) appendOption(forwardedArgs, args, option);
  console.log(JSON.stringify(await runCoupangAdapter(args, 'sanitize', forwardedArgs), null, 2));
}

async function commandReplay(args: Args): Promise<void> {
  requireCoupangDomain(args, 'replay');
  const forwardedArgs: string[] = [];
  for (const option of [
    'dataset',
    'mode',
    'organization-id',
    'dev-user-id',
    'api-url',
    'image-sync-timeout-ms',
    'image-sync-poll-ms',
  ]) {
    appendOption(forwardedArgs, args, option);
  }
  appendFlag(forwardedArgs, args, 'dry-run');
  appendFlag(forwardedArgs, args, 'yes');
  appendFlag(forwardedArgs, args, 'no-wait');
  console.log(JSON.stringify(await runCoupangAdapter(args, 'replay', forwardedArgs), null, 2));
}

async function main(): Promise<void> {
  const args = parseArgs();
  switch (args.command) {
    case 'status':
      await commandStatus(args);
      break;
    case 'setup':
      await commandSetup(args);
      break;
    case 'pull':
      await commandPull(args);
      break;
    case 'sync':
      await commandSync(args);
      break;
    case 'pack':
      await commandPack(args);
      break;
    case 'publish':
      await commandPublish(args);
      break;
    case 'export':
      await commandExport(args);
      break;
    case 'sanitize':
      await commandSanitize(args);
      break;
    case 'replay':
      await commandReplay(args);
      break;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
