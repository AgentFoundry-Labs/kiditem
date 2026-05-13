import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ListContentArchiveQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(['detail_page', 'image'])
  contentType?: 'detail_page' | 'image';

  @IsOptional()
  @IsIn(['linked', 'unlinked'])
  linkState?: 'linked' | 'unlinked';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  status?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  sourceCandidateId?: string;
}

export class AttachContentGroupToProductDto {
  @IsUUID()
  productId!: string;
}
