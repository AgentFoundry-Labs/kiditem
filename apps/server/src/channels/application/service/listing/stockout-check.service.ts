import type { StockoutCheckPort, StockoutCheckResult } from '../../port/in/listing/stockout-check.port';
import type { StockoutCheckPersistencePort, StockoutSubject } from '../../port/out/persistence/stockout-check.persistence.port';
import type { RegistrationExecutionRepositoryPort } from '../../port/out/repository/registration-execution.repository.port';
import type { ChannelAdapter, ChannelAdapterRegistryPort } from '../../port/out/channel/channel-adapter.port';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { ListingAvailabilitySnapshot } from '@kiditem/shared/sales-product';
import { FactConflictError, FactNotFoundError } from '../../../../common/errors/fact-errors';
import { getListingAvailabilityCapability } from '../../../domain/registration/mall-adapter-manifest';
import { decideStockout } from '../../../domain/listing/stockout-policy';
import { SalesProductDraftError, requireConfirmedPrice } from '../../../domain/sales-product/sales-product-draft';
import type { SalesProductOptionSupplyStatus, SalesProductStatus } from '@kiditem/shared/sales-product';

const POLICY = 'capacity_at_or_below_safety_stock' as const;

/** Explicit stockout coordination; collection and stock recovery do not invoke this service. */
export class StockoutCheckService implements StockoutCheckPort {
  constructor(private readonly persistence: StockoutCheckPersistencePort,
    private readonly executions: Pick<RegistrationExecutionRepositoryPort, 'prepareListingAvailability' | 'findListingAvailabilityByKey'>,
    /** 옵션 단위 몰이 어느 옵션에 판매자 재고를 받는지는 채널 어댑터가 답한다(KID-321). */
    private readonly adapters: ChannelAdapterRegistryPort) {}

  async preview(organizationId: string, listingIds: readonly string[]): Promise<StockoutCheckResult[]> {
    return (await this.persistence.readSubjects(organizationId, listingIds)).map(subject => evaluate(subject, this.adapters.get(subject.channel)));
  }

  async prepare(organizationId: string, userId: string | null, input: { listingId: string; idempotencyKey: string }) {
    const replay = await this.executions.findListingAvailabilityByKey({
      organizationId, requestedByUserId: userId, idempotencyKey: input.idempotencyKey,
    });
    if (replay) {
      if (replay.payload.channelListingId !== input.listingId
        || replay.payload.kind !== 'sold_out' || replay.payload.stockoutPolicy !== POLICY) {
        throw new FactConflictError('Idempotency key belongs to another availability intent.');
      }
      return replay;
    }
    const [subject] = await this.persistence.readSubjects(organizationId, [input.listingId]);
    if (!subject) throw new FactNotFoundError('Active channel listing not found.');
    const result = evaluate(subject, this.adapters.get(subject.channel));
    requireEligible(result);
    return this.executions.prepareListingAvailability({
      organizationId,
      requestedByUserId: userId,
      request: {
        channelAccountId: result.channelAccountId,
        externalListingId: result.externalListingId,
        kind: 'sold_out',
        stockoutPolicy: POLICY,
        optionCodes: result.optionCodes,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  async assertEligible(transaction: OwnerTransaction, organizationId: string, snapshot: ListingAvailabilitySnapshot, executionId: string): Promise<void> {
    if (snapshot.stockoutPolicy !== POLICY || snapshot.kind !== 'sold_out') {
      throw new FactConflictError('Inventory stockout requires a frozen sold-out policy.');
    }
    const [subject] = await this.persistence.readSubjects(organizationId, [snapshot.channelListingId], transaction);
    if (!subject) throw new FactNotFoundError('Active channel listing not found.');
    const result = evaluate(subject, this.adapters.get(subject.channel), executionId);
    requireEligible(result);
    if (result.channelAccountId !== snapshot.channelAccountId
      || result.externalListingId !== snapshot.externalListingId
      || result.channel !== snapshot.mallKey
      || JSON.stringify(result.optionCodes) !== JSON.stringify([...snapshot.optionCodes].sort())) {
      throw new FactConflictError('Inventory stockout targets changed after preparation.');
    }
  }
}

function requireEligible(result: StockoutCheckResult): void {
  if (result.decision !== 'eligible') {
    throw new FactConflictError(`Inventory stockout is not eligible: ${result.decision}.`);
  }
}

/** 초안의 값이 확정되었는가. 초안이 없는 몰 상품(수집으로만 들어온 것)은 가릴 것이 없다. */
function confirmedDraftPrice(subject: StockoutSubject): boolean {
  const product = subject.salesProduct;
  if (!product) return true;
  try {
    requireConfirmedPrice({
      name: product.name,
      status: product.status as SalesProductStatus,
      options: product.options.map((option) => ({
        id: option.id,
        supplyStatus: option.supplyStatus as SalesProductOptionSupplyStatus,
        salePrice: option.salePrice,
      })),
    });
    return true;
  } catch (error) {
    if (error instanceof SalesProductDraftError) return false;
    throw error;
  }
}

function evaluate(subject: StockoutSubject, adapter: ChannelAdapter, ownExecutionId?: string): StockoutCheckResult {
  const result: StockoutCheckResult = {
    listingId: subject.listingId, channelAccountId: subject.channelAccountId,
    externalListingId: subject.externalListingId, channel: subject.channel,
    decision: 'unknown', optionCodes: [],
  };
  const capability = getListingAvailabilityCapability(subject.channel, 'sold_out');
  if (!capability) return { ...result, decision: 'unsupported' };
  // 등록 동결 · 몰 엑셀과 같은 게이트다 — 값이 확정되지 않은 초안은 몰에 아무것도 보내지 않는다.
  if (!confirmedDraftPrice(subject)) return { ...result, decision: 'draft' };
  if (subject.activeExecutions.some(execution => execution.id !== ownExecutionId)) return { ...result, decision: 'active_execution' };
  if (alreadyStopped(subject.status)) return { ...result, decision: 'already_sold_out' };
  if (subject.options.length === 0) return result;
  if (subject.options.every(option => alreadyStopped(option.status))) return { ...result, decision: 'already_sold_out' };
  const decisions = subject.options.map(option => ({
    option,
    decision: decideStockout(option.capacity, option.safetyStock, option.compositionUnconfirmed),
  }));
  if (capability.axis === 'listing') {
    if (decisions.some(({ option, decision }) => decision === 'unknown' || !option.externalOptionId.trim())) return result;
    if (decisions.some(({ decision }) => decision === 'in_stock')) return { ...result, decision: 'in_stock' };
    return { ...result, decision: 'eligible', optionCodes: subject.options.map(option => option.externalOptionId).sort() };
  }
  const eligible = decisions.filter(({ option, decision }) => decision === 'out_of_stock'
    && !alreadyStopped(option.status) && option.externalOptionId.trim()
    && adapter.availabilityOption(option) === 'sendable');
  if (eligible.length > 0) return { ...result, decision: 'eligible', optionCodes: eligible.map(({ option }) => option.externalOptionId).sort() };
  if (decisions.some(({ option, decision }) => decision === 'unknown' || !option.externalOptionId.trim()
    || adapter.availabilityOption(option) === 'unknown')) return result;
  if (decisions.some(({ decision }) => decision === 'in_stock')) return { ...result, decision: 'in_stock' };
  return { ...result, decision: 'unsupported' };
}

function alreadyStopped(status: string | null): boolean {
  return status !== null && new Set([
    'sold_out', 'soldout', 'out_of_stock', 'off_sale', 'stopped', 'suspended',
    '품절', '판매중지', '판매 중지',
  ]).has(status.trim().toLowerCase());
}
