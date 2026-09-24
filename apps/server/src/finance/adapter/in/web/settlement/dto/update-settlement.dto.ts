import { IsString, IsOptional, IsInt, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSettlementDto {
  /**
   * The deposited amount. Omit it to keep the stored amount; `null` is not an
   * amount and answers 400 instead of reaching the non-null column.
   */
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  actualAmount?: number;

  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() notes?: string;
}
