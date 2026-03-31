import { IsUUID } from 'class-validator';

export class UninstallMarketplaceBodyDto {
  @IsUUID() companyId: string;
}
