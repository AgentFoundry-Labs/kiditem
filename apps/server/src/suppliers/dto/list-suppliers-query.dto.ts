import { IsString, IsOptional } from 'class-validator';

export class ListSuppliersQueryDto {
  @IsString() @IsOptional() companyId?: string;
}
