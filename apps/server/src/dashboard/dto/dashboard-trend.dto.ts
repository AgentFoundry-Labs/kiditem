import { IsString, IsOptional } from 'class-validator';

export class DashboardTrendQueryDto {
  @IsString() @IsOptional() range: string = '30d';
}
