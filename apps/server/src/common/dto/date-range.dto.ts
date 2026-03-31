import { IsOptional, IsString } from 'class-validator';

export class DateRangeQueryDto {
  @IsString()
  @IsOptional()
  from?: string;

  @IsString()
  @IsOptional()
  to?: string;
}
