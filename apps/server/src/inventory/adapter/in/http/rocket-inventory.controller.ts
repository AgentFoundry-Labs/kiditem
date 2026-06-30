import { Body, Controller, Inject, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  INVENTORY_PORT,
  type InventoryPort,
} from '../../../application/port/in/stock/inventory.port';
import { RocketInventoryEventDto } from './dto';

@Controller('inventory/rocket')
export class RocketInventoryController {
  constructor(
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
  ) {}

  @Post('events')
  applyEvent(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RocketInventoryEventDto,
  ) {
    return this.inventory.applyRocketInventoryEvent({
      organizationId,
      userId: user.id,
      ...dto,
    });
  }
}
