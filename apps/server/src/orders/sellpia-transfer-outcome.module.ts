import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SellpiaTransferOutcomePersistenceAdapter } from './adapter/out/persistence/sellpia-transfer-outcome.persistence.adapter';
import { SELLPIA_TRANSFER_OUTCOME_PORT } from './application/port/in/capability/sellpia-transfer-outcome.port';

/**
 * Orders의 셀피아 전송 결과 capability(KID-388). Inventory 로켓 워크북 진행이 읽는다 — OrdersModule은 SupplyModule을,
 * SupplyModule은 InventoryModule을 들이므로 Inventory가 OrdersModule 전체를 들이면 순환이 된다. 그래서 따로 둔다.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    SellpiaTransferOutcomePersistenceAdapter,
    { provide: SELLPIA_TRANSFER_OUTCOME_PORT, useExisting: SellpiaTransferOutcomePersistenceAdapter },
  ],
  exports: [SELLPIA_TRANSFER_OUTCOME_PORT],
})
export class SellpiaTransferOutcomeModule {}
