import { createHash } from 'node:crypto';

export const LAUNCH_CANDIDATE_IDENTITY_SCHEMA_VERSION = 2 as const;

export type LaunchCandidateIdentityEconomicsStatus =
  | 'unknown'
  | 'known'
  | 'blocked';
export type LaunchCandidateIdentityGateStatus = 'unknown' | 'passed' | 'blocked';

export interface LaunchCandidateIdentityInput {
  supplierOfferSkuSnapshotId: string;
  targetChannelAccountId: string;
  productConceptVersionKey: string;
  variantKey: string;
  bundle: {
    koreanSellableBundleVersionKey: string;
    unitOfMeasure: string;
    units: number;
  };
  launchPlanVersion: string;
  complianceVersion: string;
  qcVersion: string;
  ipVersion: string;
  intendedAgeMinMonths: number | null;
  intendedAgeMaxMonths: number | null;
  intendedUse: string;
  materialProfileKey: string;
  labelingProfileKey: string;
  initialOrderQuantity: number;
  targetSalePriceKrw: number;
  fulfillmentMode: string;
  economicsStatus: LaunchCandidateIdentityEconomicsStatus;
  complianceStatus: LaunchCandidateIdentityGateStatus;
  qualityStatus: LaunchCandidateIdentityGateStatus;
  ipStatus: LaunchCandidateIdentityGateStatus;
  landedCostKrw: number | null;
  profitP10Krw: number | null;
  blockingRiskCodes: string[];
  unknownRiskCodes: string[];
  bundleSnapshot: Record<string, unknown>;
  launchPlanSnapshot: Record<string, unknown>;
  economicsSnapshot: Record<string, unknown>;
  complianceSnapshot: Record<string, unknown>;
  qualitySnapshot: Record<string, unknown>;
  ipSnapshot: Record<string, unknown>;
}

export interface CanonicalLaunchCandidateIdentity {
  schemaVersion: typeof LAUNCH_CANDIDATE_IDENTITY_SCHEMA_VERSION;
  supplierOfferSkuSnapshotId: string;
  targetChannelAccountId: string;
  productConceptVersionKey: string;
  variantKey: string;
  bundle: {
    koreanSellableBundleVersionKey: string;
    unitOfMeasure: string;
    units: number;
  };
  launchPlanVersion: string;
  complianceVersion: string;
  qcVersion: string;
  ipVersion: string;
  intendedAgeMinMonths: number | null;
  intendedAgeMaxMonths: number | null;
  intendedUse: string;
  materialProfileKey: string;
  labelingProfileKey: string;
  initialOrderQuantity: number;
  targetSalePriceKrw: number;
  fulfillmentMode: string;
  economicsStatus: LaunchCandidateIdentityEconomicsStatus;
  complianceStatus: LaunchCandidateIdentityGateStatus;
  qualityStatus: LaunchCandidateIdentityGateStatus;
  ipStatus: LaunchCandidateIdentityGateStatus;
  landedCostKrw: number | null;
  profitP10Krw: number | null;
  blockingRiskCodes: string[];
  unknownRiskCodes: string[];
  bundleSnapshot: Record<string, unknown>;
  launchPlanSnapshot: Record<string, unknown>;
  economicsSnapshot: Record<string, unknown>;
  complianceSnapshot: Record<string, unknown>;
  qualitySnapshot: Record<string, unknown>;
  ipSnapshot: Record<string, unknown>;
}

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

/**
 * Produce the canonical, versioned identity document used by persistence and
 * idempotency. The preliminary traversal rejects non-JSON and cyclic input even
 * when a malformed caller smuggles unexpected properties past TypeScript.
 */
export function canonicalizeLaunchCandidateIdentity(
  input: LaunchCandidateIdentityInput,
): string {
  toCanonicalJson(input, '$', new Set<object>());
  const identity = normalizeLaunchCandidateIdentity(input);
  return JSON.stringify(toCanonicalJson(identity, '$', new Set<object>()));
}

export function fingerprintLaunchCandidateIdentity(
  input: LaunchCandidateIdentityInput,
): string {
  return createHash('sha256')
    .update(canonicalizeLaunchCandidateIdentity(input))
    .digest('hex');
}

export function normalizeLaunchCandidateIdentity(
  input: LaunchCandidateIdentityInput,
): CanonicalLaunchCandidateIdentity {
  if (!isPlainObject(input)) {
    throw new TypeError('Launch candidate identity must be a plain object.');
  }
  if (!isPlainObject(input.bundle)) {
    throw new TypeError('Launch candidate bundle must be a plain object.');
  }
  if (!Number.isFinite(input.bundle.units) || !Number.isInteger(input.bundle.units)) {
    throw new TypeError('Launch candidate bundle units must be a finite integer.');
  }
  if (input.bundle.units <= 0) {
    throw new TypeError('Launch candidate bundle units must be positive.');
  }
  assertNullableNonNegativeInteger(input.intendedAgeMinMonths, 'intendedAgeMinMonths');
  assertNullableNonNegativeInteger(input.intendedAgeMaxMonths, 'intendedAgeMaxMonths');
  if (
    input.intendedAgeMinMonths !== null &&
    input.intendedAgeMaxMonths !== null &&
    input.intendedAgeMinMonths > input.intendedAgeMaxMonths
  ) {
    throw new TypeError(
      'Launch candidate intendedAgeMinMonths cannot exceed intendedAgeMaxMonths.',
    );
  }
  assertPositiveInteger(input.initialOrderQuantity, 'initialOrderQuantity');
  assertNonNegativeInteger(input.targetSalePriceKrw, 'targetSalePriceKrw');
  assertNullableNonNegativeInteger(input.landedCostKrw, 'landedCostKrw');
  assertNullableInteger(input.profitP10Krw, 'profitP10Krw');

  return {
    schemaVersion: LAUNCH_CANDIDATE_IDENTITY_SCHEMA_VERSION,
    supplierOfferSkuSnapshotId: requiredText(
      input.supplierOfferSkuSnapshotId,
      'supplierOfferSkuSnapshotId',
    ),
    targetChannelAccountId: requiredText(
      input.targetChannelAccountId,
      'targetChannelAccountId',
    ),
    productConceptVersionKey: requiredText(
      input.productConceptVersionKey,
      'productConceptVersionKey',
    ),
    variantKey: requiredText(input.variantKey, 'variantKey'),
    bundle: {
      koreanSellableBundleVersionKey: requiredText(
        input.bundle.koreanSellableBundleVersionKey,
        'bundle.koreanSellableBundleVersionKey',
      ),
      unitOfMeasure: requiredText(
        input.bundle.unitOfMeasure,
        'bundle.unitOfMeasure',
      ).toUpperCase(),
      units: input.bundle.units,
    },
    launchPlanVersion: requiredText(
      input.launchPlanVersion,
      'launchPlanVersion',
    ),
    complianceVersion: requiredText(
      input.complianceVersion,
      'complianceVersion',
    ),
    qcVersion: requiredText(input.qcVersion, 'qcVersion'),
    ipVersion: requiredText(input.ipVersion, 'ipVersion'),
    intendedAgeMinMonths: input.intendedAgeMinMonths,
    intendedAgeMaxMonths: input.intendedAgeMaxMonths,
    intendedUse: requiredText(input.intendedUse, 'intendedUse'),
    materialProfileKey: requiredText(
      input.materialProfileKey,
      'materialProfileKey',
    ),
    labelingProfileKey: requiredText(
      input.labelingProfileKey,
      'labelingProfileKey',
    ),
    initialOrderQuantity: input.initialOrderQuantity,
    targetSalePriceKrw: input.targetSalePriceKrw,
    fulfillmentMode: requiredText(input.fulfillmentMode, 'fulfillmentMode'),
    economicsStatus: requiredStatus(
      input.economicsStatus,
      ['unknown', 'known', 'blocked'],
      'economicsStatus',
    ),
    complianceStatus: requiredStatus(
      input.complianceStatus,
      ['unknown', 'passed', 'blocked'],
      'complianceStatus',
    ),
    qualityStatus: requiredStatus(
      input.qualityStatus,
      ['unknown', 'passed', 'blocked'],
      'qualityStatus',
    ),
    ipStatus: requiredStatus(
      input.ipStatus,
      ['unknown', 'passed', 'blocked'],
      'ipStatus',
    ),
    landedCostKrw: input.landedCostKrw,
    profitP10Krw: input.profitP10Krw,
    blockingRiskCodes: normalizedCodes(
      input.blockingRiskCodes,
      'blockingRiskCodes',
    ),
    unknownRiskCodes: normalizedCodes(
      input.unknownRiskCodes,
      'unknownRiskCodes',
    ),
    bundleSnapshot: requiredSnapshot(input.bundleSnapshot, 'bundleSnapshot'),
    launchPlanSnapshot: requiredSnapshot(
      input.launchPlanSnapshot,
      'launchPlanSnapshot',
    ),
    economicsSnapshot: requiredSnapshot(
      input.economicsSnapshot,
      'economicsSnapshot',
    ),
    complianceSnapshot: requiredSnapshot(
      input.complianceSnapshot,
      'complianceSnapshot',
    ),
    qualitySnapshot: requiredSnapshot(input.qualitySnapshot, 'qualitySnapshot'),
    ipSnapshot: requiredSnapshot(input.ipSnapshot, 'ipSnapshot'),
  };
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`Launch candidate ${field} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new TypeError(
      `Launch candidate ${field} must be a non-negative integer.`,
    );
  }
}

function assertNullableNonNegativeInteger(
  value: number | null,
  field: string,
): void {
  if (value !== null) assertNonNegativeInteger(value, field);
}

function assertNullableInteger(value: number | null, field: string): void {
  if (value !== null && (!Number.isFinite(value) || !Number.isInteger(value))) {
    throw new TypeError(`Launch candidate ${field} must be a finite integer or null.`);
  }
}

function requiredStatus<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new TypeError(
      `Launch candidate ${field} must be one of: ${allowed.join(', ')}.`,
    );
  }
  return value as T;
}

function normalizedCodes(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Launch candidate ${field} must be an array.`);
  }
  return Array.from(
    new Set(value.map((code, index) => requiredText(code, `${field}[${index}]`))),
  ).sort();
}

function requiredSnapshot(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError(`Launch candidate ${field} must be a plain object.`);
  }
  return value;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`Launch candidate ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function toCanonicalJson(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): CanonicalJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must contain only finite JSON numbers.`);
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${path} contains a non-JSON value.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${path} contains a circular reference.`);
  }

  const isArray = Array.isArray(value);
  if (!isArray && !isPlainObject(value)) {
    throw new TypeError(`${path} must contain only plain JSON objects.`);
  }

  ancestors.add(value);
  try {
    if (isArray) {
      return value.map((entry, index) =>
        toCanonicalJson(entry, `${path}[${index}]`, ancestors),
      );
    }

    const output = Object.create(null) as Record<string, CanonicalJson>;
    for (const key of Object.keys(value).sort()) {
      output[key] = toCanonicalJson(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
        ancestors,
      );
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
