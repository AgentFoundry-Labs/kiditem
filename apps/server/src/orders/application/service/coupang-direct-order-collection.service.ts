import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  CoupangDirectOrderCollectionRequestSchema,
} from '@kiditem/shared/coupang-direct-order';
import type {
  CoupangDirectCapture,
  CoupangDirectOrderCollectionPort,
  CoupangDirectOwnerAttempt,
  CoupangDirectOwnerAttemptControl,
  CoupangDirectProjection,
} from '../port/in/coupang-direct-order-collection.port';
import {
  COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT,
  type CoupangDirectOrderCollectionTransactionPort,
} from '../port/out/transaction/coupang-direct-order-collection.transaction.port';

@Injectable()
export class CoupangDirectOrderCollectionService
implements CoupangDirectOrderCollectionPort {
  constructor(
    @Inject(COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT)
    private readonly transactions: CoupangDirectOrderCollectionTransactionPort,
  ) {}

  beginAttempt(input: Parameters<CoupangDirectOrderCollectionPort['beginAttempt']>[0]) {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
    }
    if (!isUuid(input.channelAccountId)) {
      throw new BadRequestException('INVALID_CHANNEL_ACCOUNT_ID');
    }
    return this.transactions.beginAttempt({
      ...input,
      idempotencyKey: input.idempotencyKey.trim(),
    });
  }

  readAttempt(
    input: Parameters<CoupangDirectOrderCollectionPort['readAttempt']>[0],
  ): Promise<CoupangDirectOwnerAttempt | null> {
    return this.transactions.readAttempt(input);
  }

  readAttemptControl(
    input: Parameters<CoupangDirectOrderCollectionPort['readAttemptControl']>[0],
  ): Promise<CoupangDirectOwnerAttemptControl | null> {
    return this.transactions.readAttemptControl(input);
  }

  async completeAttempt(
    input: Parameters<CoupangDirectOrderCollectionPort['completeAttempt']>[0],
  ): Promise<CoupangDirectOwnerAttempt> {
    try {
      const capture = parseCapture(input.capture);
      return await this.transactions.completeAttempt({ ...input, capture });
    } catch (error) {
      // The completion transaction rolls back all Orders/Supply/artifact writes;
      // terminalize provider/mapping failures separately so the failed capture
      // and Alert remain visible without inventing a second run ledger. Fence
      // and terminal replay conflicts must not mutate the owner.
      if (!(error instanceof ConflictException)) {
        try {
          await this.transactions.failAttempt({
            organizationId: input.organizationId,
            attemptId: input.attemptId,
            attemptToken: input.attemptToken,
            code: 'CAPTURE_FAILED',
            message: failureMessage(error),
          });
        } catch {
          // A concurrent terminal mutation must retain the original error.
        }
      }
      throw error;
    }
  }

  async consumeAttempt(input: {
    organizationId: string;
    userId: string;
    attemptId: string;
    attemptToken: string;
    capture: unknown;
    transport: unknown;
  }) {
    const capture = parseCapture(input.capture);
    const transport = parseTransport(input.transport);
    // Consumption is a downstream, transport-scoped projection. A malformed
    // or unmappable selection must not turn the already-complete raw capture
    // into a failed source attempt.
    return this.transactions.consumeAttempt({
      ...input,
      capture,
      transport,
    });
  }

  failAttempt(
    input: Parameters<CoupangDirectOrderCollectionPort['failAttempt']>[0],
  ): Promise<CoupangDirectOwnerAttempt> {
    return this.transactions.failAttempt(input);
  }

  readCaptured(
    input: Parameters<CoupangDirectOrderCollectionPort['readCaptured']>[0],
  ) {
    return this.transactions.readCaptured(input);
  }

  readProjection(
    input: Parameters<CoupangDirectOrderCollectionPort['readProjection']>[0],
  ): Promise<CoupangDirectProjection> {
    return this.transactions.readProjection(input);
  }

}

function parseCapture(value: unknown): CoupangDirectCapture {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Invalid Coupang direct order capture');
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.transport !== undefined
    && candidate.transport !== 'SHIPMENT'
    && candidate.transport !== 'MILKRUN'
  ) {
    throw new BadRequestException('운송유형(transport)은 SHIPMENT 또는 MILKRUN 이어야 합니다.');
  }
  const parsed = CoupangDirectOrderCollectionRequestSchema.safeParse({
    ...candidate,
    // Validate the transport-independent payload with either allowed transport;
    // the capture itself is persisted once and projected later per transport.
    transport: 'SHIPMENT',
  });
  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid Coupang direct order capture',
      errors: parsed.error.flatten(),
    });
  }
  const { transport: _transport, ...capture } = parsed.data;
  return capture;
}

function parseTransport(value: unknown): 'SHIPMENT' | 'MILKRUN' {
  if (value !== 'SHIPMENT' && value !== 'MILKRUN') {
    throw new BadRequestException('운송유형(transport)은 SHIPMENT 또는 MILKRUN 이어야 합니다.');
  }
  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 300);
  if (typeof error === 'string') return error.slice(0, 300);
  return 'Coupang direct order capture failed.';
}
