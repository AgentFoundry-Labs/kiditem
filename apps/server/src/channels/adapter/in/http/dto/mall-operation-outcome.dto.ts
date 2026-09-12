import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MALL_OPERATION_KINDS } from '@kiditem/shared/mall-operation-outcomes';

export class MallOperationOutcomeListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  mallKey?: string;

  @IsOptional()
  @IsIn([...MALL_OPERATION_KINDS])
  operation?: string;
}

export class MallOperationOutcomeSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}
