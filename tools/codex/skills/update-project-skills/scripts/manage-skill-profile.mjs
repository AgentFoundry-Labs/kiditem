#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST_RELATIVE_PATH = 'tools/codex/skill-profiles.json';
const LOCAL_OVERLAY_RELATIVE_PATH = '.agents/skill-profile.local.json';
const STATE_RELATIVE_PATH = '.agents/skill-profile-state.json';
const SKILLS_RELATIVE_PATH = '.agents/skills';
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class SkillProfileError extends Error {
  constructor(message, { exitCode = 1 } = {}) {
    super(message);
    this.name = 'SkillProfileError';
    this.exitCode = exitCode;
  }
}

function usageError(message) {
  return new SkillProfileError(message, { exitCode: 2 });
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SkillProfileError(`${label} must be an object.`);
  }
}

function assertName(value, label) {
  if (typeof value !== 'string' || !NAME_PATTERN.test(value)) {
    throw new SkillProfileError(
      `${label} must match ${NAME_PATTERN}; received ${JSON.stringify(value)}.`,
    );
  }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizeSlashes(value) {
  return value.split(path.sep).join('/');
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function expandHome(candidate) {
  if (candidate === '~') return os.homedir();
  if (candidate.startsWith('~/')) {
    return path.join(os.homedir(), candidate.slice(2));
  }
  return candidate;
}

function resolveConfiguredPath(repoRoot, candidate) {
  const expanded = expandHome(candidate);
  return path.resolve(path.isAbsolute(expanded) ? expanded : path.join(repoRoot, expanded));
}

async function pathType(targetPath) {
  try {
    const stat = await fs.lstat(targetPath);
    if (stat.isSymbolicLink()) return 'symlink';
    if (stat.isDirectory()) return 'directory';
    if (stat.isFile()) return 'file';
    return 'other';
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing';
    throw error;
  }
}

async function readJson(filePath, { optional = false } = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      throw new SkillProfileError(`Invalid JSON in ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function parseSelector(selector) {
  if (typeof selector !== 'string') {
    throw new SkillProfileError(`Skill selector must be a string; received ${typeof selector}.`);
  }
  const separatorIndex = selector.indexOf(':');
  if (separatorIndex <= 0 || selector.indexOf(':', separatorIndex + 1) !== -1) {
    throw new SkillProfileError(
      `Invalid skill selector ${JSON.stringify(selector)}; expected source:skill.`,
    );
  }
  const source = selector.slice(0, separatorIndex);
  const skill = selector.slice(separatorIndex + 1);
  assertName(source, `Source alias in ${selector}`);
  if (skill !== '*') assertName(skill, `Skill name in ${selector}`);
  return { source, skill, selector: `${source}:${skill}` };
}

function validateSourceDefinition(definition, label) {
  assertPlainObject(definition, label);
  if (definition.type !== 'directory') {
    throw new SkillProfileError(`${label}.type must be "directory".`);
  }
  if (definition.env !== undefined) assertName(definition.env, `${label}.env`);
  if (
    !Array.isArray(definition.pathCandidates) ||
    definition.pathCandidates.length === 0 ||
    definition.pathCandidates.some((candidate) => typeof candidate !== 'string' || !candidate)
  ) {
    throw new SkillProfileError(`${label}.pathCandidates must be a non-empty string array.`);
  }
}

function validateManifest(manifest, label = 'Skill profile manifest') {
  assertPlainObject(manifest, label);
  if (manifest.version !== 1) {
    throw new SkillProfileError(`${label}.version must be 1.`);
  }
  assertName(manifest.defaultProfile, `${label}.defaultProfile`);
  assertPlainObject(manifest.sources, `${label}.sources`);
  for (const [name, definition] of Object.entries(manifest.sources)) {
    assertName(name, `${label} source name`);
    validateSourceDefinition(definition, `${label}.sources.${name}`);
  }
  if (!Array.isArray(manifest.required)) {
    throw new SkillProfileError(`${label}.required must be an array.`);
  }
  manifest.required.forEach(parseSelector);
  assertPlainObject(manifest.profiles, `${label}.profiles`);
  for (const [name, profile] of Object.entries(manifest.profiles)) {
    assertName(name, `${label} profile name`);
    assertPlainObject(profile, `${label}.profiles.${name}`);
    if (!Array.isArray(profile.include)) {
      throw new SkillProfileError(`${label}.profiles.${name}.include must be an array.`);
    }
    profile.include.forEach(parseSelector);
  }
  if (!manifest.profiles[manifest.defaultProfile]) {
    throw new SkillProfileError(
      `${label}.defaultProfile references unknown profile ${manifest.defaultProfile}.`,
    );
  }
  return manifest;
}

function emptyOverlay(defaultProfile) {
  return {
    version: 1,
    profile: defaultProfile,
    add: [],
    remove: [],
    sources: {},
  };
}

function normalizeOverlay(overlay, manifest, label = 'Local skill profile overlay') {
  if (!overlay) return emptyOverlay(manifest.defaultProfile);
  assertPlainObject(overlay, label);
  if (overlay.version !== 1) throw new SkillProfileError(`${label}.version must be 1.`);
  assertName(overlay.profile, `${label}.profile`);
  if (!manifest.profiles[overlay.profile]) {
    throw new SkillProfileError(`${label}.profile references unknown profile ${overlay.profile}.`);
  }
  for (const key of ['add', 'remove']) {
    if (!Array.isArray(overlay[key])) {
      throw new SkillProfileError(`${label}.${key} must be an array.`);
    }
    overlay[key].forEach(parseSelector);
  }
  const sources = overlay.sources ?? {};
  assertPlainObject(sources, `${label}.sources`);
  const normalizedSources = {};
  for (const [name, definition] of Object.entries(sources)) {
    assertName(name, `${label} source name`);
    const normalized =
      typeof definition === 'string'
        ? { type: 'directory', pathCandidates: [definition] }
        : {
            type: definition.type ?? 'directory',
            ...(definition.env ? { env: definition.env } : {}),
            pathCandidates: definition.pathCandidates ?? [definition.path],
          };
    validateSourceDefinition(normalized, `${label}.sources.${name}`);
    normalizedSources[name] = normalized;
  }
  return {
    version: 1,
    profile: overlay.profile,
    add: uniqueSorted(overlay.add.map((selector) => parseSelector(selector).selector)),
    remove: uniqueSorted(overlay.remove.map((selector) => parseSelector(selector).selector)),
    sources: normalizedSources,
  };
}

export async function loadManifest(repoRoot) {
  const filePath = path.join(repoRoot, MANIFEST_RELATIVE_PATH);
  return validateManifest(await readJson(filePath), filePath);
}

export async function loadLocalOverlay(repoRoot, manifest) {
  const filePath = path.join(repoRoot, LOCAL_OVERLAY_RELATIVE_PATH);
  return normalizeOverlay(await readJson(filePath, { optional: true }), manifest, filePath);
}

async function canonicalDirectory(directoryPath) {
  try {
    return await fs.realpath(directoryPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function resolveSourceRoots({ repoRoot, manifest, overlay, aliases, env = process.env }) {
  const definitions = { ...manifest.sources, ...overlay.sources };
  const sourceRoots = new Map();
  for (const alias of uniqueSorted(aliases)) {
    const definition = definitions[alias];
    if (!definition) throw new SkillProfileError(`Unknown skill source alias: ${alias}.`);
    const candidates = [];
    if (definition.env && env[definition.env]) candidates.push(env[definition.env]);
    candidates.push(...definition.pathCandidates);
    const attempted = [];
    let resolved = null;
    for (const candidate of candidates) {
      const candidatePath = resolveConfiguredPath(repoRoot, candidate);
      attempted.push(candidatePath);
      const canonical = await canonicalDirectory(candidatePath);
      if (canonical) {
        resolved = { alias, configuredPath: candidatePath, canonicalPath: canonical };
        break;
      }
    }
    if (!resolved) {
      throw new SkillProfileError(
        `Unable to resolve skill source ${alias}; checked: ${attempted.join(', ')}.`,
      );
    }
    sourceRoots.set(alias, resolved);
  }
  return sourceRoots;
}

async function listSkillNames(sourceRoot) {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (!NAME_PATTERN.test(entry.name)) continue;
    if ((await pathType(path.join(sourceRoot, entry.name, 'SKILL.md'))) === 'file') {
      names.push(entry.name);
    }
  }
  return names.sort((left, right) => left.localeCompare(right));
}

async function expandSelectors(selectors, sourceRoots) {
  const expanded = [];
  for (const selector of selectors) {
    const parsed = parseSelector(selector);
    const sourceRoot = sourceRoots.get(parsed.source);
    if (!sourceRoot) {
      throw new SkillProfileError(`Source ${parsed.source} was not resolved for ${selector}.`);
    }
    const names =
      parsed.skill === '*'
        ? await listSkillNames(sourceRoot.canonicalPath)
        : [parsed.skill];
    for (const name of names) {
      const target = path.join(sourceRoot.canonicalPath, name);
      if (!isWithin(sourceRoot.canonicalPath, target)) {
        throw new SkillProfileError(`Skill ${parsed.source}:${name} escapes its source root.`);
      }
      const skillFile = path.join(target, 'SKILL.md');
      if ((await pathType(skillFile)) !== 'file') {
        throw new SkillProfileError(`Missing SKILL.md for ${parsed.source}:${name} at ${skillFile}.`);
      }
      const canonicalTarget = await fs.realpath(target);
      expanded.push({
        selector: `${parsed.source}:${name}`,
        source: parsed.source,
        name,
        target: canonicalTarget,
      });
    }
  }
  return expanded;
}

export async function resolveSelection({
  repoRoot,
  manifest: manifestInput,
  overlay: overlayInput,
  profileName,
  env = process.env,
}) {
  const manifest = validateManifest(manifestInput ?? (await loadManifest(repoRoot)));
  const overlay = normalizeOverlay(
    overlayInput ?? (await loadLocalOverlay(repoRoot, manifest)),
    manifest,
  );
  const selectedProfile = profileName ?? overlay.profile ?? manifest.defaultProfile;
  assertName(selectedProfile, 'Profile name');
  const profile = manifest.profiles[selectedProfile];
  if (!profile) throw new SkillProfileError(`Unknown skill profile: ${selectedProfile}.`);

  const requiredSelectors = manifest.required.map((selector) => parseSelector(selector).selector);
  const profileSelectors = profile.include.map((selector) => parseSelector(selector).selector);
  const additionSelectors = overlay.add.map((selector) => parseSelector(selector).selector);
  const removalSelectors = overlay.remove.map((selector) => parseSelector(selector).selector);
  const selectedSelectors = [...new Set([
    ...requiredSelectors,
    ...profileSelectors,
    ...additionSelectors,
  ])];
  const selectedAliases = uniqueSorted(
    [...selectedSelectors, ...removalSelectors].map(
      (selector) => parseSelector(selector).source,
    ),
  );
  const sourceRoots = await resolveSourceRoots({
    repoRoot,
    manifest,
    overlay,
    aliases: selectedAliases,
    env,
  });
  const allSourceDefinitions = { ...manifest.sources, ...overlay.sources };
  for (const alias of Object.keys(allSourceDefinitions)) {
    if (sourceRoots.has(alias)) continue;
    try {
      const optionalRoot = await resolveSourceRoots({
        repoRoot,
        manifest,
        overlay,
        aliases: [alias],
        env,
      });
      sourceRoots.set(alias, optionalRoot.get(alias));
    } catch {
      // An unselected optional source may be absent on a developer machine.
    }
  }
  const recognizedTargets = new Set();
  for (const source of sourceRoots.values()) {
    for (const name of await listSkillNames(source.canonicalPath)) {
      recognizedTargets.add(await fs.realpath(path.join(source.canonicalPath, name)));
    }
  }
  const requiredSkills = await expandSelectors(requiredSelectors, sourceRoots);
  const removableSkills = await expandSelectors(removalSelectors, sourceRoots);
  const selectionKey = (skill) => `${skill.source}\0${skill.name}`;
  const requiredKeys = new Set(requiredSkills.map(selectionKey));
  const invalidRemoval = removableSkills.find((skill) => requiredKeys.has(selectionKey(skill)));
  if (invalidRemoval) {
    throw new SkillProfileError(
      `Required skill ${invalidRemoval.selector} cannot be removed locally.`,
    );
  }
  const removalKeys = new Set(removableSkills.map(selectionKey));
  const optionalSkills = await expandSelectors(
    [...new Set([...profileSelectors, ...additionSelectors])],
    sourceRoots,
  );
  const effectiveSkills = [
    ...requiredSkills,
    ...optionalSkills.filter((skill) => !removalKeys.has(selectionKey(skill))),
  ];

  const desiredByName = new Map();
  for (const skill of effectiveSkills) {
    const existing = desiredByName.get(skill.name);
    if (existing && existing.target !== skill.target) {
      throw new SkillProfileError(
        `Duplicate exposed skill name ${skill.name}: ${existing.selector} -> ${existing.target}; ` +
          `${skill.selector} -> ${skill.target}.`,
      );
    }
    desiredByName.set(skill.name, skill);
  }

  return {
    manifest,
    overlay,
    profileName: selectedProfile,
    requiredSelectors,
    selectedSelectors,
    sourceRoots,
    recognizedTargets,
    desiredByName,
  };
}

async function readState(repoRoot) {
  const statePath = path.join(repoRoot, STATE_RELATIVE_PATH);
  const state = await readJson(statePath, { optional: true });
  if (!state) return { version: 1, managedLinks: {} };
  assertPlainObject(state, statePath);
  if (state.version !== 1) throw new SkillProfileError(`${statePath}.version must be 1.`);
  assertPlainObject(state.managedLinks ?? {}, `${statePath}.managedLinks`);
  return { ...state, managedLinks: state.managedLinks ?? {} };
}

async function inspectSymlink(linkPath) {
  const rawTarget = await fs.readlink(linkPath);
  const lexicalTarget = path.resolve(path.dirname(linkPath), rawTarget);
  const canonicalTarget = (await canonicalDirectory(lexicalTarget)) ?? lexicalTarget;
  return { rawTarget, lexicalTarget, canonicalTarget };
}

function targetMatchesSource(target, sourceRoots, recognizedTargets) {
  if (recognizedTargets.has(target)) return true;
  for (const source of sourceRoots.values()) {
    if (isWithin(source.canonicalPath, target) || isWithin(source.configuredPath, target)) return true;
  }
  return false;
}

export async function planReconciliation({ repoRoot, selection, state: stateInput }) {
  const state = stateInput ?? (await readState(repoRoot));
  const skillsDir = path.join(repoRoot, SKILLS_RELATIVE_PATH);
  const existingEntries =
    (await pathType(skillsDir)) === 'directory'
      ? await fs.readdir(skillsDir, { withFileTypes: true })
      : [];
  const existingByName = new Map(existingEntries.map((entry) => [entry.name, entry]));
  const removals = [];
  const creations = [];
  const kept = [];
  const preserved = [];
  const conflicts = [];

  for (const [name, entry] of existingByName) {
    const entryPath = path.join(skillsDir, name);
    if (!entry.isSymbolicLink()) {
      if (selection.desiredByName.has(name)) {
        conflicts.push(`${entryPath} exists and is not a symlink.`);
      } else {
        preserved.push(name);
      }
      continue;
    }
    const link = await inspectSymlink(entryPath);
    const managerOwned = Object.hasOwn(state.managedLinks, name);
    const recognized =
      managerOwned ||
      targetMatchesSource(
        link.canonicalTarget,
        selection.sourceRoots,
        selection.recognizedTargets,
      );
    const desired = selection.desiredByName.get(name);
    if (desired) {
      if (link.canonicalTarget === desired.target) {
        kept.push(name);
      } else if (recognized) {
        removals.push({ name, path: entryPath, previousTarget: link.rawTarget });
        creations.push({ name, path: entryPath, target: desired.target });
      } else {
        conflicts.push(
          `${entryPath} is an unmanaged symlink to ${link.rawTarget}; refusing to replace it.`,
        );
      }
    } else if (recognized) {
      removals.push({ name, path: entryPath, previousTarget: link.rawTarget });
    } else {
      preserved.push(name);
    }
  }

  for (const [name, desired] of selection.desiredByName) {
    if (!existingByName.has(name)) {
      creations.push({
        name,
        path: path.join(skillsDir, name),
        target: desired.target,
      });
    }
  }

  return {
    skillsDir,
    removals: removals.sort((a, b) => a.name.localeCompare(b.name)),
    creations: creations.sort((a, b) => a.name.localeCompare(b.name)),
    kept: uniqueSorted(kept),
    preserved: uniqueSorted(preserved),
    conflicts,
  };
}

function manifestHash(manifest) {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

function managedLinksFor(selection) {
  return Object.fromEntries(
    [...selection.desiredByName.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, skill]) => [name, skill.target]),
  );
}

export async function prepareProfile({
  repoRoot,
  profileName,
  env = process.env,
  manifest,
  overlay,
}) {
  const selection = await resolveSelection({
    repoRoot,
    profileName,
    env,
    manifest,
    overlay,
  });
  const state = await readState(repoRoot);
  const plan = await planReconciliation({ repoRoot, selection, state });
  if (plan.conflicts.length > 0) {
    throw new SkillProfileError(`Skill profile conflicts:\n- ${plan.conflicts.join('\n- ')}`);
  }
  return { repoRoot, selection, state, plan };
}

export async function applyPreparedProfile({ repoRoot, selection, plan }) {
  await fs.mkdir(plan.skillsDir, { recursive: true });
  const temporaryLinks = [];
  try {
    for (const creation of plan.creations) {
      const temporaryPath = path.join(
        plan.skillsDir,
        `.${creation.name}.tmp-${process.pid}-${Date.now()}-${temporaryLinks.length}`,
      );
      await fs.symlink(creation.target, temporaryPath, 'dir');
      temporaryLinks.push({ ...creation, temporaryPath });
    }
    for (const removal of plan.removals) await fs.unlink(removal.path);
    for (const creation of temporaryLinks) {
      await fs.rename(creation.temporaryPath, creation.path);
    }

    const statePath = path.join(repoRoot, STATE_RELATIVE_PATH);
    await writeJsonAtomic(statePath, {
      version: 1,
      profile: selection.profileName,
      selectedSelectors: selection.selectedSelectors,
      managedLinks: managedLinksFor(selection),
      manifestHash: manifestHash(selection.manifest),
      appliedAt: new Date().toISOString(),
    });
  } catch (error) {
    for (const creation of temporaryLinks) {
      if ((await pathType(creation.temporaryPath)) === 'symlink') {
        await fs.unlink(creation.temporaryPath).catch(() => {});
      }
    }
    throw new SkillProfileError(
      `Failed to apply skill profile: ${error.message ?? String(error)}`,
    );
  }

  const managedLinks = managedLinksFor(selection);
  return {
    ok: true,
    profileName: selection.profileName,
    exposedCount: Object.keys(managedLinks).length,
    created: uniqueSorted(plan.creations.map((item) => item.name)),
    removed: uniqueSorted(plan.removals.map((item) => item.name)),
    kept: plan.kept,
    preserved: plan.preserved,
    sourceRoots: Object.fromEntries(
      [...selection.sourceRoots].map(([name, source]) => [name, source.canonicalPath]),
    ),
  };
}

export async function applyProfile(options) {
  return applyPreparedProfile(await prepareProfile(options));
}

export async function verifyProfile({ repoRoot, profileName, env = process.env }) {
  const selection = await resolveSelection({ repoRoot, profileName, env });
  const state = await readState(repoRoot);
  const plan = await planReconciliation({ repoRoot, selection, state });
  const stateMatches =
    state.profile === selection.profileName &&
    state.manifestHash === manifestHash(selection.manifest) &&
    JSON.stringify(state.managedLinks ?? {}) ===
      JSON.stringify(managedLinksFor(selection));
  const drift = [
    ...plan.conflicts,
    ...plan.creations.map((item) => `missing or incorrect link: ${item.name}`),
    ...plan.removals.map((item) => `unexpected managed link: ${item.name}`),
    ...(!stateMatches ? ['profile state does not match the resolved selection'] : []),
  ];
  return {
    ok: drift.length === 0,
    profileName: selection.profileName,
    exposedCount: selection.desiredByName.size,
    drift,
    preserved: plan.preserved,
    sourceRoots: Object.fromEntries(
      [...selection.sourceRoots].map(([name, source]) => [name, source.canonicalPath]),
    ),
  };
}

function sortOverlay(overlay) {
  return {
    version: 1,
    profile: overlay.profile,
    add: uniqueSorted(overlay.add),
    remove: uniqueSorted(overlay.remove),
    sources: Object.fromEntries(
      Object.entries(overlay.sources).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

async function buildLocalOverlay(overlay, manifest, edit) {
  const updated = sortOverlay(await edit(structuredClone(overlay), manifest));
  normalizeOverlay(updated, manifest);
  return updated;
}

async function buildSharedManifest(manifest, manifestPath, edit) {
  const updated = await edit(structuredClone(manifest));
  validateManifest(updated, manifestPath);
  updated.sources = Object.fromEntries(
    Object.entries(updated.sources).sort(([left], [right]) => left.localeCompare(right)),
  );
  updated.required = uniqueSorted(updated.required);
  updated.profiles = Object.fromEntries(
    Object.entries(updated.profiles)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, profile]) => [name, { include: uniqueSorted(profile.include) }]),
  );
  return updated;
}

function parseOptions(argv) {
  const positional = [];
  const options = { shared: false, root: null, profile: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--shared') options.shared = true;
    else if (token === '--root') options.root = argv[++index] ?? null;
    else if (token === '--profile') options.profile = argv[++index] ?? null;
    else if (token.startsWith('--')) throw usageError(`Unknown option: ${token}.`);
    else positional.push(token);
  }
  if ((argv.includes('--root') && !options.root) || (argv.includes('--profile') && !options.profile)) {
    throw usageError('--root and --profile require a value.');
  }
  return { positional, options };
}

function detectRepoRoot(explicitRoot, env) {
  if (explicitRoot) return path.resolve(explicitRoot);
  if (env.KIDITEM_ROOT) return path.resolve(env.KIDITEM_ROOT);
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new SkillProfileError('Unable to detect repository root; pass --root PATH.');
  }
}

function helpText() {
  return `Usage: manage-skill-profile.mjs <command> [arguments] [options]\n\n` +
    `Commands:\n` +
    `  list\n` +
    `  show [profile]\n` +
    `  apply [profile]\n` +
    `  add <source:skill> [--shared] [--profile name]\n` +
    `  remove <source:skill> [--shared] [--profile name]\n` +
    `  reset <source:skill>\n` +
    `  source-add <name> <path> [--shared]\n` +
    `  verify [profile]\n\n` +
    `Options:\n` +
    `  --root PATH      Override the repository root.\n` +
    `  --profile NAME   Select the shared profile edited by add/remove.\n` +
    `  --shared         Edit tracked configuration instead of local override.\n`;
}

function defaultIo(overrides = {}) {
  return {
    env: process.env,
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
    ...overrides,
  };
}

function printJson(io, value) {
  io.stdout(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runCli(argv, ioOverrides = {}) {
  const io = defaultIo(ioOverrides);
  try {
    const { positional, options } = parseOptions(argv);
    const command = positional[0];
    if (!command || command === 'help' || command === '--help' || command === '-h') {
      io.stdout(helpText());
      return { exitCode: 0 };
    }
    const repoRoot = detectRepoRoot(options.root ?? io.repoRoot, io.env);
    const manifestPath = path.join(repoRoot, MANIFEST_RELATIVE_PATH);
    const overlayPath = path.join(repoRoot, LOCAL_OVERLAY_RELATIVE_PATH);
    const manifest = await loadManifest(repoRoot);
    const overlay = await loadLocalOverlay(repoRoot, manifest);

    if (command === 'list') {
      if (options.shared || options.profile) {
        throw usageError('list does not accept --shared or --profile.');
      }
      if (positional.length !== 1) throw usageError('list does not accept arguments.');
      const selection = await resolveSelection({ repoRoot, env: io.env });
      printJson(io, {
        activeProfile: overlay.profile,
        defaultProfile: manifest.defaultProfile,
        profileSelectorCounts: Object.fromEntries(
          Object.entries(manifest.profiles).map(([name, profile]) => [name, profile.include.length]),
        ),
        activeSkillCount: selection.desiredByName.size,
        required: manifest.required,
        localAdd: overlay.add,
        localRemove: overlay.remove,
        localSources: Object.keys(overlay.sources),
        sourceRoots: Object.fromEntries(
          [...selection.sourceRoots].map(([name, source]) => [name, source.canonicalPath]),
        ),
      });
      return { exitCode: 0 };
    }

    if (command === 'show') {
      if (options.shared || options.profile) {
        throw usageError('show does not accept --shared or --profile.');
      }
      if (positional.length > 2) throw usageError('show accepts at most one profile.');
      const selection = await resolveSelection({
        repoRoot,
        profileName: positional[1],
        env: io.env,
      });
      printJson(io, {
        profile: selection.profileName,
        selectors: selection.selectedSelectors,
        skills: [...selection.desiredByName.keys()].sort(),
        sourceRoots: Object.fromEntries(
          [...selection.sourceRoots].map(([name, source]) => [name, source.canonicalPath]),
        ),
      });
      return { exitCode: 0 };
    }

    if (command === 'apply') {
      if (options.shared || options.profile) {
        throw usageError('apply does not accept --shared or --profile.');
      }
      if (positional.length > 2) throw usageError('apply accepts at most one profile.');
      const requestedProfile = positional[1];
      let report;
      if (requestedProfile) {
        if (!manifest.profiles[requestedProfile]) {
          throw new SkillProfileError(`Unknown skill profile: ${requestedProfile}.`);
        }
        const nextOverlay = await buildLocalOverlay(overlay, manifest, async (draft) => ({
          ...draft,
          profile: requestedProfile,
        }));
        const prepared = await prepareProfile({
          repoRoot,
          manifest,
          overlay: nextOverlay,
          env: io.env,
        });
        await writeJsonAtomic(overlayPath, nextOverlay);
        report = await applyPreparedProfile(prepared);
      } else {
        report = await applyProfile({ repoRoot, env: io.env });
      }
      printJson(io, report);
      return { exitCode: 0, report };
    }

    if (command === 'add' || command === 'remove' || command === 'reset') {
      if (positional.length !== 2) throw usageError(`${command} requires one source:skill selector.`);
      const selector = parseSelector(positional[1]).selector;
      let prepared;
      if (options.shared) {
        if (command === 'reset') throw usageError('reset does not accept --shared.');
        const profileName = options.profile ?? manifest.defaultProfile;
        if (!manifest.profiles[profileName]) {
          throw new SkillProfileError(`Unknown shared profile: ${profileName}.`);
        }
        const nextManifest = await buildSharedManifest(manifest, manifestPath, async (draft) => {
          const include = new Set(draft.profiles[profileName].include);
          if (command === 'add') include.add(selector);
          else include.delete(selector);
          draft.profiles[profileName].include = [...include];
          return draft;
        });
        prepared = await prepareProfile({
          repoRoot,
          manifest: nextManifest,
          overlay,
          env: io.env,
        });
        await writeJsonAtomic(manifestPath, nextManifest);
      } else {
        if (options.profile) {
          throw usageError('--profile is only valid with --shared add/remove.');
        }
        const nextOverlay = await buildLocalOverlay(overlay, manifest, async (draft) => {
          const add = new Set(draft.add);
          const remove = new Set(draft.remove);
          const parsed = parseSelector(selector);
          const profileIncludes = manifest.profiles[draft.profile].include.some((item) => {
            const configured = parseSelector(item);
            return (
              configured.source === parsed.source &&
              (configured.skill === '*' || configured.skill === parsed.skill)
            );
          });
          if (command === 'add') {
            remove.delete(selector);
            if (profileIncludes) add.delete(selector);
            else add.add(selector);
          } else if (command === 'remove') {
            add.delete(selector);
            if (profileIncludes) remove.add(selector);
            else remove.delete(selector);
          } else {
            add.delete(selector);
            remove.delete(selector);
          }
          draft.add = [...add];
          draft.remove = [...remove];
          return draft;
        });
        prepared = await prepareProfile({
          repoRoot,
          manifest,
          overlay: nextOverlay,
          env: io.env,
        });
        await writeJsonAtomic(overlayPath, nextOverlay);
      }
      const report = await applyPreparedProfile(prepared);
      printJson(io, report);
      return { exitCode: 0, report };
    }

    if (command === 'source-add') {
      if (options.profile) throw usageError('source-add does not accept --profile.');
      if (positional.length !== 3) throw usageError('source-add requires a name and path.');
      const [, sourceName, sourcePathInput] = positional;
      assertName(sourceName, 'Source name');
      const sourcePath = path.resolve(repoRoot, sourcePathInput);
      if ((await pathType(sourcePath)) !== 'directory') {
        throw new SkillProfileError(`Skill source directory does not exist: ${sourcePath}.`);
      }
      let prepared;
      if (options.shared) {
        if (path.isAbsolute(sourcePathInput)) {
          throw new SkillProfileError('Shared source paths must be repository-relative.');
        }
        const nextManifest = await buildSharedManifest(manifest, manifestPath, async (draft) => {
          draft.sources[sourceName] = {
            type: 'directory',
            pathCandidates: [normalizeSlashes(sourcePathInput)],
          };
          return draft;
        });
        prepared = await prepareProfile({
          repoRoot,
          manifest: nextManifest,
          overlay,
          env: io.env,
        });
        await writeJsonAtomic(manifestPath, nextManifest);
      } else {
        const nextOverlay = await buildLocalOverlay(overlay, manifest, async (draft) => {
          draft.sources[sourceName] = {
            type: 'directory',
            pathCandidates: [sourcePath],
          };
          return draft;
        });
        prepared = await prepareProfile({
          repoRoot,
          manifest,
          overlay: nextOverlay,
          env: io.env,
        });
        await writeJsonAtomic(overlayPath, nextOverlay);
      }
      const report = await applyPreparedProfile(prepared);
      printJson(io, {
        source: sourceName,
        path: sourcePath,
        shared: options.shared,
        profile: report,
      });
      return { exitCode: 0, report };
    }

    if (command === 'verify') {
      if (options.shared || options.profile) {
        throw usageError('verify does not accept --shared or --profile.');
      }
      if (positional.length > 2) throw usageError('verify accepts at most one profile.');
      const report = await verifyProfile({
        repoRoot,
        profileName: positional[1],
        env: io.env,
      });
      printJson(io, report);
      return { exitCode: report.ok ? 0 : 1, report };
    }

    throw usageError(`Unknown command: ${command}.`);
  } catch (error) {
    const normalized =
      error instanceof SkillProfileError
        ? error
        : new SkillProfileError(error?.stack || error?.message || String(error));
    io.stderr(`${normalized.message}\n`);
    return { exitCode: normalized.exitCode ?? 1, error: normalized };
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await runCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
}
