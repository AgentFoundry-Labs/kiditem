import { IsOptional, IsString } from 'class-validator';

export class ProfitLossQueryDto {
  @IsString() @IsOptional() period?: string;
}
