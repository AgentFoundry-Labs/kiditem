import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { InventoryApplicationService } from '../../../application/service/inventory-application.service';
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
  constructor(private readonly inventory: InventoryApplicationService) {}

  @Get()
  list(@CurrentCompany() companyId: string, @Query() query: ListInventoryQueryDto) {
    return this.inventory.list(query, companyId);
  }

  @Get('transactions')
  listTransactions(
    @CurrentCompany() companyId: string,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.inventory.listTransactions(query, companyId);
  }

  @Get('transactions/summary')
  transactionSummary(
    @CurrentCompany() companyId: string,
    @Query() query: TransactionSummaryQueryDto,
  ) {
    return this.inventory.getTransactionSummary(query, companyId);
  }

  @Get('option/:optionId')
  findByOptionId(
    @CurrentCompany() companyId: string,
    @Param('optionId') optionId: string,
  ) {
    return this.inventory.findByOptionId(optionId, companyId);
  }

  @Get(':id')
  findById(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.inventory.findById(id, companyId);
  }

  @Patch(':id')
  updateMetadata(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryMetadataDto,
  ) {
    return this.inventory.updateMetadata(id, dto, companyId);
  }

  @Post(':id/receive')
  receive(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReceiveStockDto,
  ) {
    return this.inventory.receive(id, dto, companyId, user.id);
  }

  @Post(':id/issue')
  issue(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: IssueStockDto,
  ) {
    return this.inventory.issue(id, dto, companyId, user.id);
  }

  @Post(':id/adjust')
  adjust(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventory.adjust(id, dto, companyId, user.id);
  }
}
