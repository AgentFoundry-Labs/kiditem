import { IsOptional, IsString } from 'class-validator';

export class ListStockTransfersQueryDto {
  @IsString() @IsOptional() companyId?: string;
  @IsString() @IsOptional() status?: string;
}
