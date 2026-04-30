import { IsInt, Min, IsOptional, IsUUID, IsString, MaxLength } from 'class-validator';

export class IssueStockDto {
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(100) relatedId?: string;
  @IsOptional() @IsString() @MaxLength(50) relatedType?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
