import { Body, Controller, Get, Inject, Param, Patch, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  INVENTORY_PORT,
  type InventoryPort,
} from '../../../application/port/in/stock/inventory.port';
import {
  ListInventoryQueryDto,
  UpdateInventoryMetadataDto,
} from './dto';

@Controller('inventory')
export class InventoryItemsController {
  constructor(
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
  ) {}

  @Get()
  list(@CurrentOrganization() organizationId: string, @Query() query: ListInventoryQueryDto) {
    return this.inventory.list(query, organizationId);
  }

  @Get('option/:optionId')
  findByOptionId(
    @CurrentOrganization() organizationId: string,
    @Param('optionId') optionId: string,
  ) {
    return this.inventory.findByOptionId(optionId, organizationId);
  }

  @Get(':id')
  findById(@CurrentOrganization() organizationId: string, @Param('id') id: string) {
    return this.inventory.findById(id, organizationId);
  }

  @Patch(':id')
  updateMetadata(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryMetadataDto,
  ) {
    return this.inventory.updateMetadata(id, dto, organizationId);
  }
}
