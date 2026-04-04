import { IsOptional, IsString } from 'class-validator';

export class ListReturnTransfersQueryDto {
  @IsString() @IsOptional() companyId?: string;
  @IsString() @IsOptional() status?: string;
}
