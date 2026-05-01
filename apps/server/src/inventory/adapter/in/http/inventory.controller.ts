import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  INVENTORY_PORT,
  type InventoryPort,
} from '../../../application/port/in/inventory.port';
import {
  ListInventoryQueryDto,
  UpdateInventoryMetadataDto,
  ReceiveStockDto,
  IssueStockDto,
  AdjustStockDto,
  ListTransactionsQueryDto,
  TransactionSummaryQueryDto,
} from './dto';

@Controller('inventory')
export class InventoryController {
  constructor(
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
  ) {}

  @Get()
  list(@CurrentOrganization() organizationId: string, @Query() query: ListInventoryQueryDto) {
    return this.inventory.list(query, organizationId);
  }

  @Get('transactions')
  listTransactions(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.inventory.listTransactions(query, organizationId);
  }

  @Get('transactions/summary')
  transactionSummary(
    @CurrentOrganization() organizationId: string,
    @Query() query: TransactionSummaryQueryDto,
  ) {
    return this.inventory.getTransactionSummary(query, organizationId);
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
