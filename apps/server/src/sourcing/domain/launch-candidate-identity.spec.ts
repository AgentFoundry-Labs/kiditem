import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeLaunchCandidateIdentity,
  fingerprintLaunchCandidateIdentity,
  normalizeLaunchCandidateIdentity,
  type LaunchCandidateIdentityInput,
} from './launch-candidate-identity';

const BASE_IDENTITY: LaunchCandidateIdentityInput = {
  supplierOfferSkuSnapshotId: 'supplier-offer-sku-snapshot-1',
  targetChannelAccountId: 'coupang-account-1',
  productConceptVersionKey: 'product-concept:magnetic-pencil-case:v3',
  variantKey: 'blue-24cm',
  bundle: {
    koreanSellableBundleVersionKey: 'sellable-bundle:single-unit:v2',
    unitOfMeasure: 'EA',
    units: 1,
  },
  launchPlanVersion: 'launch-plan-v4',
  complianceVersion: 'compliance-v2',
  qcVersion: 'qc-v5',
  ipVersion: 'ip-v3',
  intendedAgeMinMonths: 96,
  intendedAgeMaxMonths: 156,
  intendedUse: 'school stationery',
  materialProfileKey: 'abs-pvc-v1',
  labelingProfileKey: 'kr-stationery-v2',
  initialOrderQuantity: 100,
  targetSalePriceKrw: 12900,
  fulfillmentMode: 'rocket_growth',
  economicsStatus: 'known',
  complianceStatus: 'passed',
  qualityStatus: 'passed',
  ipStatus: 'passed',
  landedCostKrw: 5100,
  profitP10Krw: 2300,
  blockingRiskCodes: [],
  unknownRiskCodes: ['seasonality'],
  bundleSnapshot: { units: 1, unitOfMeasure: 'EA' },
  launchPlanSnapshot: { quantity: 100, channel: 'coupang' },
  economicsSnapshot: { marginRate: 0.31, feeVersion: 'coupang-2026-07' },
  complianceSnapshot: { kc: 'verified' },
  qualitySnapshot: { aql: 2.5 },
  ipSnapshot: { trademark: 'clear' },
};

function cloneIdentity(): LaunchCandidateIdentityInput {
  return JSON.parse(JSON.stringify(BASE_IDENTITY)) as LaunchCandidateIdentityInput;
}

describe('launch candidate identity', () => {
  it('keeps a gate that was not evaluated distinct from an evaluated unknown result', () => {
    const notEvaluated = normalizeLaunchCandidateIdentity({
      ...BASE_IDENTITY,
      complianceStatus: 'not_evaluated',
    });
    const unknown = normalizeLaunchCandidateIdentity({
      ...BASE_IDENTITY,
      complianceStatus: 'unknown',
    });

    expect(notEvaluated.complianceStatus).toBe('not_evaluated');
    expect(unknown.complianceStatus).toBe('unknown');
    expect(fingerprintLaunchCandidateIdentity(notEvaluated))
      .not.toBe(fingerprintLaunchCandidateIdentity(unknown));
  });

  it('produces the same canonical JSON and SHA-256 fingerprint regardless of key order', () => {
    const reordered = {
      ipSnapshot: BASE_IDENTITY.ipSnapshot,
      qualitySnapshot: BASE_IDENTITY.qualitySnapshot,
      complianceSnapshot: BASE_IDENTITY.complianceSnapshot,
      economicsSnapshot: BASE_IDENTITY.economicsSnapshot,
      launchPlanSnapshot: BASE_IDENTITY.launchPlanSnapshot,
      bundleSnapshot: BASE_IDENTITY.bundleSnapshot,
      unknownRiskCodes: BASE_IDENTITY.unknownRiskCodes,
      blockingRiskCodes: BASE_IDENTITY.blockingRiskCodes,
      profitP10Krw: BASE_IDENTITY.profitP10Krw,
      landedCostKrw: BASE_IDENTITY.landedCostKrw,
      ipStatus: BASE_IDENTITY.ipStatus,
      qualityStatus: BASE_IDENTITY.qualityStatus,
      complianceStatus: BASE_IDENTITY.complianceStatus,
      economicsStatus: BASE_IDENTITY.economicsStatus,
      fulfillmentMode: BASE_IDENTITY.fulfillmentMode,
      targetSalePriceKrw: BASE_IDENTITY.targetSalePriceKrw,
      initialOrderQuantity: BASE_IDENTITY.initialOrderQuantity,
      labelingProfileKey: BASE_IDENTITY.labelingProfileKey,
      materialProfileKey: BASE_IDENTITY.materialProfileKey,
      intendedUse: BASE_IDENTITY.intendedUse,
      intendedAgeMaxMonths: BASE_IDENTITY.intendedAgeMaxMonths,
      intendedAgeMinMonths: BASE_IDENTITY.intendedAgeMinMonths,
      ipVersion: BASE_IDENTITY.ipVersion,
      qcVersion: BASE_IDENTITY.qcVersion,
      complianceVersion: BASE_IDENTITY.complianceVersion,
      launchPlanVersion: BASE_IDENTITY.launchPlanVersion,
      bundle: {
        units: BASE_IDENTITY.bundle.units,
        unitOfMeasure: BASE_IDENTITY.bundle.unitOfMeasure,
        koreanSellableBundleVersionKey:
          BASE_IDENTITY.bundle.koreanSellableBundleVersionKey,
      },
      variantKey: BASE_IDENTITY.variantKey,
      productConceptVersionKey: BASE_IDENTITY.productConceptVersionKey,
      supplierOfferSkuSnapshotId: BASE_IDENTITY.supplierOfferSkuSnapshotId,
      targetChannelAccountId: BASE_IDENTITY.targetChannelAccountId,
    } satisfies LaunchCandidateIdentityInput;

    const canonical = canonicalizeLaunchCandidateIdentity(BASE_IDENTITY);
    expect(canonicalizeLaunchCandidateIdentity(reordered)).toBe(canonical);
    expect(fingerprintLaunchCandidateIdentity(reordered)).toBe(
      fingerprintLaunchCandidateIdentity(BASE_IDENTITY),
    );
    expect(fingerprintLaunchCandidateIdentity(BASE_IDENTITY)).toBe(
      createHash('sha256').update(canonical).digest('hex'),
    );
    expect(fingerprintLaunchCandidateIdentity(BASE_IDENTITY)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('normalizes surrounding text whitespace and UOM casing', () => {
    const equivalent = cloneIdentity();
    equivalent.supplierOfferSkuSnapshotId = ` ${equivalent.supplierOfferSkuSnapshotId} `;
    equivalent.variantKey = ` ${equivalent.variantKey} `;
    equivalent.bundle.unitOfMeasure = ' ea ';
    equivalent.unknownRiskCodes = ['seasonality', ' seasonality '];

    expect(normalizeLaunchCandidateIdentity(equivalent)).toEqual(
      normalizeLaunchCandidateIdentity(BASE_IDENTITY),
    );
    expect(fingerprintLaunchCandidateIdentity(equivalent)).toBe(
      fingerprintLaunchCandidateIdentity(BASE_IDENTITY),
    );
  });

  it.each([
    ['supplier offer SKU snapshot', (value: LaunchCandidateIdentityInput) => {
      value.supplierOfferSkuSnapshotId = 'supplier-offer-sku-snapshot-2';
    }],
    ['target channel account', (value: LaunchCandidateIdentityInput) => {
      value.targetChannelAccountId = 'coupang-account-2';
    }],
    ['product concept version', (value: LaunchCandidateIdentityInput) => {
      value.productConceptVersionKey = 'product-concept:magnetic-pencil-case:v4';
    }],
    ['variant key', (value: LaunchCandidateIdentityInput) => {
      value.variantKey = 'pink-24cm';
    }],
    ['bundle version', (value: LaunchCandidateIdentityInput) => {
      value.bundle.koreanSellableBundleVersionKey = 'sellable-bundle:single-unit:v3';
    }],
    ['bundle UOM', (value: LaunchCandidateIdentityInput) => {
      value.bundle.unitOfMeasure = 'BOX';
    }],
    ['bundle units', (value: LaunchCandidateIdentityInput) => {
      value.bundle.units = 2;
    }],
    ['launch plan version', (value: LaunchCandidateIdentityInput) => {
      value.launchPlanVersion = 'launch-plan-v5';
    }],
    ['compliance version', (value: LaunchCandidateIdentityInput) => {
      value.complianceVersion = 'compliance-v3';
    }],
    ['QC version', (value: LaunchCandidateIdentityInput) => {
      value.qcVersion = 'qc-v6';
    }],
    ['IP version', (value: LaunchCandidateIdentityInput) => {
      value.ipVersion = 'ip-v4';
    }],
    ['initial order quantity', (value: LaunchCandidateIdentityInput) => {
      value.initialOrderQuantity = 120;
    }],
    ['target sale price', (value: LaunchCandidateIdentityInput) => {
      value.targetSalePriceKrw = 13900;
    }],
    ['fulfillment mode', (value: LaunchCandidateIdentityInput) => {
      value.fulfillmentMode = 'seller_fulfilled';
    }],
    ['economics status', (value: LaunchCandidateIdentityInput) => {
      value.economicsStatus = 'blocked';
    }],
    ['compliance status', (value: LaunchCandidateIdentityInput) => {
      value.complianceStatus = 'blocked';
    }],
    ['quality status', (value: LaunchCandidateIdentityInput) => {
      value.qualityStatus = 'unknown';
    }],
    ['IP status', (value: LaunchCandidateIdentityInput) => {
      value.ipStatus = 'blocked';
    }],
    ['landed cost', (value: LaunchCandidateIdentityInput) => {
      value.landedCostKrw = 5300;
    }],
    ['P10 profit', (value: LaunchCandidateIdentityInput) => {
      value.profitP10Krw = -300;
    }],
    ['blocking risks', (value: LaunchCandidateIdentityInput) => {
      value.blockingRiskCodes = ['kc_missing'];
    }],
    ['unknown risks', (value: LaunchCandidateIdentityInput) => {
      value.unknownRiskCodes = ['seasonality', 'supplier_capacity'];
    }],
    ['bundle snapshot', (value: LaunchCandidateIdentityInput) => {
      value.bundleSnapshot = { ...value.bundleSnapshot, packaging: 'polybag' };
    }],
    ['launch-plan snapshot', (value: LaunchCandidateIdentityInput) => {
      value.launchPlanSnapshot = { ...value.launchPlanSnapshot, quantity: 120 };
    }],
    ['economics snapshot', (value: LaunchCandidateIdentityInput) => {
      value.economicsSnapshot = { ...value.economicsSnapshot, marginRate: 0.28 };
    }],
    ['compliance snapshot', (value: LaunchCandidateIdentityInput) => {
      value.complianceSnapshot = { ...value.complianceSnapshot, kc: 'pending' };
    }],
    ['quality snapshot', (value: LaunchCandidateIdentityInput) => {
      value.qualitySnapshot = { ...value.qualitySnapshot, aql: 4 };
    }],
    ['IP snapshot', (value: LaunchCandidateIdentityInput) => {
      value.ipSnapshot = { ...value.ipSnapshot, trademark: 'review' };
    }],
  ] as const)('changes the fingerprint when %s changes', (_label, mutate) => {
    const changed = cloneIdentity();
    mutate(changed);
    expect(fingerprintLaunchCandidateIdentity(changed)).not.toBe(
      fingerprintLaunchCandidateIdentity(BASE_IDENTITY),
    );
  });

  it('rejects undefined and non-finite numbers instead of silently dropping them', () => {
    const withUndefined = cloneIdentity() as unknown as Record<string, unknown>;
    withUndefined.variantKey = undefined;
    expect(() => canonicalizeLaunchCandidateIdentity(
      withUndefined as unknown as LaunchCandidateIdentityInput,
    )).toThrow(/non-JSON/);

    const withNaN = cloneIdentity();
    withNaN.bundle.units = Number.NaN;
    expect(() => canonicalizeLaunchCandidateIdentity(withNaN)).toThrow(/finite JSON numbers/);
  });

  it('rejects circular input even when it arrives through an unexpected property', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const malformed = {
      ...cloneIdentity(),
      unexpected: circular,
    } as unknown as LaunchCandidateIdentityInput;

    expect(() => canonicalizeLaunchCandidateIdentity(malformed)).toThrow(/circular reference/);
  });

  it('rejects incomplete or non-positive exact identity fields', () => {
    const blankVariant = cloneIdentity();
    blankVariant.variantKey = '   ';
    expect(() => fingerprintLaunchCandidateIdentity(blankVariant)).toThrow(/variantKey/);

    const zeroUnits = cloneIdentity();
    zeroUnits.bundle.units = 0;
    expect(() => fingerprintLaunchCandidateIdentity(zeroUnits)).toThrow(/positive/);

    const invalidAge = cloneIdentity();
    invalidAge.intendedAgeMinMonths = 157;
    expect(() => fingerprintLaunchCandidateIdentity(invalidAge)).toThrow(/cannot exceed/);
  });
});
