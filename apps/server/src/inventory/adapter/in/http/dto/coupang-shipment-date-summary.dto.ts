import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CoupangShipmentDateSummaryItemDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsInt() @Min(0) @Max(1_000_000) count!: number;

  @IsInt() @Min(0) @Max(1_000_000) boxes!: number;
}

export class SaveCoupangShipmentDateSummaryDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CoupangShipmentDateSummaryItemDto)
  items!: CoupangShipmentDateSummaryItemDto[];
}
