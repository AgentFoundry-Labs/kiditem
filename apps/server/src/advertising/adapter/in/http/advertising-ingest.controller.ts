import { Controller, Get } from '@nestjs/common';
import { AdvertisingExtensionService } from '../../../application/service/advertising-extension.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

@Controller('ads')
export class AdvertisingIngestController {
  constructor(
    private readonly extensionService: AdvertisingExtensionService,
  ) {}

  @Get('extension/status')
  extensionStatus(@CurrentOrganization() organizationId: string) {
    return this.extensionService.getExtensionStatus(organizationId);
  }
}
