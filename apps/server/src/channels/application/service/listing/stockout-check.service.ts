import type { StockoutCheckPort, StockoutCheckResult } from '../../port/in/listing/stockout-check.port';
import type { StockoutCheckPersistencePort, StockoutSubject } from '../../port/out/persistence/stockout-check.persistence.port';
import type { RegistrationExecutionRepositoryPort } from '../../port/out/repository/registration-execution.repository.port';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { ListingAvailabilitySnapshot } from '@kiditem/shared/sales-product';
import { FactConflictError, FactNotFoundError } from '../../../../common/errors/fact-errors';
import { getListingAvailabilityCapability } from '../../../domain/registration/mall-adapter-manifest';
import { decideStockout } from '../../../domain/listing/stockout-policy';

const POLICY = 'capacity_at_or_below_safety_stock' as const;

/** Explicit stockout coordination; collection and stock recovery do not invoke this service. */
export class StockoutCheckService implements StockoutCheckPort {
  constructor(private readonly persistence: StockoutCheckPersistencePort,
    private readonly executions: Pick<RegistrationExecutionRepositoryPort, 'prepareListingAvailability' | 'findListingAvailabilityByKey'>) {}

  async preview(organizationId: string, listingIds: readonly string[]): Promise<StockoutCheckResult[]> {
    return (await this.persistence.readSubjects(organizationId, listingIds)).map(subject => evaluate(subject));
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
    const result = evaluate(subject);
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
    const result = evaluate(subject, executionId);
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

function evaluate(subject: StockoutSubject, ownExecutionId?: string): StockoutCheckResult {
  const result: StockoutCheckResult = {
    listingId: subject.listingId, channelAccountId: subject.channelAccountId,
    externalListingId: subject.externalListingId, channel: subject.channel,
    decision: 'unknown', optionCodes: [],
  };
  const capability = getListingAvailabilityCapability(subject.channel, 'sold_out');
  if (!capability) return { ...result, decision: 'unsupported' };
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
    && (subject.channel !== 'coupang' || option.registrationType === 'NORMAL'));
  if (eligible.length > 0) return { ...result, decision: 'eligible', optionCodes: eligible.map(({ option }) => option.externalOptionId).sort() };
  if (decisions.some(({ option, decision }) => decision === 'unknown' || !option.externalOptionId.trim()
    || (subject.channel === 'coupang' && option.registrationType === null))) return result;
  if (decisions.some(({ decision }) => decision === 'in_stock')) return { ...result, decision: 'in_stock' };
  return { ...result, decision: 'unsupported' };
}

function alreadyStopped(status: string | null): boolean {
  return status !== null && new Set([
    'sold_out', 'soldout', 'out_of_stock', 'off_sale', 'stopped', 'suspended',
    '품절', '판매중지', '판매 중지',
  ]).has(status.trim().toLowerCase());
}
