import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto';

const MAPPING_STATUSES = ['all', 'unmatched', 'needs_review', 'matched'] as const;

export class ChannelSkuMappingQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  channelAccountId?: string;

  @IsOptional()
  @IsIn(MAPPING_STATUSES)
  mappingStatus?: (typeof MAPPING_STATUSES)[number] = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class ChannelSkuCandidateQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100)
  limit?: number = 50;
}
