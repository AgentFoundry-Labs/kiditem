import { Inject, Injectable } from '@nestjs/common';
import { KiditemConflictError, KiditemNotFoundError } from '@kiditem/shared/errors';
import { COUPANG_DIRECTSHIP_KIND, CoupangDirectshipPlanSchema, type CoupangDirectshipPlan } from '@kiditem/shared/orders-operations';
import { OPERATION_PORT, type OperationPort } from '../../../common/operation/application/port/in/operation.port';
import type { OwnerTransaction } from '../../../common/owner-transaction';
import type { CoupangDirectPoSnapshotResponse } from '@kiditem/shared/coupang-direct-order';
import type {
  CoupangDirectCapture,
  CoupangDirectOrderCollectionPort,
  CoupangDirectProjection,
  CoupangDirectTransport,
  CoupangDirectTransportReceipt,
} from '../port/in/coupang-direct-order-collection.port';
import {
  COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT,
  type CoupangDirectOrderCollectionTransactionPort,
} from '../port/out/transaction/coupang-direct-order-collection.transaction.port';
import { directshipCalendarEntries, parseCapture } from '../../domain/coupang-directship-operation';

/**
 * 달력이 계정의 마지막 성공을 찾을 때 훑는 조직의 최근 성공한 directship 실행 수(reader 상한). 로켓 계정은 몇 개이고 수집은
 * 하루 몇 번이라, 한 계정의 마지막 성공이 이 창 밖으로 밀려나지 않는다.
 */
const SNAPSHOT_SCAN = 200;

/**
 * 쿠팡 직배송 원천의 문(KID-359). 캡처를 읽거나 변환하기 전에 그 실행이 이 조직의 성공한 `orders.coupang_directship`
 * 실행이고 계정이 맞는지 실행 계약에서 확인한다(옛 attempt 헤더 펜스 대신).
 */
@Injectable()
export class CoupangDirectOrderCollectionService implements CoupangDirectOrderCollectionPort {
  constructor(
    @Inject(COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT)
    private readonly transactions: CoupangDirectOrderCollectionTransactionPort,
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
  ) {}

  async planOperation(input: { organizationId: string; channelAccountId: string }): Promise<CoupangDirectshipPlan> {
    const channelAccountId = input.channelAccountId.toLowerCase();
    if (!(await this.transactions.isActiveRocketAccount({ organizationId: input.organizationId, channelAccountId }))) {
      throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'rocket_account', channelAccountId } });
    }
    return { channelAccountId, captureMode: 'browser' };
  }

  publishCapture(transaction: OwnerTransaction, input: { organizationId: string; operationId: string; capture: CoupangDirectCapture }) {
    return this.transactions.publishCapture(transaction, input);
  }

  async readCapture(input: { organizationId: string; operationId: string; channelAccountId?: string }): Promise<CoupangDirectCapture> {
    await this.assertSucceeded(input.organizationId, input.operationId, input.channelAccountId);
    return this.transactions.readCapture(input);
  }

  async readLatestSnapshot(input: { organizationId: string; channelAccountId: string }): Promise<CoupangDirectPoSnapshotResponse> {
    const channelAccountId = input.channelAccountId.toLowerCase();
    if (!(await this.transactions.isActiveRocketAccount({ organizationId: input.organizationId, channelAccountId }))) {
      throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'rocket_account', channelAccountId } });
    }
    const { operations } = await this.operations.list(input.organizationId, {
      kinds: [COUPANG_DIRECTSHIP_KIND],
      status: 'succeeded',
      limit: SNAPSHOT_SCAN,
    });
    // reader는 최근 시작한 것부터 준다 — 이 계정에서 처음 만난 성공이 마지막 수집이다.
    const latest = operations.find((operation) => {
      const plan = CoupangDirectshipPlanSchema.safeParse(operation.plan);
      return plan.success && plan.data.channelAccountId === channelAccountId;
    });
    if (!latest) return { channelAccountId, operationId: null, collectedAt: null, entries: [] };
    const capture = await this.transactions.readCapture({ organizationId: input.organizationId, operationId: latest.id });
    return {
      channelAccountId,
      operationId: latest.id,
      collectedAt: latest.finishedAt ? new Date(latest.finishedAt).toISOString() : null,
      entries: directshipCalendarEntries(capture.pos),
    };
  }

  async consume(input: {
    organizationId: string;
    userId: string;
    operationId: string;
    capture: CoupangDirectCapture;
    transport: CoupangDirectTransport;
  }): Promise<CoupangDirectTransportReceipt> {
    await this.assertSucceeded(input.organizationId, input.operationId, input.capture.channelAccountId);
    // 변환은 하위 투영이다. 고른 발주가 잘못돼도 성공한 캡처(실행)는 그대로 둔다.
    return this.transactions.consume({ ...input, capture: parseCapture(input.capture) });
  }

  readProjection(input: { organizationId: string; operationId: string; transport: CoupangDirectTransport }): Promise<CoupangDirectProjection> {
    return this.transactions.readProjection(input);
  }

  /** 이 조직의 성공한 directship 실행(그 계정)인가. 아니면 NOT_FOUND·STATE_CONFLICT. */
  private async assertSucceeded(organizationId: string, operationId: string, channelAccountId?: string): Promise<CoupangDirectshipPlan> {
    const operation = await this.operations.get(organizationId, operationId);
    if (!operation || operation.kind !== COUPANG_DIRECTSHIP_KIND) {
      throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'coupang_directship_operation', operationId } });
    }
    if (operation.status !== 'succeeded') {
      throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'COUPANG_DIRECT_OPERATION_NOT_SUCCEEDED', status: operation.status } });
    }
    const plan = CoupangDirectshipPlanSchema.parse(operation.plan);
    if (channelAccountId && channelAccountId.toLowerCase() !== plan.channelAccountId) {
      throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'COUPANG_DIRECT_ACCOUNT_MISMATCH' } });
    }
    return plan;
  }
}
