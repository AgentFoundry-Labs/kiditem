import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  ROCKET_FINAL_ORDER_RECONCILIATION_PORT,
  type RocketFinalOrderReconciliationPort,
} from '../../../../supply/application/port/in/procurement/rocket-final-order-reconciliation.port';
import type {
  CoupangDirectOrderCollectionTransactionPort,
} from '../../../application/port/out/transaction/coupang-direct-order-collection.transaction.port';
import {
  canonicalCoupangDirectOrderHash,
  mapCoupangDirectOrder,
} from '../../../mapper/coupang-direct-order.mapper';

const LOCK_NAMESPACE = 'coupang-direct-order-collection';
const SOURCE_TYPE = 'coupang_rocket_final_order';
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class CoupangDirectOrderCollectionTransactionAdapter
implements CoupangDirectOrderCollectionTransactionPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ROCKET_FINAL_ORDER_RECONCILIATION_PORT)
    private readonly reconciliation: RocketFinalOrderReconciliationPort,
  ) {}

  async collect(
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['collect']>[0],
  ) {
    const fileHash = canonicalCoupangDirectOrderHash(input.request);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${LOCK_NAMESPACE}),
          hashtext(${input.organizationId})
        )
      `;
      await assertActiveActor(tx, input.organizationId, input.userId);
      await assertRocketAccount(
        tx,
        input.organizationId,
        input.request.channelAccountId,
      );

      const existingRun = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          channelAccountId: input.request.channelAccountId,
          sourceType: SOURCE_TYPE,
          fileHash,
        },
        select: { id: true, status: true },
      });
      const importRun = existingRun ?? await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          channelAccountId: input.request.channelAccountId,
          sourceType: SOURCE_TYPE,
          fileName: `coupang-rocket-final-order-${fileHash.slice(0, 12)}.json`,
          fileHash,
          status: 'running',
          rowCount: 0,
          createdBy: input.userId,
        },
        select: { id: true, status: true },
      });

      const reconciliationLines: Array<{
        finalOrderLineId: string;
        poNumber: string;
        productNo: string;
        barcode: string | null;
        unitQuantity: number;
      }> = [];
      for (const purchaseOrder of input.request.pos) {
        let mapped: ReturnType<typeof mapCoupangDirectOrder>;
        try {
          mapped = mapCoupangDirectOrder(
            purchaseOrder,
            input.request.centers[purchaseOrder.center],
          );
        } catch (error) {
          throw new BadRequestException(
            error instanceof Error ? error.message : 'Invalid Coupang direct order',
          );
        }
        const order = await tx.order.upsert({
          where: {
            organizationId_channelAccountId_externalOrderId: {
              organizationId: input.organizationId,
              channelAccountId: input.request.channelAccountId,
              externalOrderId: mapped.externalOrderId,
            },
          },
          create: {
            organizationId: input.organizationId,
            channelAccountId: input.request.channelAccountId,
            sourceImportRunId: importRun.id,
            ...orderData(mapped),
          },
          update: {
            sourceImportRunId: importRun.id,
            ...orderData(mapped),
          },
          select: { id: true },
        });
        for (let index = 0; index < mapped.lines.length; index += 1) {
          const line = mapped.lines[index]!;
          const source = purchaseOrder.items[index]!;
          const persisted = await tx.orderLineItem.upsert({
            where: {
              orderId_externalLineId: {
                orderId: order.id,
                externalLineId: line.externalLineId,
              },
            },
            create: {
              organizationId: input.organizationId,
              orderId: order.id,
              ...line,
              metadata: line.metadata as Prisma.InputJsonValue,
            },
            update: {
              ...line,
              metadata: line.metadata as Prisma.InputJsonValue,
            },
            select: { id: true },
          });
          reconciliationLines.push({
            finalOrderLineId: persisted.id,
            poNumber: mapped.externalOrderId,
            productNo: source.skuId,
            barcode: source.barcode.trim() || null,
            unitQuantity: source.qty,
          });
        }
      }

      const reconciled = await this.reconciliation.reconcile({
        transaction: tx,
        organizationId: input.organizationId,
        userId: input.userId,
        channelAccountId: input.request.channelAccountId,
        sourceImportRunId: importRun.id,
        transport: input.request.transport,
        lines: reconciliationLines,
      });
      // 활성 발주확정이 없어 정산에서 제외된 라인은 하드 에러가 아니라 스킵으로 보고한다.
      // 확정(정산)된 라인만 셀피아 양식·후속 처리 대상이 되도록 (발주번호, SKU) 식별자로 분리한다.
      const skippedKeys = new Set(
        reconciled.skippedLines.map(({ poNumber, productNo }) => lineKey(poNumber, productNo)),
      );
      const confirmedLines = dedupeLineRefs(
        reconciliationLines
          .filter(({ poNumber, productNo }) => !skippedKeys.has(lineKey(poNumber, productNo)))
          .map(({ poNumber, productNo }) => ({ poNumber, productNo })),
      );
      const skippedLines = dedupeLineRefs(reconciled.skippedLines);
      await tx.sourceImportRun.update({
        where: { id: importRun.id },
        data: {
          status: 'completed',
          rowCount: reconciliationLines.length,
          importedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      return {
        importRunId: importRun.id,
        exportId: reconciled.exportId,
        transmissionIntentKey: reconciled.transmissionIntentKey,
        matchedLineCount: reconciled.matchedLineCount,
        reconciledRows: reconciled.reconciledRows,
        confirmedLines,
        skippedLines,
        duplicate: existingRun?.status === 'completed',
      };
    }, TRANSACTION_OPTIONS);
  }
}

function orderData(mapped: ReturnType<typeof mapCoupangDirectOrder>) {
  const { lines: _lines, metadata, ...data } = mapped;
  return { ...data, metadata: metadata as Prisma.InputJsonValue };
}

function lineKey(poNumber: string, productNo: string): string {
  return JSON.stringify([poNumber, productNo]);
}

function dedupeLineRefs(
  refs: Array<{ poNumber: string; productNo: string }>,
): Array<{ poNumber: string; productNo: string }> {
  const seen = new Set<string>();
  const result: Array<{ poNumber: string; productNo: string }> = [];
  for (const ref of refs) {
    const key = lineKey(ref.poNumber, ref.productNo);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ poNumber: ref.poNumber, productNo: ref.productNo });
  }
  return result;
}

async function assertActiveActor(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
) {
  const membership = await tx.organizationMembership.findFirst({
    where: {
      organizationId,
      userId,
      status: 'active',
      user: { isActive: true },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new UnauthorizedException('Active organization membership is required.');
  }
}

async function assertRocketAccount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  channelAccountId: string,
) {
  const account = await tx.channelAccount.findFirst({
    where: {
      id: channelAccountId,
      organizationId,
      channel: 'rocket',
      status: 'active',
    },
    select: { id: true },
  });
  if (!account) {
    throw new BadRequestException('Active Rocket channel account was not found.');
  }
}
