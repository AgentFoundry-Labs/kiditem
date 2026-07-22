import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  isRocketConfirmationBlockingReason,
  RocketPurchaseConfirmationRequestSchema,
  RocketPurchaseConfirmationReleaseRequestSchema,
  RocketPurchaseConfirmationResponseSchema,
  type RocketPurchaseConfirmationRequest,
  type RocketPurchaseConfirmationResponse,
  type RocketPurchaseConfirmationReleaseRequest,
  type RocketPurchasePreviewRequest,
} from '@kiditem/shared/rocket-purchase-preview';
import {
  ROCKET_PURCHASE_PREVIEW_PORT,
  type RocketPurchasePreviewPort,
} from '../port/in/procurement/rocket-purchase-preview.port';
import {
  ROCKET_PURCHASE_CONFIRMATION_TRANSACTION_PORT,
  type RocketPurchaseConfirmationTransactionPort,
} from '../port/out/transaction/rocket-purchase-confirmation.transaction.port';
import type { RocketPurchaseConfirmationPort } from '../port/in/procurement/rocket-purchase-confirmation.port';

@Injectable()
export class RocketPurchaseConfirmationService
implements RocketPurchaseConfirmationPort {
  constructor(
    @Inject(ROCKET_PURCHASE_PREVIEW_PORT)
    private readonly previewPort: RocketPurchasePreviewPort,
    @Inject(ROCKET_PURCHASE_CONFIRMATION_TRANSACTION_PORT)
    private readonly transactions: RocketPurchaseConfirmationTransactionPort,
  ) {}

  async confirm(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchaseConfirmationRequest;
  }): Promise<RocketPurchaseConfirmationResponse> {
    const request = RocketPurchaseConfirmationRequestSchema.parse(input.request);
    const {
      idempotencyKey: _idempotencyKey,
      shortageReasons: _shortageReasons,
      ...previewRequest
    } = request;
    const preview = await this.previewPort.preview({
      organizationId: input.organizationId,
      userId: input.userId,
      request: previewRequest satisfies RocketPurchasePreviewRequest,
    });
    if (!preview.catalog) {
      throw new BadRequestException(
        'A complete Rocket PO collection is required before confirmation.',
      );
    }
    if (preview.rows.some(({ reason }) => isRocketConfirmationBlockingReason(reason))) {
      throw new BadRequestException(
        'Every Rocket confirmation line requires a confirmed product recipe.',
      );
    }
    return RocketPurchaseConfirmationResponseSchema.parse(
      await this.transactions.confirm({
        organizationId: input.organizationId,
        userId: input.userId,
        sourceImportRunId: preview.catalog.run.id,
        request,
        preview,
      }),
    );
  }

  async release(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchaseConfirmationReleaseRequest;
  }): Promise<RocketPurchaseConfirmationResponse> {
    const request = RocketPurchaseConfirmationReleaseRequestSchema.parse(input.request);
    return RocketPurchaseConfirmationResponseSchema.parse(
      await this.transactions.release({
        organizationId: input.organizationId,
        userId: input.userId,
        confirmationId: request.confirmationId,
        reason: request.reason,
      }),
    );
  }
}
