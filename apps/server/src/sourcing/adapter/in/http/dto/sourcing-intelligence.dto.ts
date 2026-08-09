import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SOURCING_EVIDENCE_GRANULARITIES,
  SOURCING_EVIDENCE_RUN_STATUSES,
  SOURCING_EVIDENCE_SIGNAL_ROLES,
} from '../../../../application/port/out/repository/sourcing-evidence-ledger.repository.port';
import {
  SOURCING_ECONOMICS_STATUSES,
  SOURCING_GATE_STATUSES,
} from '../../../../application/port/out/repository/sourcing-launch-candidate.repository.port';

const POSTGRES_INT_MIN = -2_147_483_648;
const POSTGRES_INT_MAX = 2_147_483_647;
export class SetSourcingCollectionSourceEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

export class StartEvidenceRunDto {
  @IsString()
  @MaxLength(80)
  sourceKey!: string;

  @IsString()
  @MaxLength(300)
  runKey!: string;

  @IsString()
  @MaxLength(300)
  scopeKey!: string;

  @IsString()
  @MaxLength(120)
  collectorVersion!: string;

  @IsOptional()
  @IsDateString()
  windowStartAt?: string | null;

  @IsOptional()
  @IsDateString()
  windowEndAt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(POSTGRES_INT_MAX)
  expectedCount?: number | null;
}

export class EvidenceObservationDto {
  @IsString()
  @MaxLength(80)
  platform!: string;

  @IsString()
  @MaxLength(100)
  evidenceFamily!: string;

  @IsIn(SOURCING_EVIDENCE_SIGNAL_ROLES)
  signalRole!: (typeof SOURCING_EVIDENCE_SIGNAL_ROLES)[number];

  @IsIn(SOURCING_EVIDENCE_GRANULARITIES)
  granularity!: (typeof SOURCING_EVIDENCE_GRANULARITIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  conceptKey?: string | null;

  @IsString()
  @MaxLength(80)
  sourceEntityType!: string;

  @IsString()
  @MaxLength(300)
  sourceEntityId!: string;

  @IsString()
  @MaxLength(80)
  schemaVersion!: string;

  @IsString()
  @MaxLength(64)
  observationKey!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(POSTGRES_INT_MAX)
  revision?: number;

  @IsOptional()
  @IsBoolean()
  supportsCandidate?: boolean;

  @IsOptional()
  @IsString()
  sourceUrl?: string | null;

  @IsDateString()
  eventAt!: string;

  @IsDateString()
  observedAt!: string;

  @IsDateString()
  availableAt!: string;

  @IsOptional()
  @IsDateString()
  revisionAt?: string | null;

  @IsObject()
  rawPayload!: Record<string, unknown>;
}

export class AppendEvidenceObservationsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => EvidenceObservationDto)
  observations!: EvidenceObservationDto[];
}

export class FinalizeEvidenceRunDto {
  @IsIn(
    SOURCING_EVIDENCE_RUN_STATUSES.filter(
      (status) => status !== 'collecting' && status !== 'cancel_requested',
    ),
  )
  status!: Exclude<
    (typeof SOURCING_EVIDENCE_RUN_STATUSES)[number],
    'collecting' | 'cancel_requested'
  >;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  coverageBps?: number | null;

  @IsOptional()
  @IsDateString()
  watermarkEventAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  errorCode?: string | null;

  @IsOptional()
  @IsString()
  errorMessage?: string | null;
}

export class CreateLaunchCandidateDto {
  @IsOptional()
  @IsUUID()
  sourceCandidateId?: string | null;

  @IsUUID()
  supplierOfferSkuSnapshotId!: string;

  @IsUUID()
  targetChannelAccountId!: string;

  @IsString()
  @MaxLength(200)
  productConceptVersionKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string | null;

  @IsString()
  @MaxLength(200)
  koreanSellableBundleVersionKey!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(POSTGRES_INT_MAX)
  unitsPerSellableBundle!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(POSTGRES_INT_MAX)
  initialOrderQuantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(POSTGRES_INT_MAX)
  targetSalePriceKrw!: number;

  @IsString()
  @MaxLength(60)
  fulfillmentMode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(POSTGRES_INT_MAX)
  intendedAgeMinMonths?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(POSTGRES_INT_MAX)
  intendedAgeMaxMonths?: number | null;

  @IsString()
  @MaxLength(160)
  intendedUse!: string;

  @IsString()
  @MaxLength(200)
  materialProfileKey!: string;

  @IsString()
  @MaxLength(200)
  labelingProfileKey!: string;

  @IsString()
  @MaxLength(200)
  launchPlanVersion!: string;

  @IsString()
  @MaxLength(200)
  complianceAssessmentVersion!: string;

  @IsString()
  @MaxLength(200)
  qualitySpecVersion!: string;

  @IsString()
  @MaxLength(200)
  ipAssessmentVersion!: string;

  @IsIn(SOURCING_ECONOMICS_STATUSES)
  economicsStatus!: (typeof SOURCING_ECONOMICS_STATUSES)[number];

  @IsIn(SOURCING_GATE_STATUSES)
  complianceStatus!: (typeof SOURCING_GATE_STATUSES)[number];

  @IsIn(SOURCING_GATE_STATUSES)
  qualityStatus!: (typeof SOURCING_GATE_STATUSES)[number];

  @IsIn(SOURCING_GATE_STATUSES)
  ipStatus!: (typeof SOURCING_GATE_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(POSTGRES_INT_MAX)
  landedCostKrw?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(POSTGRES_INT_MIN)
  @Max(POSTGRES_INT_MAX)
  profitP10Krw?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  blockingRiskCodes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  unknownRiskCodes?: string[];

  @IsObject()
  bundleSnapshot!: Record<string, unknown>;

  @IsObject()
  launchPlanSnapshot!: Record<string, unknown>;

  @IsObject()
  economicsSnapshot!: Record<string, unknown>;

  @IsObject()
  complianceSnapshot!: Record<string, unknown>;

  @IsObject()
  qualitySnapshot!: Record<string, unknown>;

  @IsObject()
  ipSnapshot!: Record<string, unknown>;
}

export class DecisionCandidateBindingDto {
  @IsString()
  @MaxLength(300)
  modelCandidateId!: string;

  @IsOptional()
  @IsUUID()
  supplierOfferSkuSnapshotId?: string | null;

  @IsOptional()
  @IsUUID()
  launchCandidateId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  evidenceObservationIds?: string[];
}

export class CreateDecisionBatchDto {
  @IsString()
  @MaxLength(300)
  idempotencyKey!: string;

  @IsString()
  @MaxLength(160)
  keyword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  category?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  expiresInHours?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(240)
  @ValidateNested({ each: true })
  @Type(() => DecisionCandidateBindingDto)
  candidateBindings?: DecisionCandidateBindingDto[];
}

export class CreateDecisionProcurementIntentDto {
  @IsString()
  @MaxLength(300)
  idempotencyKey!: string;

  @IsIn(['request_rfq', 'request_sample', 'test_order'])
  intentType!: 'request_rfq' | 'request_sample' | 'test_order';

  @IsOptional()
  @IsUUID()
  selectedPriceTierId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requestedOrderUnits?: number | null;
}
