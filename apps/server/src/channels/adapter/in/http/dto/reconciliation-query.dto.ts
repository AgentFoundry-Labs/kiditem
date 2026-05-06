import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto';

const STATUSES = ['linked', 'needs_review', 'conflict', 'ignored', 'stale', 'all'] as const;
type StatusFilter = (typeof STATUSES)[number];
const RESOLUTION_SOURCES = [
  'existing_external_id',
  'auto_legacy_code',
  'manual',
  'ignored',
] as const;
type ResolutionSourceFilter = (typeof RESOLUTION_SOURCES)[number];

export class CoupangReconciliationListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: StatusFilter;

  @IsOptional()
  @IsIn(RESOLUTION_SOURCES)
  resolutionSource?: ResolutionSourceFilter;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
