import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '@kiditem/shared/server-errors';
import type {
  RocketFinalOrderReconciliationTransactionPort,
} from '../../../application/port/out/transaction/rocket-final-order-reconciliation.transaction.port';

const NONTERMINAL_WORKBOOK_STATUSES = [
  'awaiting_coupang_confirmation',
  'orders_collected',
  'sellpia_transmitting',
  'awaiting_inventory_sync',
];

@Injectable()
export class RocketFinalOrderReconciliationTransactionAdapter
implements RocketFinalOrderReconciliationTransactionPort {
  async reconcile(
    input: Parameters<RocketFinalOrderReconciliationTransactionPort['reconcile']>[0],
  ) {
    const tx = transactionClient(input.transaction);
    const activeExports = await tx.rocketPurchaseConfirmation.findMany({
      where: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        status: { in: NONTERMINAL_WORKBOOK_STATUSES },
      },
      select: { id: true },
      orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
      take: 2,
    });
    const activeExportIds = activeExports.map(({ id }) => id);
    const lines = [...input.lines].sort((left, right) =>
      left.poNumber.localeCompare(right.poNumber)
      || left.productNo.localeCompare(right.productNo)
      || left.finalOrderLineId.localeCompare(right.finalOrderLineId));

    let reconciledRows = 0;
    const matchedExportIds = new Set<string>();
    const skippedLines: Array<{ poNumber: string; productNo: string }> = [];
    for (const line of lines) {
      const matches = activeExportIds.length === 0 ? []
        : await tx.rocketPurchaseConfirmationLine.findMany({
          where: {
            organizationId: input.organizationId,
            confirmationId: { in: activeExportIds },
            poNumber: line.poNumber,
            productNo: line.productNo,
            confirmedQuantity: { gt: 0 },
          },
          select: {
            id: true,
            barcode: true,
            confirmationId: true,
            collectedOrderLineItemId: true,
          },
          orderBy: { id: 'asc' },
          take: 2,
        });
      if (matches.length === 0) {
        skippedLines.push({ poNumber: line.poNumber, productNo: line.productNo });
        continue;
      }
      if (matches.length > 1) {
        throw new AppException(
          409,
          'ROCKET_FINAL_ORDER_AMBIGUOUS',
          'More than one Rocket workbook line matched the collected order line.',
        );
      }
      const match = matches[0]!;
      const requestBarcode = match.barcode?.trim() || null;
      const finalBarcode = line.barcode?.trim() || null;
      if (requestBarcode && finalBarcode && requestBarcode !== finalBarcode) {
        throw new AppException(
          409,
          'ROCKET_FINAL_ORDER_BARCODE_MISMATCH',
          'The collected Rocket order barcode differs from the workbook export.',
        );
      }
      if (
        match.collectedOrderLineItemId
        && match.collectedOrderLineItemId !== line.finalOrderLineId
      ) {
        throw new AppException(
          409,
          'ROCKET_FINAL_ORDER_ALREADY_COLLECTED',
          'The Rocket workbook line is already linked to a different collected order line.',
        );
      }
      await tx.rocketPurchaseConfirmationLine.update({
        where: { id: match.id },
        data: {
          collectedOrderLineItemId: line.finalOrderLineId,
          collectedAt: match.collectedOrderLineItemId ? undefined : new Date(),
        },
      });
      matchedExportIds.add(match.confirmationId);
      reconciledRows += 1;
    }

    if (matchedExportIds.size > 1) {
      throw new AppException(
        409,
        'ROCKET_FINAL_ORDER_AMBIGUOUS',
        'Collected Rocket order lines matched more than one workbook export.',
      );
    }
    if (matchedExportIds.size === 0 && activeExports.length > 1) {
      throw new AppException(
        409,
        'ROCKET_WORKBOOK_ACTIVE_AMBIGUOUS',
        'More than one active Rocket workbook export was found.',
      );
    }

    const exportId = [...matchedExportIds][0] ?? activeExports[0]?.id ?? null;
    if (!exportId) {
      return {
        exportId: null,
        transmissionIntentKey: null,
        matchedLineCount: 0,
        reconciledRows: 0,
        skippedLines,
      };
    }

    const transmissionIntentKey = reconciledRows > 0
      ? `rocket-workbook:${exportId}:${input.transport.toLowerCase()}`
      : null;
    await tx.rocketPurchaseConfirmationTransmission.upsert({
      where: {
        confirmationId_transport: {
          confirmationId: exportId,
          transport: input.transport,
        },
      },
      create: {
        organizationId: input.organizationId,
        confirmationId: exportId,
        sourceImportRunId: input.sourceImportRunId,
        transport: input.transport,
        intentKey: transmissionIntentKey,
        matchedLineCount: reconciledRows,
      },
      update: transmissionIntentKey === null ? {
        sourceImportRunId: input.sourceImportRunId,
        observedAt: new Date(),
      } : {
        sourceImportRunId: input.sourceImportRunId,
        intentKey: transmissionIntentKey,
        matchedLineCount: reconciledRows,
        observedAt: new Date(),
      },
    });

    const remainingPositiveLines = await tx.rocketPurchaseConfirmationLine.count({
      where: {
        organizationId: input.organizationId,
        confirmationId: exportId,
        confirmedQuantity: { gt: 0 },
        collectedOrderLineItemId: null,
      },
    });
    if (remainingPositiveLines === 0) {
      await tx.rocketPurchaseConfirmation.updateMany({
        where: {
          id: exportId,
          organizationId: input.organizationId,
          status: 'awaiting_coupang_confirmation',
        },
        data: {
          status: 'orders_collected',
          ordersCollectedAt: new Date(),
        },
      });
    }

    return {
      exportId,
      transmissionIntentKey,
      matchedLineCount: reconciledRows,
      reconciledRows,
      skippedLines,
    };
  }
}

function transactionClient(value: unknown): Prisma.TransactionClient {
  if (
    typeof value !== 'object'
    || value === null
    || !('rocketPurchaseConfirmation' in value)
    || !('rocketPurchaseConfirmationLine' in value)
    || !('rocketPurchaseConfirmationTransmission' in value)
  ) {
    throw new TypeError('A Prisma transaction client is required');
  }
  return value as Prisma.TransactionClient;
}
