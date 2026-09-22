#!/usr/bin/env node
// Guards ADR-0013: a reference to another owner's row is a plain id column with
// an index and no Prisma `@relation`. ADR-0021 makes Channels-related scope and
// attempt references explicit migration exceptions too; same-owner constraints
// remain. Other owners retain ADR-0013's platform exceptions. The remaining
// cross-owner relations live on the allowlist in scripts/cross-owner-fk.json and
// leave it only by deletion.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODELS_DIR = 'prisma/models';
const CONFIG_FILE = 'scripts/cross-owner-fk.json';

const MODEL_DECLARATION = /^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/;
const RELATION_FIELD =
  /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\?|\[\])?\s+@relation\(([^)]*)\)/;

function parseArguments(argv) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') {
      const value = argv[index + 1];
      if (!value) throw new Error('--root requires a path');
      root = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument ${argument}`);
  }

  return { root };
}

/** Owner of every model a schema file declares, before config overrides. */
export function parseModelOwners(fileName, source) {
  const owner = path.basename(fileName, '.prisma');
  const owners = new Map();

  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) continue;
    const declaration = MODEL_DECLARATION.exec(trimmed);
    if (declaration) owners.set(declaration[1], owner);
  }

  return owners;
}

/**
 * Every `@relation(fields: …)` a schema file declares, in file order, plus the
 * `@relation(` lines this reader could not take apart. An unreadable one is
 * never silently dropped: it would leave the guard counting fewer relations
 * than the schema has and still printing PASS.
 */
export function parseRelationEdges(fileName, source) {
  const defaultOwner = path.basename(fileName, '.prisma');
  const file = `${MODELS_DIR}/${path.basename(fileName)}`;
  const lines = source.split('\n');
  const edges = [];
  const unparsed = [];
  let model = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) continue;

    const declaration = MODEL_DECLARATION.exec(trimmed);
    if (declaration) {
      model = declaration[1];
      continue;
    }
    if (trimmed === '}') {
      model = null;
      continue;
    }
    if (!model) continue;

    // Wrapped over several lines, preceded by another attribute, or carrying a
    // `)` inside a quoted argument: read it as nothing and the relation leaves
    // the count without leaving the schema.
    const relation = RELATION_FIELD.exec(line);
    if (!relation || !hasBalancedParentheses(line)) {
      if (line.includes('@relation(')) {
        unparsed.push({ file, line: index + 1, text: line });
      }
      continue;
    }
    const [, field, target, attributeArguments] = relation;
    if (!/\bfields:\s*\[/.test(attributeArguments)) continue;

    edges.push({
      file,
      defaultOwner,
      model,
      field,
      target,
      line: index + 1,
    });
  }

  return { edges, unparsed };
}

function hasBalancedParentheses(line) {
  let depth = 0;
  for (const character of line) {
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function relationKey(sourceOwner, sourceModel, targetOwner, targetModel) {
  return `${sourceOwner}.${sourceModel} -> ${targetOwner}.${targetModel}`;
}

/**
 * Sorts every relation into scope, kept, intra-owner, or cross-owner, then
 * reconciles the cross-owner ones against the allowlist in both directions.
 */
export function classifyRelations({ edges, config, modelOwners }) {
  const declared = modelOwners ?? new Map();
  for (const edge of edges) {
    if (!declared.has(edge.model)) declared.set(edge.model, edge.defaultOwner);
  }

  const overrides = config.owners ?? {};
  const scopeTargets = new Set(config.scopeTargets ?? []);
  const keptTargets = new Set(config.keptTargets ?? []);
  // One entry covers one relation, so a second `@relation` between the same two
  // models is a new cross-owner edge rather than a free ride on the first.
  const remaining = new Map();
  for (const key of config.allowlist ?? []) {
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const ownerOf = (model) => overrides[model] ?? declared.get(model) ?? null;

  const classifications = [];
  const summary = { total: 0, scope: 0, kept: 0, intra: 0, cross: 0 };
  const unlisted = [];
  const unknownTargets = [];

  for (const edge of edges) {
    summary.total += 1;
    const sourceOwner = ownerOf(edge.model);
    const targetOwner = ownerOf(edge.target);
    if (targetOwner === null) {
      unknownTargets.push(edge);
      classifications.push({ ...edge, kind: 'unknown' });
      continue;
    }
    // Scope is a business-owner boundary, not the Prisma filename. Only the
    // migrated Channels boundary loses the legacy platform-target exemptions.
    const channelsBoundary = sourceOwner === 'channels' || targetOwner === 'channels';
    if (!channelsBoundary && scopeTargets.has(edge.target)) {
      summary.scope += 1;
      classifications.push({ ...edge, kind: 'scope' });
      continue;
    }
    if (!channelsBoundary && keptTargets.has(edge.target)) {
      summary.kept += 1;
      classifications.push({ ...edge, kind: 'kept' });
      continue;
    }

    if (sourceOwner === targetOwner) {
      summary.intra += 1;
      classifications.push({ ...edge, kind: 'intra', sourceOwner, targetOwner });
      continue;
    }

    const key = relationKey(sourceOwner, edge.model, targetOwner, edge.target);
    const crossEdge = { ...edge, kind: 'cross', sourceOwner, targetOwner, key };
    summary.cross += 1;
    classifications.push(crossEdge);
    const covered = remaining.get(key) ?? 0;
    if (covered > 0) remaining.set(key, covered - 1);
    else unlisted.push({ ...crossEdge, listed: remaining.has(key) });
  }

  const stale = [...remaining]
    .filter(([, count]) => count > 0)
    .map(([key]) => key)
    .sort();

  return { classifications, summary, unlisted, stale, unknownTargets };
}

/**
 * Names in the data file that `prisma/models/*.prisma` no longer declares. A
 * renamed or deleted model would otherwise leave a silent override behind:
 * the entry stops matching anything and the relation it used to classify is
 * quietly reclassified.
 */
function findUnknownConfigNames(config, declaredModels) {
  const unknown = [];
  const collect = (field, names) => {
    for (const name of names) {
      if (!declaredModels.has(name)) unknown.push({ field, name });
    }
  };
  collect('owners', Object.keys(config.owners ?? {}));
  collect('scopeTargets', config.scopeTargets ?? []);
  collect('keptTargets', config.keptTargets ?? []);
  return unknown;
}

export function loadConfig(root) {
  const config = JSON.parse(
    readFileSync(path.join(root, CONFIG_FILE), 'utf8'),
  );
  if (config.version !== 1) {
    throw new Error(`${CONFIG_FILE} version must be 1`);
  }
  if (config.owners === null || typeof config.owners !== 'object') {
    throw new Error(`${CONFIG_FILE} needs an object "owners"`);
  }
  for (const key of ['scopeTargets', 'keptTargets', 'allowlist']) {
    if (!Array.isArray(config[key])) {
      throw new Error(`${CONFIG_FILE} needs an array "${key}"`);
    }
  }
  return config;
}

export function inspectCrossOwnerRelations({ root, config }) {
  const modelsDir = path.join(root, MODELS_DIR);
  const files = readdirSync(modelsDir)
    .filter((name) => name.endsWith('.prisma'))
    .sort();

  const modelOwners = new Map();
  const edges = [];
  const unparsed = [];
  for (const name of files) {
    const source = readFileSync(path.join(modelsDir, name), 'utf8');
    for (const [model, owner] of parseModelOwners(name, source)) {
      modelOwners.set(model, owner);
    }
    const parsed = parseRelationEdges(name, source);
    edges.push(...parsed.edges);
    unparsed.push(...parsed.unparsed);
  }

  const unknownNames = findUnknownConfigNames(
    config,
    new Set(modelOwners.keys()),
  );

  return {
    ...classifyRelations({ edges, config, modelOwners }),
    unparsed,
    unknownNames,
  };
}

function main() {
  let options;
  let config;
  try {
    options = parseArguments(process.argv.slice(2));
    config = loadConfig(options.root);
  } catch (error) {
    console.error(`check:cross-owner-fk FAIL: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = inspectCrossOwnerRelations({ root: options.root, config });
  const hasFailure =
    result.unlisted.length > 0 ||
    result.stale.length > 0 ||
    result.unknownTargets.length > 0 ||
    result.unparsed.length > 0 ||
    result.unknownNames.length > 0;

  if (hasFailure) {
    console.error('check:cross-owner-fk FAIL');
    for (const edge of result.unlisted) {
      const already = edge.listed
        ? ` ("${edge.key}" already covers another relation)`
        : '';
      console.error(
        `${edge.file}:${edge.line} ${edge.model}.${edge.field} -> ${edge.targetOwner}.${edge.target}: cross-owner @relation is not allowlisted${already}; drop @relation, keep the id column and its index (ADR-0013)`,
      );
    }
    for (const key of result.stale) {
      console.error(
        `${CONFIG_FILE}: stale allowlist entry "${key}"; the relation is gone, remove the entry`,
      );
    }
    for (const { field, name } of result.unknownNames) {
      console.error(
        `${CONFIG_FILE}: unknown model in ${field}: ${name} (prisma/models/*.prisma does not declare it)`,
      );
    }
    for (const entry of result.unparsed) {
      console.error(
        `${entry.file}:${entry.line} could not read this @relation; write it on one line`,
      );
    }
    for (const edge of result.unknownTargets) {
      console.error(
        `${edge.file}:${edge.line} ${edge.model}.${edge.field}: no owner for model ${edge.target}; add it to "owners" in ${CONFIG_FILE}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  const { total, scope, kept, intra, cross } = result.summary;
  console.log(
    `check:cross-owner-fk PASS (${total} relations: ${scope} scope, ${kept} SourceImportRun, ${intra} intra-owner, ${cross} cross-owner transitional allowlisted)`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}
