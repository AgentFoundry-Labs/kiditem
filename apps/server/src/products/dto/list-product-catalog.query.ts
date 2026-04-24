import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListProductCatalogQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number = 20;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsIn(['A', 'B', 'C'])
  grade?: 'A' | 'B' | 'C';

  @IsOptional() @IsString()
  pipelineStep?: string;

  @IsOptional() @IsString()
  status?: string;
}
