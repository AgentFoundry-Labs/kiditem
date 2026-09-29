import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { resolveCoupangVendorId } from '../../../../channels/domain/account/coupang-account-identity';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AD_ACTION_KIND } from '@kiditem/shared/advertising-operations';
import { readOperationsByPlan } from '../../../../common/operation/transaction/operations-by-plan';
import type { AdActionOperationRepositoryPort } from '../../../application/port/out/repository/ad-action-operation.repository.port';
import type { AdActionExecutionRecord } from '../../../domain/ad-action-operation';

/** 광고 액션 실행 kind(KID-386)의 persistence. 계정은 Channels 계정 capability로만 읽는다. */
@Injectable()
export class AdActionOperationRepository implements AdActionOperationRepositoryPort {
  constructor(
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    private readonly prisma: PrismaService,
  ) {}

  async readAction(organizationId: string, actionId: string, transaction?: OwnerTransaction) {
    const client = transaction ? ownerTransactionClient(transaction) : this.prisma;
    return client.adAction.findFirst({
      where: { id: actionId, organizationId },
      select: { id: true, actionType: true, approvalStatus: true, targetLabel: true, channelAccountId: true, payload: true },
    });
  }

  async readAccount(organizationId: string, channelAccountId: string, transaction?: OwnerTransaction) {
    const account = await this.channelAccounts.resolveActiveProvider(transaction ?? ownerTransaction(this.prisma), {
      organizationId,
      channel: 'coupang',
      accountId: channelAccountId,
    });
    if (!account || account.id !== channelAccountId) return null;
    return { id: account.id, vendorId: resolveCoupangVendorId(account) };
  }

  async readRunResult(
    transaction: OwnerTransaction,
    input: { organizationId: string; actionId: string; operationId: string },
  ) {
    const rows = await readOperationsByPlan(ownerTransactionClient(transaction), {
      organizationId: input.organizationId,
      kinds: [AD_ACTION_KIND],
      planContainsAny: [{ actionId: input.actionId }],
      plan: { payloadKeys: [] },
    });
    const result = rows.find((row) => row.id === input.operationId)?.result;
    return result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, unknown>) : null;
  }

  async recordExecution(
    transaction: OwnerTransaction,
    input: { organizationId: string; actionId: string; execution: AdActionExecutionRecord },
  ) {
    const tx = ownerTransactionClient(transaction);
    await tx.$executeRaw(Prisma.sql`
      UPDATE ad_actions
      SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('execution', ${JSON.stringify(input.execution)}::jsonb)
      WHERE id = ${input.actionId}::uuid AND organization_id = ${input.organizationId}::uuid
    `);
  }
}
