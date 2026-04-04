import { IsString, IsOptional } from 'class-validator';

export class ListSalesPlansQueryDto {
  @IsString() @IsOptional() companyId?: string;
}
