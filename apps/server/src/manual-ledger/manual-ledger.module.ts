import { Module } from '@nestjs/common';
import { ManualLedgerController } from './manual-ledger.controller';
import { ManualLedgerService } from './manual-ledger.service';

@Module({
  controllers: [ManualLedgerController],
  providers: [ManualLedgerService],
})
export class ManualLedgerModule {}
