import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../../../channels/application/port/in/channel-option-recipe.port';
// `AdAction` aggregate adapter: query + persistence + dedup + transaction-
// wrapped lifecycle writes. The adapter owns `$transaction` for approve /
// reject / registration so the application service stays Prisma-free.
// An action is a decision; its execution is an `advertising.ad_action`
// operation (KID-386) read through `read/ad-action-execution.ts`. This adapter
// prepares and cancels that operation through `OPERATION_PORT`; the retired
// attempt table is neither read nor written.

import { Injectable, Optional, Inject } from '@nestjs/common';
import { Prisma, type AdAction } from '@prisma/client';
import { KiditemConflictError } from '@kiditem/shared/errors';
import {
  AD_ACTION_COMMAND_MAX_IDS,
  AdKeywordPauseProposalSchema,
  type AdActionExecuteStatus,
} from '@kiditem/shared/advertising';
import { AD_ACTION_KIND, adActionLockKey } from '@kiditem/shared/advertising-operations';
import { PrismaService } from '../../../../prisma/prisma.service';
import { OPERATION_PORT, type OperationPort } from '../../../../common/operation/application/port/in/operation.port';
import {
  AD_LEDGER_READ_REPOSITORY_PORT,
  type AdLedgerReadRepositoryPort,
} from '../../../application/port/out/repository/ad-ledger-read.repository.port';
import { activeAdAccountIds, AD_SWEEP_CHANNEL } from '../../../domain/ad-sweep-coverage';
import {
  NOT_PREPARED_EXECUTION,
  readAdActionExecutions,
} from './read/ad-action-execution';
import { AdListingRepositoryAdapter } from './ad-listing.repository';
import { readPublishedProductAbcGrades } from '../../../../products/adapter/out/persistence/read/product-abc-publication.reader';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';
import type { ActionCandidate } from '../../../domain/ad-action-rules';
import { isExecutableAdActionType, isOpenAdAction } from '../../../domain/ad-action-operation';
import type {
  AdActionExecution,
  AdActionQuery,
  AdActionRecord,
  AdActionRepositoryPort,
  AdActionReviewOptions,
  AdActionReviewResult,
  ExistingAdActionDedupRow,
  KeywordPauseProposalRow,
  HydratedAdAction,
  AdRuleTarget,
  KeywordPauseKey,
} from '../../../application/port/out/repository/ad-action.repository.port';

const OPEN_ACTION_APPROVAL_STATUSES = ['pending_review', 'approved'] as const;
/** Executions after which the action changed the ad center or may have, which keep a campaign name taken. */
const APPLIED_EXECUTE_STATUSES: readonly AdActionExecuteStatus[] = ['done', 'uncertain'];

const OPEN_ACTION_APPROVAL_STATUS_VALUES = Prisma.join(
  OPEN_ACTION_APPROVAL_STATUSES.map((status) => Prisma.sql`${status}`),
);

/**
 * Each keyword's newest `pause_keyword` proposal, whatever its review: one row
 * per advertised option (`external_id`) and keyword text (`target_label`).
 * The keyword read shows it and the pause dedupe tests it, so the proposal an
 * operator sees is the only one that can block a new proposal for the keyword.
 * Rejecting it is the last word on the keyword: an older proposal neither shows
 * nor blocks. Use it as a CTE aliased `action`, with its own organization
 * predicate at each use.
 */
function latestPauseKeywordProposals(organizationId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT ON (proposal.external_id, proposal.target_label)
      proposal.id,
      proposal.organization_id,
      proposal.action_type,
      proposal.external_id,
      proposal.target_label,
      proposal.reason,
      proposal.approval_status,
      proposal.operation_id
    FROM ad_actions proposal
    WHERE proposal.organization_id = ${organizationId}::uuid
      AND proposal.action_type = 'pause_keyword'
      AND proposal.target_type = 'keyword'
    ORDER BY proposal.external_id, proposal.target_label,
      proposal.created_at DESC, proposal.id DESC`;
}

/** Every stored AdAction column; the execution words come from its operation. */
const AD_ACTION_ROW_SELECT = {
  id: true,
  organizationId: true,
  listingId: true,
  actionType: true,
  targetType: true,
  externalId: true,
  targetLabel: true,
  reason: true,
  priority: true,
  currentValue: true,
  proposedValue: true,
  payload: true,
  approvalStatus: true,
  approvedAt: true,
  channelAccountId: true,
  operationId: true,
  createdAt: true,
} as const;

type AdActionRow = Omit<AdAction, keyof AdActionExecution>;

@Injectable()
export class AdActionRepositoryAdapter implements AdActionRepositoryPort {
  constructor(
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly channelRecipes: ChannelOptionRecipePort,
    private readonly prisma: PrismaService,
    // Reused for the listing hydration step in `findAdActionsForReview`.
    // The adapter depends on a sibling adapter here, which is allowed for
    // intra-domain composition; ports/services never see this.
    private readonly listingAdapter: AdListingRepositoryAdapter,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(AD_LEDGER_READ_REPOSITORY_PORT) private readonly ledger: AdLedgerReadRepositoryPort,
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
    @Optional()
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly products?: ProductTransactionalReadPort,
  ) {}

  async findAdActionsForReview(
    query: AdActionQuery,
    organizationId: string,
  ): Promise<AdActionReviewResult> {
    // A page holds at most as many actions as one approve or reject command names.
    const limit = Math.min(query.limit || 50, AD_ACTION_COMMAND_MAX_IDS);
    // Execution words live on operations, so the page, its execution filter
    // and the counts are decided here over the organization's actions.
    const all = await this.prisma.adAction.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        operationId: true,
        approvalStatus: true,
        listingId: true,
        targetType: true,
        priority: true,
      },
    });
    const executions = await readAdActionExecutions(this.prisma, { organizationId, actions: all });
    const statusOf = (id: string) => executions.get(id)?.executeStatus ?? 'not_prepared';
    const matches = (value: string | undefined, actual: string | null) =>
      !value || value === 'all' || value === actual;
    const page = all
      .filter((action) =>
        matches(query.approvalStatus, action.approvalStatus)
        && matches(query.executeStatus, statusOf(action.id))
        && (!query.listingId || action.listingId === query.listingId)
        && matches(query.targetType, action.targetType)
        && matches(query.priority, action.priority))
      .slice(0, limit);
    const count = (predicate: (action: (typeof all)[number]) => boolean) => all.filter(predicate).length;

    const rows: AdActionRow[] =
      page.length === 0
        ? []
        : await this.prisma.adAction.findMany({
            where: { organizationId, id: { in: page.map((entry) => entry.id) } },
            select: AD_ACTION_ROW_SELECT,
          });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const actions: AdActionRecord[] = page.flatMap((entry) => {
      const row = rowById.get(entry.id);
      return row ? [{ ...row, ...(executions.get(entry.id) ?? NOT_PREPARED_EXECUTION) }] : [];
    });

    const hydrated = await this.hydrateActionRelations(organizationId, actions);
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const sortedItems = [...hydrated].sort((a, b) => {
      const priDiff =
        (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 9) -
        (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 9);
      if (priDiff !== 0) return priDiff;
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });

    return {
      items: sortedItems,
      summary: {
        pendingReview: count((action) => action.approvalStatus === 'pending_review'),
        approvedQueued: count((action) => action.approvalStatus === 'approved' && statusOf(action.id) === 'queued'),
        running: count((action) => statusOf(action.id) === 'running'),
        done: count((action) => statusOf(action.id) === 'done'),
        uncertain: count((action) => statusOf(action.id) === 'uncertain'),
        failed: count((action) => statusOf(action.id) === 'failed'),
      },
    };
  }

  async findRuleTargets(organizationId: string): Promise<AdRuleTarget[]> {
    return this.prisma.$transaction(
      async (tx) => {
        const handle = ownerTransaction(tx);
        const identities = await this.channelAccounts.readProviderIdentities(handle, {
          organizationId,
          channel: AD_SWEEP_CHANNEL,
        });
        // Current campaigns and search keywords of the recent measured window
        // of the ad report ledger (KID-372).
        const current = await this.ledger.readCurrentAdTargets(handle, {
          organizationId,
          activeAccountIds: activeAdAccountIds(identities),
        });
        const businessDate = current.latestMeasuredDate;
        if (businessDate === null) return [];
        const measuredDays = current.measuredDates.length;
        const windowStartDate = current.measuredDates[0];
        const catalog = await this.channelListings.readCatalogFacts(handle, {
          organizationId, channels: ['coupang'], activeAccountsOnly: true, activeOnly: true,
        });
        const listingById = new Map(catalog.map((row) => [row.id, row]));
        const scoped = (id: string | null) => (id && listingById.has(id) ? id : null);
        const targets: Array<Omit<AdRuleTarget, 'abcGrade'>> = [
          ...current.campaigns.map((campaign) => {
            const listingIds = campaign.listingIds.filter((id) => listingById.has(id));
            const listingId = listingIds.length === 1 ? listingIds[0] : null;
            return {
              targetType: 'campaign' as const,
              channelAccountId: campaign.channelAccountId,
              campaignId: campaign.campaignId,
              campaignName: campaign.campaignName,
              adGroupId: null,
              keyword: null,
              vendorItemId: null,
              vendorItemIds: [...campaign.vendorItemIds],
              listingIds,
              listingId,
              listingChannel: listingId ? listingById.get(listingId)!.channel : null,
              productName: null,
              isActive: campaign.isActive,
              budget: campaign.budget,
              spend: campaign.spend,
              revenue: campaign.revenue,
              impressions: campaign.impressions,
              clicks: campaign.clicks,
              orders: campaign.orders,
              businessDate,
              measuredDays,
              windowStartDate,
            };
          }),
          ...current.keywords.filter((row) => !row.nonSearch).map((row) => {
            const listingId = scoped(row.listingId);
            const campaign = current.campaigns.find((item) =>
              item.channelAccountId === row.channelAccountId && item.campaignId === row.campaignId);
            return {
              targetType: 'keyword' as const,
              channelAccountId: row.channelAccountId,
              campaignId: row.campaignId,
              campaignName: row.campaignName,
              adGroupId: row.adGroupId,
              keyword: row.keyword,
              vendorItemId: row.vendorItemId,
              vendorItemIds: [row.vendorItemId],
              listingIds: listingId ? [listingId] : [],
              listingId,
              listingChannel: listingId ? listingById.get(listingId)!.channel : null,
              productName: row.optionName,
              isActive: campaign?.isActive ?? null,
              budget: null,
              spend: row.spend,
              revenue: row.revenue,
              impressions: row.impressions,
              clicks: row.clicks,
              orders: row.orders,
              businessDate,
              measuredDays,
              windowStartDate,
            };
          }),
        ];
        if (targets.length === 0) return [];
        const listingIds = [...new Set(targets.flatMap((target) => (target.listingId ? [target.listingId] : [])))];
        const summaries = await this.channelRecipes.readListingProductSummaries(handle, { organizationId, listingIds });
        const masterProductIds = [...new Set(listingIds.flatMap((id) => {
          const masterProductId = summaries.get(id);
          return masterProductId ? [masterProductId] : [];
        }))];
        const identitiesById = new Map((this.products
          ? await this.products.readSourceIdentities(
            { client: tx },
            { organizationId, selector: { kind: 'ids', values: masterProductIds } },
          )
          : []).map((identity) => [identity.masterProductId, identity]));
        const gradeByProductId = await readPublishedProductAbcGrades(tx, { organizationId, masterProductIds });
        return targets.map((target) => {
          const listing = target.listingId ? listingById.get(target.listingId) ?? null : null;
          const masterProductId = target.listingId ? summaries.get(target.listingId) ?? null : null;
          return {
            ...target,
            productName:
              (masterProductId ? identitiesById.get(masterProductId)?.name : null) ??
              listing?.displayName ?? listing?.channelName ?? target.productName ?? listing?.externalId ?? null,
            abcGrade: masterProductId ? gradeByProductId.get(masterProductId) ?? null : null,
          };
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findAppliedKeywordPauses(organizationId: string, sinceDate: string): Promise<KeywordPauseKey[]> {
    const since = new Date(`${sinceDate}T00:00:00+09:00`);
    const pauses = await this.prisma.adAction.findMany({
      where: {
        organizationId,
        actionType: 'pause_keyword',
        targetType: 'keyword',
        createdAt: { gte: since },
      },
      select: { id: true, operationId: true, approvalStatus: true, externalId: true, targetLabel: true },
    });
    const executions = await readAdActionExecutions(this.prisma, { organizationId, actions: pauses });
    const applied = new Map<string, KeywordPauseKey>();
    for (const pause of pauses) {
      if (pause.approvalStatus !== 'approved' && executions.get(pause.id)?.executeStatus !== 'done') continue;
      applied.set(`${pause.externalId ?? ''}\u0000${pause.targetLabel}`, { externalId: pause.externalId, targetLabel: pause.targetLabel });
    }
    return [...applied.values()];
  }

  async findExistingInflightActions(
    organizationId: string,
    sinceCreatedAt: Date,
  ): Promise<ExistingAdActionDedupRow[]> {
    const rows = await this.prisma.adAction.findMany({
      where: {
        organizationId,
        createdAt: { gte: sinceCreatedAt },
        approvalStatus: { in: [...OPEN_ACTION_APPROVAL_STATUSES] },
      },
      select: {
        id: true,
        operationId: true,
        approvalStatus: true,
        actionType: true,
        externalId: true,
        targetLabel: true,
        currentValue: true,
        proposedValue: true,
      },
    });
    const executions = await readAdActionExecutions(this.prisma, { organizationId, actions: rows });
    return rows
      .filter((row) => isOpenAdAction(row, executions.get(row.id)?.executeStatus ?? 'not_prepared'))
      .map(({ actionType, externalId, targetLabel, currentValue, proposedValue }) => ({
        actionType,
        externalId,
        targetLabel,
        currentValue,
        proposedValue,
      }));
  }

  async findKeywordPauseProposals(
    organizationId: string,
  ): Promise<KeywordPauseProposalRow[]> {
    const rows = await this.prisma.$queryRaw<Array<{
      actionId: string;
      operationId: string | null;
      externalId: string | null;
      targetLabel: string;
      reason: string;
      approvalStatus: string;
    }>>(Prisma.sql`
      WITH latest_proposal AS (${latestPauseKeywordProposals(organizationId)})
      SELECT
        action.id AS "actionId",
        action.operation_id AS "operationId",
        action.external_id AS "externalId",
        action.target_label AS "targetLabel",
        action.reason,
        action.approval_status AS "approvalStatus"
      FROM latest_proposal action
      WHERE action.organization_id = ${organizationId}::uuid
        AND action.approval_status IN (${OPEN_ACTION_APPROVAL_STATUS_VALUES})
    `);
    const executions = await readAdActionExecutions(this.prisma, {
      organizationId,
      actions: rows.map((row) => ({ id: row.actionId, operationId: row.operationId })),
    });
    return rows.flatMap((row) => {
      const execution = executions.get(row.actionId) ?? NOT_PREPARED_EXECUTION;
      const approvalStatus = AdKeywordPauseProposalSchema.shape.approvalStatus.safeParse(row.approvalStatus);
      if (!approvalStatus.success) return [];
      return [{
        actionId: row.actionId,
        externalId: row.externalId,
        targetLabel: row.targetLabel,
        reason: row.reason,
        approvalStatus: approvalStatus.data,
        executeStatus: execution.executeStatus,
        errorMessage: execution.errorMessage,
      }];
    });
  }

  async createAdActionsFromCandidates(
    organizationId: string,
    candidates: ActionCandidate[],
  ): Promise<AdActionRecord[]> {
    if (candidates.length === 0) return [];
    return this.prisma.$transaction(async (tx) => {
      const pauseKeywordCandidates = candidates.filter((candidate) =>
        pauseKeywordActionKey(candidate) !== null);

      const existingPauseKeys = new Set<string>();
      if (pauseKeywordCandidates.length > 0) {
        // Prevent two concurrent strategy runs from both seeing "no open action"
        // and inserting duplicate pause_keyword proposals for the same tenant.
        // Only a keyword's newest proposal, the one the keyword read shows, can
        // block it, and an approved pause stays open until the operator closes
        // it (`isOpenAdAction`), so a confirmed keyword is not proposed again.
        await tx.$queryRaw(
          Prisma.sql`
            SELECT pg_advisory_xact_lock(
              hashtext('kiditem_ad_action_pause_keyword'::text),
              hashtext(${organizationId}::text)
            )::text AS locked
          `,
        );

        const latest = await tx.$queryRaw<
          Array<{ id: string; operationId: string | null; actionType: string; approvalStatus: string; externalId: string | null; targetLabel: string }>
        >(Prisma.sql`
          WITH latest_proposal AS (${latestPauseKeywordProposals(organizationId)})
          SELECT action.id, action.operation_id AS "operationId", action.action_type AS "actionType",
            action.approval_status AS "approvalStatus", action.external_id AS "externalId",
            action.target_label AS "targetLabel"
          FROM latest_proposal action
          WHERE action.organization_id = ${organizationId}::uuid
            AND action.approval_status IN (${OPEN_ACTION_APPROVAL_STATUS_VALUES})
            AND (${Prisma.join(
              pauseKeywordCandidates.map((candidate) => Prisma.sql`(
                action.external_id IS NOT DISTINCT FROM ${candidate.externalId}::text
                AND action.target_label = ${candidate.targetLabel}
              )`),
              ' OR ',
            )})
        `);
        const executions = await readAdActionExecutions(tx, { organizationId, actions: latest });
        for (const action of latest) {
          if (!isOpenAdAction(action, executions.get(action.id)?.executeStatus ?? 'not_prepared')) continue;
          const key = pauseKeywordActionKey(action);
          if (key) existingPauseKeys.add(key);
        }
      }

      const seenPauseKeys = new Set<string>();
      const created: AdActionRecord[] = [];
      for (const candidate of candidates) {
        const pauseKey = pauseKeywordActionKey(candidate);
        if (pauseKey) {
          if (existingPauseKeys.has(pauseKey) || seenPauseKeys.has(pauseKey)) {
            continue;
          }
          seenPauseKeys.add(pauseKey);
        }
        const row = await tx.adAction.create({
          data: {
            organizationId,
            listingId: candidate.listingId,
            channelAccountId: candidate.channelAccountId ?? null,
            actionType: candidate.actionType,
            targetType: candidate.targetType,
            externalId: candidate.externalId,
            targetLabel: candidate.targetLabel,
            reason: candidate.reason,
            priority: candidate.priority,
            currentValue: candidate.currentValue,
            proposedValue: candidate.proposedValue,
            payload: candidate.payload as Prisma.InputJsonValue,
          },
          select: AD_ACTION_ROW_SELECT,
        });
        // A new proposal has no run until an approval prepares one.
        created.push({ ...row, ...NOT_PREPARED_EXECUTION });
      }

      return created;
    });
  }

  async approveAdActions(
    ids: string[],
    organizationId: string,
    options: AdActionReviewOptions = {},
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const approved = await this.prisma.$transaction(async (tx) => {
      const scopedActions = await lockReviewableActions(tx, {
        ids,
        organizationId,
        expectedApprovalStatus: options.expectedApprovalStatus,
      });
      if (scopedActions.length === 0) return [];
      await tx.adAction.updateMany({
        where: { id: { in: scopedActions.map((a) => a.id) }, organizationId },
        data: {
          approvalStatus: 'approved',
          approvedAt: new Date(),
        },
      });
      return scopedActions;
    });

    // The approval commits first: the owner's `plan` reads the approved action
    // outside this transaction (KID-386). A manual action is only confirmed and
    // prepares nothing. A failure to prepare leaves the action approved and
    // `not_prepared`; approving it again prepares it.
    let failure: unknown = null;
    for (const action of approved) {
      if (!isExecutableAdActionType(action.actionType)) continue;
      try {
        await this.prepareExecution(organizationId, action.id);
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure) throw failure;
    return approved.length;
  }

  async rejectAdActions(
    ids: string[],
    organizationId: string,
    options: AdActionReviewOptions = {},
  ): Promise<number> {
    if (ids.length === 0) return 0;
    return this.prisma.$transaction(async (tx) => {
      const handle = ownerTransaction(tx);
      // Runs first, then actions: a finish or lease expiry locks the run and then writes the action
      // (`payload.execution`), so taking them in the same order never deadlocks. `findLive` row-locks
      // a live run, so the extension cannot claim or finish it meanwhile.
      const liveById = new Map<string, Awaited<ReturnType<OperationPort['findLive']>>>();
      for (const id of [...new Set(ids)].sort()) {
        liveById.set(id, await this.operations.findLive(organizationId, adActionLockKey(id), handle));
      }
      const scopedActions = await lockReviewableActions(tx, {
        ids,
        organizationId,
        expectedApprovalStatus: options.expectedApprovalStatus,
      });
      const scopedIds = scopedActions.map((a) => a.id);
      if (scopedIds.length === 0) return 0;
      await tx.adAction.updateMany({
        where: { id: { in: scopedIds }, organizationId },
        data: { approvalStatus: 'rejected' },
      });

      // A run the extension holds may already be writing to the ad center, and
      // an applied one already changed it, so either refuses the rejection and
      // this transaction rolls back. A prepared run is cancelled.
      const linked = scopedActions.filter((action) => action.operationId !== null);
      const executions = await readAdActionExecutions(tx, { organizationId, actions: linked });
      for (const action of linked) {
        const live = liveById.get(action.id) ?? null;
        if (live?.status === 'prepared') {
          await this.operations.cancel(organizationId, live.id, handle);
          continue;
        }
        if (live) throw new KiditemConflictError('ADVERTISING_AD_ACTION_EXECUTING', { details: { actionId: action.id } });
        // An uncertain run may be rejected: that is how the operator releases it after checking the ad center.
        if (executions.get(action.id)?.executeStatus === 'done') {
          throw new KiditemConflictError('ADVERTISING_AD_ACTION_ALREADY_APPLIED', { details: { actionId: action.id } });
        }
      }
      return scopedIds.length;
    });
  }

  async createCampaignAction(input: {
    organizationId: string;
    channelAccountId: string;
    campaignName: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    reason: string;
    payload: Record<string, unknown>;
  }): Promise<{ actionId: string; operationId: string | null }> {
    const actionId = await this.prisma.$transaction(async (tx) => {
      // Two registrations of one name serialize here, so only one creates the action.
      const organizationId = input.organizationId;
      await tx.$queryRaw(Prisma.sql`
        -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
        SELECT pg_advisory_xact_lock(
          hashtext(${`kiditem_ad_action_create_campaign:${organizationId}`}::text),
          hashtext(${input.campaignName}::text)
        )::text AS locked
      `);
      const open = await findOpenCreateCampaignAction(tx, input.organizationId, input.campaignName);
      // An approved registration left without a run is prepared again instead of registered twice.
      if (open?.executeStatus === 'not_prepared') return open.id;
      if (open) {
        throw new KiditemConflictError('ADVERTISING_CAMPAIGN_ALREADY_REQUESTED', {
          details: { actionId: open.id, executeStatus: open.executeStatus },
        });
      }
      const created = await tx.adAction.create({
        data: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          actionType: 'create_campaign',
          targetType: 'campaign',
          targetLabel: input.campaignName,
          reason: input.reason,
          priority: input.priority,
          approvalStatus: 'approved',
          approvedAt: new Date(),
          payload: input.payload as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return created.id;
    });
    // Committed first so the owner's `plan` reads it (KID-386); a failure here
    // leaves it approved and `not_prepared`, and registering the name again prepares it.
    const operationId = await this.prepareExecution(input.organizationId, actionId);
    return { actionId, operationId };
  }

  /**
   * Prepare the action's `advertising.ad_action` run unless one is live or one
   * already applied it, and link it. The action row is locked so two approvals
   * do not both prepare; `findLive` locks a live run. Returns the linked run.
   */
  private async prepareExecution(organizationId: string, actionId: string): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const handle = ownerTransaction(tx);
      // The run before the action, in the order a finish takes them (see `rejectAdActions`).
      const live = await this.operations.findLive(organizationId, adActionLockKey(actionId), handle);
      const [action] = await tx.$queryRaw<Array<{ id: string; actionType: string; approvalStatus: string; operationId: string | null }>>(Prisma.sql`
        SELECT id, action_type AS "actionType", approval_status AS "approvalStatus", operation_id AS "operationId"
        FROM ad_actions
        WHERE id = ${actionId}::uuid AND organization_id = ${organizationId}::uuid
        FOR UPDATE
      `);
      if (!action || action.approvalStatus !== 'approved' || !isExecutableAdActionType(action.actionType)) return null;
      if (live) return live.id;
      if (action.operationId) {
        // An applied run is not repeated: a second run would create a second campaign. An uncertain one waits
        // for the operator to check the ad center and reject it or register again under a new name.
        const executeStatus = (await readAdActionExecutions(tx, { organizationId, actions: [action] }))
          .get(actionId)?.executeStatus;
        if (executeStatus === 'done') {
          throw new KiditemConflictError('ADVERTISING_AD_ACTION_ALREADY_APPLIED', { details: { actionId } });
        }
        if (executeStatus === 'uncertain') {
          throw new KiditemConflictError('ADVERTISING_AD_ACTION_UNCERTAIN', { details: { actionId } });
        }
        // Another preparation committed while this one waited for the action row.
        if (executeStatus === 'queued' || executeStatus === 'running') return action.operationId;
      }
      const { operation } = await this.operations.prepare(
        organizationId,
        { kind: AD_ACTION_KIND, scope: { actionId }, maxAttempts: 1 },
        handle,
      );
      await tx.adAction.updateMany({ where: { id: actionId, organizationId }, data: { operationId: operation.id } });
      return operation.id;
    });
  }

  private async hydrateActionRelations(
    organizationId: string,
    actions: AdActionRecord[],
  ): Promise<HydratedAdAction[]> {
    const listingMap = await this.listingAdapter.findScopedAdListings(
      organizationId,
      actions.map((action) => action.listingId),
    );
    return actions.map((action) => {
      const listing = action.listingId
        ? listingMap.get(action.listingId)
        : null;
      return {
        ...action,
        listing: listing
          ? {
              id: listing.id,
              externalId: listing.externalId,
              channelName: listing.channelName,
              master: {
                id: listing.masterProduct.id,
                code: listing.masterProduct.code,
                name: listing.masterProduct.name,
                abcGrade: listing.masterProduct.abcGrade,
              },
            }
          : null,
      };
    });
  }
}

/**
 * The newest `create_campaign` action of this name that keeps the name taken:
 * not rejected, and either approved without a run (`not_prepared`, prepared
 * again by the next registration) or with a run queued, running, done or
 * uncertain. A failed or cancelled run frees the name.
 */
async function findOpenCreateCampaignAction(
  tx: Prisma.TransactionClient,
  organizationId: string,
  campaignName: string,
): Promise<{ id: string; executeStatus: AdActionExecuteStatus } | null> {
  const rows = await tx.adAction.findMany({
    where: {
      organizationId,
      actionType: 'create_campaign',
      targetLabel: campaignName,
      approvalStatus: { in: [...OPEN_ACTION_APPROVAL_STATUSES] },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, operationId: true, approvalStatus: true },
  });
  const executions = await readAdActionExecutions(tx, { organizationId, actions: rows });
  for (const row of rows) {
    const executeStatus = executions.get(row.id)?.executeStatus ?? 'not_prepared';
    if (executeStatus === 'not_prepared' && row.approvalStatus === 'approved' && row.operationId === null) {
      return { id: row.id, executeStatus };
    }
    if (['queued', 'running', ...APPLIED_EXECUTE_STATUSES].includes(executeStatus)) return { id: row.id, executeStatus };
  }
  return null;
}

/**
 * Row-locks the named actions of the organization, in id order, and returns
 * the ones a review changes: every one of them, or with
 * `expectedApprovalStatus` only those still in that review. The review is
 * checked under the lock, so a review that waited for another one skips the
 * actions that one changed.
 */
async function lockReviewableActions(
  tx: Prisma.TransactionClient,
  input: {
    ids: readonly string[];
    organizationId: string;
    expectedApprovalStatus?: AdActionReviewOptions['expectedApprovalStatus'];
  },
): Promise<Array<{ id: string; actionType: string; operationId: string | null }>> {
  return tx.$queryRaw<Array<{ id: string; actionType: string; operationId: string | null }>>(Prisma.sql`
    SELECT action.id, action.action_type AS "actionType", action.operation_id AS "operationId"
    FROM ad_actions action
    WHERE action.organization_id = ${input.organizationId}::uuid
      AND action.id IN (${Prisma.join(input.ids.map((id) => Prisma.sql`${id}::uuid`))})
      ${input.expectedApprovalStatus
        ? Prisma.sql`AND action.approval_status = ${input.expectedApprovalStatus}`
        : Prisma.empty}
    ORDER BY action.id
    FOR UPDATE
  `);
}

function pauseKeywordActionKey(input: {
  actionType?: string | null;
  targetType?: string | null;
  externalId?: string | null;
  targetLabel?: string | null;
}): string | null {
  if (input.actionType !== undefined && input.actionType !== 'pause_keyword') return null;
  if (input.targetType !== undefined && input.targetType !== 'keyword') return null;
  const externalId = normalizeActionKeyPart(input.externalId);
  const targetLabel = normalizeActionKeyPart(input.targetLabel);
  if (!externalId && !targetLabel) return null;
  return `${externalId ?? ''}\u0000${targetLabel ?? ''}`;
}

function normalizeActionKeyPart(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}
