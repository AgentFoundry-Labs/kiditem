import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcingLaunchCandidateService } from '../sourcing-launch-candidate.service';

const INPUT = {
  organizationId: 'org-1',
  createdByUserId: 'user-1',
  supplierOfferSkuSnapshotId: 'offer-snapshot-1',
  targetChannelAccountId: 'channel-1',
  productConceptVersionKey: 'concept:magnetic-case:v1',
  koreanSellableBundleVersionKey: 'bundle:single:v1',
  unitsPerSellableBundle: 1,
  initialOrderQuantity: 100,
  targetSalePriceKrw: 12_900,
  fulfillmentMode: 'rocket_growth',
  intendedAgeMinMonths: 96,
  intendedAgeMaxMonths: 156,
  intendedUse: 'school stationery',
  materialProfileKey: 'abs-v1',
  labelingProfileKey: 'kr-label-v1',
  launchPlanVersion: 'launch-v1',
  complianceAssessmentVersion: 'kc-v1',
  qualitySpecVersion: 'qc-v1',
  ipAssessmentVersion: 'ip-v1',
  economicsStatus: 'known' as const,
  complianceStatus: 'passed' as const,
  qualityStatus: 'passed' as const,
  ipStatus: 'passed' as const,
  landedCostKrw: 5_000,
  profitP10Krw: 2_000,
  bundleSnapshot: {},
  launchPlanSnapshot: {},
  economicsSnapshot: {},
  complianceSnapshot: {},
  qualitySnapshot: {},
  ipSnapshot: {},
};

describe('SourcingLaunchCandidateService', () => {
  const repository = { createVersion: vi.fn(), findById: vi.fn(), list: vi.fn() };
  const supply = { findOfferSnapshot: vi.fn() };
  const evidence = {
    findObservationsByIds: vi.fn(),
    findLatestObservationRevisions: vi.fn(),
  };
  const sources = { authorize: vi.fn() };
  let service: SourcingLaunchCandidateService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new SourcingLaunchCandidateService(
      repository as never,
      supply as never,
      evidence as never,
      sources as never,
    );
    evidence.findObservationsByIds.mockResolvedValue([offerEvidence()]);
    evidence.findLatestObservationRevisions.mockResolvedValue([{
      observationKey: 'offer-1:evidence',
      observationId: 'evidence-1',
      revision: 1,
    }]);
    sources.authorize.mockResolvedValue({
      allowed: true,
      reasonCode: null,
      entitlement: { id: 'entitlement-1' },
    });
  });

  it('rejects offer-only evidence because outcomes require an exact variant', async () => {
    supply.findOfferSnapshot.mockResolvedValue({
      id: 'offer-snapshot-1',
      identityStatus: 'offer_only',
      externalSkuId: null,
      variantKey: null,
      orderUnit: null,
      unitsPerOrderUnit: null,
    });

    await expect(service.create(INPUT)).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it('freezes the exact offer, channel, version keys, economics, and launch gates', async () => {
    supply.findOfferSnapshot.mockResolvedValue(exactOffer());
    repository.createVersion.mockImplementation(async (command) => ({
      kind: 'created',
      duplicate: false,
      record: command,
    }));

    await service.create(INPUT);

    expect(repository.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      supplierOfferSkuSnapshotId: 'offer-snapshot-1',
      targetChannelAccountId: 'channel-1',
      productConceptVersionKey: 'concept:magnetic-case:v1',
      koreanSellableBundleVersionKey: 'bundle:single:v1',
      initialOrderQuantity: 100,
      targetSalePriceKrw: 12_900,
      economicsStatus: 'known',
      identityHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it('creates a different immutable identity when decision assessment content changes', async () => {
    supply.findOfferSnapshot.mockResolvedValue(exactOffer());
    repository.createVersion.mockImplementation(async (command) => ({
      kind: 'created',
      duplicate: false,
      record: command,
    }));

    await service.create(INPUT);
    await service.create({
      ...INPUT,
      economicsSnapshot: { feeRate: 0.12 },
    });

    const firstHash = repository.createVersion.mock.calls[0][0].identityHash;
    const secondHash = repository.createVersion.mock.calls[1][0].identityHash;
    expect(firstHash).not.toBe(secondHash);
  });

  it('returns HTTP 400 when the repository rejects the target Coupang account', async () => {
    supply.findOfferSnapshot.mockResolvedValue(exactOffer());
    repository.createVersion.mockResolvedValue({
      kind: 'target_channel_account_invalid',
    });

    await expect(service.create(INPUT)).rejects.toThrow(
      /active Coupang account in this organization/,
    );
  });

  it('rejects values that cannot be persisted as PostgreSQL Int fields', async () => {
    supply.findOfferSnapshot.mockResolvedValue(exactOffer());

    await expect(service.create({
      ...INPUT,
      initialOrderQuantity: 2_147_483_648,
    })).rejects.toThrow(/PostgreSQL Int/);
    await expect(service.create({
      ...INPUT,
      profitP10Krw: -2_147_483_649,
    })).rejects.toThrow(/integer KRW values/);
    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it('blocks a new launch when supplier evidence retention is revoked', async () => {
    supply.findOfferSnapshot.mockResolvedValue(exactOffer());
    sources.authorize.mockResolvedValue({
      allowed: false,
      reasonCode: 'kill_switch_enabled',
      entitlement: null,
    });

    await expect(service.create(INPUT)).rejects.toThrow(/no longer retainable/);
    expect(repository.createVersion).not.toHaveBeenCalled();
  });
});

function exactOffer() {
  return {
    id: 'offer-snapshot-1',
    evidenceObservationId: 'evidence-1',
    identityStatus: 'exact_variant',
    externalSkuId: 'sku-blue',
    variantKey: 'blue',
    orderUnit: 'BOX',
    unitsPerOrderUnit: 12,
    validUntil: new Date(Date.now() + 86_400_000),
    productName: '자석 필통',
    sourcePlatform: '1688',
    externalOfferId: 'offer-1',
  };
}

function offerEvidence() {
  return {
    id: 'evidence-1',
    sourceKey: '1688-approved-collector',
    sourceScopeKey: 'stationery',
    observationKey: 'offer-1:evidence',
  };
}
