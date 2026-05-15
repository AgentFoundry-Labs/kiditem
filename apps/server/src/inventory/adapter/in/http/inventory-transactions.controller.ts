import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  INVENTORY_PORT,
  type InventoryPort,
} from '../../../application/port/in/inventory.port';
import {
  ListTransactionsQueryDto,
  TransactionSummaryQueryDto,
} from './dto';

@Controller('inventory')
export class InventoryTransactionsController {
  constructor(
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
  ) {}

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
}
