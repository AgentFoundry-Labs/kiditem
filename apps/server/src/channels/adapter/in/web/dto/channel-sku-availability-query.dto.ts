import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';
import type {
  ChannelSkuAvailabilityQuery,
  ChannelSkuAvailabilityStatus,
} from '@kiditem/shared/channel-sku-availability';

const AVAILABILITY_STATUSES: ChannelSkuAvailabilityStatus[] = [
  'all',
  'in_stock',
  'out_of_stock',
  'unmatched',
  'needs_review',
];

export class ChannelSkuAvailabilityQueryDto implements ChannelSkuAvailabilityQuery {
  @IsOptional()
  @IsUUID()
  channelAccountId?: string;

  @IsOptional()
  @IsIn(AVAILABILITY_STATUSES)
  status: ChannelSkuAvailabilityStatus = 'all';

  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsOptional()
  @IsBoolean()
  hasBottleneck?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  page = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100)
  limit = 50;
}
