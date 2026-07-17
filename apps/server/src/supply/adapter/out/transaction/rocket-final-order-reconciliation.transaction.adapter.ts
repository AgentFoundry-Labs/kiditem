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
  ): Promise<{ reconciledRows: number }> {
    const tx = transactionClient(input.transaction);
    const lines = [...input.lines].sort((left, right) =>
      left.poNumber.localeCompare(right.poNumber)
      || left.productNo.localeCompare(right.productNo)
      || left.finalOrderLineId.localeCompare(right.finalOrderLineId));

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
        throw new AppException(
          409,
          'ROCKET_REQUEST_COMMITMENT_NOT_FOUND',
          'An active Rocket request commitment was not found for the final order.',
        );
      }
      if (matches.length > 1) {
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
    }
    return { reconciledRows: lines.length };
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
