import { IsString, IsUrl, IsOptional } from 'class-validator';

export class ImageEditBodyDto {
  @IsUrl() image_url: string;
  @IsString() preset: string;
  @IsString() @IsOptional() user_prompt?: string;
}
