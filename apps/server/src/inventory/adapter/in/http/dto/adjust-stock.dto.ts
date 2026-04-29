import { IsInt, NotEquals, IsString, MinLength, MaxLength } from 'class-validator';

export class AdjustStockDto {
  @IsInt() @NotEquals(0) delta!: number;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
