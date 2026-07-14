import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// Wing 카탈로그 28일 지표(스냅샷 값). body(JSON) 이라 이미 number/null 이므로 @Type 불필요.
// nullable 필드는 @IsOptional 로 null/undefined 통과.
class WingSnapshotMetricsDto {
  @IsOptional()
  @IsNumber()
  salePriceKrw?: number | null;

  @IsOptional()
  @IsNumber()
  ratingCount?: number | null;

  @IsOptional()
  @IsNumber()
  ratingAverage?: number | null;

  @IsOptional()
  @IsNumber()
  pvLast28Day?: number | null;

  @IsOptional()
  @IsNumber()
  salesLast28d?: number | null;

  @IsOptional()
  @IsNumber()
  estimatedRevenue28d?: number | null;

  @IsOptional()
  @IsNumber()
  conversionRate28d?: number | null;
}

export class AddWingTrackedProductDto extends WingSnapshotMetricsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  productId: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  itemId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vendorItemId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  productName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imagePath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  brandName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  categoryHierarchy?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceKeyword?: string | null;
}

export class IngestWingSnapshotItemDto extends WingSnapshotMetricsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  productId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceKeyword?: string | null;
}

export class IngestWingSnapshotsDto {
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => IngestWingSnapshotItemDto)
  items: IngestWingSnapshotItemDto[];
}

export class WingTrackedHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  days?: number;
}
