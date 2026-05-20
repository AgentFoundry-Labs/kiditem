import { IsOptional, IsString, IsUUID } from 'class-validator';

export class SelectPreparationThumbnailDto {
  @IsString()
  selectedThumbnailUrl!: string;

  @IsOptional()
  @IsUUID()
  selectedThumbnailGenerationCandidateId?: string | null;
}
