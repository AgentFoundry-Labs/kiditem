import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '@kiditem/shared/server-errors';
import {
  INVENTORY_COMMITMENT_PORT,
  type InventoryCommitmentPort,
} from '../../../../inventory/application/port/in/stock/inventory-commitment.port';
import type {
  RocketFinalOrderReconciliationTransactionPort,
} from '../../../application/port/out/transaction/rocket-final-order-reconciliation.transaction.port';

@Injectable()
export class RocketFinalOrderReconciliationTransactionAdapter
implements RocketFinalOrderReconciliationTransactionPort {
  constructor(
    @Inject(INVENTORY_COMMITMENT_PORT)
    private readonly inventoryCommitments: InventoryCommitmentPort,
  ) {}

  async reconcile(
    input: Parameters<RocketFinalOrderReconciliationTransactionPort['reconcile']>[0],
  ): Promise<{
    reconciledRows: number;
    skippedLines: Array<{ poNumber: string; productNo: string }>;
  }> {
    const tx = transactionClient(input.transaction);
    const lines = [...input.lines].sort((left, right) =>
      left.poNumber.localeCompare(right.poNumber)
      || left.productNo.localeCompare(right.productNo)
      || left.finalOrderLineId.localeCompare(right.finalOrderLineId));

    let reconciledRows = 0;
    const skippedLines: Array<{ poNumber: string; productNo: string }> = [];
    for (const line of lines) {
      const matches = await tx.rocketPurchaseConfirmationLine.findMany({
        where: {
          organizationId: input.organizationId,
          poNumber: line.poNumber,
          productNo: line.productNo,
          confirmedQuantity: { gt: 0 },
          confirmation: {
            channelAccountId: input.channelAccountId,
            status: 'active',
          },
        },
        select: { id: true, barcode: true },
        orderBy: { id: 'asc' },
        take: 2,
      });
      if (matches.length === 0) {
        // 활성 발주확정이 없는 라인은 하드 에러로 배치 전체를 막지 않고 스킵한다.
        // 조용히 버리지 말고 식별자를 모아 호출자가 사용자에게 "발주확정 없어 제외" 로 알리게 한다.
        skippedLines.push({ poNumber: line.poNumber, productNo: line.productNo });
        continue;
      }
      if (matches.length > 1) {
        // 2건 이상 매칭은 진짜 데이터 무결성 오류다 — 스킵하지 않고 그대로 중단한다.
        throw new AppException(
          409,
          'ROCKET_FINAL_ORDER_AMBIGUOUS',
          'More than one Rocket request matched the final order line.',
        );
      }
      const requestBarcode = matches[0]!.barcode?.trim() || null;
      const finalBarcode = line.barcode?.trim() || null;
      if (requestBarcode && finalBarcode && requestBarcode !== finalBarcode) {
        throw new AppException(
          409,
          'ROCKET_FINAL_ORDER_BARCODE_MISMATCH',
          'The final Rocket order barcode differs from the confirmed request.',
        );
      }
      await this.inventoryCommitments.replaceRocketRequestWithFinalOrder({
        transaction: tx,
        organizationId: input.organizationId,
        userId: input.userId,
        finalOrderLineId: line.finalOrderLineId,
        channelAccountId: input.channelAccountId,
        poNumber: line.poNumber,
        productNo: line.productNo,
        unitQuantity: line.unitQuantity,
        barcode: finalBarcode,
      });
      reconciledRows += 1;
    }
    return { reconciledRows, skippedLines };
  }
}

function transactionClient(value: unknown): Prisma.TransactionClient {
  if (
    typeof value !== 'object'
    || value === null
    || !('rocketPurchaseConfirmationLine' in value)
  ) {
    throw new TypeError('A Prisma transaction client is required');
  }
  return value as Prisma.TransactionClient;
}
