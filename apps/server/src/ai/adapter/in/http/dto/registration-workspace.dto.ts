import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

const PRODUCT_TITLE_MESSAGE = '상품명은 한글, 영문, 숫자, 공백만 사용할 수 있습니다.';
const PRODUCT_TITLE_PATTERN = /^(?=.*[\p{L}\p{N}])[\p{L}\p{N}\s]+$/u;

export class ListRegistrationWorkspacesQueryDto {
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
  @IsString()
  @MaxLength(60)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;
}

export class DuplicateRegistrationWorkspaceQueryDto {
  @IsString()
  @MaxLength(160)
  @Matches(PRODUCT_TITLE_PATTERN, { message: PRODUCT_TITLE_MESSAGE })
  title!: string;
}

export class CreateRegistrationWorkspaceDto {
  @IsString()
  @MaxLength(160)
  @Matches(PRODUCT_TITLE_PATTERN, { message: PRODUCT_TITLE_MESSAGE })
  title!: string;

  @IsOptional()
  @IsUUID()
  sourceCandidateId?: string;

  @IsOptional()
  @IsUUID()
  targetMasterId?: string;
}

export class RegistrationWorkspaceIdParamDto {
  @IsUUID()
  workspaceId!: string;
}
