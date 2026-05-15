import { Controller, Get, Inject } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  INVENTORY_PORT,
  type InventoryPort,
} from '../../../application/port/in/inventory.port';

@Controller('inventory')
export class InventoryAssetsController {
  constructor(
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
  ) {}

  @Get('assets')
  getAssetReport(@CurrentOrganization() organizationId: string) {
    return this.inventory.getAssetReport(organizationId);
  }
}
