import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import type { RenderImageInput } from '../../../../application/service/detail-page-requests';

export class RenderImageBodyDto implements RenderImageInput {
  @IsString() @MinLength(1) html: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(320)
  @Max(1600)
  viewportWidth?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  renderScale?: number;

  @IsOptional()
  @IsInt()
  @Min(320)
  @Max(2400)
  outputWidth?: number;

  @IsOptional()
  @IsIn(['png', 'jpeg'])
  format?: 'png' | 'jpeg';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quality?: number;
}
