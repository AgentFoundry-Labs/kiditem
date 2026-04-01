import { IsOptional, IsString, IsArray } from 'class-validator';

export class TriggerContentDraftBodyDto {
  @IsString() @IsOptional() seed_hook_text?: string;
  @IsString() @IsOptional() seed_hook_title_sub?: string;
  @IsString() @IsOptional() seed_hero_image?: string;
  @IsArray() @IsString({ each: true }) @IsOptional() color_image_urls?: string[];
}
