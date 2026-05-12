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

  // Phase 5 (#192): API surface for master lifecycle. Replaces the legacy
  // `pipelineStep` query param and its `status` alias — both are gone.
  // Allowed values mirror @kiditem/shared/product PRODUCT_LIFECYCLE_STATES.
  @IsOptional() @IsIn(['active', 'paused', 'discontinued'])
  lifecycleState?: 'active' | 'paused' | 'discontinued';
}
