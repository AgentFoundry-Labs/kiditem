import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const CASE_KEYS = new Set([
  'id',
  'suite',
  'fixtureId',
  'messages',
  'target',
  'trials',
  'userBehavior',
  'harness',
  'grading',
]);
const FIXTURE_KEYS = new Set(['id', 'resetProfile', 'disposable', 'variables']);
const MESSAGE_KEYS = new Set(['id', 'promptTemplate']);
const TARGET_KEYS = new Set(['provider', 'model', 'effort']);
const USER_BEHAVIOR_KEYS = new Set(['approval']);
const HARNESS_KEYS = new Set(['restartAfterMessageIds']);
const GRADING_KEYS = new Set([
  'minimumNormalCompletions',
  'hardInvariants',
  'capabilityAlternatives',
  'expectedDomainDelta',
]);
const FORBIDDEN_AUTHORING_FIELDS = new Set([
  'rawOutput',
  'expectedOutput',
  'expectedResponse',
  'expectedToolSequence',
  'requestKey',
  'transcript',
  'privateReasoning',
]);
const HARD_INVARIANTS = new Set([
  'organization_isolation',
  'approval_before_write',
  'no_canonical_write',
  'no_fabricated_canonical_input',
  'no_duplicate_write',
  'same_conversation',
  'no_automatic_reasoning',
  'no_business_capability',
]);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function listJsonFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  });
}

function assertRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertAllowedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown field: ${key}`);
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${label} must be an array of strings`);
  }
}

function findForbiddenAuthoringField(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findForbiddenAuthoringField(entry);
      if (found) return found;
    }
    return undefined;
  }
  if (value === null || typeof value !== 'object') return undefined;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_AUTHORING_FIELDS.has(key)) return key;
    const found = findForbiddenAuthoringField(entry);
    if (found) return found;
  }
  return undefined;
}

function promptVariables(messages) {
  return new Set(
    messages.flatMap((message) =>
      [...message.promptTemplate.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)].map(
        (match) => match[1],
      ),
    ),
  );
}

function parseFixtures(fixturesPath) {
  const raw = readJson(fixturesPath);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('fixtures must be a non-empty array');
  }

  return new Map(
    raw.map((fixture, index) => {
      assertRecord(fixture, `fixtures[${index}]`);
      assertAllowedKeys(fixture, FIXTURE_KEYS, `fixtures[${index}]`);
      assertNonEmptyString(fixture.id, `fixtures[${index}].id`);
      assertNonEmptyString(fixture.resetProfile, `fixtures[${index}].resetProfile`);
      if (fixture.disposable !== true) {
        throw new Error(`fixtures[${index}].disposable must be true`);
      }
      assertStringArray(fixture.variables, `fixtures[${index}].variables`);
      return [fixture.id, fixture];
    }),
  );
}

function parseCase(raw, sourcePath, fixtures) {
  assertRecord(raw, sourcePath);
  const forbiddenField = findForbiddenAuthoringField(raw);
  if (forbiddenField) {
    throw new Error(`forbidden eval authoring field: ${forbiddenField}`);
  }
  assertAllowedKeys(raw, CASE_KEYS, sourcePath);
  assertNonEmptyString(raw.id, `${sourcePath}.id`);
  if (raw.suite !== 'capability' && raw.suite !== 'regression') {
    throw new Error(`${sourcePath}.suite must be capability or regression`);
  }
  assertNonEmptyString(raw.fixtureId, `${sourcePath}.fixtureId`);
  if (!fixtures.has(raw.fixtureId)) {
    throw new Error(`${sourcePath}.fixtureId references an unknown fixture`);
  }
  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    throw new Error(`${sourcePath}.messages must be a non-empty array`);
  }
  raw.messages.forEach((message, index) => {
    assertRecord(message, `${sourcePath}.messages[${index}]`);
    assertAllowedKeys(message, MESSAGE_KEYS, `${sourcePath}.messages[${index}]`);
    assertNonEmptyString(message.id, `${sourcePath}.messages[${index}].id`);
    assertNonEmptyString(
      message.promptTemplate,
      `${sourcePath}.messages[${index}].promptTemplate`,
    );
  });
  assertRecord(raw.target, `${sourcePath}.target`);
  assertAllowedKeys(raw.target, TARGET_KEYS, `${sourcePath}.target`);
  assertNonEmptyString(raw.target.provider, `${sourcePath}.target.provider`);
  assertNonEmptyString(raw.target.model, `${sourcePath}.target.model`);
  assertNonEmptyString(raw.target.effort, `${sourcePath}.target.effort`);
  if (!Number.isInteger(raw.trials) || raw.trials < 1) {
    throw new Error(`${sourcePath}.trials must be a positive integer`);
  }
  assertRecord(raw.userBehavior, `${sourcePath}.userBehavior`);
  assertAllowedKeys(raw.userBehavior, USER_BEHAVIOR_KEYS, `${sourcePath}.userBehavior`);
  if (!['none', 'approve_when_requested', 'deny_when_requested'].includes(raw.userBehavior.approval)) {
    throw new Error(`${sourcePath}.userBehavior.approval is unsupported`);
  }
  assertRecord(raw.harness, `${sourcePath}.harness`);
  assertAllowedKeys(raw.harness, HARNESS_KEYS, `${sourcePath}.harness`);
  assertStringArray(
    raw.harness.restartAfterMessageIds,
    `${sourcePath}.harness.restartAfterMessageIds`,
  );
  assertRecord(raw.grading, `${sourcePath}.grading`);
  assertAllowedKeys(raw.grading, GRADING_KEYS, `${sourcePath}.grading`);
  if (
    !Number.isInteger(raw.grading.minimumNormalCompletions) ||
    raw.grading.minimumNormalCompletions < 1 ||
    raw.grading.minimumNormalCompletions > raw.trials
  ) {
    throw new Error(`${sourcePath}.grading.minimumNormalCompletions is invalid`);
  }
  assertStringArray(raw.grading.hardInvariants, `${sourcePath}.grading.hardInvariants`);
  for (const invariant of raw.grading.hardInvariants) {
    if (!HARD_INVARIANTS.has(invariant)) {
      throw new Error(`${sourcePath}.grading contains unsupported invariant: ${invariant}`);
    }
  }
  if (
    !Array.isArray(raw.grading.capabilityAlternatives) ||
    raw.grading.capabilityAlternatives.length === 0
  ) {
    throw new Error(`${sourcePath}.grading.capabilityAlternatives must be non-empty`);
  }
  raw.grading.capabilityAlternatives.forEach((alternative, index) => {
    assertStringArray(alternative, `${sourcePath}.grading.capabilityAlternatives[${index}]`);
    if (alternative.some((key) => !/^[a-z][a-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*$/.test(key))) {
      throw new Error(`${sourcePath}.grading.capabilityAlternatives[${index}] has an invalid key`);
    }
  });
  const expectsNoBusinessCapability = raw.grading.hardInvariants.includes(
    'no_business_capability',
  );
  const hasEmptyCapabilityAlternative = raw.grading.capabilityAlternatives.some(
    (alternative) => alternative.length === 0,
  );
  if (expectsNoBusinessCapability !== hasEmptyCapabilityAlternative) {
    throw new Error(
      `${sourcePath}.grading must pair no_business_capability with an empty capability alternative`,
    );
  }
  assertRecord(raw.grading.expectedDomainDelta, `${sourcePath}.grading.expectedDomainDelta`);
  for (const [key, delta] of Object.entries(raw.grading.expectedDomainDelta)) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(key) || !Number.isInteger(delta)) {
      throw new Error(`${sourcePath}.grading.expectedDomainDelta is invalid`);
    }
  }

  const fixture = fixtures.get(raw.fixtureId);
  const declaredVariables = new Set(fixture.variables);
  for (const variable of promptVariables(raw.messages)) {
    if (!declaredVariables.has(variable)) {
      throw new Error(`${sourcePath} uses undeclared fixture variable: ${variable}`);
    }
  }

  return Object.freeze({ ...raw, sourcePath });
}

export function loadEvalCases({ casesDir, fixturesPath }) {
  const fixtures = parseFixtures(fixturesPath);
  const cases = listJsonFiles(casesDir)
    .sort()
    .map((filePath) => parseCase(readJson(filePath), filePath, fixtures));
  const ids = new Set();
  for (const evalCase of cases) {
    if (ids.has(evalCase.id)) throw new Error(`duplicate eval case id: ${evalCase.id}`);
    ids.add(evalCase.id);
  }
  return Object.freeze(cases);
}
