import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  MaxLength,
} from "class-validator";

export class CoupangShipmentDateSummaryItemDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date must be YYYY-MM-DD" })
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

export class BeginShipmentSummaryDto {
  @IsOptional() @Type(() => Number) @IsNumber() maxPages?: number;
}
class ShipmentSummaryProofDto {
  @IsNumber() maxPages!: number;
  @IsBoolean() validatedTable!: boolean;
  @IsIn(["empty_page", "short_page", "max_pages"]) stopReason!:
    "empty_page" | "short_page" | "max_pages";
  @IsInt() @Min(0) lastPageRowCount!: number;
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  pageRowCounts!: number[];
}
export class SubmitShipmentSummaryDto extends SaveCoupangShipmentDateSummaryDto {
  @IsInt() @Min(1) scannedPages!: number;
  @IsInt() @Min(0) totalRows!: number;
  @ValidateNested()
  @Type(() => ShipmentSummaryProofDto)
  proof!: ShipmentSummaryProofDto;
}
export class FailShipmentSummaryDto {
  @IsString() @MaxLength(100) code!: string;
  @IsString() @MaxLength(300) message!: string;
}
