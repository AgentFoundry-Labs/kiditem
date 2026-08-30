const RUN_KEYS = new Set(['caseId', 'model', 'effort', 'trials']);
const TRIAL_KEYS = new Set([
  'trial',
  'normalCompletion',
  'agentKey',
  'correlation',
  'capabilityKeys',
  'canonicalInputHashes',
  'approvalRefs',
  'operationRefs',
  'resourceRefs',
  'invariants',
  'milestones',
  'stateChanges',
  'delegations',
  'responseAssessment',
]);
const CORRELATION_KEYS = new Set(['conversationRef', 'turnRefs', 'executionRefs']);
const DELEGATION_EDGE_KEYS = new Set([
  'sourceAgentKey',
  'targetAgentKey',
  'capabilityKey',
]);
const RESPONSE_ASSESSMENT_KEYS = new Set(['evaluatorVersion', 'criteria']);
const AGENT_KEYS = new Set([
  'sourcing',
  'merchandising',
  'supply',
  'channel_operations',
  'advertising',
]);
const CAPABILITY_KEY_PATTERN =
  /^[a-z][a-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*$/;
const POLICY_KEY_PATTERN = /^[a-z][A-Za-z0-9_]*$/;
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

function assertAgentKey(value, label) {
  if (value === null) return;
  if (typeof value !== 'string' || !AGENT_KEYS.has(value)) {
    throw new Error(`${label} is unsupported`);
  }
}

function parseBooleanRecord(value, label) {
  assertRecord(value, label);
  for (const [key, observed] of Object.entries(value)) {
    if (!POLICY_KEY_PATTERN.test(key) || typeof observed !== 'boolean') {
      throw new Error(`${label} is invalid`);
    }
  }
  return Object.freeze({ ...value });
}

function parseStateChanges(value, label) {
  assertRecord(value, label);
  for (const [key, delta] of Object.entries(value)) {
    if (!POLICY_KEY_PATTERN.test(key) || !Number.isInteger(delta)) {
      throw new Error(`${label} is invalid`);
    }
  }
  return Object.freeze({ ...value });
}

function parseDelegations(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return Object.freeze(value.map((edge, index) => {
    const edgeLabel = `${label}[${index}]`;
    assertRecord(edge, edgeLabel);
    assertAllowedKeys(edge, DELEGATION_EDGE_KEYS, edgeLabel);
    assertAgentKey(edge.sourceAgentKey, `${edgeLabel}.sourceAgentKey`);
    assertAgentKey(edge.targetAgentKey, `${edgeLabel}.targetAgentKey`);
    if (
      edge.sourceAgentKey === null ||
      edge.targetAgentKey === null ||
      edge.sourceAgentKey === edge.targetAgentKey
    ) {
      throw new Error(`${edgeLabel} delegation must cross Agent profiles`);
    }
    if (
      typeof edge.capabilityKey !== 'string' ||
      !CAPABILITY_KEY_PATTERN.test(edge.capabilityKey)
    ) {
      throw new Error(`${edgeLabel}.capabilityKey is invalid`);
    }
    assertNonEmptyString(edge.capabilityKey, `${edgeLabel}.capabilityKey`);
    return Object.freeze({ ...edge });
  }));
}

function parseResponseAssessment(value, label) {
  assertRecord(value, label);
  assertAllowedKeys(value, RESPONSE_ASSESSMENT_KEYS, label);
  assertNonEmptyString(value.evaluatorVersion, `${label}.evaluatorVersion`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.evaluatorVersion)) {
    throw new Error(`${label}.evaluatorVersion is invalid`);
  }
  return Object.freeze({
    evaluatorVersion: value.evaluatorVersion,
    criteria: parseBooleanRecord(value.criteria, `${label}.criteria`),
  });
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
  assertAgentKey(value.agentKey, `${label}.agentKey`);
  parseCorrelation(value.correlation, `${label}.correlation`);
  assertStringArray(value.capabilityKeys, `${label}.capabilityKeys`);
  if (
    value.capabilityKeys.some(
      (key) => !CAPABILITY_KEY_PATTERN.test(key),
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
  const invariants = parseBooleanRecord(value.invariants, `${label}.invariants`);
  const milestones = parseBooleanRecord(value.milestones, `${label}.milestones`);
  const stateChanges = parseStateChanges(value.stateChanges, `${label}.stateChanges`);
  const delegations = parseDelegations(value.delegations, `${label}.delegations`);
  const responseAssessment = parseResponseAssessment(
    value.responseAssessment,
    `${label}.responseAssessment`,
  );
  return Object.freeze({
    ...value,
    correlation: Object.freeze({
      conversationRef: value.correlation.conversationRef,
      turnRefs: Object.freeze([...value.correlation.turnRefs]),
      executionRefs: Object.freeze([...value.correlation.executionRefs]),
    }),
    capabilityKeys: Object.freeze([...value.capabilityKeys]),
    canonicalInputHashes: Object.freeze([...value.canonicalInputHashes]),
    approvalRefs: Object.freeze([...value.approvalRefs]),
    operationRefs: Object.freeze([...value.operationRefs]),
    resourceRefs: Object.freeze([...value.resourceRefs]),
    invariants,
    milestones,
    stateChanges,
    delegations,
    responseAssessment,
  });
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
