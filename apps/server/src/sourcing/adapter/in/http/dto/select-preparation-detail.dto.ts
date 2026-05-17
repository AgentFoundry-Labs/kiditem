import { IsOptional, IsString, IsUUID } from 'class-validator';

export class SelectPreparationDetailDto {
  @IsUUID()
  selectedDetailPageGenerationId!: string;

  @IsOptional()
  @IsUUID()
  selectedDetailPageArtifactId?: string | null;

  @IsOptional()
  @IsString()
  selectedDetailPageRevisionId?: string | null;
}
