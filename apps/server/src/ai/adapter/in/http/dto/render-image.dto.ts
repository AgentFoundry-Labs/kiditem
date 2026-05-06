import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class RenderImageBodyDto {
  @IsString() @MinLength(1) html: string;

  @IsOptional()
  @IsIn(['png', 'jpeg'])
  format?: 'png' | 'jpeg';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quality?: number;
}
