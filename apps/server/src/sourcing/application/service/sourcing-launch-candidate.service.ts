import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { fingerprintLaunchCandidateIdentity } from '../../domain/launch-candidate-identity';
import { hashSourcingIntelligenceJson } from '../../domain/sourcing-intelligence-hash';
import {
  SOURCING_SUPPLY_INTELLIGENCE_PORT,
  type SourcingSupplyIntelligencePort,
} from '../port/out/cross-domain/sourcing-supply-intelligence.port';
import {
  SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT,
  type SourcingEvidenceLedgerRepositoryPort,
} from '../port/out/repository/sourcing-evidence-ledger.repository.port';
import {
  SOURCING_LAUNCH_CANDIDATE_REPOSITORY_PORT,
  type SourcingEconomicsStatus,
  type SourcingGateStatus,
  type SourcingLaunchCandidateRepositoryPort,
} from '../port/out/repository/sourcing-launch-candidate.repository.port';

const POSTGRES_INT_MIN = -2_147_483_648;
const POSTGRES_INT_MAX = 2_147_483_647;

export interface CreateSourcingLaunchCandidateInput {
  organizationId: string;
  createdByUserId: string;
  sourceRecordId?: string | null;
  supplierOfferSkuSnapshotId: string;
  targetChannelAccountId: string;
  productConceptVersionKey: string;
  title?: string | null;
  koreanSellableBundleVersionKey: string;
  unitsPerSellableBundle: number;
  initialOrderQuantity: number;
  targetSalePriceKrw: number;
  fulfillmentMode: string;
  intendedAgeMinMonths?: number | null;
  intendedAgeMaxMonths?: number | null;
  intendedUse: string;
  materialProfileKey: string;
  labelingProfileKey: string;
  launchPlanVersion: string;
  complianceAssessmentVersion: string;
  qualitySpecVersion: string;
  ipAssessmentVersion: string;
  economicsStatus: SourcingEconomicsStatus;
  complianceStatus: SourcingGateStatus;
  qualityStatus: SourcingGateStatus;
  ipStatus: SourcingGateStatus;
  landedCostKrw?: number | null;
  profitP10Krw?: number | null;
  blockingRiskCodes?: string[];
  unknownRiskCodes?: string[];
  bundleSnapshot: Record<string, unknown>;
  launchPlanSnapshot: Record<string, unknown>;
  economicsSnapshot: Record<string, unknown>;
  complianceSnapshot: Record<string, unknown>;
  qualitySnapshot: Record<string, unknown>;
  ipSnapshot: Record<string, unknown>;
}

@Injectable()
export class SourcingLaunchCandidateService {
  constructor(
    @Inject(SOURCING_LAUNCH_CANDIDATE_REPOSITORY_PORT)
    private readonly repository: SourcingLaunchCandidateRepositoryPort,
    @Inject(SOURCING_SUPPLY_INTELLIGENCE_PORT)
    private readonly supply: SourcingSupplyIntelligencePort,
    @Inject(SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT)
    private readonly evidence: SourcingEvidenceLedgerRepositoryPort,
  ) {}

  async create(input: CreateSourcingLaunchCandidateInput) {
    const offer = await this.supply.findOfferSnapshot({
      organizationId: input.organizationId,
      id: input.supplierOfferSkuSnapshotId,
    });
    if (!offer) throw new NotFoundException('Supplier offer SKU snapshot not found');
    const [offerEvidence] = await this.evidence.findObservationsByIds({
      organizationId: input.organizationId,
      observationIds: [offer.evidenceObservationId],
    });
    if (!offerEvidence) {
      throw new BadRequestException(
        'Supplier offer provenance is missing in this organization',
      );
    }
    const provenanceAt = new Date();
    const [latestEvidence] = await this.evidence.findLatestObservationRevisions({
      organizationId: input.organizationId,
      observationKeys: [offerEvidence.observationKey],
      cutoffAt: provenanceAt,
    });
    if (latestEvidence?.observationId !== offerEvidence.id) {
      throw new BadRequestException(
        'Supplier offer provenance was superseded; freeze a new offer snapshot',
      );
    }
    if (
      offer.identityStatus !== 'exact_variant' ||
      !offer.externalSkuId ||
      !offer.variantKey ||
      !offer.orderUnit ||
      !offer.unitsPerOrderUnit
    ) {
      throw new BadRequestException(
        'LaunchCandidate requires an exact supplier variant and unit conversion',
      );
    }
    if (offer.validUntil && offer.validUntil.getTime() <= Date.now()) {
      throw new BadRequestException('Supplier offer SKU snapshot has expired');
    }

    const productConceptVersionKey = requiredText(
      input.productConceptVersionKey,
      'productConceptVersionKey',
    );
    const koreanSellableBundleVersionKey = requiredText(
      input.koreanSellableBundleVersionKey,
      'koreanSellableBundleVersionKey',
    );
    assertPositiveInteger(input.unitsPerSellableBundle, 'unitsPerSellableBundle');
    assertPositiveInteger(input.initialOrderQuantity, 'initialOrderQuantity');
    assertNonNegativeInteger(input.targetSalePriceKrw, 'targetSalePriceKrw');
    const intendedAgeMinMonths = nullableNonNegativeInteger(
      input.intendedAgeMinMonths,
      'intendedAgeMinMonths',
    );
    const intendedAgeMaxMonths = nullableNonNegativeInteger(
      input.intendedAgeMaxMonths,
      'intendedAgeMaxMonths',
    );
    if (
      intendedAgeMinMonths !== null &&
      intendedAgeMaxMonths !== null &&
      intendedAgeMinMonths > intendedAgeMaxMonths
    ) {
      throw new BadRequestException(
        'intendedAgeMinMonths cannot exceed intendedAgeMaxMonths',
      );
    }
    assertEconomics(input);

    const versions = {
      launchPlanVersion: requiredText(input.launchPlanVersion, 'launchPlanVersion'),
      complianceAssessmentVersion: requiredText(
        input.complianceAssessmentVersion,
        'complianceAssessmentVersion',
      ),
      qualitySpecVersion: requiredText(input.qualitySpecVersion, 'qualitySpecVersion'),
      ipAssessmentVersion: requiredText(input.ipAssessmentVersion, 'ipAssessmentVersion'),
    };
    const blockingRiskCodes = normalizedCodes(input.blockingRiskCodes ?? []);
    const unknownRiskCodes = normalizedCodes(input.unknownRiskCodes ?? []);
    const identityHash = fingerprintLaunchCandidateIdentity({
      supplierOfferSkuSnapshotId: offer.id,
      targetChannelAccountId: requiredText(
        input.targetChannelAccountId,
        'targetChannelAccountId',
      ),
      productConceptVersionKey,
      variantKey: offer.variantKey,
      bundle: {
        koreanSellableBundleVersionKey,
        unitOfMeasure: offer.orderUnit,
        units: input.unitsPerSellableBundle,
      },
      launchPlanVersion: versions.launchPlanVersion,
      complianceVersion: versions.complianceAssessmentVersion,
      qcVersion: versions.qualitySpecVersion,
      ipVersion: versions.ipAssessmentVersion,
      intendedAgeMinMonths,
      intendedAgeMaxMonths,
      intendedUse: requiredText(input.intendedUse, 'intendedUse'),
      materialProfileKey: normalizedKey(
        input.materialProfileKey,
        'materialProfileKey',
      ),
      labelingProfileKey: normalizedKey(
        input.labelingProfileKey,
        'labelingProfileKey',
      ),
      initialOrderQuantity: input.initialOrderQuantity,
      targetSalePriceKrw: input.targetSalePriceKrw,
      fulfillmentMode: normalizedKey(input.fulfillmentMode, 'fulfillmentMode'),
      economicsStatus: input.economicsStatus,
      complianceStatus: input.complianceStatus,
      qualityStatus: input.qualityStatus,
      ipStatus: input.ipStatus,
      landedCostKrw: input.landedCostKrw ?? null,
      profitP10Krw: input.profitP10Krw ?? null,
      blockingRiskCodes,
      unknownRiskCodes,
      bundleSnapshot: input.bundleSnapshot,
      launchPlanSnapshot: input.launchPlanSnapshot,
      economicsSnapshot: input.economicsSnapshot,
      complianceSnapshot: input.complianceSnapshot,
      qualitySnapshot: input.qualitySnapshot,
      ipSnapshot: input.ipSnapshot,
    });
    const candidateKey = hashSourcingIntelligenceJson({
      sourcePlatform: offer.sourcePlatform,
      externalOfferId: offer.externalOfferId,
      externalSkuId: offer.externalSkuId,
      targetChannelAccountId: input.targetChannelAccountId,
    });

    const result = await this.repository.createVersion({
      organizationId: input.organizationId,
      candidateKey,
      identityHash,
      sourceRecordId: input.sourceRecordId ?? null,
      supplierOfferSkuSnapshotId: offer.id,
      targetChannelAccountId: requiredText(
        input.targetChannelAccountId,
        'targetChannelAccountId',
      ),
      productConceptVersionKey,
      title: optionalText(input.title) ?? offer.productName,
      koreanSellableBundleVersionKey,
      unitsPerSellableBundle: input.unitsPerSellableBundle,
      initialOrderQuantity: input.initialOrderQuantity,
      targetSalePriceKrw: input.targetSalePriceKrw,
      fulfillmentMode: normalizedKey(input.fulfillmentMode, 'fulfillmentMode'),
      intendedAgeMinMonths,
      intendedAgeMaxMonths,
      intendedUse: requiredText(input.intendedUse, 'intendedUse'),
      materialProfileKey: normalizedKey(
        input.materialProfileKey,
        'materialProfileKey',
      ),
      labelingProfileKey: normalizedKey(
        input.labelingProfileKey,
        'labelingProfileKey',
      ),
      ...versions,
      economicsStatus: input.economicsStatus,
      complianceStatus: input.complianceStatus,
      qualityStatus: input.qualityStatus,
      ipStatus: input.ipStatus,
      landedCostKrw: input.landedCostKrw ?? null,
      profitP10Krw: input.profitP10Krw ?? null,
      blockingRiskCodes,
      unknownRiskCodes,
      bundleSnapshot: input.bundleSnapshot,
      launchPlanSnapshot: input.launchPlanSnapshot,
      economicsSnapshot: input.economicsSnapshot,
      complianceSnapshot: input.complianceSnapshot,
      qualitySnapshot: input.qualitySnapshot,
      ipSnapshot: input.ipSnapshot,
      validUntil: offer.validUntil,
      createdByUserId: input.createdByUserId,
    });
    if (result.kind === 'source_record_not_found') {
      throw new BadRequestException('Source record not found in this organization');
    }
    if (result.kind === 'target_channel_account_invalid') {
      throw new BadRequestException(
        'Target channel account must be an active Coupang account in this organization',
      );
    }
    return result;
  }

  async get(organizationId: string, id: string) {
    const record = await this.repository.findById({ organizationId, id });
    if (!record) throw new NotFoundException('LaunchCandidate not found');
    return record;
  }

  list(input: {
    organizationId: string;
    productConceptVersionKey?: string;
    limit?: number;
  }) {
    return this.repository.list({
      organizationId: input.organizationId,
      ...(input.productConceptVersionKey && {
        productConceptVersionKey: requiredText(
          input.productConceptVersionKey,
          'productConceptVersionKey',
        ),
      }),
      limit: Math.max(1, Math.min(200, input.limit ?? 50)),
    });
  }
}

function assertEconomics(input: CreateSourcingLaunchCandidateInput) {
  const values = [input.landedCostKrw, input.targetSalePriceKrw, input.profitP10Krw];
  if (input.economicsStatus === 'known' && values.some((value) => value == null)) {
    throw new BadRequestException(
      'Known economics requires landedCostKrw, targetSalePriceKrw, and profitP10Krw',
    );
  }
  for (const [index, value] of values.entries()) {
    if (
      value != null &&
      (!Number.isSafeInteger(value) ||
        value < POSTGRES_INT_MIN ||
        value > POSTGRES_INT_MAX ||
        (index < 2 && value < 0))
    ) {
      throw new BadRequestException('Economics amounts must be integer KRW values');
    }
  }
}

function normalizedKey(value: string, field: string): string {
  return requiredText(value, field)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._:-]+/gu, '_');
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new BadRequestException(`${field} is required`);
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizedCodes(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizedKey(value, 'riskCode')))).sort();
}

function assertPositiveInteger(value: number, field: string) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > POSTGRES_INT_MAX
  ) {
    throw new BadRequestException(
      `${field} must fit a positive PostgreSQL Int`,
    );
  }
}

function assertNonNegativeInteger(value: number, field: string) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > POSTGRES_INT_MAX
  ) {
    throw new BadRequestException(
      `${field} must fit a non-negative PostgreSQL Int`,
    );
  }
}

function nullableNonNegativeInteger(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value == null) return null;
  assertNonNegativeInteger(value, field);
  return value;
}
