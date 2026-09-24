import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ProfitLossQueryDto } from '../../profit-loss/dto/profit-loss-query.dto';

export const PROFIT_LOSS_FILTERS = ['all', 'minus', 'low', 'normal'] as const;
export type ProfitLossFilter = (typeof PROFIT_LOSS_FILTERS)[number];

export const PROFIT_LOSS_SORT_FIELDS = [
  'revenue',
  'cogs',
  'commission',
  'shippingCost',
  'adCost',
  'otherCost',
  'netProfit',
  'profitRate',
] as const;
export type ProfitLossSortField = (typeof PROFIT_LOSS_SORT_FIELDS)[number];

/** The page's fixed filter/sort vocabulary, not an arbitrary report query. */
export class ProfitLossExportQueryDto extends ProfitLossQueryDto {
  @IsOptional()
  @IsIn(PROFIT_LOSS_FILTERS)
  profitFilter?: ProfitLossFilter;

  @IsOptional()
  @IsString()
  @Matches(/^(?:A|B|C)(?:,(?:A|B|C))*$/, {
    message: 'grades must be a comma-separated list of A, B, or C',
  })
  grades?: string;

  @IsOptional()
  @IsIn(PROFIT_LOSS_SORT_FIELDS)
  sortField?: ProfitLossSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';
}
