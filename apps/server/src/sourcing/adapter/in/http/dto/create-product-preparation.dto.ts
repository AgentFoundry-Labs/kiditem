import { Transform } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProductPreparationDto {
  @IsUUID()
  channelAccountId!: string;

  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @MinLength(1)
  @MaxLength(500)
  displayName!: string;

  @IsObject()
  registrationInput!: Record<string, unknown>;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  selectedThumbnailUrl?: string | null;

  @IsOptional()
  @IsUUID()
  selectedThumbnailGenerationId?: string | null;

  @IsOptional()
  @IsUUID()
  selectedThumbnailGenerationCandidateId?: string | null;

  @IsOptional()
  @IsUUID()
  selectedDetailPageArtifactId?: string | null;

  @IsOptional()
  @IsUUID()
  selectedDetailPageRevisionId?: string | null;

  @IsOptional()
  @IsUUID()
  selectedDetailPageGenerationId?: string | null;
}
