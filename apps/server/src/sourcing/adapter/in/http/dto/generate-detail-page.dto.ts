import { IsIn, IsOptional, IsString } from 'class-validator';

export class GenerateDetailPageBodyDto {
  @IsOptional()
  @IsString()
  @IsIn(['draft', 'image', 'full'])
  mode?: 'draft' | 'image' | 'full';

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  seed_hook_text?: string;

  @IsOptional()
  @IsString()
  seed_hook_title_sub?: string;

  @IsOptional()
  @IsString()
  seed_hero_image?: string;
}
