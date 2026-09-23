import { ChannelIntegrityAdapter } from '../integrity/channel-integrity.adapter';
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type ProductRegistrationExecution } from '@prisma/client';
import {
  PrepareListingAvailabilityInputSchema,
  ListingAvailabilitySnapshotSchema,
  type PrepareListingAvailabilityInput,
  type ListingAvailabilityExecution,
  type ListingAvailabilitySnapshot,
  type ReportListingAvailabilityInput,
  TargetExecutionSnapshotSchema,
  type PrepareTargetExecutionInput,
  type ReportTargetExecutionInput,
  type TargetExecutionResult,
  type TargetExecutionSnapshot,
} from '@kiditem/shared/sales-product';
import { MALL_ADMIN_LISTING_READERS } from '@kiditem/shared/mall-admin-listings';
import { getListingAvailabilityCapability } from '../../../domain/registration/mall-adapter-manifest';
import { registrationDraftState } from '../../../domain/registration/registration-execution-state';
import { allocateKidItemCode } from '../../../../common/kid-item-code';
import { preparedRegistrationRecipe, registrationRequestBeforeCodeAssignment, withRegistrationItemCode } from '../../../domain/registration/registration-item-code';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import {
  freezeProductRegistrationPayload,
  hashRegistrationSubmissionPayload,
  type RegistrationSubmissionJson,
} from '../../../domain/registration/registration-submission-payload';
import {
  hasLiveExecutionLease,
  retainsProviderIdentity,
  type RegistrationExecutionProviderOutcome,
} from '../../../domain/registration/registration-execution-state';
import {
  REGISTRATION_DRAFT_PORT,
  type FrozenRegistrationDraft,
  type RegistrationDraftPort,
} from '../../../application/port/out/persistence/registration-draft.port';
import {
  CHANNEL_OPTION_RECIPE_PORT,
  type ChannelOptionRecipeMutation,
  type ChannelOptionRecipePort,
} from '../../../application/port/in/channel-option-recipe.port';
import type { ChannelsRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';
import type {
  ClosedRegistrationExecutionResult,
  FrozenRegistrationSubmission,
  PrepareRegistrationExecutionInput,
  RegistrationExecutionClaimResult,
  RegistrationExecutionRegisteredResult,
  RegistrationExecutionRepositoryPort,
  RegistrationExecutionResult,
} from '../../../application/port/out/repository/registration-execution.repository.port';

const channelIntegrity = new ChannelIntegrityAdapter();

const TARGET_EXECUTION_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * 등록 실행 울타리의 저장소 어댑터.
 *
 * 울타리는 트랜잭션을 연다. 실행 행은 여기서 직접 쓰고, 같은 트랜잭션 안의 초안
 * 전이는 `RegistrationDraftPort` 로 Sourcing 에 맡긴다 — Channels 는 초안 행을
 * 직접 쓰지 않는다([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 */
@Injectable()
export class RegistrationExecutionRepositoryAdapter
  implements RegistrationExecutionRepositoryPort
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REGISTRATION_DRAFT_PORT)
    private readonly drafts: RegistrationDraftPort,
    @Optional()
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly recipes?: ChannelOptionRecipePort,
  ) {}

  async findListingAvailabilityByKey(input: {
    organizationId: string;
    requestedByUserId: string | null;
    idempotencyKey: string;
  }): Promise<ListingAvailabilityExecution | null> {
    const execution = await this.prisma.productRegistrationExecution.findFirst({
      where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
    });
    if (!execution) return null;
    if (execution.requestedByUserId !== input.requestedByUserId) {
      throw new ConflictException('Listing availability execution belongs to a different actor.');
    }
    return listingAvailabilityResult(execution, false);
  }

  async prepareListingAvailability(input: {
    organizationId: string;
    requestedByUserId: string | null;
    request: PrepareListingAvailabilityInput;
  }): Promise<ListingAvailabilityExecution> {
    const parsedRequest = PrepareListingAvailabilityInputSchema.safeParse(input.request);
    if (!parsedRequest.success) throw new ConflictException('Listing availability request is invalid.');
    const request = parsedRequest.data;
    if (request.stockoutPolicy && request.kind !== 'sold_out') {
      throw new ConflictException('Inventory stockout policy cannot resume sales.');
    }
    const optionCodes = [...(request.optionCodes ?? [])].sort();
    if (new Set(optionCodes).size !== optionCodes.length) {
      throw new ConflictException('Listing availability option codes must be unique.');
    }
    const intentHash = listingAvailabilityIntentHash({ ...request, optionCodes });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await tx.productRegistrationExecution.findFirst({
          where: { organizationId: input.organizationId, idempotencyKey: request.idempotencyKey },
        });
        if (replay) {
          assertListingAvailabilityReplayIdentity(replay, input.requestedByUserId, intentHash);
          return listingAvailabilityResult(replay, false);
        }

        const lockedAccount = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id FROM channel_accounts
          WHERE id = ${request.channelAccountId}::uuid
            AND organization_id = ${input.organizationId}::uuid
          FOR UPDATE
        `);
        if (lockedAccount.length !== 1) throw new NotFoundException('Channel account not found.');
        const account = await tx.channelAccount.findFirst({
          where: {
            id: request.channelAccountId,
            organizationId: input.organizationId,
            status: 'active',
          },
          select: { id: true, channel: true, vendorId: true, externalAccountId: true },
        });
        if (!account) throw new ConflictException('Listing availability requires an active channel account.');
        assertListingAvailabilitySupported(account.channel, request.kind);
        if (account.channel === 'coupang' && !(account.vendorId?.trim() || account.externalAccountId?.trim())) {
          throw new ConflictException('Wing availability requires a verified provider account identity.');
        }

        const lockedListing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id FROM channel_listings
          WHERE organization_id = ${input.organizationId}::uuid
            AND channel_account_id = ${request.channelAccountId}::uuid
            AND external_id = ${request.externalListingId}
            AND is_active = TRUE
          FOR UPDATE
        `);
        if (lockedListing.length !== 1) throw new NotFoundException('Active channel listing not found.');
        const listing = await tx.channelListing.findFirst({
          where: {
            id: lockedListing[0]!.id,
            organizationId: input.organizationId,
            channelAccountId: request.channelAccountId,
            externalId: request.externalListingId,
            isActive: true,
          },
          select: { id: true, externalId: true },
        });
        if (!listing) throw new ConflictException('Channel listing changed during availability preparation.');

        if (optionCodes.length > 0) {
          await tx.$queryRaw(Prisma.sql`
            SELECT id FROM channel_listing_options
            WHERE organization_id = ${input.organizationId}::uuid
              AND listing_id = ${listing.id}::uuid
              AND is_active = TRUE
              AND external_option_id IN (${Prisma.join(optionCodes)})
            FOR UPDATE
          `);
        }
        const options = await tx.channelListingOption.findMany({
          where: {
            organizationId: input.organizationId,
            listingId: listing.id,
            isActive: true,
            ...(optionCodes.length > 0 ? { externalOptionId: { in: optionCodes } } : {}),
          },
          select: { externalOptionId: true, rawJson: true },
        });
        if (optionCodes.length > 0 && options.length !== optionCodes.length) {
          throw new ConflictException('One or more availability option codes do not belong to the active listing.');
        }

        assertAvailabilityOptionSupport(account.channel, options);
        const frozenOptionCodes = account.channel === 'coupang'
          ? options.map((option) => option.externalOptionId).sort()
          : optionCodes;
        const frozen = freezeListingAvailabilitySnapshot({
          subject: 'channel_listing',
          channelListingId: listing.id,
          channelAccountId: account.id,
          mallKey: account.channel,
          externalListingId: listing.externalId,
          kind: request.kind,
          ...(request.stockoutPolicy ? { stockoutPolicy: request.stockoutPolicy } : {}),
          optionCodes: frozenOptionCodes,
        });
        const execution = await tx.productRegistrationExecution.create({
          data: {
            organizationId: input.organizationId,
            registrationTargetId: null,
            channelAccountId: account.id,
            channelListingId: listing.id,
            executionKind: request.kind,
            expectedProviderAccountId: account.vendorId?.trim() || account.externalAccountId?.trim() || null,
            idempotencyKey: request.idempotencyKey,
            requestHash: intentHash,
            submissionPayloadJson: frozen.payload as unknown as Prisma.InputJsonValue,
            submissionPayloadHash: frozen.hash,
            status: 'prepared',
            providerOutcome: 'not_attempted',
            requestedByUserId: input.requestedByUserId,
          },
        });
        return listingAvailabilityResult(execution, false);
      }, TARGET_EXECUTION_TRANSACTION_OPTIONS);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const replay = await this.prisma.productRegistrationExecution.findFirst({
        where: { organizationId: input.organizationId, idempotencyKey: request.idempotencyKey },
      });
      if (replay) {
        assertListingAvailabilityReplayIdentity(replay, input.requestedByUserId, intentHash);
        return listingAvailabilityResult(replay, false);
      }
      throw new ConflictException('Another listing execution is already active for this listing.');
    }
  }

  async listListingAvailability(input: {
    organizationId: string;
    requestedByUserId: string | null;
    channelAccountId: string;
    externalListingId: string;
  }): Promise<ListingAvailabilityExecution[]> {
    const listing = await this.prisma.channelListing.findFirst({
      where: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        externalId: input.externalListingId,
      },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException('Channel listing not found.');
    const executions = await this.prisma.productRegistrationExecution.findMany({
      where: {
        organizationId: input.organizationId,
        requestedByUserId: input.requestedByUserId,
        channelAccountId: input.channelAccountId,
        channelListingId: listing.id,
        registrationTargetId: null,
        executionKind: { in: ['sold_out', 'resume'] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return executions.map((execution) => listingAvailabilityResult(execution, false));
  }

  async startListingAvailability(input: {
    organizationId: string;
    requestedByUserId: string | null;
    executionId: string;
    assertInventoryStockout?: (transaction: ChannelsRepositoryTransaction, snapshot: ListingAvailabilitySnapshot) => Promise<void>;
  }): Promise<ListingAvailabilityExecution> {
    return this.prisma.$transaction(async (tx) => {
      await lockExecution(tx, input.organizationId, input.executionId);
      const execution = await tx.productRegistrationExecution.findFirst({
        where: { id: input.executionId, organizationId: input.organizationId },
      });
      if (!execution) throw new NotFoundException('Listing availability execution not found.');
      if (execution.requestedByUserId !== input.requestedByUserId) {
        throw new ConflictException('Listing availability execution belongs to a different actor.');
      }
      const snapshot = listingAvailabilitySnapshot(execution);
      const scope = await lockListingAvailabilityScope(tx, input.organizationId, snapshot);
      if (scope.account.status !== 'active' || !scope.listing.isActive) {
        throw new ConflictException('Listing availability execution account or listing is no longer active.');
      }

      const fresh = execution.status === 'prepared'
        && execution.providerOutcome === 'not_attempted'
        && execution.leaseToken === null
        && execution.leaseClaimedAt === null
        && execution.startedAt === null
        && execution.completedAt === null
        && execution.providerSubmissionId === null
        && execution.externalListingId === null
        && execution.resultJson === null;
      if (!fresh) return listingAvailabilityResult(execution, false);
      assertListingAvailabilityAccount(execution, snapshot, scope.account);
      await assertFrozenAvailabilityOptions(tx, input.organizationId, snapshot);
      if (snapshot.stockoutPolicy) {
        if (!input.assertInventoryStockout) {
          throw new ConflictException('Inventory stockout requires a transactional eligibility check.');
        }
        await input.assertInventoryStockout(ownerTransaction(tx), snapshot);
      }

      const startedAt = new Date();
      const updated = await tx.productRegistrationExecution.update({
        where: { id: execution.id },
        data: {
          status: 'executing',
          providerOutcome: 'uncertain',
          leaseToken: randomUUID(),
          leaseClaimedAt: startedAt,
          startedAt,
        },
      });
      return listingAvailabilityResult(updated, true);
    }, TARGET_EXECUTION_TRANSACTION_OPTIONS);
  }

  async reportListingAvailability(input: {
    organizationId: string;
    requestedByUserId: string | null;
    executionId: string;
    report: ReportListingAvailabilityInput;
  }): Promise<ListingAvailabilityExecution> {
    return this.prisma.$transaction(async (tx) => {
      await lockExecution(tx, input.organizationId, input.executionId);
      const execution = await tx.productRegistrationExecution.findFirst({
        where: { id: input.executionId, organizationId: input.organizationId },
      });
      if (!execution) throw new NotFoundException('Listing availability execution not found.');
      if (execution.requestedByUserId !== input.requestedByUserId) {
        throw new ConflictException('Listing availability execution belongs to a different actor.');
      }
      const snapshot = listingAvailabilitySnapshot(execution);
      if (input.report.payloadHash !== execution.submissionPayloadHash) {
        throw new ConflictException('Listing availability payload hash does not match the frozen snapshot.');
      }
      if (input.report.evidence.channelAccountId !== execution.channelAccountId) {
        throw new ConflictException('Listing availability evidence belongs to another account.');
      }
      const reportedExternalId = input.report.evidence.externalListingId?.trim();
      if (reportedExternalId && reportedExternalId !== snapshot.externalListingId) {
        throw new ConflictException('Listing availability provider identity differs from the frozen listing.');
      }

      if (isTerminalTargetExecution(execution)) {
        if (listingAvailabilityTerminalReplayMatches(execution, snapshot, input.report)) {
          return listingAvailabilityResult(execution, false);
        }
        throw new ConflictException('Listing availability execution is already terminal.');
      }
      if (!['prepared', 'executing', 'reconciling'].includes(execution.status)
        || !execution.leaseToken
        || execution.leaseToken !== input.report.leaseToken) {
        throw new ConflictException('Listing availability execution lease is stale or missing.');
      }

      const scope = await lockListingAvailabilityScope(tx, input.organizationId, snapshot);
      if (scope.listing.externalId !== snapshot.externalListingId) {
        throw new ConflictException('Canonical listing identity changed during availability execution.');
      }
      assertListingAvailabilityAccount(execution, snapshot, scope.account);
      await assertTargetProviderEvidence(tx, execution, input.report);
      if (input.report.outcome === 'confirmed' && snapshot.mallKey === 'coupang') {
        await assertFrozenAvailabilityOptions(tx, input.organizationId, snapshot);
        assertWingAvailabilityConfirmation(snapshot, input.report);
      }

      const data: Prisma.ProductRegistrationExecutionUpdateInput = {
        resultJson: {
          ...targetReportEvidenceJson(input.report) as Prisma.InputJsonObject,
          ...(input.report.evidence.observedOptionStocks
            ? { observedOptionStocks: input.report.evidence.observedOptionStocks } : {}),
        },
      };
      if (input.report.outcome === 'not_submitted') {
        data.status = 'failed';
        data.providerOutcome = 'definitive_failure';
        data.completedAt = new Date();
        data.leaseToken = null;
        data.leaseClaimedAt = null;
        data.lastErrorMessage = input.report.evidence.message?.slice(0, 4_000) ?? null;
      } else if (input.report.outcome === 'uncertain'
        || input.report.outcome === 'submitted'
        || input.report.outcome === 'awaiting_approval') {
        data.status = 'reconciling';
        data.providerOutcome = 'uncertain';
      } else {
        if (scope.account.status !== 'active') {
          throw new ConflictException('Confirmed listing availability requires an active channel account.');
        }
        if (snapshot.mallKey !== 'coupang' && input.report.evidence.observedStatus !== undefined) {
          const updatedListing = await tx.channelListing.updateMany({
            where: {
              id: snapshot.channelListingId,
              organizationId: input.organizationId,
              channelAccountId: snapshot.channelAccountId,
              externalId: snapshot.externalListingId,
            },
            data: { status: input.report.evidence.observedStatus },
          });
          if (updatedListing.count !== 1) {
            throw new ConflictException('Canonical listing changed during availability confirmation.');
          }
        }
        data.externalListingId = snapshot.externalListingId;
        data.status = 'succeeded';
        data.providerOutcome = 'succeeded';
        data.completedAt = new Date();
        data.leaseToken = null;
        data.leaseClaimedAt = null;
      }

      const updated = await tx.productRegistrationExecution.update({
        where: { id: execution.id },
        data,
      });
      return listingAvailabilityResult(updated, false);
    }, TARGET_EXECUTION_TRANSACTION_OPTIONS);
  }

  async findTargetReplay(input: {
    organizationId: string;
    requestedByUserId: string | null;
    targetId: string;
    request: PrepareTargetExecutionInput;
  }): Promise<TargetExecutionResult | null> {
    const execution = await this.prisma.productRegistrationExecution.findFirst({
      where: {
        organizationId: input.organizationId,
        idempotencyKey: input.request.idempotencyKey,
      },
    });
    if (!execution) return null;
    assertTargetReplayIdentity(execution, input);
    return targetExecutionResult(execution, false);
  }

  async prepareTarget(input: {
    organizationId: string;
    requestedByUserId: string | null;
    request: PrepareTargetExecutionInput;
    snapshot: TargetExecutionSnapshot;
  }): Promise<TargetExecutionResult> {
    const intentHash = targetExecutionIntentHash(input.snapshot.targetId, input.request);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await tx.productRegistrationExecution.findFirst({
          where: {
            organizationId: input.organizationId,
            idempotencyKey: input.request.idempotencyKey,
          },
        });
        if (replay) {
          assertTargetReplayIdentity(replay, {
            organizationId: input.organizationId,
            requestedByUserId: input.requestedByUserId,
            targetId: input.snapshot.targetId,
            request: input.request,
          });
          return targetExecutionResult(replay, false);
        }

        // Replay is deliberately checked before resolving or validating the
        // caller's snapshot. A repeated intent must return the old server
        // snapshot even when the target/product has since been edited.
        const frozen = freezeTargetExecutionSnapshot(input.snapshot);
        assertTargetRequestMatchesSnapshot(input.request, frozen.payload);
        // Refuse before any provider call: a confirmation could not record an option without its KID.
        if (frozen.payload.product.options.some((option) => option.optionCode === null)) {
          throw new ConflictException('A KID must be issued before registration for every selected sales product option.');
        }

        await tx.$queryRaw(Prisma.sql`
          SELECT id
          FROM registration_targets
          WHERE id = ${frozen.payload.targetId}::uuid
            AND organization_id = ${input.organizationId}::uuid
          FOR UPDATE
        `);
        const target = await tx.registrationTarget.findFirst({
          where: {
            id: frozen.payload.targetId,
            organizationId: input.organizationId,
            archivedAt: null,
          },
          select: {
            id: true,
            salesProductId: true,
            channelAccountId: true,
            version: true,
            selectedOptions: {
              orderBy: { sortOrder: 'asc' },
              select: { salesProductOptionId: true },
            },
          },
        });
        if (!target) {
          throw new NotFoundException('Registration target not found.');
        }
        if (target.version !== input.request.expectedVersion
          || target.version !== frozen.payload.targetVersion) {
          throw new ConflictException('Registration target changed while it was being prepared.');
        }
        if (target.channelAccountId !== frozen.payload.channelAccountId) {
          throw new ConflictException('Registration target account does not match the frozen execution.');
        }

        const account = await tx.channelAccount.findFirst({
          where: {
            id: target.channelAccountId,
            organizationId: input.organizationId,
            status: 'active',
          },
          select: { id: true, vendorId: true, externalAccountId: true },
        });
        if (!account) throw new ConflictException('Registration target account is not active.');

        await tx.$queryRaw(Prisma.sql`
          SELECT id
          FROM sales_products
          WHERE id = ${target.salesProductId}::uuid
            AND organization_id = ${input.organizationId}::uuid
          FOR UPDATE
        `);

        const product = await tx.salesProduct.findFirst({
          where: {
            id: target.salesProductId,
            organizationId: input.organizationId,
          },
          select: { id: true, version: true, status: true },
        });
        if (!product || product.id !== frozen.payload.product.id
          || product.version !== frozen.payload.product.version) {
          throw new ConflictException('Sales product changed while the execution was being prepared.');
        }

        const targetOptionIds = target.selectedOptions.map((option) => option.salesProductOptionId);
        const snapshotOptionIds = frozen.payload.product.options.map((option) => option.id);
        if (!sameStringArray(targetOptionIds, snapshotOptionIds)
          || !sameStringSet(
            frozen.payload.supplyPrices.map((price) => price.salesProductOptionId),
            snapshotOptionIds,
          )) {
          throw new ConflictException('Registration target options changed while the execution was being prepared.');
        }
        const options = await tx.salesProductOption.findMany({
          where: {
            organizationId: input.organizationId,
            salesProductId: target.salesProductId,
            id: { in: snapshotOptionIds },
          },
          select: { id: true, supplyStatus: true },
        });
        if (options.length !== new Set(snapshotOptionIds).size) {
          throw new ConflictException('Frozen registration options no longer belong to the sales product.');
        }
        if (frozen.payload.kind === 'register'
          && (product.status === 'archived' || product.status === 'unused')) {
          throw new ConflictException('Archived or unused sales products cannot start a new registration.');
        }
        if (frozen.payload.kind === 'register'
          && options.some((option) => option.supplyStatus === 'unused')) {
          throw new ConflictException('Unused sales product options cannot start a new registration.');
        }

        if (frozen.payload.channelListingId) {
          const listing = await tx.channelListing.findFirst({
            where: {
              id: frozen.payload.channelListingId,
              organizationId: input.organizationId,
              channelAccountId: target.channelAccountId,
            },
            select: { id: true },
          });
          if (!listing) throw new ConflictException('Registration listing does not belong to the target account.');
        }

        await assertFrozenTargetOptionTransitions(
          tx,
          input.organizationId,
          frozen.payload,
          target.channelAccountId,
        );

        const execution = await tx.productRegistrationExecution.create({
          data: {
            organizationId: input.organizationId,
            registrationTargetId: target.id,
            channelAccountId: target.channelAccountId,
            channelListingId: frozen.payload.channelListingId,
            executionKind: frozen.payload.kind,
            expectedProviderAccountId: account.vendorId?.trim() || account.externalAccountId?.trim() || null,
            idempotencyKey: input.request.idempotencyKey,
            requestHash: intentHash,
            submissionPayloadJson: frozen.payload as unknown as Prisma.InputJsonValue,
            submissionPayloadHash: frozen.hash,
            status: 'prepared',
            providerOutcome: 'not_attempted',
            requestedByUserId: input.requestedByUserId,
          },
        });
        return targetExecutionResult(execution, false);
      }, TARGET_EXECUTION_TRANSACTION_OPTIONS);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const replay = await this.prisma.productRegistrationExecution.findFirst({
        where: {
          organizationId: input.organizationId,
          idempotencyKey: input.request.idempotencyKey,
        },
      });
      if (replay) {
        assertTargetReplayIdentity(replay, {
          organizationId: input.organizationId,
          requestedByUserId: input.requestedByUserId,
          targetId: input.snapshot.targetId,
          request: input.request,
        });
        return targetExecutionResult(replay, false);
      }
      throw new ConflictException('Registration execution conflicted with another active execution.');
    }
  }

  async startTarget(input: {
    organizationId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<TargetExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      await lockExecution(tx, input.organizationId, input.executionId);
      const execution = await tx.productRegistrationExecution.findFirst({
        where: { id: input.executionId, organizationId: input.organizationId },
      });
      if (!execution) throw new NotFoundException('Registration execution not found.');
      assertTargetExecutionRow(execution);
      if (execution.requestedByUserId !== input.requestedByUserId) {
        throw new ConflictException('Registration execution belongs to a different actor.');
      }

      const fresh = execution.status === 'prepared'
        && execution.providerOutcome === 'not_attempted'
        && execution.leaseToken === null
        && execution.leaseClaimedAt === null
        && execution.startedAt === null
        && execution.completedAt === null
        && execution.providerSubmissionId === null
        && execution.externalListingId === null
        && execution.resultJson === null;
      if (!fresh) return targetExecutionResult(execution, false);

      const snapshot = targetExecutionSnapshot(execution);
      if (snapshot.kind !== execution.executionKind || snapshot.channelListingId !== execution.channelListingId) {
        throw new ConflictException('Registration execution scope does not match its frozen snapshot.');
      }
      // Keep prepareTarget's target -> account -> product -> option order.
      // The execution lock serializes starts; owner row locks keep edits from
      // changing this eligibility decision before the lease commits.
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM registration_targets
        WHERE id = ${snapshot.targetId}::uuid AND organization_id = ${input.organizationId}::uuid
        FOR UPDATE
      `);
      const target = await tx.registrationTarget.findFirst({
        where: { id: snapshot.targetId, organizationId: input.organizationId, archivedAt: null },
        select: { salesProductId: true, channelAccountId: true, version: true,
          selectedOptions: { orderBy: { sortOrder: 'asc' }, select: { salesProductOptionId: true } } },
      });
      if (!target || target.version !== snapshot.targetVersion
        || target.channelAccountId !== snapshot.channelAccountId
        || target.salesProductId !== snapshot.product.id) {
        throw new ConflictException('Registration target changed after execution preparation.');
      }
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM channel_accounts
        WHERE id = ${target.channelAccountId}::uuid AND organization_id = ${input.organizationId}::uuid
        FOR UPDATE
      `);
      const account = await tx.channelAccount.findFirst({
        where: { id: target.channelAccountId, organizationId: input.organizationId, status: 'active' },
        select: { vendorId: true, externalAccountId: true },
      });
      if (!account) throw new ConflictException('Registration target account is not active.');
      const providerIdentity = account.vendorId?.trim() || account.externalAccountId?.trim() || null;
      if (providerIdentity !== execution.expectedProviderAccountId) {
        throw new ConflictException('Registration target provider account changed after execution preparation.');
      }
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM sales_products
        WHERE id = ${target.salesProductId}::uuid AND organization_id = ${input.organizationId}::uuid
        FOR UPDATE
      `);
      const product = await tx.salesProduct.findFirst({
        where: { id: target.salesProductId, organizationId: input.organizationId },
        select: { version: true, status: true },
      });
      if (!product || product.version !== snapshot.product.version || product.status !== snapshot.product.status
        || (snapshot.kind === 'register' && ['archived', 'unused'].includes(product.status))) {
        throw new ConflictException('Sales product changed after execution preparation.');
      }
      const snapshotOptionIds = snapshot.product.options.map(option => option.id);
      if (!sameStringArray(target.selectedOptions.map(option => option.salesProductOptionId), snapshotOptionIds)
        || !sameStringSet(snapshot.supplyPrices.map(price => price.salesProductOptionId), snapshotOptionIds)) {
        throw new ConflictException('Registration target options changed after execution preparation.');
      }
      if (snapshotOptionIds.length > 0) {
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM sales_product_options
          WHERE organization_id = ${input.organizationId}::uuid AND sales_product_id = ${target.salesProductId}::uuid
            AND id IN (${Prisma.join(snapshotOptionIds.map(id => Prisma.sql`${id}::uuid`))})
          ORDER BY id FOR UPDATE
        `);
      }
      const options = await tx.salesProductOption.findMany({
        where: { organizationId: input.organizationId, salesProductId: target.salesProductId, id: { in: snapshotOptionIds } },
        select: { id: true, supplyStatus: true },
      });
      if (options.length !== new Set(snapshotOptionIds).size || options.some(option =>
        option.supplyStatus !== snapshot.product.options.find(frozen => frozen.id === option.id)?.supplyStatus
        || (snapshot.kind === 'register' && option.supplyStatus === 'unused'))) {
        throw new ConflictException('Sales product options changed after execution preparation.');
      }
      if (snapshot.kind !== 'register' && !snapshot.channelListingId) {
        throw new ConflictException('This execution requires an active channel listing.');
      }
      if (snapshot.channelListingId) {
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM channel_listings
          WHERE id = ${snapshot.channelListingId}::uuid AND organization_id = ${input.organizationId}::uuid
            AND channel_account_id = ${target.channelAccountId}::uuid
          FOR UPDATE
        `);
        const listing = await tx.channelListing.findFirst({
          where: { id: snapshot.channelListingId, organizationId: input.organizationId,
            channelAccountId: target.channelAccountId, isActive: true },
          select: { id: true },
        });
        if (!listing) throw new ConflictException('Registration listing is no longer active in the target account.');
      }
      await assertFrozenTargetOptionTransitions(tx, input.organizationId, snapshot, target.channelAccountId);
      if (snapshot.kind === 'composition_change') {
        const optionIds = (snapshot.optionTransitions ?? []).map(transition => transition.channelListingOptionId);
        const activeOptions = await tx.channelListingOption.count({
          where: { organizationId: input.organizationId, listingId: snapshot.channelListingId!,
            id: { in: optionIds }, isActive: true },
        });
        if (activeOptions !== optionIds.length) {
          throw new ConflictException('Frozen composition options are no longer active.');
        }
      }

      const leaseToken = randomUUID();
      const startedAt = new Date();
      const updated = await tx.productRegistrationExecution.update({
        where: { id: execution.id, organizationId: execution.organizationId },
        data: {
          status: 'executing',
          providerOutcome: 'uncertain',
          leaseToken,
          leaseClaimedAt: startedAt,
          startedAt,
        },
      });
      return targetExecutionResult(updated, true);
    }, TARGET_EXECUTION_TRANSACTION_OPTIONS);
  }

  async listTarget(input: {
    organizationId: string;
    targetId: string;
    requestedByUserId: string | null;
  }): Promise<TargetExecutionResult[]> {
    const target = await this.prisma.registrationTarget.findFirst({
      where: { id: input.targetId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Registration target not found.');
    const executions = await this.prisma.productRegistrationExecution.findMany({
      where: {
        organizationId: input.organizationId,
        registrationTargetId: input.targetId,
        requestedByUserId: input.requestedByUserId,
        executionKind: { in: ['register', 'update', 'sold_out', 'resume', 'composition_change'] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return executions.map((execution) => targetExecutionResult(execution, false));
  }

  async getTarget(input: {
    organizationId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<TargetExecutionResult> {
    const execution = await this.prisma.productRegistrationExecution.findFirst({
      where: {
        id: input.executionId,
        organizationId: input.organizationId,
        requestedByUserId: input.requestedByUserId,
      },
    });
    if (!execution) throw new NotFoundException('Registration execution not found.');
    assertTargetExecutionRow(execution);
    return targetExecutionResult(execution, false);
  }

  async reportTarget(input: {
    organizationId: string;
    executionId: string;
    requestedByUserId: string | null;
    report: ReportTargetExecutionInput;
  }): Promise<TargetExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      await lockExecution(tx, input.organizationId, input.executionId);
      const execution = await tx.productRegistrationExecution.findFirst({
        where: { id: input.executionId, organizationId: input.organizationId },
      });
      if (!execution) throw new NotFoundException('Registration execution not found.');
      assertTargetExecutionRow(execution);
      if (execution.requestedByUserId !== input.requestedByUserId) {
        throw new ConflictException('Registration execution belongs to a different actor.');
      }

      const snapshot = targetExecutionSnapshot(execution);
      if (input.report.payloadHash !== execution.submissionPayloadHash) {
        throw new ConflictException('Registration execution payload hash does not match the frozen snapshot.');
      }
      if (input.report.evidence.channelAccountId !== execution.channelAccountId) {
        throw new ConflictException('Registration execution evidence belongs to another account.');
      }

      if (isTerminalTargetExecution(execution)) {
        if (targetTerminalReplayMatches(execution, input.report)) {
          return targetExecutionResult(execution, false);
        }
        throw new ConflictException('Registration execution is already terminal.');
      }
      if (!['prepared', 'executing', 'reconciling'].includes(execution.status)
        || !execution.leaseToken
        || execution.leaseToken !== input.report.leaseToken) {
        throw new ConflictException('Registration execution lease is stale or missing.');
      }

      const externalListingId = input.report.evidence.externalListingId?.trim() || null;
      if (execution.externalListingId
        && externalListingId
        && execution.externalListingId !== externalListingId) {
        throw new ConflictException('Registration execution provider identity changed.');
      }
      if (input.report.outcome === 'not_submitted'
        && (execution.externalListingId !== null || execution.providerSubmissionId !== null || externalListingId !== null)) {
        throw new ConflictException('A registration with provider identity cannot be reported as not submitted.');
      }

      await assertTargetProviderEvidence(tx, execution, input.report);

      const evidenceJson = targetReportEvidenceJson(input.report);
      const data: Prisma.ProductRegistrationExecutionUpdateInput = {
        resultJson: evidenceJson,
      };
      if (externalListingId && !execution.externalListingId) data.externalListingId = externalListingId;

      if (input.report.outcome === 'not_submitted') {
        data.status = 'failed';
        data.providerOutcome = 'definitive_failure';
        data.completedAt = new Date();
        data.leaseToken = null;
        data.leaseClaimedAt = null;
        data.lastErrorMessage = input.report.evidence.message?.slice(0, 4_000) ?? null;
      } else if (input.report.outcome === 'uncertain'
        || input.report.outcome === 'submitted'
        || input.report.outcome === 'awaiting_approval') {
        data.status = 'reconciling';
        data.providerOutcome = 'uncertain';
      } else {
        const confirmedListingId = externalListingId ?? execution.externalListingId;
        if (!confirmedListingId) {
          throw new ConflictException('Confirmed registration requires a provider listing identity.');
        }
        const resolved = await resolveTargetConfirmationListing(
          tx,
          execution,
          snapshot,
          input.report,
          confirmedListingId,
        );
        await applyTargetConfirmationRecipes(
          ownerTransaction(tx),
          this.recipes,
          input.organizationId,
          snapshot,
          input.report,
          resolved,
        );
        data.channelListing = {
          connect: {
            id_organizationId_channelAccountId: {
              id: resolved.listingId,
              organizationId: input.organizationId,
              channelAccountId: execution.channelAccountId,
            },
          },
        };
        data.status = 'succeeded';
        data.providerOutcome = 'succeeded';
        data.completedAt = new Date();
        data.leaseToken = null;
        data.leaseClaimedAt = null;
      }

      const updated = await tx.productRegistrationExecution.update({
        where: { id: execution.id, organizationId: execution.organizationId },
        data,
      });
      return targetExecutionResult(updated, false);
    }, TARGET_EXECUTION_TRANSACTION_OPTIONS);
  }

  async cancelUnstartedExecutions(
    transaction: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      cancelledAt: Date;
    },
  ): Promise<number> {
    const tx = ownerTransactionClient(transaction);
    // 후보는 Sourcing 의 이름이다. 울타리는 그 후보가 만든 판매상품으로만 움직인다.
    const salesProductId = await this.drafts.findSalesProductIdForSource(transaction, {
      organizationId: input.organizationId,
      sourceCandidateId: input.sourceCandidateId,
    });
    if (!salesProductId) return 0;
    const preparationIds = await this.drafts.findDraftIds(transaction, {
      organizationId: input.organizationId,
      salesProductId,
      isDeleted: false,
      fenceIdle: true,
    });
    const identities = preparationIds.length === 0 ? [] : await tx.productRegistrationExecution.findMany({
      where: {
        organizationId: input.organizationId,
        executionKind: 'external_wing',
        status: 'prepared',
        providerOutcome: 'not_attempted',
        providerSubmissionId: null,
        externalListingId: null,
        resultJson: { equals: Prisma.DbNull },
        leaseToken: null,
        leaseClaimedAt: null,
        startedAt: null,
        completedAt: null,
        registrationTargetId: { in: preparationIds },
      },
      select: { id: true, registrationTargetId: true },
    });

    let cancelled = 0;
    for (const identity of identities) {
      const preparationId = identity.registrationTargetId;
      if (preparationId === null) continue;
      await this.drafts.lockDraft(transaction, {
        organizationId: input.organizationId,
        preparationId,
      });
      await lockExecution(tx, input.organizationId, identity.id);
      const current = await tx.productRegistrationExecution.findFirst({
        where: {
          id: identity.id,
          organizationId: input.organizationId,
          registrationTargetId: preparationId,
        },
      });
      if (!current || current.registrationTargetId === null) continue;
      const draft = current
        ? await this.drafts.loadDraft(transaction, {
          organizationId: input.organizationId,
          preparationId: current.registrationTargetId,
        })
        : null;
      if (!draft || !isUnstartedExternalRegistrationIntent(
        current,
        draft,
        input.organizationId,
        salesProductId,
      )) {
        continue;
      }

      const execution = await tx.productRegistrationExecution.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          status: 'prepared',
          providerOutcome: 'not_attempted',
          providerSubmissionId: null,
          externalListingId: null,
          resultJson: { equals: Prisma.DbNull },
          leaseToken: null,
          leaseClaimedAt: null,
          startedAt: null,
          completedAt: null,
        },
        data: {
          status: 'cancelled',
          completedAt: input.cancelledAt,
          leaseToken: null,
          leaseClaimedAt: null,
        },
      });
      if (execution.count !== 1) continue;

      const draftCancelled = await this.drafts.closeDraft(transaction, {
        organizationId: input.organizationId, preparationId: current.registrationTargetId,
        salesProductId, closedAt: input.cancelledAt, archive: true,
      });
      if (draftCancelled !== 1) {
        throw new ConflictException(
          'Registration preparation changed while candidate deletion was being prepared.',
        );
      }
      cancelled += 1;
    }
    return cancelled;
  }

  async prepare(
    input: PrepareRegistrationExecutionInput,
  ): Promise<RegistrationExecutionResult> {
    const requested = freezeProductRegistrationPayload({
      channelAccountId: input.channelAccountId,
      displayName: input.displayName,
      registrationInput: input.registrationInput,
    } as RegistrationSubmissionJson, channelIntegrity.sha256);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const handle = ownerTransaction(tx);
        const replay = await tx.productRegistrationExecution.findFirst({
          where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
        });
        if (replay) {
          if (!matchesPreparedRequest(replay, requested.hash)) {
            throw new ConflictException('External registration idempotency key was reused with a different payload.');
          }
          if (replay.registrationTargetId === null
            || replay.channelAccountId !== input.channelAccountId
            || await this.executionSalesProductId(handle, input.organizationId, replay) !== input.salesProductId
            || replay.requestedByUserId !== input.requestedByUserId) {
            throw new ConflictException('External registration execution belongs to another account, product, or actor.');
          }
          return externalExecutionResult(replay);
        }
        await this.drafts.lockProduct(handle, {
          organizationId: input.organizationId,
          salesProductId: input.salesProductId,
        });
        const lockedReplay = await tx.productRegistrationExecution.findFirst({
          where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
        });
        if (lockedReplay) {
          if (!matchesPreparedRequest(lockedReplay, requested.hash)
            || lockedReplay.registrationTargetId === null
            || lockedReplay.channelAccountId !== input.channelAccountId
            || await this.executionSalesProductId(handle, input.organizationId, lockedReplay) !== input.salesProductId
            || lockedReplay.requestedByUserId !== input.requestedByUserId) {
            throw new ConflictException('External registration idempotency key belongs to a different request.');
          }
          return externalExecutionResult(lockedReplay);
        }
        await this.drafts.requireActiveProduct(handle, {
          organizationId: input.organizationId,
          salesProductId: input.salesProductId,
        });
        const account = await tx.channelAccount.findFirst({
          where: { id: input.channelAccountId, organizationId: input.organizationId, status: 'active' },
          select: { id: true, channel: true, vendorId: true, externalAccountId: true },
        });
        if (!account) throw new NotFoundException('Channel account not found.');
        const expectedProviderAccountId = account.vendorId?.trim() || account.externalAccountId?.trim() || '';
        if (account.channel !== 'coupang' || !expectedProviderAccountId) {
          throw new ConflictException('External WING registration requires an active Coupang account with a vendor identity.');
        }
        // 브라우저 새로고침/재진입은 새 UI idempotency key를 만들 수 있다. 같은 후보·계정·
        // 사용자·동일 frozen payload의 미종결 외부 실행이 있으면 새 준비를 만들지 않고
        // 그 실행을 돌려줘 수동 완료/정산 UI가 이어받게 한다.
        const livePreparationIds = await this.drafts.findDraftIds(handle, {
          organizationId: input.organizationId,
          salesProductId: input.salesProductId,
          isDeleted: false,
        });
        const previousExecutions = livePreparationIds.length === 0 ? [] : await tx.productRegistrationExecution.findMany({
          where: {
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
            executionKind: 'external_wing',
            requestedByUserId: input.requestedByUserId,
            status: {
              in: input.providerAbsenceVerified === true
                ? ['prepared', 'failed']
                : ['prepared', 'executing', 'reconciling', 'failed'],
            },
            registrationTargetId: { in: livePreparationIds },
          },
          orderBy: { createdAt: 'desc' },
        });
        const matching = previousExecutions.filter((execution) => matchesPreparedRequest(execution, requested.hash));
        const resumable = matching.find((execution) => execution.status !== 'failed');
        if (resumable) return externalExecutionResult(resumable);
        const retryCode = matching.find((execution) => execution.status === 'failed'
          && execution.providerOutcome === 'definitive_failure');

        const draft = await this.drafts.findAccountDraft(handle, {
          organizationId: input.organizationId,
          salesProductId: input.salesProductId,
          channelAccountId: input.channelAccountId,
          status: 'draft',
        });
        if (!draft) {
          await this.supersedeAbandonedDraft(tx, input, expectedProviderAccountId, requested.hash);
        }
        let registrationInput = input.registrationInput;
        const match = registrationInput.sellpiaMatch as Record<string, unknown> | undefined;
        if (match) {
          if (typeof match.code !== 'string' || !/^KID[0-9]{8}$/.test(match.code)
            || !Number.isSafeInteger(match.quantity) || Number(match.quantity) < 1) {
            throw new ConflictException('Registration requires a valid source KID code and positive quantity');
          }
          const previousCode = retryCode ? preparedRegistrationRecipe(retryCode.submissionPayloadJson)?.kidItemCode : undefined;
          const code = previousCode ?? (match.quantity === 1 ? match.code : await allocateKidItemCode(tx));
          registrationInput = withRegistrationItemCode(registrationInput, code);
        }
        const frozen = freezeProductRegistrationPayload({
          channelAccountId: input.channelAccountId,
          displayName: input.displayName,
          registrationInput,
        } as RegistrationSubmissionJson, channelIntegrity.sha256);
        const frozenDraft = await this.drafts.freezeForSubmission(handle, {
          organizationId: input.organizationId,
          salesProductId: input.salesProductId,
          channelAccountId: input.channelAccountId,
          displayName: input.displayName,
          registrationInput,
          frozenHash: frozen.hash,
          requestedByUserId: input.requestedByUserId,
        });
        const execution = await tx.productRegistrationExecution.create({
          data: {
            organizationId: input.organizationId,
            registrationTargetId: frozenDraft.preparationId,
            channelAccountId: input.channelAccountId,
            executionKind: 'external_wing',
            expectedProviderAccountId,
            idempotencyKey: input.idempotencyKey,
            requestHash: frozen.hash,
            reviewPayloadHash: frozen.hash,
            approvedAt: new Date(),
            approvedByUserId: input.requestedByUserId,
            submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
            submissionPayloadHash: frozen.hash,
            status: 'prepared',
            providerOutcome: 'not_attempted',
            requestedByUserId: input.requestedByUserId,
          },
        });
        return externalExecutionResult(execution);
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      return this.prisma.$transaction(async (tx) => {
        const replay = await tx.productRegistrationExecution.findFirst({
          where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
        });
        if (!replay
          || !matchesPreparedRequest(replay, requested.hash)
          || replay.registrationTargetId === null
          || replay.channelAccountId !== input.channelAccountId
          || await this.executionSalesProductId(ownerTransaction(tx), input.organizationId, replay) !== input.salesProductId
          || replay.requestedByUserId !== input.requestedByUserId) {
          throw new ConflictException('Concurrent external registration preparation conflicted.');
        }
        return externalExecutionResult(replay);
      });
    }
  }

  /**
   * 공급자에 닿은 적 없는 앞선 시도를 접고 새 시도에 자리를 내준다.
   *
   * 앞선 시도가 `prepared` 실행을 만들어 두고 제출까지 가지 못한 경우(예: 카테고리를
   * 고쳐 해시가 달라져 그 실행을 이어받을 수 없는 경우)다. 후보·초안·실행 잠금과
   * 잠금 뒤 재조회는 의도한 것이다 — 그 사이 `start` 가 같은 실행을
   * `executing/uncertain` 로 올릴 수 있다. 티 없는 외부 WING 의사 하나만 승계되고,
   * 살아 있는 리스나 공급자 흔적은 전부 충돌로 남는다.
   */
  private async supersedeAbandonedDraft(
    tx: Prisma.TransactionClient,
    input: PrepareRegistrationExecutionInput,
    expectedProviderAccountId: string,
    nextRequestHash: string,
  ): Promise<void> {
    const handle = ownerTransaction(tx);
    const activeIdentity = await this.drafts.findAccountDraft(handle, {
      organizationId: input.organizationId,
      salesProductId: input.salesProductId,
      channelAccountId: input.channelAccountId,
    });
    if (!activeIdentity) return;

    await this.drafts.lockDraft(handle, {
      organizationId: input.organizationId,
      preparationId: activeIdentity.preparationId,
    });
    const executionIdentities = await tx.productRegistrationExecution.findMany({
      where: {
        organizationId: input.organizationId,
        registrationTargetId: activeIdentity.preparationId,
        status: { in: ['prepared', 'executing', 'reconciling'] },
      },
      select: { id: true },
    });
    // Completed attempts remain immutable history; the target is reused.
    if (executionIdentities.length === 0) return;
    if (executionIdentities.length !== 1) {
      throw new ConflictException('An active registration preparation already exists.');
    }
    await lockExecution(tx, input.organizationId, executionIdentities[0]!.id);
    const active = await this.drafts.findAccountDraft(handle, {
      organizationId: input.organizationId,
      salesProductId: input.salesProductId,
      channelAccountId: input.channelAccountId,
    });
    const execution = await tx.productRegistrationExecution.findFirst({
      where: {
        id: executionIdentities[0]!.id,
        organizationId: input.organizationId,
        registrationTargetId: activeIdentity.preparationId,
      },
    });
    if (
      !active
      || active.preparationId !== activeIdentity.preparationId
      || !execution
      || !(
        canSupersedePreparedExternalExecution({
          draft: active,
          execution,
          requestedByUserId: input.requestedByUserId,
          expectedProviderAccountId,
          nextRequestHash,
        })
        || input.providerAbsenceVerified === true
          && canRestartVerifiedMissingExternalExecution({
            draft: active,
            execution,
            requestedByUserId: input.requestedByUserId,
            expectedProviderAccountId,
          })
      )
    ) {
      throw new ConflictException('An active registration preparation already exists.');
    }

    const supersededAt = new Date();
    const executionCancelled = await tx.productRegistrationExecution.updateMany({
      where: {
        id: execution.id,
        organizationId: input.organizationId,
        registrationTargetId: active.preparationId,
        status: execution.status,
        providerOutcome: execution.providerOutcome,
        providerSubmissionId: null,
        externalListingId: null,
        channelListingId: null,
      },
      data: {
        status: 'cancelled',
        completedAt: supersededAt,
        leaseToken: null,
        leaseClaimedAt: null,
      },
    });
    if (executionCancelled.count !== 1) {
      throw new ConflictException(
        'Registration execution changed while it was being superseded.',
      );
    }
    // Only the superseded execution closes. Its reusable registration target stays open.
  }

  async start(input: {
    organizationId: string;
    salesProductId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<RegistrationExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      const handle = ownerTransaction(tx);
      const identity = await this.findProductExecutionIdentity(handle, {
        organizationId: input.organizationId,
        salesProductId: input.salesProductId,
        executionId: input.executionId,
      });
      if (!identity) throw new NotFoundException('External registration execution not found.');
      await this.drafts.lockProduct(handle, {
        organizationId: input.organizationId,
        salesProductId: input.salesProductId,
      });
      await this.drafts.lockDraft(handle, {
        organizationId: input.organizationId,
        preparationId: identity.registrationTargetId,
      });
      await lockExecution(tx, input.organizationId, identity.id);
      const execution = await tx.productRegistrationExecution.findFirst({
        where: {
          id: identity.id,
          organizationId: input.organizationId,
          executionKind: 'external_wing',
          registrationTargetId: identity.registrationTargetId,
        },
      });
      if (!execution || execution.registrationTargetId === null) {
        throw new NotFoundException('External registration execution not found.');
      }
      const preparation = execution
        ? await this.drafts.loadDraft(handle, {
          organizationId: input.organizationId,
          preparationId: execution.registrationTargetId,
        })
        : null;
      if (
        !execution
        || !preparation
        || preparation.salesProductId !== input.salesProductId
        || preparation.organizationId !== input.organizationId
      ) {
        throw new NotFoundException('External registration execution not found.');
      }
      if (execution.requestedByUserId !== input.requestedByUserId) {
        throw new ConflictException('External registration execution belongs to a different actor.');
      }
      if (
        preparation.isDeleted
        || preparation.status !== 'submitting'
        || preparation.channelAccountId !== execution.channelAccountId
      ) {
        throw new ConflictException(
          'External registration execution no longer has an active preparation.',
        );
      }
      if (execution.status === 'executing' && execution.providerOutcome === 'uncertain') {
        if (
          !execution.leaseToken
        ) {
          throw new ConflictException(
            'External registration execution drifted from its active preparation.',
          );
        }
        return externalExecutionResult(execution);
      }
      if (
        execution.status !== 'prepared'
        || execution.providerOutcome !== 'not_attempted'
        || execution.leaseToken !== null
        || execution.leaseClaimedAt !== null
        || execution.startedAt !== null
        || retainsProviderIdentity(execution)
      ) {
        throw new ConflictException('External registration execution cannot be started from its current state.');
      }
      const leaseToken = randomUUID();
      const startedAt = new Date();
      const updated = await tx.productRegistrationExecution.update({
        where: { id: execution.id, organizationId: execution.organizationId },
        data: { status: 'executing', providerOutcome: 'uncertain', leaseToken, leaseClaimedAt: startedAt, startedAt },
      });
      return externalExecutionResult(updated);
    });
  }

  async get(input: {
    organizationId: string;
    salesProductId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<RegistrationExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      const handle = ownerTransaction(tx);
      const execution = await tx.productRegistrationExecution.findFirst({
        where: {
          id: input.executionId,
          organizationId: input.organizationId,
          executionKind: 'external_wing',
          requestedByUserId: input.requestedByUserId,
          registrationTargetId: {
            in: await this.drafts.findDraftIds(handle, {
              organizationId: input.organizationId,
              salesProductId: input.salesProductId,
            }),
          },
        },
      });
      if (!execution) throw new NotFoundException('External registration execution not found.');
      return externalExecutionResult(execution);
    });
  }

  async markUnresolved(input: {
    organizationId: string;
    salesProductId: string;
    executionId: string;
    requestedByUserId: string | null;
    evidence: unknown;
  }): Promise<RegistrationExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      const handle = ownerTransaction(tx);
      const identity = await this.findProductExecutionIdentity(handle, {
        organizationId: input.organizationId,
        salesProductId: input.salesProductId,
        executionId: input.executionId,
        requestedByUserId: input.requestedByUserId,
      });
      if (!identity) throw new NotFoundException('External registration execution not found.');
      await this.drafts.lockProduct(handle, {
        organizationId: input.organizationId,
        salesProductId: input.salesProductId,
      });
      await this.drafts.lockDraft(handle, {
        organizationId: input.organizationId,
        preparationId: identity.registrationTargetId,
      });
      await lockExecution(tx, input.organizationId, identity.id);
      const current = await tx.productRegistrationExecution.findFirst({
        where: {
          id: identity.id,
          organizationId: input.organizationId,
          executionKind: 'external_wing',
          requestedByUserId: input.requestedByUserId,
          registrationTargetId: identity.registrationTargetId,
        },
      });
      if (!current || current.registrationTargetId === null) {
        throw new NotFoundException('External registration execution not found.');
      }
      if (current.providerOutcome === 'succeeded') {
        return externalExecutionResult(current);
      }
      if (!['executing', 'reconciling'].includes(current.status)) {
        throw new ConflictException('Only a started external registration may be reconciled.');
      }
      if (current.providerOutcome !== 'uncertain' || retainsProviderIdentity(current)) {
        throw new ConflictException('Recorded provider identity cannot become unresolved.');
      }
      const evidence = JSON.stringify(input.evidence ?? null).slice(0, 4_000);
      const changed = await tx.productRegistrationExecution.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          status: { in: ['executing', 'reconciling'] },
          providerOutcome: 'uncertain',
          providerSubmissionId: null,
          externalListingId: null,
          resultJson: { equals: Prisma.DbNull },
        },
        data: { status: 'reconciling', providerOutcome: 'uncertain', lastErrorMessage: evidence },
      });
      if (changed.count !== 1) {
        throw new ConflictException('External registration changed while it was being reconciled.');
      }
      const updated = await tx.productRegistrationExecution.findFirstOrThrow({
        where: { id: current.id, organizationId: input.organizationId },
      });
      return externalExecutionResult(updated);
    });
  }

  async markNotSubmitted(input: {
    organizationId: string;
    salesProductId: string;
    executionId: string;
    requestedByUserId: string | null;
    evidence: unknown;
  }): Promise<ClosedRegistrationExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      const handle = ownerTransaction(tx);
      const identity = await this.findProductExecutionIdentity(handle, {
        organizationId: input.organizationId,
        salesProductId: input.salesProductId,
        executionId: input.executionId,
        requestedByUserId: input.requestedByUserId,
      });
      if (!identity) throw new NotFoundException('External registration execution not found.');
      await this.drafts.lockProduct(handle, {
        organizationId: input.organizationId,
        salesProductId: input.salesProductId,
      });
      await this.drafts.lockDraft(handle, {
        organizationId: input.organizationId,
        preparationId: identity.registrationTargetId,
      });
      await lockExecution(tx, input.organizationId, identity.id);
      const current = await tx.productRegistrationExecution.findFirst({
        where: {
          id: identity.id,
          organizationId: input.organizationId,
          executionKind: 'external_wing',
          requestedByUserId: input.requestedByUserId,
          registrationTargetId: identity.registrationTargetId,
        },
      });
      if (!current || current.registrationTargetId === null) {
        throw new NotFoundException('External registration execution not found.');
      }
      const preparationId = current.registrationTargetId;
      const closed = (): ClosedRegistrationExecutionResult => ({
        executionId: current.id,
        preparationId,
        status: 'failed',
        providerOutcome: 'definitive_failure',
      });
      if (current.status === 'failed') return closed();
      if (!['prepared', 'executing', 'reconciling'].includes(current.status)) {
        throw new ConflictException(
          'Only a prepared or started external registration may be closed as not submitted.',
        );
      }
      if (current.providerOutcome === 'succeeded' || retainsProviderIdentity(current)) {
        throw new ConflictException(
          'Recorded provider identity cannot be closed as not submitted.',
        );
      }
      const evidence = JSON.stringify(input.evidence ?? null).slice(0, 4_000);
      const changed = await tx.productRegistrationExecution.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          status: { in: ['prepared', 'executing', 'reconciling'] },
          providerSubmissionId: null,
          externalListingId: null,
          resultJson: { equals: Prisma.DbNull },
        },
        data: {
          status: 'failed',
          providerOutcome: 'definitive_failure',
          lastErrorMessage: evidence,
          leaseToken: null,
          leaseClaimedAt: null,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('External registration changed while it was being closed.');
      }
      // 준비도 함께 풀어 준다. `submitting` 으로 남으면 취소도 재시도도 막힌다.
      return closed();
    });
  }

  async claimForSubmission(
    organizationId: string,
    preparationId: string,
    userId: string | null,
  ): Promise<RegistrationExecutionClaimResult> {
    return this.prisma.$transaction(async (tx) => {
      const handle = ownerTransaction(tx);
      const identity = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      if (!identity) throw new NotFoundException('Product preparation not found.');
      await this.drafts.lockProduct(handle, {
        organizationId,
        salesProductId: identity.salesProductId,
      });


      await this.drafts.lockDraft(handle, { organizationId, preparationId });
      const current = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      if (!current) throw new NotFoundException('Product preparation not found.');
      let execution = await tx.productRegistrationExecution.findFirst({
        where: { organizationId, registrationTargetId: current.preparationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (execution) await lockExecution(tx, organizationId, execution.id);
      execution = await tx.productRegistrationExecution.findFirst({
        where: { organizationId, registrationTargetId: current.preparationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (execution && execution.executionKind !== 'create') {
        throw new ConflictException('This execution must use its explicit start/completion contract.');
      }
      if (execution?.status === 'succeeded') {
        if (!execution.channelListingId) {
          throw new ConflictException('Succeeded execution is missing its listing identity.');
        }
        return {
          preparationId: current.preparationId,
          status: 'registered' as const,
          listingId: execution.channelListingId,
        };
      }
      assertRegistrationIdentity(current);
      await this.drafts.requireActiveProduct(handle, {
        organizationId,
        salesProductId: current.salesProductId,
      });
      const now = new Date();
      if (execution && ['prepared', 'executing', 'reconciling'].includes(execution.status) && hasLiveExecutionLease({
        token: execution.leaseToken,
        claimedAt: execution.leaseClaimedAt,
        now,
      })) {
        throw new ConflictException('Product registration submission is already in progress.');
      }
      if (execution?.status === 'cancelled' || execution?.status === 'failed') {
        throw new ConflictException(`Registration execution cannot be submitted from '${execution.status}'.`);
      }
      if (!['draft', 'submitting', 'failed', 'registered'].includes(current.status)) {
        throw new ConflictException(`Preparation cannot be submitted from '${current.status}'.`);
      }
      const submissionLeaseToken = randomUUID();

      if (!execution) {
        const claimed = await this.drafts.claimForSubmission(handle, {
          organizationId,
          preparationId: current.preparationId,
          userId,
          now,
          reuseFrozenSubmission: false,
        });
        const frozen = claimed.frozen!;
        execution = await tx.productRegistrationExecution.create({
          data: {
            organizationId,
            registrationTargetId: claimed.draft.preparationId,
            channelAccountId: claimed.draft.channelAccountId,
            idempotencyKey: randomUUID(),
            requestHash: frozen.hash,
            reviewPayloadHash: frozen.hash,
            approvedAt: now,
            approvedByUserId: userId,
            submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
            submissionPayloadHash: frozen.hash,
            status: 'prepared',
            providerOutcome: 'not_attempted',
            leaseToken: submissionLeaseToken,
            leaseClaimedAt: now,
            requestedByUserId: userId,
          },
        });
        return toFrozenSubmission(claimed.draft, execution);
      }

      if (execution.reviewPayloadHash !== execution.requestHash
        || execution.approvedAt === null
        || execution.approvedByUserId !== userId) {
        throw new ConflictException('Registration execution does not match its frozen approval.');
      }
      if (!execution.submissionPayloadJson || !execution.submissionPayloadHash) {
        throw new ConflictException('Registration execution is missing its frozen submission.');
      }
      const claimed = await this.drafts.claimForSubmission(handle, {
        organizationId,
        preparationId: current.preparationId,
        userId,
        now,
        reuseFrozenSubmission: true,
      });
      if (execution.requestedByUserId !== userId) {
        throw new ConflictException('Registration execution belongs to a different actor.');
      }
      const refreshedExecution = await tx.productRegistrationExecution.update({
        where: { id: execution.id, organizationId: execution.organizationId },
        data: { leaseToken: submissionLeaseToken, leaseClaimedAt: now },
      });
      return toFrozenSubmission(claimed.draft, refreshedExecution);
    });
  }

  async loadFrozenSubmission(
    organizationId: string,
    preparationId: string,
    executionId?: string,
  ): Promise<FrozenRegistrationSubmission> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.drafts.loadDraft(ownerTransaction(tx), { organizationId, preparationId });
      if (!row || row.isDeleted) throw new NotFoundException('Frozen product preparation not found.');
      const execution = await requireExecution(tx, organizationId, preparationId, executionId);
      return toFrozenSubmission(row, execution);
    });
  }

  async markProviderAttemptStarted(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const handle = ownerTransaction(tx);
      await this.drafts.lockDraft(handle, { organizationId, preparationId });
      const current = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      const execution = await requireExecution(tx, organizationId, preparationId);
      await lockExecution(tx, organizationId, execution.id);
      if (!current || current.status !== 'submitting' || current.isDeleted
        || execution.leaseToken !== submissionLeaseToken) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
      if (execution.status !== 'prepared' || execution.providerOutcome !== 'not_attempted') {
        throw new ConflictException(
          'Provider create is not allowed while the prior outcome is uncertain or succeeded.',
        );
      }
      const started = await tx.productRegistrationExecution.updateMany({
        where: {
          id: execution.id,
          organizationId,
          status: 'prepared',
          leaseToken: submissionLeaseToken,
        },
        data: {
          status: 'executing', providerOutcome: 'uncertain', startedAt: new Date(),
          lastErrorCode: null, lastErrorMessage: null,
        },
      });
      if (started.count !== 1) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
    });
  }

  async recordProviderResult(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
    result: {
      providerSubmissionId?: string | null;
      externalListingId: string;
      channel: string;
      rawResult: unknown;
    },
    executionId?: string,
  ): Promise<FrozenRegistrationSubmission> {
    return this.prisma.$transaction(async (tx) => {
      const handle = ownerTransaction(tx);
      await this.drafts.lockDraft(handle, { organizationId, preparationId });
      const current = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      const execution = await requireExecution(tx, organizationId, preparationId, executionId);
      await lockExecution(tx, organizationId, execution.id);
      if (!current || current.status !== 'submitting' || current.isDeleted
        || execution.leaseToken !== submissionLeaseToken) {
        throw new ConflictException('Preparation is not awaiting this provider result.');
      }
      const registrationResult = freezeProductRegistrationPayload({
        providerSubmissionId: result.providerSubmissionId ?? null,
        externalListingId: result.externalListingId,
        channel: result.channel,
        rawResult: result.rawResult,
      } as RegistrationSubmissionJson, channelIntegrity.sha256).payload;
      const updatedExecution = await tx.productRegistrationExecution.update({
        where: { id: execution.id, organizationId: execution.organizationId },
        data: {
          providerSubmissionId: result.providerSubmissionId ?? result.externalListingId,
          externalListingId: result.externalListingId,
          resultJson: registrationResult as Prisma.InputJsonValue,
          providerOutcome: 'succeeded',
          status: 'executing',
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      const updated = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      if (!updated) throw new ConflictException('Product preparation disappeared while recording the provider result.');
      return toFrozenSubmission(updated, updatedExecution);
    });
  }

  async markFailed(input: {
    organizationId: string;
    preparationId: string;
    submissionLeaseToken: string;
    error: string;
    executionId?: string;
    providerOutcome?: 'definitive_failure';
  }): Promise<{ preparationId: string; status: 'failed' }> {
    return this.prisma.$transaction(async (tx) => {
      const handle = ownerTransaction(tx);
      await this.drafts.lockDraft(handle, {
        organizationId: input.organizationId,
        preparationId: input.preparationId,
      });
      const current = await this.drafts.loadDraft(handle, {
        organizationId: input.organizationId,
        preparationId: input.preparationId,
      });
      if (!current || current.isDeleted) throw new NotFoundException('Product preparation not found.');
      const execution = await requireExecution(tx, input.organizationId, input.preparationId, input.executionId);
      await lockExecution(tx, input.organizationId, execution.id);
      if (current.status !== 'submitting' && current.status !== 'failed') {
        throw new ConflictException(`Preparation cannot fail from '${current.status}'.`);
      }
      if (
        current.status === 'submitting'
        && execution.leaseToken !== input.submissionLeaseToken
      ) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
      if (current.status === 'failed' && execution.leaseToken === null) {
        return { preparationId: current.preparationId, status: 'failed' as const };
      }
      const currentOutcome = execution.providerOutcome as RegistrationExecutionProviderOutcome;
      if (
        input.providerOutcome === 'definitive_failure'
        && (currentOutcome === 'succeeded'
          || execution.providerSubmissionId !== null
          || execution.resultJson !== null)
      ) {
        throw new ConflictException('Recorded provider success cannot become a definitive failure.');
      }
      const providerOutcome = input.providerOutcome
        ?? (currentOutcome === 'not_attempted' ? 'uncertain' : currentOutcome);
      const executionStatus = providerOutcome === 'definitive_failure' ? 'failed' : 'reconciling';
      await tx.productRegistrationExecution.updateMany({
        where: { id: execution.id, organizationId: input.organizationId, leaseToken: input.submissionLeaseToken },
        data: {
          status: executionStatus, providerOutcome,
          lastErrorMessage: input.error, leaseToken: null, leaseClaimedAt: null,
        },
      });
      return { preparationId: current.preparationId, status: 'failed' as const };
    });
  }

  async finalizeRegistered(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
    finalize: (
      tx: ChannelsRepositoryTransaction,
    ) => Promise<{ listingId: string }>,
    executionId?: string,
  ): Promise<RegistrationExecutionRegisteredResult> {
    return this.prisma.$transaction(async (tx) => {
      const handle = ownerTransaction(tx);
      const identity = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      if (!identity || identity.isDeleted) throw new NotFoundException('Product preparation not found.');
      await this.drafts.lockProduct(handle, {
        organizationId,
        salesProductId: identity.salesProductId,
      });


      await this.drafts.lockDraft(handle, { organizationId, preparationId });
      const current = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      if (!current || current.isDeleted) throw new NotFoundException('Product preparation not found.');
      const execution = await requireExecution(tx, organizationId, preparationId, executionId);
      await lockExecution(tx, organizationId, execution.id);
      if (execution.status === 'succeeded' && execution.channelListingId) {
        return {
          preparationId: current.preparationId,
          status: 'registered' as const,
          listingId: execution.channelListingId,
        };
      }
      if (current.status !== 'submitting') {
        throw new ConflictException('Preparation is not ready for finalization.');
      }
      assertRegistrationIdentity(current);
      await this.drafts.requireActiveProduct(handle, {
        organizationId,
        salesProductId: current.salesProductId,
      });
      if (execution.leaseToken !== submissionLeaseToken) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
      if (!execution.resultJson || execution.providerOutcome !== 'succeeded') {
        throw new ConflictException('Provider success must be recorded before finalization.');
      }

      const result = await finalize(handle);
      const listing = await tx.channelListing.findFirst({
        where: {
          id: result.listingId,
          organizationId,
          channelAccountId: current.channelAccountId,
          salesProductId: current.salesProductId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!listing) {
        throw new ConflictException('Final listing is outside the preparation account or source.');
      }
      // Successful submission is an execution fact. The reusable target stays open.
      await tx.productRegistrationExecution.update({
        where: { id: execution.id, organizationId: execution.organizationId },
        data: {
          channelListingId: listing.id,
          status: 'succeeded',
          providerOutcome: 'succeeded',
          completedAt: new Date(),
          leaseToken: null,
          leaseClaimedAt: null,
        },
      });
      return {
        preparationId: current.preparationId,
        status: 'registered' as const,
        listingId: listing.id,
      };
    }, { timeout: 15_000 });
  }

  private async executionSalesProductId(
    tx: ChannelsRepositoryTransaction,
    organizationId: string,
    execution: { registrationTargetId: string | null },
  ): Promise<string | null> {
    if (execution.registrationTargetId === null) return null;
    const draft = await this.drafts.loadDraft(tx, {
      organizationId,
      preparationId: execution.registrationTargetId,
    });
    return draft?.salesProductId ?? null;
  }

  private async findProductExecutionIdentity(
    handle: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      salesProductId: string;
      executionId: string;
      requestedByUserId?: string | null;
    },
  ): Promise<{ id: string; registrationTargetId: string } | null> {
    const tx = ownerTransactionClient(handle);

    const execution = await tx.productRegistrationExecution.findFirst({
      where: {
        id: input.executionId,
        organizationId: input.organizationId,
        executionKind: 'external_wing',
        ...(input.requestedByUserId === undefined
          ? {}
          : { requestedByUserId: input.requestedByUserId }),
      },
      select: { id: true, registrationTargetId: true },
    });
    if (!execution || execution.registrationTargetId === null) return null;
    const identity = { id: execution.id, registrationTargetId: execution.registrationTargetId };
    const salesProductId = await this.executionSalesProductId(handle, input.organizationId, identity);
    return salesProductId === input.salesProductId ? identity : null;
  }
}

function assertListingAvailabilitySupported(channel: string, kind: 'sold_out' | 'resume'): void {
  if (!getListingAvailabilityCapability(channel, kind)) {
    throw new ConflictException(`The channel has no verified ${kind} route.`);
  }
}

function assertAvailabilityOptionSupport(
  channel: string,
  options: Array<{ externalOptionId: string; rawJson: Prisma.JsonValue | null }>,
): void {
  if (channel !== 'coupang') return;
  if (options.length === 0) throw new ConflictException('Wing availability requires active options.');
  if (options.some((option) => option.rawJson && typeof option.rawJson === 'object'
    && !Array.isArray(option.rawJson) && option.rawJson.registrationType === 'RFM')) {
    throw new ConflictException('Rocket Growth options do not support seller stock changes.');
  }
}

function assertListingAvailabilityAccount(
  execution: ProductRegistrationExecution,
  snapshot: ListingAvailabilitySnapshot,
  account: { channel: string; vendorId: string | null; externalAccountId: string | null },
): void {
  assertListingAvailabilitySupported(account.channel, snapshot.kind);
  const identity = account.vendorId?.trim() || account.externalAccountId?.trim() || null;
  if (account.channel !== snapshot.mallKey || identity !== execution.expectedProviderAccountId) {
    throw new ConflictException('Listing availability provider account changed after preparation.');
  }
}

async function assertFrozenAvailabilityOptions(
  tx: Prisma.TransactionClient,
  organizationId: string,
  snapshot: ListingAvailabilitySnapshot,
): Promise<void> {
  if (snapshot.mallKey !== 'coupang') return;
  const options = await tx.channelListingOption.findMany({
    where: { organizationId, listingId: snapshot.channelListingId, isActive: true,
      externalOptionId: { in: snapshot.optionCodes } },
    select: { externalOptionId: true, rawJson: true },
  });
  if (options.length !== snapshot.optionCodes.length) {
    throw new ConflictException('Frozen availability options are no longer active.');
  }
  assertAvailabilityOptionSupport(snapshot.mallKey, options);
}

function assertWingAvailabilityConfirmation(
  snapshot: ListingAvailabilitySnapshot,
  report: ReportListingAvailabilityInput,
): void {
  const observations = report.evidence.observedOptionStocks ?? [];
  const ids = new Set(observations.map((option) => option.externalOptionId));
  if (report.evidence.externalListingId !== snapshot.externalListingId
    || observations.length !== snapshot.optionCodes.length || ids.size !== observations.length
    || snapshot.optionCodes.some((id) => !ids.has(id))
    || observations.some((option) => option.registrationType !== 'NORMAL'
      || !Number.isSafeInteger(option.stock) || option.stock < 0
      || (snapshot.kind === 'sold_out' ? option.stock !== 0 : option.stock === 0))) {
    throw new ConflictException('Wing confirmation requires a matching stock reread for every frozen normal option.');
  }
}

function listingAvailabilityIntentHash(
  request: PrepareListingAvailabilityInput,
): string {
  return hashRegistrationSubmissionPayload({
    purpose: 'listing-availability-execution-intent',
    ...(request.stockoutPolicy ? { stockoutPolicy: request.stockoutPolicy } : {}),
    channelAccountId: request.channelAccountId,
    externalListingId: request.externalListingId.trim(),
    kind: request.kind,
    optionCodes: [...(request.optionCodes ?? [])].map((code) => code.trim()).sort(),
    idempotencyKey: request.idempotencyKey,
  }, channelIntegrity.sha256);
}

function freezeListingAvailabilitySnapshot(snapshot: ListingAvailabilitySnapshot): {
  payload: ListingAvailabilitySnapshot;
  hash: string;
} {
  const parsed = ListingAvailabilitySnapshotSchema.safeParse(snapshot);
  if (!parsed.success) throw new ConflictException('Listing availability snapshot is invalid.');
  const frozen = freezeProductRegistrationPayload(
    parsed.data as unknown as RegistrationSubmissionJson, channelIntegrity.sha256,
  );
  return {
    payload: frozen.payload as unknown as ListingAvailabilitySnapshot,
    hash: frozen.hash,
  };
}

function listingAvailabilitySnapshot(
  execution: ProductRegistrationExecution,
): ListingAvailabilitySnapshot {
  if (execution.registrationTargetId !== null
    || !['sold_out', 'resume'].includes(execution.executionKind)
    || !execution.submissionPayloadJson
    || !execution.submissionPayloadHash) {
    throw new ConflictException('Execution is not a listing availability execution.');
  }
  const parsed = ListingAvailabilitySnapshotSchema.safeParse(execution.submissionPayloadJson);
  if (!parsed.success) throw new ConflictException('Listing availability snapshot is invalid.');
  const frozen = freezeListingAvailabilitySnapshot(parsed.data);
  if (frozen.hash !== execution.submissionPayloadHash
    || frozen.payload.channelListingId !== execution.channelListingId
    || frozen.payload.channelAccountId !== execution.channelAccountId
    || frozen.payload.kind !== execution.executionKind
    || (execution.externalListingId !== null
      && execution.externalListingId !== frozen.payload.externalListingId)) {
    throw new ConflictException('Listing availability snapshot does not match its execution row.');
  }
  return frozen.payload;
}

function listingAvailabilityResult(
  execution: ProductRegistrationExecution,
  maySubmit: boolean,
): ListingAvailabilityExecution {
  const snapshot = listingAvailabilitySnapshot(execution);
  if (!['prepared', 'executing', 'reconciling', 'succeeded', 'failed', 'cancelled'].includes(execution.status)
    || !['not_attempted', 'uncertain', 'succeeded', 'definitive_failure'].includes(execution.providerOutcome)) {
    throw new ConflictException('Listing availability execution has an unsupported lifecycle state.');
  }
  return {
    executionId: execution.id,
    channelAccountId: execution.channelAccountId,
    status: execution.status as ListingAvailabilityExecution['status'],
    providerOutcome: execution.providerOutcome as ListingAvailabilityExecution['providerOutcome'],
    payloadHash: execution.submissionPayloadHash!,
    payload: snapshot,
    leaseToken: execution.leaseToken,
    maySubmit,
    externalListingId: execution.externalListingId,
    expectedProviderAccountId: execution.expectedProviderAccountId,
    result: execution.resultJson ?? null,
    createdAt: execution.createdAt.toISOString(),
  };
}

function assertListingAvailabilityReplayIdentity(
  execution: ProductRegistrationExecution,
  requestedByUserId: string | null,
  requestHash: string,
): void {
  if (execution.registrationTargetId !== null
    || !['sold_out', 'resume'].includes(execution.executionKind)
    || execution.requestedByUserId !== requestedByUserId
    || execution.requestHash !== requestHash) {
    throw new ConflictException('Listing availability idempotency key belongs to a different request.');
  }
}

async function lockListingAvailabilityScope(
  tx: Prisma.TransactionClient,
  organizationId: string,
  snapshot: ListingAvailabilitySnapshot,
): Promise<{
  account: { id: string; status: string; channel: string; vendorId: string | null; externalAccountId: string | null };
  listing: { id: string; externalId: string; isActive: boolean };
}> {
  const lockedAccount = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM channel_accounts
    WHERE id = ${snapshot.channelAccountId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
  if (lockedAccount.length !== 1) throw new NotFoundException('Channel account not found.');
  const account = await tx.channelAccount.findFirst({
    where: { id: snapshot.channelAccountId, organizationId },
    select: { id: true, status: true, channel: true, vendorId: true, externalAccountId: true },
  });
  if (!account) throw new NotFoundException('Channel account not found.');

  const lockedListing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM channel_listings
    WHERE id = ${snapshot.channelListingId}::uuid
      AND organization_id = ${organizationId}::uuid
      AND channel_account_id = ${snapshot.channelAccountId}::uuid
      AND external_id = ${snapshot.externalListingId}
    FOR UPDATE
  `);
  if (lockedListing.length !== 1) throw new NotFoundException('Channel listing not found.');
  const listing = await tx.channelListing.findFirst({
    where: {
      id: snapshot.channelListingId,
      organizationId,
      channelAccountId: snapshot.channelAccountId,
      externalId: snapshot.externalListingId,
    },
    select: { id: true, externalId: true, isActive: true },
  });
  if (!listing) throw new NotFoundException('Channel listing not found.');
  return { account, listing };
}

function listingAvailabilityTerminalReplayMatches(
  execution: ProductRegistrationExecution,
  snapshot: ListingAvailabilitySnapshot,
  report: ReportListingAvailabilityInput,
): boolean {
  const externalListingId = report.evidence.externalListingId?.trim() || null;
  if (execution.status === 'succeeded'
    && execution.providerOutcome === 'succeeded'
    && report.outcome === 'confirmed') {
    return externalListingId === null || externalListingId === snapshot.externalListingId;
  }
  return execution.status === 'failed'
    && execution.providerOutcome === 'definitive_failure'
    && report.outcome === 'not_submitted';
}

function assertTargetExecutionRow(execution: ProductRegistrationExecution): void {
  if (execution.registrationTargetId === null) {
    throw new ConflictException('Listing availability execution is not a registration-target execution.');
  }
}

function isUnstartedExternalRegistrationIntent(
  execution: ProductRegistrationExecution,
  draft: FrozenRegistrationDraft,
  organizationId: string,
  salesProductId: string,
): boolean {
  return execution.organizationId === organizationId
    && execution.executionKind === 'external_wing'
    && execution.status === 'prepared'
    && execution.providerOutcome === 'not_attempted'
    && execution.providerSubmissionId === null
    && execution.externalListingId === null
    && execution.resultJson === null
    && execution.leaseToken === null
    && execution.leaseClaimedAt === null
    && execution.startedAt === null
    && execution.completedAt === null
    && draft.organizationId === organizationId
    && draft.salesProductId === salesProductId
    && draft.status === 'submitting'
    && draft.isDeleted === false;
}

async function lockExecution(
  tx: Prisma.TransactionClient,
  organizationId: string,
  executionId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM product_registration_executions
    WHERE id = ${executionId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
}

async function requireExecution(
  tx: Prisma.TransactionClient,
  organizationId: string,
  preparationId: string,
  executionId?: string,
): Promise<ProductRegistrationExecution> {
  const execution = await tx.productRegistrationExecution.findFirst({
    where: { organizationId, registrationTargetId: preparationId, ...(executionId ? { id: executionId } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  if (!execution) throw new ConflictException('Product registration execution is missing.');
  if (executionId ? !['create', 'external_wing'].includes(execution.executionKind) : execution.executionKind !== 'create') {
    throw new ConflictException('Use the explicit execution identity for this registration.');
  }
  return execution;
}

function canSupersedePreparedExternalExecution(input: {
  draft: FrozenRegistrationDraft;
  execution: ProductRegistrationExecution;
  requestedByUserId: string | null;
  expectedProviderAccountId: string;
  nextRequestHash: string;
}): boolean {
  const { draft, execution } = input;
  return draft.status === 'submitting'
    && draft.channelListingId === null
    && execution.reviewPayloadHash === execution.requestHash
    && execution.approvedAt !== null
    && execution.approvedByUserId === input.requestedByUserId
    && execution.executionKind === 'external_wing'
    && execution.status === 'prepared'
    && execution.providerOutcome === 'not_attempted'
    && execution.providerSubmissionId === null
    && execution.externalListingId === null
    && execution.channelListingId === null
    && execution.resultJson === null
    && execution.leaseToken === null
    && execution.leaseClaimedAt === null
    && execution.startedAt === null
    && execution.completedAt === null
    && execution.submissionPayloadJson !== null
    && execution.submissionPayloadHash === execution.requestHash
    && execution.requestedByUserId === input.requestedByUserId
    && execution.expectedProviderAccountId === input.expectedProviderAccountId
    && execution.requestHash !== input.nextRequestHash;
}

function canRestartVerifiedMissingExternalExecution(input: {
  draft: FrozenRegistrationDraft;
  execution: ProductRegistrationExecution;
  requestedByUserId: string | null;
  expectedProviderAccountId: string;
}): boolean {
  const { draft, execution } = input;
  return draft.status === 'submitting'
    && draft.channelListingId === null
    && execution.reviewPayloadHash === execution.requestHash
    && execution.approvedAt !== null
    && execution.approvedByUserId === input.requestedByUserId
    && execution.executionKind === 'external_wing'
    && ['executing', 'reconciling'].includes(execution.status)
    && execution.providerOutcome === 'uncertain'
    && execution.providerSubmissionId === null
    && execution.externalListingId === null
    && execution.channelListingId === null
    && execution.resultJson === null
    && execution.leaseToken !== null
    && execution.leaseClaimedAt !== null
    && execution.startedAt !== null
    && execution.completedAt === null
    && execution.submissionPayloadJson !== null
    && execution.submissionPayloadHash === execution.requestHash
    && execution.requestedByUserId === input.requestedByUserId
    && execution.expectedProviderAccountId === input.expectedProviderAccountId;
}

function matchesPreparedRequest(execution: ProductRegistrationExecution, requestHash: string): boolean {
  if (!execution.submissionPayloadJson) return execution.requestHash === requestHash;
  const frozen = freezeProductRegistrationPayload(execution.submissionPayloadJson as RegistrationSubmissionJson, channelIntegrity.sha256);
  if (frozen.hash !== execution.requestHash || frozen.hash !== execution.submissionPayloadHash) {
    throw new ConflictException('Frozen registration execution payload hash does not match its JSON.');
  }
  const original = registrationRequestBeforeCodeAssignment(frozen.payload);
  return freezeProductRegistrationPayload(original as RegistrationSubmissionJson, channelIntegrity.sha256).hash === requestHash;
}

function externalExecutionResult(
  execution: ProductRegistrationExecution,
): RegistrationExecutionResult {
  if (execution.registrationTargetId === null) {
    throw new ConflictException('Listing availability execution is not an external registration.');
  }
  if (!['prepared', 'executing', 'reconciling', 'succeeded'].includes(execution.status)
    || !['not_attempted', 'uncertain', 'succeeded'].includes(execution.providerOutcome)) {
    throw new ConflictException('External registration execution has an unsupported lifecycle state.');
  }
  const recipe = preparedRegistrationRecipe(execution.submissionPayloadJson);
  return {
    ...(recipe ? { kidItemCode: recipe.kidItemCode } : {}),
    executionId: execution.id,
    preparationId: execution.registrationTargetId,
    requestHash: execution.requestHash,
    status: execution.status as 'prepared' | 'executing' | 'reconciling' | 'succeeded',
    providerOutcome: execution.providerOutcome as 'not_attempted' | 'uncertain' | 'succeeded',
    submissionLeaseToken: execution.leaseToken,
    expectedProviderAccountId: execution.expectedProviderAccountId ?? '',
    listingId: execution.channelListingId,
  };
}

function assertRegistrationIdentity(
  draft: FrozenRegistrationDraft,
): asserts draft is FrozenRegistrationDraft & {
  salesProductId: string;
  channelAccountId: string;
} {
  if (!draft.salesProductId || !draft.channelAccountId) {
    throw new ConflictException('Product preparation is missing its registration identity.');
  }
}

/**
 * 실행이 동결한 제출본을 되읽는다.
 *
 * 표시명 · 선택된 콘텐츠는 **동결 payload** 에서 읽는다 — 초안이 그 뒤에 편집돼도
 * 제출된 것은 바뀌지 않는다. 행 쪽에서 읽으면 그 보장이 사라진다.
 */
function toFrozenSubmission(
  draft: FrozenRegistrationDraft,
  execution: ProductRegistrationExecution,
): FrozenRegistrationSubmission {
  assertRegistrationIdentity(draft);
  if (!execution.idempotencyKey || !execution.submissionPayloadJson || !execution.submissionPayloadHash) {
    throw new ConflictException('Preparation submission has not been frozen.');
  }
  const frozen = freezeProductRegistrationPayload(
    execution.submissionPayloadJson as RegistrationSubmissionJson, channelIntegrity.sha256,
  );
  if (frozen.hash !== execution.submissionPayloadHash || frozen.hash !== execution.requestHash) {
    throw new ConflictException('Frozen registration execution payload hash does not match its JSON.');
  }
  const payload = frozen.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ConflictException('Frozen preparation payload must be an object.');
  }
  const frozenChannelAccountId = frozenRequiredString(payload, 'channelAccountId');
  if (frozenChannelAccountId !== draft.channelAccountId) {
    throw new ConflictException('Frozen preparation account does not match the row identity.');
  }
  return {
    executionId: execution.id,
    preparationId: draft.preparationId,
    salesProductId: draft.salesProductId,
    sourceCandidateId: draft.sourceCandidateId,
    channelAccountId: frozenChannelAccountId,
    sourceContentWorkspaceId: draft.sourceContentWorkspaceId,
    displayName: frozenRequiredString(payload, 'displayName'),
    status: registrationDraftState(draft.closedAt, execution),
    submissionKey: execution.idempotencyKey,
    submissionPayloadJson: frozen.payload,
    submissionPayloadHash: execution.submissionPayloadHash,
    providerSubmissionId: execution.providerSubmissionId,
    registrationResult: execution.resultJson ?? null,
    providerOutcome: execution.providerOutcome as RegistrationExecutionProviderOutcome,
    submissionLeaseToken: execution.leaseToken,
    isRetry: execution.lastErrorMessage !== null || execution.providerOutcome !== 'not_attempted',
    selectedThumbnailUrl: frozenNullableString(payload, 'selectedThumbnailUrl'),
    selectedThumbnailGenerationId: frozenNullableString(
      payload,
      'selectedThumbnailGenerationId',
    ),
    selectedThumbnailGenerationCandidateId: frozenNullableString(
      payload,
      'selectedThumbnailGenerationCandidateId',
    ),
    selectedDetailPageArtifactId: frozenNullableString(
      payload,
      'selectedDetailPageArtifactId',
    ),
    selectedDetailPageRevisionId: frozenNullableString(
      payload,
      'selectedDetailPageRevisionId',
    ),
    selectedDetailPageGenerationId: frozenNullableString(
      payload,
      'selectedDetailPageGenerationId',
    ),
  };
}

function frozenRequiredString(
  payload: RegistrationSubmissionJson,
  key: string,
): string {
  const value = (payload as Record<string, RegistrationSubmissionJson>)[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConflictException(`Frozen preparation payload is missing '${key}'.`);
  }
  return value;
}

function frozenNullableString(
  payload: RegistrationSubmissionJson,
  key: string,
): string | null {
  const value = (payload as Record<string, RegistrationSubmissionJson>)[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new ConflictException(`Frozen preparation payload field '${key}' is invalid.`);
  }
  return value;
}

function freezeTargetExecutionSnapshot(snapshot: TargetExecutionSnapshot): {
  payload: TargetExecutionSnapshot;
  hash: string;
} {
  const parsed = TargetExecutionSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    throw new ConflictException('Registration execution snapshot is invalid.');
  }
  const frozen = freezeProductRegistrationPayload(
    parsed.data as unknown as RegistrationSubmissionJson, channelIntegrity.sha256,
  );
  return {
    payload: frozen.payload as unknown as TargetExecutionSnapshot,
    hash: frozen.hash,
  };
}

function targetExecutionSnapshot(
  execution: ProductRegistrationExecution,
): TargetExecutionSnapshot {
  if (!execution.submissionPayloadJson || !execution.submissionPayloadHash) {
    throw new ConflictException('Registration execution snapshot is missing.');
  }
  const parsed = TargetExecutionSnapshotSchema.safeParse(execution.submissionPayloadJson);
  if (!parsed.success) {
    throw new ConflictException('Registration execution snapshot is invalid.');
  }
  const frozen = freezeProductRegistrationPayload(
    parsed.data as unknown as RegistrationSubmissionJson, channelIntegrity.sha256,
  );
  if (frozen.hash !== execution.submissionPayloadHash) {
    throw new ConflictException('Registration execution snapshot hash does not match its JSON.');
  }
  if (parsed.data.targetId !== execution.registrationTargetId
    || parsed.data.channelAccountId !== execution.channelAccountId) {
    throw new ConflictException('Registration execution snapshot identity does not match its row.');
  }
  return parsed.data;
}

function targetExecutionResult(
  execution: ProductRegistrationExecution,
  maySubmit: boolean,
): TargetExecutionResult {
  const snapshot = targetExecutionSnapshot(execution);
  if (!['prepared', 'executing', 'reconciling', 'succeeded', 'failed', 'cancelled'].includes(execution.status)
    || !['not_attempted', 'uncertain', 'succeeded', 'definitive_failure'].includes(execution.providerOutcome)) {
    throw new ConflictException('Registration execution has an unsupported lifecycle state.');
  }
  return {
    executionId: execution.id,
    targetId: snapshot.targetId,
    channelAccountId: execution.channelAccountId,
    status: execution.status as TargetExecutionResult['status'],
    providerOutcome: execution.providerOutcome as TargetExecutionResult['providerOutcome'],
    payloadHash: execution.submissionPayloadHash!,
    payload: snapshot,
    leaseToken: execution.leaseToken,
    maySubmit,
    externalListingId: execution.externalListingId,
    expectedProviderAccountId: execution.expectedProviderAccountId,
    result: execution.resultJson ?? null,
    createdAt: execution.createdAt.toISOString(),
  };
}

function targetExecutionIntentHash(
  targetId: string,
  request: PrepareTargetExecutionInput,
): string {
  return hashRegistrationSubmissionPayload({
    purpose: 'registration-target-execution-intent',
    targetId,
    expectedVersion: request.expectedVersion,
    kind: request.kind,
    idempotencyKey: request.idempotencyKey,
    channelListingId: request.channelListingId ?? null,
    applyCompositionTemplate: request.applyCompositionTemplate ?? false,
    optionTransitions: request.optionTransitions ?? [],
    ...(request.updateFields ? { updateFields: request.updateFields } : {}),
    ...(request.adapterDefaults ? { adapterDefaults: request.adapterDefaults } : {}),
    ...(request.adapterValues ? { adapterValues: request.adapterValues } : {}),
  }, channelIntegrity.sha256);
}

function assertTargetRequestMatchesSnapshot(
  request: PrepareTargetExecutionInput,
  snapshot: TargetExecutionSnapshot,
): void {
  if (snapshot.targetVersion !== request.expectedVersion
    || snapshot.kind !== request.kind
    || snapshot.channelListingId !== (request.channelListingId ?? null)
    || snapshot.applyCompositionTemplate !== (request.applyCompositionTemplate ?? false)
    || hashRegistrationSubmissionPayload(snapshot.adapterDefaults ?? {}, channelIntegrity.sha256) !== hashRegistrationSubmissionPayload(request.adapterDefaults ?? {}, channelIntegrity.sha256)
    || hashRegistrationSubmissionPayload(snapshot.adapterValues ?? {}, channelIntegrity.sha256) !== hashRegistrationSubmissionPayload(request.adapterValues ?? {}, channelIntegrity.sha256)
    || !sameStringArray(snapshot.updateFields ?? [], request.updateFields ?? [])
    || !sameOptionTransitions(snapshot.optionTransitions ?? [], request.optionTransitions ?? [])) {
    throw new ConflictException('Registration execution request does not match its snapshot.');
  }
}

function assertTargetReplayIdentity(
  execution: ProductRegistrationExecution,
  input: {
    organizationId: string;
    requestedByUserId: string | null;
    targetId: string;
    request: PrepareTargetExecutionInput;
  },
): void {
  if (execution.registrationTargetId !== input.targetId
    || execution.requestedByUserId !== input.requestedByUserId
    || execution.requestHash !== targetExecutionIntentHash(input.targetId, input.request)) {
    throw new ConflictException('Registration execution idempotency key belongs to a different request.');
  }
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && new Set(left).size === left.length
    && new Set(right).size === right.length
    && left.every((value) => right.includes(value));
}

type TargetOptionTransition = NonNullable<PrepareTargetExecutionInput['optionTransitions']>[number];
type TargetProductOption = TargetExecutionSnapshot['product']['options'][number];

function sameOptionTransitions(
  left: readonly TargetOptionTransition[],
  right: readonly TargetOptionTransition[],
): boolean {
  return left.length === right.length
    && left.every((transition, index) => (
      transition.channelListingOptionId === right[index]?.channelListingOptionId
      && transition.salesProductOptionId === right[index]?.salesProductOptionId
    ));
}

function isTerminalTargetExecution(execution: ProductRegistrationExecution): boolean {
  return ['succeeded', 'failed', 'cancelled'].includes(execution.status);
}

function targetTerminalReplayMatches(
  execution: ProductRegistrationExecution,
  report: ReportTargetExecutionInput,
): boolean {
  const externalListingId = report.evidence.externalListingId?.trim() || null;
  if (execution.status === 'succeeded'
    && execution.providerOutcome === 'succeeded'
    && report.outcome === 'confirmed') {
    return externalListingId === null || externalListingId === execution.externalListingId;
  }
  return execution.status === 'failed'
    && execution.providerOutcome === 'definitive_failure'
    && report.outcome === 'not_submitted'
    && externalListingId === null;
}

async function assertTargetProviderEvidence(
  tx: Prisma.TransactionClient,
  execution: ProductRegistrationExecution,
  report: ReportTargetExecutionInput,
): Promise<void> {
  const providerAccountId = report.evidence.providerAccountId?.trim() || null;
  const observedUrl = report.evidence.observedUrl?.trim() || null;
  const needsAccount = report.outcome === 'confirmed' || providerAccountId !== null || observedUrl !== null;
  if (!needsAccount) return;

  const account = await tx.channelAccount.findFirst({
    where: { id: execution.channelAccountId, organizationId: execution.organizationId },
    select: { channel: true, vendorId: true, externalAccountId: true },
  });
  if (!account) throw new ConflictException('Registration execution account no longer exists.');

  const configuredProviderAccountId = execution.expectedProviderAccountId;
  if (providerAccountId !== null
    && (!configuredProviderAccountId || providerAccountId !== configuredProviderAccountId)) {
    throw new ConflictException('Provider account evidence does not match the selected account.');
  }
  const trustedObservedUrl = observedUrl !== null
    && isTrustedProviderAdminUrl(account.channel, observedUrl);
  if (observedUrl !== null && !trustedObservedUrl) {
    throw new ConflictException('Observed provider URL is outside the registered admin origin.');
  }
  if (report.outcome !== 'confirmed') return;
  if (configuredProviderAccountId && providerAccountId !== configuredProviderAccountId) {
    throw new ConflictException('Confirmed registration requires the frozen provider account identity.');
  }

  const priorEvidence = targetPriorProviderEvidence(execution.resultJson, account.channel, configuredProviderAccountId);
  if (providerAccountId === null && !trustedObservedUrl && !priorEvidence) {
    throw new ConflictException('Confirmed registration requires provider account or trusted product evidence.');
  }
}

function isTrustedProviderAdminUrl(channel: string, observedUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(observedUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (channel === 'coupang') return parsed.origin === 'https://wing.coupang.com' && !parsed.username && !parsed.password;
  const reader = MALL_ADMIN_LISTING_READERS[channel as keyof typeof MALL_ADMIN_LISTING_READERS];
  if (!reader) return false;
  try {
    const allowed = new URL(reader.origin);
    return parsed.origin === allowed.origin && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function targetPriorProviderEvidence(
  value: Prisma.JsonValue | null,
  channel: string,
  configuredProviderAccountId: string | null,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const evidence = value as Record<string, unknown>;
  const providerAccountId = typeof evidence.providerAccountId === 'string'
    ? evidence.providerAccountId.trim()
    : '';
  if (providerAccountId && configuredProviderAccountId && providerAccountId === configuredProviderAccountId) {
    return true;
  }
  const observedUrl = typeof evidence.observedUrl === 'string' ? evidence.observedUrl.trim() : '';
  return Boolean(observedUrl && isTrustedProviderAdminUrl(channel, observedUrl));
}

function targetReportEvidenceJson(report: ReportTargetExecutionInput): Prisma.InputJsonValue {
  const evidence = report.evidence;
  const normalized = {
    outcome: report.outcome,
    channelAccountId: evidence.channelAccountId,
    ...(evidence.externalListingId !== undefined ? { externalListingId: evidence.externalListingId } : {}),
    ...(evidence.observedUrl !== undefined ? { observedUrl: evidence.observedUrl } : {}),
    ...(evidence.providerAccountId !== undefined ? { providerAccountId: evidence.providerAccountId } : {}),
    ...(evidence.observedStatus !== undefined ? { observedStatus: evidence.observedStatus } : {}),
    ...(evidence.message !== undefined ? { message: evidence.message } : {}),
    ...(evidence.options !== undefined
      ? {
        options: evidence.options.map((option) => ({
          salesProductOptionId: option.salesProductOptionId,
          externalOptionId: option.externalOptionId,
          ...(option.sellerSku !== undefined ? { sellerSku: option.sellerSku } : {}),
        })),
      }
      : {}),
  };
  const frozen = freezeProductRegistrationPayload(
    normalized as unknown as RegistrationSubmissionJson, channelIntegrity.sha256,
  );
  return frozen.payload as unknown as Prisma.InputJsonValue;
}

type TargetLocalOption = {
  id: string;
  externalOptionId: string;
  salesProductOptionId: string | null;
  inventoryComponents: { id: string }[];
};

type TargetConfirmedOption = {
  localOption: TargetLocalOption;
  commonOption: TargetProductOption;
};

type TargetConfirmation = {
  listingId: string;
  options: TargetConfirmedOption[];
};

async function assertFrozenTargetOptionTransitions(
  tx: Prisma.TransactionClient,
  organizationId: string,
  snapshot: TargetExecutionSnapshot,
  channelAccountId: string,
): Promise<void> {
  const transitions = snapshot.optionTransitions ?? [];
  if (snapshot.kind !== 'composition_change') {
    if (transitions.length > 0) {
      throw new ConflictException('Option transitions are only valid for composition changes.');
    }
    return;
  }
  if (!snapshot.channelListingId || transitions.length === 0) {
    throw new ConflictException('Composition changes require frozen channel option transitions.');
  }

  const oldIds = transitions.map((transition) => transition.channelListingOptionId);
  const newIds = transitions.map((transition) => transition.salesProductOptionId);
  if (new Set(oldIds).size !== oldIds.length
    || new Set(newIds).size !== newIds.length
    || newIds.some((id) => !snapshot.product.options.some((option) => option.id === id))) {
    throw new ConflictException('Frozen option transitions are not a valid product option mapping.');
  }

  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM channel_listing_options
    WHERE organization_id = ${organizationId}::uuid
      AND listing_id = ${snapshot.channelListingId}::uuid
      AND id IN (${Prisma.join(oldIds.map((id) => Prisma.sql`${id}::uuid`))})
    FOR UPDATE
  `);
  const listing = await tx.channelListing.findFirst({
    where: {
      id: snapshot.channelListingId,
      organizationId,
      channelAccountId,
    },
    select: { id: true },
  });
  if (!listing) throw new ConflictException('Frozen composition listing does not belong to the target account.');

  const rows = await tx.channelListingOption.findMany({
    where: {
      organizationId,
      listingId: snapshot.channelListingId,
      id: { in: oldIds },
    },
    select: { id: true },
  });
  if (rows.length !== oldIds.length) {
    throw new ConflictException('Frozen composition option no longer belongs to the selected listing.');
  }
}

async function resolveTargetConfirmationListing(
  tx: Prisma.TransactionClient,
  execution: ProductRegistrationExecution,
  snapshot: TargetExecutionSnapshot,
  report: ReportTargetExecutionInput,
  externalListingId: string,
): Promise<TargetConfirmation> {
  const account = await tx.channelAccount.findFirst({
    where: {
      id: execution.channelAccountId,
      organizationId: execution.organizationId,
    },
    select: { id: true, channel: true },
  });
  if (!account) throw new ConflictException('Registration execution account no longer exists.');

  const existingIdentity = await tx.channelListing.findFirst({
    where: {
      organizationId: execution.organizationId,
      channelAccountId: execution.channelAccountId,
      externalId: externalListingId,
    },
    select: { id: true },
  });
  if (existingIdentity) {
    await tx.$queryRaw(Prisma.sql`
      SELECT id
      FROM channel_listings
      WHERE id = ${existingIdentity.id}::uuid
        AND organization_id = ${execution.organizationId}::uuid
        AND channel_account_id = ${execution.channelAccountId}::uuid
      FOR UPDATE
    `);
  }

  const frozenListing = snapshot.channelListingId
    ? await tx.channelListing.findFirst({
      where: {
        id: snapshot.channelListingId,
        organizationId: execution.organizationId,
        channelAccountId: execution.channelAccountId,
      },
      select: { id: true, externalId: true },
    })
    : null;
  if (snapshot.channelListingId && !frozenListing) {
    throw new ConflictException('Frozen registration listing no longer belongs to the target account.');
  }
  if (frozenListing && frozenListing.externalId !== externalListingId) {
    throw new ConflictException('Provider listing identity does not match the frozen listing.');
  }
  if (frozenListing && existingIdentity && frozenListing.id !== existingIdentity.id) {
    throw new ConflictException('Provider listing identity resolves to another canonical listing.');
  }

  let listingId = existingIdentity?.id ?? null;
  if (!listingId) {
    if (snapshot.kind === 'composition_change') {
      throw new ConflictException('Composition changes require an existing channel listing.');
    }
    const created = await tx.channelListing.create({
      data: {
        organizationId: execution.organizationId,
        channelAccountId: execution.channelAccountId,
        salesProductId: snapshot.product.id,
        externalId: externalListingId,
        ...(report.evidence.observedStatus !== undefined
          ? { status: report.evidence.observedStatus }
          : {}),
      },
      select: { id: true },
    });
    listingId = created.id;
  } else {
    const existing = await tx.channelListing.findFirst({
      where: {
        id: listingId,
        organizationId: execution.organizationId,
        channelAccountId: execution.channelAccountId,
      },
      select: { id: true, salesProductId: true },
    });
    if (!existing) throw new ConflictException('Canonical registration listing disappeared during confirmation.');
    if (existing.salesProductId && existing.salesProductId !== snapshot.product.id) {
      throw new ConflictException('Canonical listing is already linked to another sales product.');
    }
    const data: Prisma.ChannelListingUpdateManyMutationInput = {
      ...(existing.salesProductId ? {} : { salesProductId: snapshot.product.id }),
      ...(report.evidence.observedStatus !== undefined
        ? { status: report.evidence.observedStatus }
        : {}),
    };
    if (Object.keys(data).length > 0) {
      const updated = await tx.channelListing.updateMany({
        where: {
          id: existing.id,
          organizationId: execution.organizationId,
          channelAccountId: execution.channelAccountId,
        },
        data,
      });
      if (updated.count !== 1) {
        throw new ConflictException('Canonical registration listing changed during confirmation.');
      }
    }
  }

  const optionById = new Map(snapshot.product.options.map((option) => [option.id, option]));
  const evidenceOptions = report.evidence.options ?? [];
  const externalOptionIds = evidenceOptions.map((option) => option.externalOptionId);
  const commonOptionIds = evidenceOptions.map((option) => option.salesProductOptionId);
  if (new Set(externalOptionIds).size !== externalOptionIds.length
    || new Set(commonOptionIds).size !== commonOptionIds.length) {
    throw new ConflictException('Provider option identity evidence contains duplicates.');
  }
  for (const option of evidenceOptions) {
    if (!optionById.has(option.salesProductOptionId)) {
      throw new ConflictException('Provider option identity is not in the frozen sales product.');
    }
  }

  if (snapshot.applyCompositionTemplate && !sameStringSet(commonOptionIds, [...optionById.keys()])) {
    throw new ConflictException('Template application requires provider identities for every selected option.');
  }

  if (snapshot.kind === 'composition_change') {
    const transitions = snapshot.optionTransitions ?? [];
    const transitionByLocalId = new Map(
      transitions.map((transition) => [transition.channelListingOptionId, transition]),
    );
    const localOptions = await tx.channelListingOption.findMany({
      where: {
        organizationId: execution.organizationId,
        listingId,
        id: { in: transitions.map((transition) => transition.channelListingOptionId) },
      },
      select: {
        id: true,
        externalOptionId: true,
        salesProductOptionId: true,
        inventoryComponents: { select: { id: true } },
      },
    });
    if (localOptions.length !== transitions.length || evidenceOptions.length !== transitions.length) {
      throw new ConflictException('Confirmed composition must report every frozen option transition.');
    }
    const localByExternalId = new Map(localOptions.map((option) => [option.externalOptionId, option]));
    const confirmedOptions = evidenceOptions.map((evidence) => {
      const localOption = localByExternalId.get(evidence.externalOptionId);
      const transition = localOption ? transitionByLocalId.get(localOption.id) : undefined;
      const commonOption = optionById.get(evidence.salesProductOptionId);
      if (!localOption || !transition || !commonOption
        || transition.salesProductOptionId !== commonOption.id) {
        throw new ConflictException('Provider option identity does not match the frozen composition transition.');
      }
      return { localOption, commonOption };
    });
    if (!sameStringSet(
      confirmedOptions.map((option) => option.localOption.id),
      transitions.map((transition) => transition.channelListingOptionId),
    )) {
      throw new ConflictException('Confirmed composition omitted a frozen option transition.');
    }
    return { listingId, options: confirmedOptions };
  }

  const confirmedOptions: TargetConfirmedOption[] = [];
  for (const evidence of evidenceOptions) {
    const commonOption = optionById.get(evidence.salesProductOptionId)!;
    const existing = await tx.channelListingOption.findFirst({
      where: {
        organizationId: execution.organizationId,
        listingId,
        externalOptionId: evidence.externalOptionId,
      },
      select: {
        id: true,
        externalOptionId: true,
        salesProductOptionId: true,
        inventoryComponents: { select: { id: true } },
      },
    });
    if (existing) {
      if (existing.salesProductOptionId && existing.salesProductOptionId !== commonOption.id) {
        throw new ConflictException('Canonical listing option is already linked to another sales product option.');
      }
      let localOption = existing;
      if (!existing.salesProductOptionId) {
        const updated = await tx.channelListingOption.updateMany({
          where: {
            id: existing.id,
            organizationId: execution.organizationId,
            listingId,
          },
          data: { salesProductOptionId: commonOption.id },
        });
        if (updated.count !== 1) {
          throw new ConflictException('Canonical listing option changed during confirmation.');
        }
        localOption = { ...existing, salesProductOptionId: commonOption.id };
      }
      // A seller SKU is a canonical fact from an existing listing identity. Keep it
      // intact even when a later provider report echoes a different value.
      confirmedOptions.push({ localOption, commonOption });
      continue;
    }
    const created = await tx.channelListingOption.create({
      data: {
        organizationId: execution.organizationId,
        listingId,
        externalOptionId: evidence.externalOptionId,
        salesProductOptionId: commonOption.id,
        kidItemCode: issuedKidItemCode(commonOption),
        ...(evidence.sellerSku !== undefined ? { sellerSku: evidence.sellerSku } : {}),
      },
      select: { id: true, externalOptionId: true, salesProductOptionId: true },
    });
    confirmedOptions.push({
      localOption: { ...created, inventoryComponents: [] },
      commonOption,
    });
  }
  return { listingId, options: confirmedOptions };
}

async function applyTargetConfirmationRecipes(
  tx: ChannelsRepositoryTransaction,
  recipes: ChannelOptionRecipePort | undefined,
  organizationId: string,
  snapshot: TargetExecutionSnapshot,
  report: ReportTargetExecutionInput,
  resolved: TargetConfirmation,
): Promise<void> {
  const compositionChange = snapshot.kind === 'composition_change';
  const applyTemplate = snapshot.applyCompositionTemplate;
  if (!compositionChange && !applyTemplate) return;
  if (compositionChange && report.evidence.options?.length === 0) {
    throw new ConflictException('Confirmed composition requires provider option identity evidence.');
  }
  if (!compositionChange && resolved.options.length === 0) return;
  if (!recipes) throw new ConflictException('Channel option recipe capability is unavailable.');

  if (compositionChange) {
    await recipes.replaceConfirmedCompositionsInTransaction(tx, {
      organizationId,
      transitions: resolved.options.map(({ localOption, commonOption }) => ({
        channelListingOptionId: localOption.id,
        salesProductOptionId: commonOption.id,
        kidItemCode: issuedKidItemCode(commonOption),
        components: commonOption.components.map((component) => ({
          masterProductId: component.masterProductId,
          quantity: component.quantity,
        })),
      })),
    });
  }

  if (applyTemplate && !compositionChange) {
    const mutations: ChannelOptionRecipeMutation[] = resolved.options
      .filter(({ localOption }) => localOption.inventoryComponents.length === 0)
      .map(({ localOption, commonOption }) => ({
        channelListingOptionId: localOption.id,
        preparedKidItemCode: issuedKidItemCode(commonOption),
        components: commonOption.components.map((component) => ({
          masterProductId: component.masterProductId,
          quantity: component.quantity,
        })),
      }));
    // This call is intentionally made only for the explicit template flag. The
    // preserving seam leaves confirmed recipes untouched and fills only rows that
    // are still eligible for the template.
    if (mutations.length > 0) {
      await recipes.applyPreservingRecipesInTransaction(tx, {
        organizationId,
        mutations,
      });
    }
  }
}

/** A confirmed recipe carries the common option's issued KID; an empty code is never sent. */
function issuedKidItemCode(option: TargetProductOption): string {
  if (option.optionCode === null) {
    throw new ConflictException('A KID must be issued for every sales product option before confirmation.');
  }
  return option.optionCode;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
