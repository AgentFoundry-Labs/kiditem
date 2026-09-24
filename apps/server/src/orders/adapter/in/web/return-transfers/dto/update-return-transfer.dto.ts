import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class UpdateReturnTransferDto {
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() condition?: string;
  @IsInt() @Min(0) @IsOptional() restockedQty?: number;
  @IsInt() @Min(0) @IsOptional() disposedQty?: number;
  @IsString() @IsOptional() processedBy?: string;
}
