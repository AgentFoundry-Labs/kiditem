import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Per-option payload for `POST /api/sourcing/candidates/:id/promote`.
 *
 * Required fields are intentionally minimal — operator-supplied option name is
 * required; legacyCode/barcode are optional and only enforced for downstream
 * uniqueness by products-domain partial indexes. Pricing fields land on the
 * product-option row when present so the post-promotion AI run sees realistic
 * sell/cost values.
 */
class PromoteOptionDto {
  @IsString() @IsNotEmpty() optionName!: string;

  @IsOptional() @IsString() legacyCode?: string;

  @IsOptional() @IsString() barcode?: string;
}

/**
 * Body DTO for `POST /api/sourcing/candidates/:id/promote`.
 *
 * Per apps/server/AGENTS.md global HTTP rules, `organizationId` is NEVER
 * accepted in the body — it comes from `@CurrentOrganization()`.
 *
 * `skipPostPromotionHooks` is a hidden ops escape hatch: when true, the
 * promote use-case commits the master/options/images and updates the
 * candidate row but does not fire the `notifyPromoted` AI hook. Default is
 * false.
 */
export class PromoteCandidateBodyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromoteOptionDto)
  options!: PromoteOptionDto[];

  @IsOptional() @IsString() @MaxLength(4000)
  selectedThumbnailUrl?: string;

  @IsOptional() @IsUUID()
  selectedThumbnailGenerationCandidateId?: string;

  @IsOptional() @IsUUID()
  selectedDetailPageGenerationId?: string;

  @IsOptional() @IsUUID()
  selectedDetailPageArtifactId?: string;

  @IsOptional() @IsUUID()
  selectedDetailPageRevisionId?: string;

  @IsOptional() @IsBoolean()
  skipPostPromotionHooks?: boolean;
}
