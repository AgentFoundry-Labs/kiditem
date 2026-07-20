import { IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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
  @IsISO8601()
  createdSince?: string;

  @IsOptional()
  @IsIn(CHANNEL_LISTING_TABS)
  tab?: (typeof CHANNEL_LISTING_TABS)[number];
}

/**
 * 삭제 게이트 입력. 비밀번호 외에 아무것도 받지 않는다 —
 * 대상 판정에 쓰이는 값은 전부 서버가 DB 에서 읽는다.
 */
export class ChannelListingDeletionDto {
  @IsString()
  @MaxLength(128)
  password!: string;

  @IsUUID()
  idempotencyKey!: string;
}

export class ChannelListingDeletionCompletionDto {
  @IsUUID()
  operationId!: string;

}

export class ChannelListingDeletionUnresolvedDto {
  @IsUUID()
  operationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  reason!: string;
}
