import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import {
  MALL_AVAILABILITY_ROWS_CHUNK_KIND,
  MallAvailabilityReadPlanSchema,
  MallAvailabilityReadResultSchema,
  MallAvailabilityReadScopeSchema,
  MallAvailabilityRowSchema,
  type MallAvailabilityReadPlan,
} from '@kiditem/shared/channels-operations';
import { accountLockKey, type OperationPlanResult, type OperationStagedChunk } from '@kiditem/shared/operation';
import type { MallAvailabilityReadOperationPort } from '../../port/in/registration-operation.port';
import type { RegistrationOperationRepositoryPort } from '../../port/out/repository/registration-operation.repository.port';

/**
 * 몰 판매 상태 읽기 kind `channels.mall_availability_read`(옛 `readMallAvailability`, KID-364). 몰 계정 하나의 몰 로그인을
 * 쓰므로 잠금은 `account:<id>` 다. finalize 는 원장을 쓰지 않고 받은 행을 `result` 에만 남긴다(KID-369 전까지).
 */
export class MallAvailabilityReadService implements MallAvailabilityReadOperationPort {
  constructor(private readonly repository: Pick<RegistrationOperationRepositoryPort, 'readActiveAccount'>) {}

  async plan(rawScope: Record<string, unknown>, context: { organizationId: string }): Promise<OperationPlanResult> {
    const parsed = MallAvailabilityReadScopeSchema.safeParse(rawScope);
    if (!parsed.success) throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'REQUEST_INVALID' }, cause: parsed.error });
    const account = await this.repository.readActiveAccount(context.organizationId, parsed.data.channelAccountId);
    if (account.channel !== parsed.data.mallKey) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'MALL_KEY_MISMATCH' } });
    }
    const plan: MallAvailabilityReadPlan = MallAvailabilityReadPlanSchema.parse({
      ...parsed.data,
      externalListingIds: [...new Set(parsed.data.externalListingIds)],
      expectedProviderAccountId: account.expectedProviderAccountId,
      startedAt: new Date().toISOString(),
    });
    return { plan, lockKeys: [accountLockKey(account.id)] };
  }

  async finalize(chunks: OperationStagedChunk[], context: { plan: Record<string, unknown> }): Promise<Record<string, unknown>> {
    const plan = MallAvailabilityReadPlanSchema.parse(context.plan);
    const rows = chunks
      .filter((chunk) => chunk.chunkKind === MALL_AVAILABILITY_ROWS_CHUNK_KIND)
      .flatMap((chunk) => chunk.payload.map((row) => MallAvailabilityRowSchema.parse(row)));
    const requested = new Set(plan.externalListingIds);
    const kept = rows.filter((row) => requested.has(row.externalListingId));
    const seen = new Set(kept.map((row) => row.externalListingId));
    return MallAvailabilityReadResultSchema.parse({
      rowCount: kept.length,
      missingExternalListingIds: plan.externalListingIds.filter((id) => !seen.has(id)),
      rows: kept,
    });
  }
}
