import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  SourcingInterestTargetSource,
  SourcingInterestTargetType,
} from '../../../../application/port/out/repository/sourcing-interest-target.repository.port';

const TARGET_TYPES: SourcingInterestTargetType[] = [
  'keyword',
  'category',
  'product',
];

const TARGET_SOURCES: SourcingInterestTargetSource[] = [
  'keyword_analysis',
  'today_recommendation',
  'wing_catalog',
  'manual',
];

export class UpsertSourcingInterestTargetDto {
  @IsIn(TARGET_TYPES)
  targetType!: SourcingInterestTargetType;

  @IsIn(TARGET_SOURCES)
  source!: SourcingInterestTargetSource;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  itemId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorItemId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  productName?: string;
}
