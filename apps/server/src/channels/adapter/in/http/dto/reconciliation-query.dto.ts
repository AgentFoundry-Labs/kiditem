import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto';

const STATUSES = ['linked', 'needs_review', 'conflict', 'ignored', 'stale', 'all'] as const;
type StatusFilter = (typeof STATUSES)[number];

export class CoupangReconciliationListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: StatusFilter;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
