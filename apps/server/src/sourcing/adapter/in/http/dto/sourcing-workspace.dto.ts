import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';
import type { SourcingRecommendationSurface } from '../../../../application/service/sourcing-recommendation.service';

const RECOMMENDATION_SURFACES: SourcingRecommendationSurface[] = [
  'home',
  'today',
  'entry',
  'final',
];

export class SourcingRecommendationQueryDto {
  @IsIn(RECOMMENDATION_SURFACES)
  surface!: SourcingRecommendationSurface;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  cursor?: string;
}

export class SourcingValidationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  cursor?: string;
}

export class SourcingReviewSelectionListQueryDto {
  @IsIn(['entry', 'final'])
  workspaceKey!: 'entry' | 'final';

  @IsUUID()
  recommendationRunId!: string;
}

export class SourcingReviewItemKeyParamsDto {
  @Matches(/^[a-f0-9]{64}$/)
  itemKey!: string;
}

export class SourcingReviewSelectionDto {
  @IsIn(['entry', 'final'])
  workspaceKey!: 'entry' | 'final';

  @IsUUID()
  recommendationRunId!: string;

  @IsIn(['neutral', 'selected', 'removed'])
  state!: 'neutral' | 'selected' | 'removed';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class SourcingReviewBatchDto {
  @IsUUID()
  recommendationRunId!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @Matches(/^[a-f0-9]{64}$/, { each: true })
  itemKeys!: string[];

  @IsUUID()
  idempotencyKey!: string;
}

export class SourcingReviewBatchParamsDto {
  @IsUUID()
  id!: string;
}

export class SourcingKeywordPreferenceParamsDto {
  @IsString()
  @MaxLength(200)
  keyword!: string;
}

export class SourcingKeywordPreferenceDto {
  @IsBoolean()
  excluded!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
