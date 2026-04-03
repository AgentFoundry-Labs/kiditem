import { IsOptional, IsString, IsIn, IsArray, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AdActionQueryDto {
  @IsOptional()
  @IsString()
  approvalStatus?: string;

  @IsOptional()
  @IsString()
  executeStatus?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AdActionCommandDto {
  @IsString()
  @IsIn(['generate', 'approve', 'reject', 'markRunning', 'markDone', 'markFailed', 'resetFailed'])
  action: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  beforeJson?: Record<string, unknown>;

  @IsOptional()
  afterJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
