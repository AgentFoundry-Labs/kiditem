import { createHash, randomUUID } from 'node:crypto';
import { redact } from '../../../../common/redact';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CoupangDirectOrderCollectionRequestSchema } from '@kiditem/shared/coupang-direct-order';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { canonicalOwnerInputHash, canonicalOwnerInputJson } from '../../../../common/owner-idempotency-key';
import {
  ROCKET_FINAL_ORDER_RECONCILIATION_PORT,
  type RocketFinalOrderReconciliationPort,
} from '../../../../supply/application/port/in/procurement/rocket-final-order-reconciliation.port';
import {
  COUPANG_DIRECT_PARSER_VERSION as DIRECT_PARSER_VERSION,
  COUPANG_DIRECT_SOURCE_TYPE as DIRECT_SOURCE_TYPE,
  type CoupangDirectCapture,
  type CoupangDirectCapturePlan,
  type CoupangDirectCollectionLineRef,
  type CoupangDirectOwnerAttempt,
  type CoupangDirectOwnerAttemptControl,
  type CoupangDirectProjection,
  type CoupangDirectTransportReceipt,
} from '../../../application/port/in/coupang-direct-order-collection.port';
import type { CoupangDirectOrderCollectionTransactionPort } from '../../../application/port/out/transaction/coupang-direct-order-collection.transaction.port';
import type { CoupangDirectOrderCollectionRequest } from '@kiditem/shared/coupang-direct-order';
import {
  canonicalCoupangDirectOrderHash,
  mapCoupangDirectOrder,
} from '../../../mapper/coupang-direct-order.mapper';

const LOCK_NAMESPACE = 'coupang-direct-order-collection';
const SOURCE_TYPE = 'coupang_rocket_final_order';
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
const ATTEMPT_EXPIRES_IN_MS = 30 * 60_000;

@Injectable()
export class CoupangDirectOrderCollectionTransactionAdapter
implements CoupangDirectOrderCollectionTransactionPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ROCKET_FINAL_ORDER_RECONCILIATION_PORT)
    private readonly reconciliation: RocketFinalOrderReconciliationPort,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async beginAttempt(
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['beginAttempt']>[0],
  ): Promise<CoupangDirectOwnerAttemptControl> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockOwner(tx, input.organizationId);
      await assertActiveActor(tx, input.organizationId, input.userId);
      await assertRocketAccount(tx, input.organizationId, input.channelAccountId);

      const plan: CoupangDirectCapturePlan = {
        sourceType: DIRECT_SOURCE_TYPE,
        parserVersion: DIRECT_PARSER_VERSION,
        channelAccountId: input.channelAccountId,
        captureMode: 'browser',
        transportScope: 'ALL',
      };
      const requestFingerprint = canonicalOwnerInputHash({
        sourceType: DIRECT_SOURCE_TYPE,
        channelAccountId: input.channelAccountId,
        transportScope: 'ALL',
      });
      const replay = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: DIRECT_SOURCE_TYPE,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint) {
          throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        }
        const row = expired(replay)
          ? await this.failIn(
            tx,
            replay,
            'ATTEMPT_EXPIRED',
            'Coupang direct order capture expired.',
          )
          : replay;
        return this.controlView(tx, row);
      }

      const running = await tx.sourceImportRun.findMany({
        where: {
          organizationId: input.organizationId,
          sourceType: DIRECT_SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          status: 'running',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const active = running.find((row) => !expired(row));
      if (active) {
        throw new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId: active.id });
      }
      for (const stale of running) {
        await this.failIn(
          tx,
          stale,
          'ATTEMPT_EXPIRED',
          'Coupang direct order capture expired.',
        );
      }

      const row = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: DIRECT_SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          attemptToken: randomUUID(),
          plan: json(plan),
          parserVersion: DIRECT_PARSER_VERSION,
          expiresAt: new Date(Date.now() + ATTEMPT_EXPIRES_IN_MS),
          createdBy: input.userId,
        },
      });
      return this.controlView(tx, row);
    }, TRANSACTION_OPTIONS);
  }

  async readAttempt(
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['readAttempt']>[0],
  ): Promise<CoupangDirectOwnerAttempt | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.sourceImportRun.findFirst({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: DIRECT_SOURCE_TYPE,
        },
      });
      if (!row) return null;
      // GET is a read-only preflight. The next begin/control mutation owns
      // stale-run terminalization and Alert creation.
      return this.attemptView(tx, row);
    }, { ...TRANSACTION_OPTIONS, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async readAttemptControl(
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['readAttemptControl']>[0],
  ): Promise<CoupangDirectOwnerAttemptControl | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.sourceImportRun.findFirst({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: DIRECT_SOURCE_TYPE,
        },
      });
      if (!row) return null;
      return this.controlView(tx, row);
    }, { ...TRANSACTION_OPTIONS, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async completeAttempt(
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['completeAttempt']>[0],
  ): Promise<CoupangDirectOwnerAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockOwner(tx, input.organizationId);
      const row = await this.findOwnerRun(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      const plan = readPlan(row.plan);
      if (plan.channelAccountId !== input.capture.channelAccountId) {
        throw new ConflictException('COUPANG_DIRECT_ACCOUNT_MISMATCH');
      }
      const captureBytes = Buffer.from(canonicalOwnerInputJson(input.capture), 'utf8');
      const contentChecksum = checksum(captureBytes);
      if (row.status !== 'running') {
        if (row.status === 'completed' && row.contentChecksum === contentChecksum) {
          return this.attemptView(tx, row);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) {
        throw new ConflictException('ATTEMPT_EXPIRED');
      }

      await tx.orderCollectionArtifact.create({
        data: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
          sourceFileName: `coupang-direct-order-${contentChecksum.slice(0, 12)}.json`,
          sourceContentType: 'application/json',
          sourceBytes: new Uint8Array(captureBytes),
        },
      });
      const partialDetailCount = input.capture.pos.filter(({ items }) => items.length === 0).length;
      const emptyTransports = (['SHIPMENT', 'MILKRUN'] as const)
        .filter((transport) => input.capture.pos.every((purchaseOrder) => purchaseOrder.transport !== transport));
      const completedAt = new Date();
      const completed = await tx.sourceImportRun.update({
        where: { id: row.id, organizationId: input.organizationId },
        data: {
          status: 'completed',
          rowCount: input.capture.pos.length,
          importedAt: completedAt,
          lastVerifiedAt: completedAt,
          verificationCount: { increment: 1 },
          contentChecksum,
          contentByteCount: captureBytes.length,
          qualityReport: json({
            source: DIRECT_SOURCE_TYPE,
            parserVersion: DIRECT_PARSER_VERSION,
            captureChecksum: contentChecksum,
            sourceRowCount: input.capture.pos.length,
            partialDetailCount,
            emptyTransports,
          }),
          errorCode: null,
          errorMessage: null,
        },
      });
      await this.resolveAlert(tx, row);
      return this.attemptView(tx, completed);
    }, TRANSACTION_OPTIONS);
  }

  async consumeAttempt(
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['consumeAttempt']>[0],
  ): Promise<CoupangDirectTransportReceipt> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockOwner(tx, input.organizationId);
      const row = await this.findOwnerRun(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      if (row.status !== 'completed') {
        throw new ConflictException(row.status === 'failed'
          ? 'SOURCE_ATTEMPT_FAILED'
          : 'SOURCE_ATTEMPT_NOT_COMPLETE');
      }
      const plan = readPlan(row.plan);
      if (plan.channelAccountId !== input.capture.channelAccountId) {
        throw new ConflictException('COUPANG_DIRECT_ACCOUNT_MISMATCH');
      }
      const stored = await this.readStoredCapture(tx, input.organizationId, row.id);
      assertTransportSelection(stored, input.capture);

      const projection = transportProjection(input.capture, input.transport);
      const existing = await tx.coupangDirectTransportConsumption.findUnique({
        where: {
          organizationId_sourceImportRunId_transport: {
            organizationId: input.organizationId,
            sourceImportRunId: row.id,
            transport: input.transport,
          },
        },
        include: { receipt: true },
      });
      if (existing) {
        const storedKeys = new Map(stored.pos
          .filter((purchaseOrder) => purchaseOrder.items.length > 0)
          .map((purchaseOrder) => [
            purchaseOrderKey(purchaseOrder),
            purchaseOrder.transport,
          ]));
        const existingSelection = existing.selectedPurchaseOrderKeys
          .filter((key) => storedKeys.get(key) === input.transport);
        if (
          existing.selectedPurchaseOrderKeys.some((key) => !storedKeys.has(key))
          || !sameSelection(existingSelection, projection.selectionKeys)
        ) {
          throw new ConflictException('SOURCE_TRANSPORT_REPLAY_CONFLICT');
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
        await this.createConsumption(
          tx,
          input.organizationId,
          row.id,
          input.transport,
          canonical.id,
          projection.selectionKeys,
        );
        return receiptView(canonical, true);
      }

      const reportReceipt = receiptFromQualityReport(row.qualityReport, input.transport);
      if (reportReceipt && reportReceipt.payloadChecksum !== projection.payloadChecksum) {
        throw new ConflictException('SOURCE_TRANSPORT_REPLAY_CONFLICT');
      }
      const receipt = reportReceipt ?? await this.publishTransport(
        tx,
        input,
        row.id,
        projection.request,
        projection.payloadChecksum,
      );
      const persisted = await tx.coupangDirectTransportReceipt.create({
        data: {
          organizationId: input.organizationId,
          channelAccountId: input.capture.channelAccountId,
          effectSourceImportRunId: receipt.sourceImportRunId,
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
      await this.createConsumption(
        tx,
        input.organizationId,
        row.id,
        input.transport,
        persisted.id,
        projection.selectionKeys,
      );
      return receiptView(persisted, reportReceipt ? true : receipt.duplicate);
    }, TRANSACTION_OPTIONS);
  }

  async failAttempt(
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['failAttempt']>[0],
  ): Promise<CoupangDirectOwnerAttempt> {
    const message = redact(input.message).slice(0, 300);
    return this.prisma.$transaction(async (tx) => {
      await this.lockOwner(tx, input.organizationId);
      const row = await this.findOwnerRun(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      if (row.status !== 'running') {
        if (
          row.status === 'failed'
          && row.errorCode === input.code
          && row.errorMessage === message
        ) {
          return this.attemptView(tx, row);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      const failed = expired(row)
        ? await this.failIn(
          tx,
          row,
          'ATTEMPT_EXPIRED',
          'Coupang direct order capture expired.',
        )
        : await this.failIn(tx, row, input.code, message);
      return this.attemptView(tx, failed);
    }, TRANSACTION_OPTIONS);
  }

  async readCaptured(
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['readCaptured']>[0],
  ): Promise<{ attempt: CoupangDirectOwnerAttempt; capture: CoupangDirectCapture }> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.findOwnerRun(tx, input.organizationId, input.attemptId);
      const plan = readPlan(row.plan);
      if (input.channelAccountId && input.channelAccountId !== plan.channelAccountId) {
        throw new ConflictException('COUPANG_DIRECT_ACCOUNT_MISMATCH');
      }
      if (row.status !== 'completed') {
        throw new ConflictException(row.status === 'failed'
          ? 'SOURCE_ATTEMPT_FAILED'
          : 'SOURCE_ATTEMPT_NOT_COMPLETE');
      }
      return {
        attempt: await this.attemptView(tx, row),
        capture: await this.readStoredCapture(tx, input.organizationId, row.id),
      };
    }, { ...TRANSACTION_OPTIONS, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async readProjection(
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['readProjection']>[0],
  ): Promise<CoupangDirectProjection> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.findOwnerRun(tx, input.organizationId, input.attemptId);
      const plan = readPlan(row.plan);
      if (row.status !== 'completed') {
        throw new ConflictException(row.status === 'failed'
          ? 'SOURCE_ATTEMPT_FAILED'
          : 'SOURCE_ATTEMPT_NOT_COMPLETE');
      }
      const capture = await this.readStoredCapture(tx, input.organizationId, row.id);
      const consumption = await tx.coupangDirectTransportConsumption.findUnique({
        where: {
          organizationId_sourceImportRunId_transport: {
            organizationId: input.organizationId,
            sourceImportRunId: row.id,
            transport: input.transport,
          },
        },
        include: { receipt: true },
      });
      const report = consumption ? null : readQualityReport(row.qualityReport);
      const selectionKeys = consumption?.selectedPurchaseOrderKeys
        ?? report?.transportSelections[input.transport];
      const selected = selectionKeys
        ? capture.pos.filter((purchaseOrder) =>
          purchaseOrder.transport === input.transport
          && selectionKeys.includes(purchaseOrderKey(purchaseOrder)))
        : capture.pos.filter(({ transport }) => transport === input.transport);
      const collectable = selected.filter(({ items }) => items.length > 0);
      if (selected.length > 0 && collectable.length === 0) {
        throw new BadRequestException(
          '쿠팡 발주 상세(품목)를 수집하지 못했습니다. 확장에서 발주를 다시 수집한 뒤 시도해주세요.',
        );
      }
      const receipt = consumption
        ? receiptView(
          consumption.receipt,
          consumption.receipt.effectSourceImportRunId !== consumption.sourceImportRunId,
        )
        : report?.transportRefs[input.transport] ?? null;
      if (!receipt) throw new Error('COUPANG_DIRECT_RECEIPT_MISSING');
      return {
        importRunId: row.id,
        request: {
          channelAccountId: plan.channelAccountId,
          centers: centersForPurchaseOrders(capture.centers, collectable),
          pos: collectable,
          transport: input.transport,
        },
        receipt,
      };
    }, { ...TRANSACTION_OPTIONS, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private async readStoredCapture(
    tx: Prisma.TransactionClient,
    organizationId: string,
    sourceImportRunId: string,
  ): Promise<CoupangDirectCapture> {
    const artifact = await tx.orderCollectionArtifact.findFirst({
      where: { organizationId, sourceImportRunId },
      select: { sourceBytes: true },
    });
    if (!artifact) throw new NotFoundException('COUPANG_DIRECT_CAPTURE_NOT_FOUND');
    return parseStoredCapture(Buffer.from(artifact.sourceBytes));
  }

  private async publishTransport(
    tx: Prisma.TransactionClient,
    input: Parameters<CoupangDirectOrderCollectionTransactionPort['completeAttempt']>[0],
    ownerRunId: string,
    request: CoupangDirectOrderCollectionRequest,
    payloadChecksum: string,
  ): Promise<CoupangDirectTransportReceipt> {
    const { transport } = request;
    const legacy = await tx.sourceImportRun.findFirst({
      where: {
        organizationId: input.organizationId,
        channelAccountId: request.channelAccountId,
        sourceType: SOURCE_TYPE,
        fileHash: payloadChecksum,
        status: 'completed',
      },
      select: { id: true },
    });
    if (legacy) {
      return this.legacyReceipt(
        tx,
        input.organizationId,
        legacy.id,
        request,
        transport,
        payloadChecksum,
      );
    }
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
        mapped = mapCoupangDirectOrder(
          purchaseOrder,
          request.centers[purchaseOrder.center],
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
            channelAccountId: request.channelAccountId,
            externalOrderId: mapped.externalOrderId,
          },
        },
        create: {
          organizationId: input.organizationId,
          channelAccountId: request.channelAccountId,
          sourceImportRunId: ownerRunId,
          ...orderData(mapped),
        },
        update: {
          sourceImportRunId: ownerRunId,
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
      channelAccountId: request.channelAccountId,
      sourceImportRunId: ownerRunId,
      transport,
      lines: reconciliationLines,
    });
    const collectedLines = dedupeLineRefs(
      reconciliationLines.map(({ poNumber, productNo }) => ({ poNumber, productNo })),
    );
    const unmatchedLines = dedupeLineRefs(reconciled.unmatchedLines);
    const unmatchedKeys = new Set(unmatchedLines.map(({ poNumber, productNo }) => lineKey(poNumber, productNo)));
    return {
      transport,
      payloadChecksum,
      sourceImportRunId: ownerRunId,
      exportId: reconciled.exportId,
      transmissionIntentKey: reconciled.transmissionIntentKey,
      matchedLineCount: reconciled.matchedLineCount,
      reconciledRows: reconciled.reconciledRows,
      collectedLines,
      matchedLines: collectedLines.filter(({ poNumber, productNo }) =>
        !unmatchedKeys.has(lineKey(poNumber, productNo))),
      unmatchedLines,
      duplicate: false,
    };
  }

  private async createConsumption(
    tx: Prisma.TransactionClient,
    organizationId: string,
    sourceImportRunId: string,
    transport: DirectTransport,
    receiptId: string,
    selectedPurchaseOrderKeys: string[],
  ): Promise<void> {
    await tx.coupangDirectTransportConsumption.create({
      data: {
        organizationId,
        sourceImportRunId,
        receiptId,
        transport,
        selectedPurchaseOrderKeys,
      },
    });
  }

  private async legacyReceipt(
    tx: Prisma.TransactionClient,
    organizationId: string,
    sourceImportRunId: string,
    request: CoupangDirectOrderCollectionRequest,
    transport: 'SHIPMENT' | 'MILKRUN',
    payloadChecksum: string,
  ): Promise<CoupangDirectTransportReceipt> {
    const collectedLines = dedupeLineRefs(
      request.pos.flatMap((purchaseOrder) => purchaseOrder.items.map((item) => ({
        poNumber: String(purchaseOrder.seq),
        productNo: item.skuId,
      }))),
    );
    const transmission = await tx.rocketPurchaseConfirmationTransmission.findFirst({
      where: {
        organizationId,
        sourceImportRunId,
        transport,
      },
      select: {
        confirmationId: true,
        intentKey: true,
        matchedLineCount: true,
      },
    });
    const orders = await tx.order.findMany({
      where: { organizationId, sourceImportRunId },
      select: {
        externalOrderId: true,
        lineItems: { select: { id: true, sku: true } },
      },
    });
    const lineRefsById = new Map<string, CoupangDirectCollectionLineRef>();
    for (const order of orders) {
      for (const line of order.lineItems) {
        if (typeof line.sku !== 'string') continue;
        lineRefsById.set(line.id, {
          poNumber: order.externalOrderId,
          productNo: line.sku,
        });
      }
    }
    const matchedLineIds = transmission
      ? await tx.rocketPurchaseConfirmationLine.findMany({
        where: {
          organizationId,
          confirmationId: transmission.confirmationId,
          collectedOrderLineItemId: { in: [...lineRefsById.keys()] },
          confirmedQuantity: { gt: 0 },
        },
        select: { collectedOrderLineItemId: true },
      })
      : [];
    const matched = new Set(
      matchedLineIds
        .map(({ collectedOrderLineItemId }) => collectedOrderLineItemId)
        .filter((value): value is string => Boolean(value)),
    );
    const matchedLines = dedupeLineRefs(
      [...matched]
        .map((id) => lineRefsById.get(id))
        .filter((ref): ref is CoupangDirectCollectionLineRef => Boolean(ref)),
    );
    const matchedKeys = new Set(matchedLines.map(({ poNumber, productNo }) => lineKey(poNumber, productNo)));
    const fallbackMatchedCount = transmission?.matchedLineCount ?? matchedLines.length;
    return {
      transport,
      payloadChecksum,
      sourceImportRunId,
      exportId: transmission?.confirmationId ?? null,
      transmissionIntentKey: transmission?.intentKey
        ?? (collectedLines.length > 0
          ? `rocket-final-order:${sourceImportRunId}:${transport.toLowerCase()}`
          : null),
      matchedLineCount: fallbackMatchedCount,
      reconciledRows: fallbackMatchedCount,
      collectedLines,
      matchedLines,
      unmatchedLines: collectedLines.filter(({ poNumber, productNo }) =>
        !matchedKeys.has(lineKey(poNumber, productNo))),
      duplicate: true,
    };
  }

  private async findOwnerRun(
    tx: Prisma.TransactionClient,
    organizationId: string,
    attemptId: string,
  ) {
    const row = await tx.sourceImportRun.findFirst({
      where: { id: attemptId, organizationId, sourceType: DIRECT_SOURCE_TYPE },
    });
    if (!row) throw new NotFoundException('COUPANG_DIRECT_ATTEMPT_NOT_FOUND');
    return row;
  }

  private async attemptView(
    tx: Prisma.TransactionClient,
    row: Prisma.SourceImportRunGetPayload<{}>,
  ): Promise<CoupangDirectOwnerAttempt> {
    const artifact = await tx.orderCollectionArtifact.findFirst({
      where: { organizationId: row.organizationId, sourceImportRunId: row.id },
      select: { id: true },
    });
    const plan = readPlan(row.plan);
    const isExpired = expired(row);
    return {
      attemptId: row.id,
      sourceImportRunId: row.id,
      state: row.status === 'completed'
        ? 'COMPLETE'
        : row.status === 'running' && !isExpired
          ? 'RUNNING'
          : 'FAILED',
      plan,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      artifactId: artifact?.id ?? null,
      contentChecksum: row.contentChecksum,
      errorCode: isExpired ? 'ATTEMPT_EXPIRED' : row.errorCode,
      errorMessage: isExpired ? 'Coupang direct order capture expired.' : row.errorMessage,
    };
  }

  private async controlView(
    tx: Prisma.TransactionClient,
    row: Prisma.SourceImportRunGetPayload<{}>,
  ): Promise<CoupangDirectOwnerAttemptControl> {
    return {
      ...(await this.attemptView(tx, row)),
      attemptToken: row.attemptToken,
    };
  }

  private async failIn(
    tx: Prisma.TransactionClient,
    row: Prisma.SourceImportRunGetPayload<{}>,
    code: string,
    message: string,
  ) {
    const failed = await tx.sourceImportRun.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: {
        status: 'failed',
        errorCode: code,
        errorMessage: redact(message).slice(0, 300),
      },
    });
    await this.alerts.recordTerminalOutcome(tx, {
      code,
      organizationId: row.organizationId,
      sourceType: DIRECT_SOURCE_TYPE,
      attemptId: row.id,
      dedupeKey: `source:${DIRECT_SOURCE_TYPE}:${row.channelAccountId ?? 'unknown'}`,
      title: '쿠팡 직배송 원본 수집 실패',
      message: message,
      href: '/order-collection',
    });
    return failed;
  }

  private async resolveAlert(
    tx: Prisma.TransactionClient,
    row: Prisma.SourceImportRunGetPayload<{}>,
  ): Promise<void> {
    await this.alerts.resolveSourceFailure(tx, {
      organizationId: row.organizationId,
      dedupeKey: `source:${DIRECT_SOURCE_TYPE}:${row.channelAccountId ?? 'unknown'}`,
      attemptId: row.id,
    });
  }

  private async lockOwner(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${LOCK_NAMESPACE}),
        hashtext(${organizationId})
      )
    `;
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

function readPlan(value: Prisma.JsonValue | null): CoupangDirectCapturePlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('COUPANG_DIRECT_PLAN_MISSING');
  }
  const plan = value as Record<string, unknown>;
  if (
    plan.sourceType !== DIRECT_SOURCE_TYPE
    || plan.parserVersion !== DIRECT_PARSER_VERSION
    || typeof plan.channelAccountId !== 'string'
    || plan.captureMode !== 'browser'
    || plan.transportScope !== 'ALL'
  ) {
    throw new Error('COUPANG_DIRECT_PLAN_INVALID');
  }
  return plan as CoupangDirectCapturePlan;
}

function parseStoredCapture(bytes: Buffer): CoupangDirectCapture {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('COUPANG_DIRECT_CAPTURE_INVALID');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('COUPANG_DIRECT_CAPTURE_INVALID');
  }
  const parsed = CoupangDirectOrderCollectionRequestSchema.safeParse({
    ...(value as Record<string, unknown>),
    transport: 'SHIPMENT',
  });
  if (!parsed.success) throw new Error('COUPANG_DIRECT_CAPTURE_INVALID');
  const { transport: _transport, ...capture } = parsed.data;
  return capture;
}

type DirectTransport = 'SHIPMENT' | 'MILKRUN';
type DirectQualityReport = {
  [key: string]: unknown;
  transportRefs: Partial<Record<DirectTransport, CoupangDirectTransportReceipt>>;
  transportSelections: Partial<Record<DirectTransport, string[]>>;
};

function readQualityReport(value: Prisma.JsonValue | null): DirectQualityReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { transportRefs: {}, transportSelections: {} };
  }
  const record = value as Record<string, unknown>;
  const transportRefs: Partial<Record<DirectTransport, CoupangDirectTransportReceipt>> = {};
  for (const transport of ['SHIPMENT', 'MILKRUN'] as const) {
    const receipt = receiptFromQualityReport(value, transport);
    if (receipt) transportRefs[transport] = receipt;
  }
  const rawSelections = record.transportSelections;
  const transportSelections: Partial<Record<DirectTransport, string[]>> = {};
  if (rawSelections && typeof rawSelections === 'object' && !Array.isArray(rawSelections)) {
    for (const transport of ['SHIPMENT', 'MILKRUN'] as const) {
      const selection = (rawSelections as Record<string, unknown>)[transport];
      if (Array.isArray(selection) && selection.every((key) => typeof key === 'string')) {
        transportSelections[transport] = selection;
      }
    }
  }
  return { ...record, transportRefs, transportSelections };
}

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
    throw new BadRequestException(
      '쿠팡 발주 상세(품목)를 수집하지 못했습니다. 확장에서 발주를 다시 수집한 뒤 시도해주세요.',
    );
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
    throw new ConflictException('COUPANG_DIRECT_CAPTURE_SELECTION_CONFLICT');
  }
  const storedKeys = new Set(stored.pos.map(purchaseOrderKey));
  if (selected.pos.some((purchaseOrder) => !storedKeys.has(purchaseOrderKey(purchaseOrder)))) {
    throw new ConflictException('COUPANG_DIRECT_CAPTURE_SELECTION_CONFLICT');
  }
}

function receiptFromQualityReport(
  value: Prisma.JsonValue | null,
  transport: 'SHIPMENT' | 'MILKRUN',
): CoupangDirectTransportReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const refs = (value as Record<string, unknown>).transportRefs;
  if (!refs || typeof refs !== 'object' || Array.isArray(refs)) return null;
  const receipt = (refs as Record<string, unknown>)[transport];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return null;
  const valueRecord = receipt as Record<string, unknown>;
  const exportId = nullableString(valueRecord.exportId);
  const transmissionIntentKey = nullableString(valueRecord.transmissionIntentKey);
  const matchedLineCount = numberValue(valueRecord.matchedLineCount);
  const reconciledRows = numberValue(valueRecord.reconciledRows);
  if (
    valueRecord.transport !== transport
    || typeof valueRecord.payloadChecksum !== 'string'
    || typeof valueRecord.sourceImportRunId !== 'string'
    || exportId === undefined
    || transmissionIntentKey === undefined
    || matchedLineCount === undefined
    || reconciledRows === undefined
    || typeof valueRecord.duplicate !== 'boolean'
  ) return null;
  const collectedLines = parseLineRefs(valueRecord.collectedLines);
  const matchedLines = parseLineRefs(valueRecord.matchedLines);
  const unmatchedLines = parseLineRefs(valueRecord.unmatchedLines);
  if (!collectedLines || !matchedLines || !unmatchedLines) return null;
  return {
    transport,
    payloadChecksum: valueRecord.payloadChecksum,
    sourceImportRunId: valueRecord.sourceImportRunId,
    exportId,
    transmissionIntentKey,
    matchedLineCount,
    reconciledRows,
    collectedLines,
    matchedLines,
    unmatchedLines,
    duplicate: valueRecord.duplicate,
  };
}

function receiptView(
  row: Prisma.CoupangDirectTransportReceiptGetPayload<{}>,
  duplicate: boolean,
): CoupangDirectTransportReceipt {
  if (row.transport !== 'SHIPMENT' && row.transport !== 'MILKRUN') {
    throw new Error('COUPANG_DIRECT_RECEIPT_INVALID');
  }
  const collectedLines = parseLineRefs(row.collectedLines);
  const matchedLines = parseLineRefs(row.matchedLines);
  const unmatchedLines = parseLineRefs(row.unmatchedLines);
  if (!collectedLines || !matchedLines || !unmatchedLines) {
    throw new Error('COUPANG_DIRECT_RECEIPT_INVALID');
  }
  return {
    transport: row.transport,
    payloadChecksum: row.payloadChecksum,
    sourceImportRunId: row.effectSourceImportRunId,
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

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

function expired(row: Pick<Prisma.SourceImportRunGetPayload<{}>, 'status' | 'expiresAt'>): boolean {
  return row.status === 'running' && (!row.expiresAt || row.expiresAt.getTime() <= Date.now());
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
