import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListMarketplaceQueryDto {
  @IsUUID() @IsOptional() companyId?: string;
  @IsString() @IsOptional() module?: string;
  @IsString() @IsOptional() category?: string;
  @IsString() @IsOptional() role?: string;
}
