import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto';

const CHANNEL_LISTING_SORTS = ['newest', 'oldest', 'name_asc'] as const;
const CHANNEL_LISTING_TABS = ['registered', 'deleted'] as const;

export class ChannelListingQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(CHANNEL_LISTING_SORTS)
  sort?: (typeof CHANNEL_LISTING_SORTS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  channel?: string;

  @IsOptional()
  @IsUUID()
  channelAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(CHANNEL_LISTING_TABS)
  tab?: (typeof CHANNEL_LISTING_TABS)[number];
}
