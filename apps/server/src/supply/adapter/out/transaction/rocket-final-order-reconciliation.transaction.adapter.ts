import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { KiditemConflictError } from '@kiditem/shared/errors';
import type { RocketFinalOrderReconciliationTransactionPort } from '../../../application/port/out/transaction/rocket-final-order-reconciliation.transaction.port';

@Injectable()
export class RocketFinalOrderReconciliationTransactionAdapter implements RocketFinalOrderReconciliationTransactionPort {
  async reconcile(
    input: Parameters<
      RocketFinalOrderReconciliationTransactionPort['reconcile']
    >[0],
  ) {
    const tx = transactionClient(input.transaction);
    const activeExports = await tx.rocketPurchaseConfirmation.findMany({
      where: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        completedAt: null,
        releasedAt: null,
      },
      select: { id: true },
      orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
      take: 2,
    });
    const activeExportIds = activeExports.map(({ id }) => id);
    const lines = [...input.lines].sort(
      (left, right) =>
        left.poNumber.localeCompare(right.poNumber) ||
        left.productNo.localeCompare(right.productNo) ||
        left.finalOrderLineId.localeCompare(right.finalOrderLineId),
    );

    let reconciledRows = 0;
    const matchedExportIds = new Set<string>();
    const unmatchedLines: Array<{ poNumber: string; productNo: string }> = [];
    for (const line of lines) {
      const matches =
        activeExportIds.length === 0
          ? []
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
        unmatchedLines.push({
          poNumber: line.poNumber,
          productNo: line.productNo,
        });
        continue;
      }
      if (matches.length > 1) {
        throw new KiditemConflictError('SUPPLY_ROCKET_FINAL_ORDER_AMBIGUOUS');
      }
      const match = matches[0]!;
      const requestBarcode = match.barcode?.trim() || null;
      const finalBarcode = line.barcode?.trim() || null;
      if (requestBarcode && finalBarcode && requestBarcode !== finalBarcode) {
        throw new KiditemConflictError('SUPPLY_ROCKET_FINAL_ORDER_BARCODE_MISMATCH');
      }
      if (
        match.collectedOrderLineItemId &&
        match.collectedOrderLineItemId !== line.finalOrderLineId
      ) {
        throw new KiditemConflictError('SUPPLY_ROCKET_FINAL_ORDER_ALREADY_COLLECTED');
      }
      const updated = await tx.rocketPurchaseConfirmationLine.updateMany({
        where: {
          id: match.id,
          organizationId: input.organizationId,
        },
        data: {
          collectedOrderLineItemId: line.finalOrderLineId,
          collectedAt: match.collectedOrderLineItemId ? undefined : new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new KiditemConflictError('SUPPLY_ROCKET_WORKBOOK_LINE_CHANGED');
      }
      matchedExportIds.add(match.confirmationId);
      reconciledRows += 1;
    }

    if (matchedExportIds.size > 1) {
      throw new KiditemConflictError('SUPPLY_ROCKET_FINAL_ORDER_AMBIGUOUS');
    }
    const exportId =
      [...matchedExportIds][0] ??
      (activeExports.length === 1 ? activeExports[0]!.id : null);
    const transmissionIntentKey =
      lines.length > 0
        ? `rocket-final-order:${input.directshipOperationId}:${input.transport.toLowerCase()}`
        : null;
    if (!exportId) {
      return {
        exportId: null,
        transmissionIntentKey,
        reconciledRows: 0,
        unmatchedLines,
      };
    }

    // The probe records which directship operation and transport observed the export. Which
    // workbook lines it linked, and whether every positive line is collected,
    // live on the lines themselves (`collectedOrderLineItemId` and the
    // first-link `collectedAt`), so readers derive both.
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
        directshipOperationId: input.directshipOperationId,
        transport: input.transport,
        intentKey: transmissionIntentKey,
      },
      update:
        transmissionIntentKey === null
          ? {
              directshipOperationId: input.directshipOperationId,
              observedAt: new Date(),
            }
          : {
              directshipOperationId: input.directshipOperationId,
              intentKey: transmissionIntentKey,
              observedAt: new Date(),
            },
    });

    return {
      exportId,
      transmissionIntentKey,
      reconciledRows,
      unmatchedLines,
    };
  }
}

function transactionClient(value: unknown): Prisma.TransactionClient {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('rocketPurchaseConfirmation' in value) ||
    !('rocketPurchaseConfirmationLine' in value) ||
    !('rocketPurchaseConfirmationTransmission' in value)
  ) {
    throw new TypeError('A Prisma transaction client is required');
  }
  return value as Prisma.TransactionClient;
}
