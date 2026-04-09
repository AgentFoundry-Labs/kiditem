import { IsOptional, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class ListGenerationsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}
