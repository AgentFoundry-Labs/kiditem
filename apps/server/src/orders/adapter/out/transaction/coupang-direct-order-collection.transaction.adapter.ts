import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { KiditemConflictError, KiditemInvalidValueError, KiditemNotFoundError, KiditemPreconditionError } from '@kiditem/shared/errors';
import { CoupangDirectOrderCollectionRequestSchema } from '@kiditem/shared/coupang-direct-order';
import type { CoupangDirectOrderCollectionRequest } from '@kiditem/shared/coupang-direct-order';
import { CoupangDirectshipResultSchema } from '@kiditem/shared/orders-operations';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { canonicalOwnerInputJson } from '../../../../common/owner-idempotency-key';
import {
  ROCKET_FINAL_ORDER_RECONCILIATION_PORT,
  type RocketFinalOrderReconciliationPort,
} from '../../../../supply/application/port/in/procurement/rocket-final-order-reconciliation.port';
import type {
  CoupangDirectCapture,
  CoupangDirectCollectionLineRef,
  CoupangDirectProjection,
  CoupangDirectTransportReceipt,
} from '../../../application/port/in/coupang-direct-order-collection.port';
import type { CoupangDirectOrderCollectionTransactionPort } from '../../../application/port/out/transaction/coupang-direct-order-collection.transaction.port';
import {
  canonicalCoupangDirectOrderHash,
  mapCoupangDirectOrder,
} from '../../../domain/coupang-direct-order.mapper';

const LOCK_NAMESPACE = 'coupang-direct-order-collection';
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * 쿠팡 직배송 원장(Orders, KID-359). 실행 `orders.coupang_directship`의 finish가 캡처를 `OrderCollectionArtifact`
 * (operationId)에 보관하고, 성공한 실행을 운송유형별로 변환할 때 주문(`Order.operationId`)·영수증
 * (`effectOperationId`)·소비(`operationId`)·Supply 워크북 대조를 쓴다. 옛 `coupang_rocket_final_order` 영수증
 * 되살리기와 attempt 경로는 지웠다.
 */
@Injectable()
export class CoupangDirectOrderCollectionTransactionAdapter
implements CoupangDirectOrderCollectionTransactionPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ROCKET_FINAL_ORDER_RECONCILIATION_PORT)
    private readonly reconciliation: RocketFinalOrderReconciliationPort,
  ) {}

  async isActiveRocketAccount(input: { organizationId: string; channelAccountId: string }): Promise<boolean> {
    const account = await this.prisma.channelAccount.findFirst({
      where: { id: input.channelAccountId, organizationId: input.organizationId, channel: 'rocket', status: 'active' },
      select: { id: true },
    });
    return account !== null;
  }

  async publishCapture(
    transaction: OwnerTransaction,
    input: { organizationId: string; operationId: string; capture: CoupangDirectCapture },
  ) {
    const tx = ownerTransactionClient(transaction);
    const captureBytes = Buffer.from(canonicalOwnerInputJson(input.capture), 'utf8');
    const contentChecksum = checksum(captureBytes);
    await tx.orderCollectionArtifact.create({
      data: {
        organizationId: input.organizationId,
        operationId: input.operationId,
        sourceFileName: `coupang-direct-order-${contentChecksum.slice(0, 12)}.json`,
        sourceContentType: 'application/json',
        sourceBytes: new Uint8Array(captureBytes),
      },
    });
    const count = (transport: DirectTransport) => input.capture.pos.filter((purchaseOrder) => purchaseOrder.transport === transport).length;
    return CoupangDirectshipResultSchema.parse({
      rowCount: input.capture.pos.length,
      purchaseOrders: input.capture.pos.length,
      lines: input.capture.pos.reduce((sum, purchaseOrder) => sum + purchaseOrder.items.length, 0),
      partialDetailCount: input.capture.pos.filter(({ items }) => items.length === 0).length,
      transports: { SHIPMENT: count('SHIPMENT'), MILKRUN: count('MILKRUN') },
    });
  }

  async readCapture(input: { organizationId: string; operationId: string }): Promise<CoupangDirectCapture> {
    return this.readStoredCapture(this.prisma, input.organizationId, input.operationId);
  }

  async consume(
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['consume']>[0],
  ): Promise<CoupangDirectTransportReceipt> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockOwner(tx, input.organizationId);
      const stored = await this.readStoredCapture(tx, input.organizationId, input.operationId);
      if (stored.channelAccountId.toLowerCase() !== input.capture.channelAccountId.toLowerCase()) throw conflict('COUPANG_DIRECT_ACCOUNT_MISMATCH');
      assertTransportSelection(stored, input.capture);

      const projection = transportProjection(input.capture, input.transport);
      const existing = await tx.coupangDirectTransportConsumption.findUnique({
        where: {
          organizationId_operationId_transport: {
            organizationId: input.organizationId,
            operationId: input.operationId,
            transport: input.transport,
          },
        },
        include: { receipt: true },
      });
      if (existing) {
        const storedKeys = new Map(stored.pos
          .filter((purchaseOrder) => purchaseOrder.items.length > 0)
          .map((purchaseOrder) => [purchaseOrderKey(purchaseOrder), purchaseOrder.transport]));
        const existingSelection = existing.selectedPurchaseOrderKeys
          .filter((key) => storedKeys.get(key) === input.transport);
        if (
          existing.selectedPurchaseOrderKeys.some((key) => !storedKeys.has(key))
          || !sameSelection(existingSelection, projection.selectionKeys)
        ) {
          throw conflict('SOURCE_TRANSPORT_REPLAY_CONFLICT');
        }
        return receiptView(existing.receipt, true);
      }

      const canonical = await tx.coupangDirectTransportReceipt.findUnique({
        where: {
          organizationId_channelAccountId_transport_payloadChecksum: {
            organizationId: input.organizationId,
            channelAccountId: input.capture.channelAccountId,
            transport: input.transport,
            payloadChecksum: projection.payloadChecksum,
          },
        },
      });
      if (canonical) {
        await this.createConsumption(tx, input.organizationId, input.operationId, input.transport, canonical.id, projection.selectionKeys);
        return receiptView(canonical, true);
      }

      const receipt = await this.publishTransport(tx, input, projection.request, projection.payloadChecksum);
      const persisted = await tx.coupangDirectTransportReceipt.create({
        data: {
          organizationId: input.organizationId,
          channelAccountId: input.capture.channelAccountId,
          effectOperationId: input.operationId,
          rocketPurchaseConfirmationId: receipt.exportId,
          transport: receipt.transport,
          payloadChecksum: receipt.payloadChecksum,
          transmissionIntentKey: receipt.transmissionIntentKey,
          matchedLineCount: receipt.matchedLineCount,
          reconciledRows: receipt.reconciledRows,
          collectedLines: json(receipt.collectedLines),
          matchedLines: json(receipt.matchedLines),
          unmatchedLines: json(receipt.unmatchedLines),
        },
      });
      await this.createConsumption(tx, input.organizationId, input.operationId, input.transport, persisted.id, projection.selectionKeys);
      return receiptView(persisted, false);
    }, TRANSACTION_OPTIONS);
  }

  async readProjection(
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['readProjection']>[0],
  ): Promise<CoupangDirectProjection> {
    return this.prisma.$transaction(async (tx) => {
      const capture = await this.readStoredCapture(tx, input.organizationId, input.operationId);
      const consumption = await tx.coupangDirectTransportConsumption.findUnique({
        where: {
          organizationId_operationId_transport: {
            organizationId: input.organizationId,
            operationId: input.operationId,
            transport: input.transport,
          },
        },
        include: { receipt: true },
      });
      if (!consumption) throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'coupang_direct_consumption', transport: input.transport } });
      const selectionKeys = consumption.selectedPurchaseOrderKeys;
      const selected = capture.pos.filter((purchaseOrder) =>
        purchaseOrder.transport === input.transport && selectionKeys.includes(purchaseOrderKey(purchaseOrder)));
      const collectable = selected.filter(({ items }) => items.length > 0);
      if (selected.length > 0 && collectable.length === 0) {
        throw new KiditemPreconditionError('ORDERS_DIRECTSHIP_DETAIL_MISSING', { details: { transport: input.transport } });
      }
      return {
        operationId: input.operationId,
        request: {
          channelAccountId: capture.channelAccountId,
          centers: centersForPurchaseOrders(capture.centers, collectable),
          pos: collectable,
          transport: input.transport,
        },
        receipt: receiptView(consumption.receipt, consumption.receipt.effectOperationId !== input.operationId),
      };
    }, { ...TRANSACTION_OPTIONS, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private async readStoredCapture(
    tx: Pick<Prisma.TransactionClient, 'orderCollectionArtifact'>,
    organizationId: string,
    operationId: string,
  ): Promise<CoupangDirectCapture> {
    const artifact = await tx.orderCollectionArtifact.findFirst({
      where: { organizationId, operationId },
      select: { sourceBytes: true },
    });
    if (!artifact) throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'coupang_direct_capture', operationId } });
    return parseStoredCapture(Buffer.from(artifact.sourceBytes));
  }

  private async publishTransport(
    tx: Prisma.TransactionClient,
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['consume']>[0],
    request: CoupangDirectOrderCollectionRequest,
    payloadChecksum: string,
  ): Promise<Omit<CoupangDirectTransportReceipt, 'duplicate' | 'effectOperationId'>> {
    const { transport } = request;
    const reconciliationLines: Array<{
      finalOrderLineId: string;
      poNumber: string;
      productNo: string;
      barcode: string | null;
      unitQuantity: number;
    }> = [];
    for (const purchaseOrder of request.pos) {
      let mapped: ReturnType<typeof mapCoupangDirectOrder>;
      try {
        mapped = mapCoupangDirectOrder(purchaseOrder, request.centers[purchaseOrder.center]);
      } catch (error) {
        throw new KiditemInvalidValueError('VALIDATION_FAILED', {
          details: { reason: 'coupang_direct_order_invalid', seq: String(purchaseOrder.seq) },
          cause: error,
        });
      }
      const order = await tx.order.upsert({
        where: {
          organizationId_channelAccountId_externalOrderId: {
            organizationId: input.organizationId,
            channelAccountId: request.channelAccountId,
            externalOrderId: mapped.externalOrderId,
          },
        },
        create: {
          organizationId: input.organizationId,
          channelAccountId: request.channelAccountId,
          operationId: input.operationId,
          ...orderData(mapped),
        },
        update: {
          operationId: input.operationId,
          ...orderData(mapped),
        },
        select: { id: true },
      });
      for (let index = 0; index < mapped.lines.length; index += 1) {
        const line = mapped.lines[index]!;
        const source = purchaseOrder.items[index]!;
        const persisted = await tx.orderLineItem.upsert({
          where: { orderId_externalLineId: { orderId: order.id, externalLineId: line.externalLineId } },
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
      channelAccountId: request.channelAccountId,
      directshipOperationId: input.operationId,
      transport,
      lines: reconciliationLines,
    });
    const collectedLines = dedupeLineRefs(reconciliationLines.map(({ poNumber, productNo }) => ({ poNumber, productNo })));
    const unmatchedLines = dedupeLineRefs(reconciled.unmatchedLines);
    const unmatchedKeys = new Set(unmatchedLines.map(({ poNumber, productNo }) => lineKey(poNumber, productNo)));
    return {
      transport,
      payloadChecksum,
      exportId: reconciled.exportId,
      transmissionIntentKey: reconciled.transmissionIntentKey,
      matchedLineCount: reconciled.reconciledRows,
      reconciledRows: reconciled.reconciledRows,
      collectedLines,
      matchedLines: collectedLines.filter(({ poNumber, productNo }) => !unmatchedKeys.has(lineKey(poNumber, productNo))),
      unmatchedLines,
    };
  }

  private async createConsumption(
    tx: Prisma.TransactionClient,
    organizationId: string,
    operationId: string,
    transport: DirectTransport,
    receiptId: string,
    selectedPurchaseOrderKeys: string[],
  ): Promise<void> {
    await tx.coupangDirectTransportConsumption.create({
      data: { organizationId, operationId, receiptId, transport, selectedPurchaseOrderKeys },
    });
  }

  private async lockOwner(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
    await tx.$executeRaw`
      -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
      SELECT pg_advisory_xact_lock(
        hashtext(${LOCK_NAMESPACE}),
        hashtext(${organizationId})
      )
    `;
  }
}

function conflict(reason: string): KiditemConflictError {
  return new KiditemConflictError('STATE_CONFLICT', { details: { reason } });
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

function parseStoredCapture(bytes: Buffer): CoupangDirectCapture {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw conflict('COUPANG_DIRECT_CAPTURE_INVALID');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw conflict('COUPANG_DIRECT_CAPTURE_INVALID');
  }
  const parsed = CoupangDirectOrderCollectionRequestSchema.safeParse({
    ...(value as Record<string, unknown>),
    transport: 'SHIPMENT',
  });
  if (!parsed.success) throw conflict('COUPANG_DIRECT_CAPTURE_INVALID');
  const { transport: _transport, ...capture } = parsed.data;
  return capture;
}

type DirectTransport = 'SHIPMENT' | 'MILKRUN';
function transportProjection(
  capture: CoupangDirectCapture,
  transport: DirectTransport,
): {
  request: CoupangDirectOrderCollectionRequest;
  payloadChecksum: string;
  selectionKeys: string[];
} {
  const selected = capture.pos.filter((purchaseOrder) => purchaseOrder.transport === transport);
  const collectable = selected.filter((purchaseOrder) => purchaseOrder.items.length > 0);
  if (selected.length > 0 && collectable.length === 0) {
    throw new KiditemPreconditionError('ORDERS_DIRECTSHIP_DETAIL_MISSING', { details: { transport } });
  }
  const request = {
    ...capture,
    centers: centersForPurchaseOrders(capture.centers, collectable),
    pos: collectable,
    transport,
  };
  return {
    request,
    payloadChecksum: canonicalCoupangDirectOrderHash(request),
    selectionKeys: collectable.map(purchaseOrderKey),
  };
}

function centersForPurchaseOrders(
  centers: CoupangDirectCapture['centers'],
  purchaseOrders: CoupangDirectCapture['pos'],
): CoupangDirectCapture['centers'] {
  const referenced = new Set(
    purchaseOrders.map((purchaseOrder) => purchaseOrder.center),
  );
  return Object.fromEntries(
    Object.entries(centers).filter(([name]) => referenced.has(name)),
  );
}

function purchaseOrderKey(purchaseOrder: CoupangDirectCapture['pos'][number]): string {
  return createHash('sha256')
    .update(canonicalOwnerInputJson(purchaseOrder))
    .digest('hex');
}

function sameSelection(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function assertTransportSelection(
  stored: CoupangDirectCapture,
  selected: CoupangDirectCapture,
): void {
  if (canonicalOwnerInputJson(stored.centers) !== canonicalOwnerInputJson(selected.centers)) {
    throw conflict('COUPANG_DIRECT_CAPTURE_SELECTION_CONFLICT');
  }
  const storedKeys = new Set(stored.pos.map(purchaseOrderKey));
  if (selected.pos.some((purchaseOrder) => !storedKeys.has(purchaseOrderKey(purchaseOrder)))) {
    throw conflict('COUPANG_DIRECT_CAPTURE_SELECTION_CONFLICT');
  }
}

function receiptView(
  row: Prisma.CoupangDirectTransportReceiptGetPayload<{}>,
  duplicate: boolean,
): CoupangDirectTransportReceipt {
  if (row.transport !== 'SHIPMENT' && row.transport !== 'MILKRUN') {
    throw conflict('COUPANG_DIRECT_RECEIPT_INVALID');
  }
  const collectedLines = parseLineRefs(row.collectedLines);
  const matchedLines = parseLineRefs(row.matchedLines);
  const unmatchedLines = parseLineRefs(row.unmatchedLines);
  if (!collectedLines || !matchedLines || !unmatchedLines) {
    throw conflict('COUPANG_DIRECT_RECEIPT_INVALID');
  }
  return {
    transport: row.transport,
    payloadChecksum: row.payloadChecksum,
    effectOperationId: row.effectOperationId,
    exportId: row.rocketPurchaseConfirmationId,
    transmissionIntentKey: row.transmissionIntentKey,
    matchedLineCount: row.matchedLineCount,
    reconciledRows: row.reconciledRows,
    collectedLines,
    matchedLines,
    unmatchedLines,
    duplicate,
  };
}

function parseLineRefs(value: unknown): CoupangDirectCollectionLineRef[] | null {
  if (!Array.isArray(value)) return null;
  const refs: CoupangDirectCollectionLineRef[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    if (typeof record.poNumber !== 'string' || typeof record.productNo !== 'string') {
      return null;
    }
    refs.push({ poNumber: record.poNumber, productNo: record.productNo });
  }
  return refs;
}

function checksum(bytes: Buffer): string {
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  return createHash('sha256').update(length).update(bytes).digest('hex');
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
