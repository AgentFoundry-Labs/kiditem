import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const PRODUCT_TITLE_MESSAGE = '상품명은 한글, 영문, 숫자, 공백만 사용할 수 있습니다.';
const PRODUCT_TITLE_PATTERN = /^(?=.*[\p{L}\p{N}])[\p{L}\p{N}\s]+$/u;

export class ListContentWorkspacesQueryDto {
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

export class DuplicateContentWorkspaceQueryDto {
  @IsString()
  @MaxLength(160)
  @Matches(PRODUCT_TITLE_PATTERN, { message: PRODUCT_TITLE_MESSAGE })
  title!: string;
}

export class CreateContentWorkspaceDto {
  @IsString()
  @MaxLength(160)
  @Matches(PRODUCT_TITLE_PATTERN, { message: PRODUCT_TITLE_MESSAGE })
  title!: string;

  @IsOptional()
  @IsUUID()
  sourceCandidateId?: string;

}

export class SelectContentWorkspaceDetailPageDto {
  @IsUUID()
  contentGenerationId!: string;
}

@ValidatorConstraint({ name: 'exactlyOneWorkspaceThumbnailSource', async: false })
class ExactlyOneWorkspaceThumbnailSourceConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: unknown, args: ValidationArguments): boolean {
    const value = args.object as SelectContentWorkspaceThumbnailDto;
    const asset = Boolean(value.contentAssetId);
    const external = Boolean(value.externalUrl);
    const anyGeneration = Boolean(
      value.sourceThumbnailGenerationId || value.sourceThumbnailCandidateId,
    );
    const completeGeneration = Boolean(
      value.sourceThumbnailGenerationId && value.sourceThumbnailCandidateId,
    );
    return Number(asset) + Number(external) + Number(anyGeneration) === 1 &&
      (!anyGeneration || completeGeneration);
  }

  defaultMessage(): string {
    return 'Select exactly one thumbnail source; generation and candidate IDs are required together.';
  }
}

export class SelectContentWorkspaceThumbnailDto {
  @IsOptional()
  @IsUUID()
  contentAssetId?: string;

  @IsOptional()
  @IsUUID()
  sourceThumbnailGenerationId?: string;

  @IsOptional()
  @IsUUID()
  sourceThumbnailCandidateId?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  externalUrl?: string;

  @Validate(ExactlyOneWorkspaceThumbnailSourceConstraint)
  private readonly exactlyOneSource?: never;
}

export class ReplaceContentWorkspaceThumbnailGalleryDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }, { each: true })
  thumbnailUrls!: string[];
}

export class ContentWorkspaceIdParamDto {
  @IsUUID()
  workspaceId!: string;
}
