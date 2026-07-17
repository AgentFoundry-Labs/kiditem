import { Inject, Injectable } from '@nestjs/common';
import {
  RocketPurchaseCommitmentActionRequestSchema,
  RocketPurchaseCommitmentActionResponseSchema,
  RocketPurchaseCommitmentListRequestSchema,
  RocketPurchaseCommitmentListResponseSchema,
  type RocketPurchaseCommitmentActionRequest,
  type RocketPurchaseCommitmentActionResponse,
  type RocketPurchaseCommitmentListRequest,
  type RocketPurchaseCommitmentListResponse,
} from '@kiditem/shared/inventory-commitment';
import {
  INVENTORY_COMMITMENT_PORT,
  type InventoryCommitmentPort,
} from '../../../inventory/application/port/in/stock/inventory-commitment.port';
import type { RocketPurchaseCommitmentQueryPort } from '../port/in/procurement/rocket-purchase-commitment-query.port';
import {
  ROCKET_PURCHASE_CONFIRMATION_QUERY_REPOSITORY_PORT,
  type RocketPurchaseConfirmationQueryRepositoryPort,
} from '../port/out/repository/rocket-purchase-confirmation-query.repository.port';

@Injectable()
export class RocketPurchaseCommitmentQueryService
implements RocketPurchaseCommitmentQueryPort {
  constructor(
    @Inject(ROCKET_PURCHASE_CONFIRMATION_QUERY_REPOSITORY_PORT)
    private readonly confirmations: RocketPurchaseConfirmationQueryRepositoryPort,
    @Inject(INVENTORY_COMMITMENT_PORT)
    private readonly inventory: InventoryCommitmentPort,
  ) {}

  async list(input: {
    organizationId: string;
    request: RocketPurchaseCommitmentListRequest;
  }): Promise<RocketPurchaseCommitmentListResponse> {
    const request = RocketPurchaseCommitmentListRequestSchema.parse(input.request);
    const page = await this.confirmations.listLines({
      organizationId: input.organizationId,
      ...(request.channelAccountId && {
        channelAccountId: request.channelAccountId,
      }),
      ...(request.cursor && { cursor: request.cursor }),
      limit: request.limit,
    });
    const commitments = await this.inventory.findBySourceIds({
      organizationId: input.organizationId,
      sourceIds: page.items.map(({ confirmationLineId }) => confirmationLineId),
    });
    const requestBySourceId = new Map(
      commitments
        .filter(({ kind }) => kind === 'rocket_request')
        .map((commitment) => [commitment.sourceId, commitment]),
    );
    const finalByPredecessorId = new Map(
      commitments
        .filter((commitment) =>
          commitment.kind === 'rocket_final_order'
          && commitment.predecessorCommitmentId !== null)
        .map((commitment) => [commitment.predecessorCommitmentId!, commitment]),
    );

    return RocketPurchaseCommitmentListResponseSchema.parse({
      items: page.items.map((line) => {
        const requestCommitment = requestBySourceId.get(line.confirmationLineId) ?? null;
        const finalOrderCommitment = requestCommitment
          ? finalByPredecessorId.get(requestCommitment.id) ?? null
          : null;
        const current = finalOrderCommitment ?? requestCommitment;
        return {
          ...line,
          requestCommitment,
          finalOrderCommitment,
          orderLineItemId: finalOrderCommitment?.sourceId ?? null,
          canRelease: current?.canRelease ?? false,
          canSettle: current?.canSettle ?? false,
        };
      }),
      nextCursor: page.nextCursor,
    });
  }

  async settleFinalOrders(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchaseCommitmentActionRequest;
  }): Promise<RocketPurchaseCommitmentActionResponse> {
    const request = RocketPurchaseCommitmentActionRequestSchema.parse(input.request);
    await this.inventory.settleFinalOrders({
      organizationId: input.organizationId,
      userId: input.userId,
      commitmentIds: request.commitmentIds,
      reason: request.reason,
    });
    return RocketPurchaseCommitmentActionResponseSchema.parse({
      affectedCommitmentIds: request.commitmentIds,
    });
  }

  async releaseFinalOrders(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchaseCommitmentActionRequest;
  }): Promise<RocketPurchaseCommitmentActionResponse> {
    const request = RocketPurchaseCommitmentActionRequestSchema.parse(input.request);
    await this.inventory.releaseFinalOrders({
      organizationId: input.organizationId,
      userId: input.userId,
      commitmentIds: request.commitmentIds,
      reason: request.reason,
    });
    return RocketPurchaseCommitmentActionResponseSchema.parse({
      affectedCommitmentIds: request.commitmentIds,
    });
  }
}
