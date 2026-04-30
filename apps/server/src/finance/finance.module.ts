import { Module } from '@nestjs/common';
import { ProfitLossController } from './controllers/profit-loss.controller';
import { ProfitLossService } from './services/profit-loss.service';
import { SalesAnalysisController } from './controllers/sales-analysis.controller';
import { SalesAnalysisService } from './services/sales-analysis.service';
import { ManualLedgerController } from './manual-ledger/manual-ledger.controller';
import { ManualLedgerService } from './manual-ledger/manual-ledger.service';
import { ProcessingCostsController } from './processing-costs/processing-costs.controller';
import { ProcessingCostsService } from './processing-costs/processing-costs.service';
import { SupplierPaymentsController } from './supplier-payments/supplier-payments.controller';
import { SupplierPaymentsService } from './supplier-payments/supplier-payments.service';
import { SalesPlansController } from './sales-plans/sales-plans.controller';
import { SalesPlansService } from './sales-plans/sales-plans.service';
import { SettlementsController } from './settlements/settlements.controller';
import { SettlementsService } from './settlements/settlements.service';

@Module({
  controllers: [
    ProfitLossController,
    SalesAnalysisController,
    ManualLedgerController,
    ProcessingCostsController,
    SupplierPaymentsController,
    SalesPlansController,
    SettlementsController,
  ],
  providers: [
    ProfitLossService,
    SalesAnalysisService,
    ManualLedgerService,
    ProcessingCostsService,
    SupplierPaymentsService,
    SalesPlansService,
    SettlementsService,
  ],
})
export class FinanceModule {}
