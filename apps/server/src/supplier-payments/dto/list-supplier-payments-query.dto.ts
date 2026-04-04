import { IsString, IsOptional } from 'class-validator';

export class ListSupplierPaymentsQueryDto {
  @IsString() @IsOptional() companyId?: string;
  @IsString() @IsOptional() status?: string;
}
