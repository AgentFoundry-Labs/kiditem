import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSellpiaReceiptBatchDto {
  @IsString() @MaxLength(50) sourceType!: string;
  @IsString() @MaxLength(200) sourceRef!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class MarkSellpiaReceiptBatchUploadedDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
