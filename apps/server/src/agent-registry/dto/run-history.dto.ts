import { IsOptional, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class RunHistoryQueryDto {
  @Type(() => Number) @IsInt() @IsPositive() @IsOptional()
  limit?: number;
}
