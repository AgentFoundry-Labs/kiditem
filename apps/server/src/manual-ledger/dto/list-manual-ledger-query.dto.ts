import { IsString, IsOptional, IsIn } from 'class-validator';

export class ListManualLedgerQueryDto {
  @IsString() @IsOptional() companyId?: string;
  @IsIn(['income', 'expense']) @IsOptional() type?: string;
  @IsString() @IsOptional() period?: string; // YYYY-MM
}
