import { IsString, IsInt, IsOptional, IsUUID, IsIn, MinLength, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateManualLedgerDto {
  @IsUUID() companyId: string;
  @IsDateString() date: string;
  @IsIn(['income', 'expense']) type: string;
  @IsString() @MinLength(1) category: string;
  @IsString() @IsOptional() counterpart?: string;
  @IsString() @IsOptional() description?: string;
  @Type(() => Number) @IsInt() amount: number;
  @Type(() => Number) @IsInt() @IsOptional() tax?: number;
}
