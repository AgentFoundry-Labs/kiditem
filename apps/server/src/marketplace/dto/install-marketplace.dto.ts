import { IsOptional, IsUUID, IsObject } from 'class-validator';

export class InstallMarketplaceBodyDto {
  @IsUUID() @IsOptional() companyId?: string;
  @IsObject() @IsOptional() params?: Record<string, any>;
}
