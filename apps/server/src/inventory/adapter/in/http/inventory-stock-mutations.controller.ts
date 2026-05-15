import { Body, Controller, Inject, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  INVENTORY_PORT,
  type InventoryPort,
} from '../../../application/port/in/inventory.port';
import {
  AdjustStockDto,
  IssueStockDto,
  ReceiveStockDto,
} from './dto';

@Controller('inventory')
export class InventoryStockMutationsController {
  constructor(
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
  ) {}

  @Post(':id/receive')
  receive(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReceiveStockDto,
  ) {
    return this.inventory.receive(id, dto, organizationId, user.id);
  }

  @Post(':id/issue')
  issue(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: IssueStockDto,
  ) {
    return this.inventory.issue(id, dto, organizationId, user.id);
  }

  @Post(':id/adjust')
  adjust(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventory.adjust(id, dto, organizationId, user.id);
  }
}
