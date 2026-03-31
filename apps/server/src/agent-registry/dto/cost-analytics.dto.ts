import { IsOptional, IsUUID } from 'class-validator';
import { DateRangeQueryDto } from '../../common/dto';

export class CostAnalyticsQueryDto extends DateRangeQueryDto {
  @IsUUID() @IsOptional() agentId?: string;
}
