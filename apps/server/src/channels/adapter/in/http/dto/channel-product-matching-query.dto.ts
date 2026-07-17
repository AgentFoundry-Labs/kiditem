import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ChannelProductMatchingQueryDto {
  @IsOptional()
  @IsUUID()
  channelAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class ChannelMatchCandidateQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
