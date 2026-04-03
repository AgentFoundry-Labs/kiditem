import { IsString, IsOptional, IsInt, Min, Max, IsIn, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class LeaseDto {
  @IsString()
  workerKey: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  pageType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

export class HeartbeatDto {
  @IsString()
  workerKey: string;

  @IsOptional()
  @IsString()
  currentUrl?: string;

  @IsOptional()
  @IsString()
  currentPageType?: string;
}

class ExecutionLogEntry {
  @IsOptional()
  @IsString()
  level?: string;

  @IsString()
  step: string;

  @IsString()
  message: string;

  @IsOptional()
  payload?: Record<string, unknown>;
}

export class ReportDto {
  @IsString()
  taskId: string;

  @IsString()
  workerKey: string;

  @IsString()
  @IsIn(['running', 'done', 'failed'])
  status: 'running' | 'done' | 'failed';

  @IsOptional()
  before?: Record<string, unknown>;

  @IsOptional()
  after?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsString()
  screenshotPath?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExecutionLogEntry)
  logs?: ExecutionLogEntry[];
}
