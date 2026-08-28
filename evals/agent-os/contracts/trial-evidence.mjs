const RUN_KEYS = new Set(['caseId', 'model', 'effort', 'trials']);
const TRIAL_KEYS = new Set([
  'trial',
  'normalCompletion',
  'correlation',
  'capabilityKeys',
  'canonicalInputHashes',
  'approvalRefs',
  'operationRefs',
  'resourceRefs',
  'invariants',
  'domainDelta',
]);
const CORRELATION_KEYS = new Set(['conversationRef', 'turnRefs', 'executionRefs']);
const OPAQUE_REFERENCE_GRAMMARS = Object.freeze({
  conversation: /^conversation-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  turn: /^turn-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  execution: /^execution-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  approval: /^approval-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  operation: /^operation-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  resource: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/,
});
const FORBIDDEN_EVIDENCE_VALUE_PATTERN =
  /token|bearer|cookie|credential|secret|password|authorization|api[_-]?key|provider(?:[_ -]?(?:payload|request|response))|raw[_ -]?provider|tool[_ -]?calls?|response[_ -]?body/i;
const TRANSCRIPT_LIKE_VALUE_PATTERN =
  /(?:^|[\s[(])(?:system|developer|user|assistant|tool|human)\s*:/i;
const SENSITIVE_URL_QUERY_PARAMETER_PATTERN =
  /token|secret|credential|password|api.?key|authorization|signature|(?:^|[_-])(?:key|sig|auth)(?:$|[_-])/i;
const CREDENTIAL_SHAPE_PATTERNS = Object.freeze([
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  /(?:AKIA|ASIA)[A-Z0-9]{16}/,
]);

function assertRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertAllowedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown field: ${key}`);
  }
}

function isJsonPayload(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === 'object';
  } catch {
    return false;
  }
}

function isCredentialBearingUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(url.protocol)) return false;
  if (url.username !== '' || url.password !== '') return true;
  return [...url.searchParams.keys()].some((key) =>
    SENSITIVE_URL_QUERY_PARAMETER_PATTERN.test(key),
  );
}

function isCredentialShapedValue(value) {
  return CREDENTIAL_SHAPE_PATTERNS.some((pattern) => pattern.test(value));
}

function isForbiddenEvidenceValue(value) {
  return (
    FORBIDDEN_EVIDENCE_VALUE_PATTERN.test(value) ||
    TRANSCRIPT_LIKE_VALUE_PATTERN.test(value) ||
    isCredentialBearingUrl(value) ||
    isJsonPayload(value) ||
    isCredentialShapedValue(value)
  );
}

function assertNonEmptyString(value, label) {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value.length > 160 ||
    /[\r\n]/.test(value)
  ) {
    throw new Error(`${label} must be a bounded single-line string`);
  }
  if (isForbiddenEvidenceValue(value)) {
    throw new Error(`forbidden evidence value: ${label}`);
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  value.forEach((entry, index) => assertNonEmptyString(entry, `${label}[${index}]`));
}

function assertOpaqueReference(value, label, type) {
  assertNonEmptyString(value, label);
  if (!OPAQUE_REFERENCE_GRAMMARS[type].test(value)) {
    throw new Error(`${label} must be an opaque ${type} reference`);
  }
}

function assertOpaqueReferenceArray(value, label, type) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  value.forEach((entry, index) =>
    assertOpaqueReference(entry, `${label}[${index}]`, type),
  );
}

function isForbiddenEvidenceField(key) {
  const normalized = key.toLowerCase();
  if (normalized === 'no_automatic_reasoning') return false;
  if (
    ['prompt', 'messages', 'transcript', 'reasoning', 'canonicalinput'].includes(normalized)
  ) {
    return true;
  }
  return [
    'token',
    'bearer',
    'cookie',
    'credential',
    'secret',
    'password',
    'transcript',
    'reasoning',
    'providerpayload',
    'rawprovider',
  ].some((segment) => normalized.includes(segment));
}

function findForbiddenEvidenceField(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findForbiddenEvidenceField(entry);
      if (found) return found;
    }
    return undefined;
  }
  if (value === null || typeof value !== 'object') return undefined;
  for (const [key, entry] of Object.entries(value)) {
    if (isForbiddenEvidenceField(key)) return key;
    const found = findForbiddenEvidenceField(entry);
    if (found) return found;
  }
  return undefined;
}

function parseCorrelation(value, label) {
  assertRecord(value, label);
  assertAllowedKeys(value, CORRELATION_KEYS, label);
  assertOpaqueReference(value.conversationRef, `${label}.conversationRef`, 'conversation');
  assertOpaqueReferenceArray(value.turnRefs, `${label}.turnRefs`, 'turn');
  assertOpaqueReferenceArray(value.executionRefs, `${label}.executionRefs`, 'execution');
  if (value.turnRefs.length === 0 || value.executionRefs.length === 0) {
    throw new Error(`${label} must contain turn and execution references`);
  }
}

function parseTrial(value, index) {
  const label = `trials[${index}]`;
  assertRecord(value, label);
  assertAllowedKeys(value, TRIAL_KEYS, label);
  if (!Number.isInteger(value.trial) || value.trial < 1) {
    throw new Error(`${label}.trial must be a positive integer`);
  }
  if (typeof value.normalCompletion !== 'boolean') {
    throw new Error(`${label}.normalCompletion must be boolean`);
  }
  parseCorrelation(value.correlation, `${label}.correlation`);
  assertStringArray(value.capabilityKeys, `${label}.capabilityKeys`);
  if (
    value.capabilityKeys.some(
      (key) => !/^[a-z][a-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*$/.test(key),
    )
  ) {
    throw new Error(`${label}.capabilityKeys contains an invalid key`);
  }
  assertStringArray(value.canonicalInputHashes, `${label}.canonicalInputHashes`);
  if (
    value.canonicalInputHashes.some((hash) => !/^sha256:[a-f0-9]{64}$/.test(hash))
  ) {
    throw new Error(`${label}.canonicalInputHashes contains an invalid hash`);
  }
  assertOpaqueReferenceArray(value.approvalRefs, `${label}.approvalRefs`, 'approval');
  assertOpaqueReferenceArray(value.operationRefs, `${label}.operationRefs`, 'operation');
  assertOpaqueReferenceArray(value.resourceRefs, `${label}.resourceRefs`, 'resource');
  assertRecord(value.invariants, `${label}.invariants`);
  for (const [key, passed] of Object.entries(value.invariants)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key) || typeof passed !== 'boolean') {
      throw new Error(`${label}.invariants is invalid`);
    }
  }
  assertRecord(value.domainDelta, `${label}.domainDelta`);
  for (const [key, delta] of Object.entries(value.domainDelta)) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(key) || !Number.isInteger(delta)) {
      throw new Error(`${label}.domainDelta is invalid`);
    }
  }
  return Object.freeze(value);
}

export function parseEvalRunEvidence(raw) {
  assertRecord(raw, 'evidence');
  const forbiddenField = findForbiddenEvidenceField(raw);
  if (forbiddenField) throw new Error(`forbidden evidence field: ${forbiddenField}`);
  assertAllowedKeys(raw, RUN_KEYS, 'evidence');
  assertNonEmptyString(raw.caseId, 'evidence.caseId');
  assertNonEmptyString(raw.model, 'evidence.model');
  assertNonEmptyString(raw.effort, 'evidence.effort');
  if (!Array.isArray(raw.trials) || raw.trials.length === 0) {
    throw new Error('evidence.trials must be a non-empty array');
  }
  const trials = raw.trials.map(parseTrial);
  const trialNumbers = new Set(trials.map((trial) => trial.trial));
  if (trialNumbers.size !== trials.length) throw new Error('evidence trial numbers must be unique');
  return Object.freeze({ ...raw, trials: Object.freeze(trials) });
}
