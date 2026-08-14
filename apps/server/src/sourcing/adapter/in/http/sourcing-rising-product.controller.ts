import { Controller, Get } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SourcingRisingProductService } from '../../../application/service/sourcing-rising-product.service';

@Controller('sourcing/rising-products')
export class SourcingRisingProductController {
  constructor(private readonly rising: SourcingRisingProductService) {}

  @Get()
  latest(@CurrentOrganization() organizationId: string) {
    return this.rising.getLatest(organizationId);
  }
}
