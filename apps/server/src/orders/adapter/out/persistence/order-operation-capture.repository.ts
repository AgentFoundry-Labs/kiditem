import { Inject, Injectable } from '@nestjs/common';
import { KiditemNotFoundError } from '@kiditem/shared/errors';
import type { OperationKind } from '@kiditem/shared/operation';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import {
  OPERATION_PORT,
  type OperationPort,
} from '../../../../common/operation/application/port/in/operation.port';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  OrderOperationCapture,
  OrderOperationCapturePort,
  OrderOperationCaptureSource,
} from '../../../application/port/in/order-operation-capture.port';

/**
 * `OrderCollectionArtifact(operationId)` 보관함. 실행 상태는 실행 계약의 reader(`OperationPort.get`)로만 본다 —
 * 실행 표를 직접 읽지 않는다(ADR-0025, `check:operation-owner-boundary`).
 */
@Injectable()
export class OrderOperationCapturePersistenceAdapter implements OrderOperationCapturePort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
  ) {}

  async store(transaction: OwnerTransaction, input: {
    organizationId: string;
    operationId: string;
    source: OrderOperationCaptureSource;
  }): Promise<{ artifactId: string }> {
    const created = await ownerTransactionClient(transaction).orderCollectionArtifact.create({
      data: {
        organizationId: input.organizationId,
        operationId: input.operationId,
        sourceFileName: input.source.fileName,
        sourceContentType: input.source.contentType,
        sourceBytes: new Uint8Array(input.source.bytes),
      },
      select: { id: true },
    });
    return { artifactId: created.id };
  }

  async readSucceeded(input: { organizationId: string; operationId: string; kind: OperationKind }) {
    const operation = await this.operations.get(input.organizationId, input.operationId);
    if (!operation || operation.kind !== input.kind) throw notFound(input, 'operation_not_found');
    if (operation.status !== 'succeeded') throw notFound(input, 'operation_not_succeeded');
    const row = await this.prisma.orderCollectionArtifact.findUnique({
      where: { operationId_organizationId: { operationId: input.operationId, organizationId: input.organizationId } },
    });
    if (!row) throw notFound(input, 'capture_missing');
    const capture: OrderOperationCapture = {
      artifactId: row.id,
      bytes: Buffer.from(row.sourceBytes),
      fileName: row.sourceFileName,
      contentType: row.sourceContentType,
    };
    return { operation, capture };
  }
}

function notFound(input: { operationId: string; kind: OperationKind }, reason: string): KiditemNotFoundError {
  return new KiditemNotFoundError('OPERATION_NOT_FOUND', { details: { reason, operationId: input.operationId, kind: input.kind } });
}
