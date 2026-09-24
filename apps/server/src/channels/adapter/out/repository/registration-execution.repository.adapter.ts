import { ChannelIntegrityAdapter } from '../integrity/channel-integrity.adapter';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
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
  TargetExecutionKindSchema,
  TargetExecutionSnapshotSchema,
  type PrepareTargetExecutionInput,
  type ReportTargetExecutionInput,
  type TargetExecutionResult,
  type TargetExecutionSnapshot,
  type RegistrationMallInput,
} from '@kiditem/shared/sales-product';
import { getListingAvailabilityCapability } from '../../../domain/registration/mall-adapter-manifest';
import { canStartRegistration } from '../../../domain/sales-product/sales-product-status';
import { LISTING_SHAPING_EXECUTION_KINDS } from '../../../domain/registration/registration-account-state';
import { REGISTRATION_ALREADY_REGISTERED_CODE, type SalesProductStatus } from '@kiditem/shared/sales-product';
import { isReservedExecutionIdempotencyKey } from '../../../domain/registration/thumbnail-update';
import { preparedRegistrationRecipe } from '../../../domain/registration/registration-item-code';
import { PrismaService } from '../../../../prisma/prisma.service';
import { applyPreparedRecipeToOptions } from '../persistence/registered-option-recipes';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import {
  freezeProductRegistrationPayload,
  hashRegistrationSubmissionPayload,
  type RegistrationSubmissionJson,
} from '../../../domain/registration/registration-submission-payload';
import {
  CHANNEL_OPTION_RECIPE_PORT,
  type ChannelOptionRecipeMutation,
  type ChannelOptionRecipePort,
} from '../../../application/port/in/channel-option-recipe.port';
import type { ChannelsRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';
import {
  CHANNEL_ADAPTER_REGISTRY_PORT,
  type ChannelAdapter,
  type ChannelAdapterRegistryPort,
} from '../../../application/port/out/channel/channel-adapter.port';
import type {
  RegistrationExecutionRepositoryPort,
  TargetExecutionIntent,
} from '../../../application/port/out/repository/registration-execution.repository.port';

const channelIntegrity = new ChannelIntegrityAdapter();

const TARGET_EXECUTION_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * 등록 대상 실행 행. 같은 표의 대표이미지 반영(`thumbnail_update`)이나 listing 가용성 실행 id 가
 * 이 경로에 오면 없는 실행으로 답한다.
 */
/** listing 가용성(품절 · 재개) 실행 행. 다른 종류의 id 는 없는 실행으로 답한다. */
const LISTING_AVAILABILITY_ROW = {
  registrationTargetId: null,
  executionKind: { in: ['sold_out', 'resume'] },
} satisfies Prisma.ProductRegistrationExecutionWhereInput;

const TARGET_EXECUTION_ROW = {
  registrationTargetId: { not: null },
  executionKind: { in: [...TargetExecutionKindSchema.options] },
} satisfies Prisma.ProductRegistrationExecutionWhereInput;

/**
 * 등록 실행 울타리의 저장소 어댑터.
 *
 * 울타리는 트랜잭션을 연다. 실행 행은 여기서 직접 쓰고, 몰마다 다른 준비 사실 · 계정 식별자 · 확인
 * 증거 · 옵션 규칙은 채널 어댑터가 답한다(KID-321). 콘텐츠 작업공간은 판매 상품에 속하고 몰 상품은 상품을
 * 거쳐 닿으므로 등록 확인은 작업공간을 건드리지 않는다(KID-313 W3b)
 * ([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 */
@Injectable()
export class RegistrationExecutionRepositoryAdapter
  implements RegistrationExecutionRepositoryPort
{
  constructor(
    private readonly prisma: PrismaService,
    /** 몰마다 다른 것(계정 식별자 · 확인 증거 · 준비 때 얼릴 몰 사실 · 옵션 규칙)은 채널 어댑터가 답한다(KID-321). */
    @Inject(CHANNEL_ADAPTER_REGISTRY_PORT)
    private readonly adapters: ChannelAdapterRegistryPort,
    @Optional()
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly recipes?: ChannelOptionRecipePort,
  ) {}

  async findListingAvailabilityByKey(input: {
    organizationId: string;
    requestedByUserId: string | null;
    idempotencyKey: string;
  }): Promise<ListingAvailabilityExecution | null> {
    assertClientIdempotencyKey(input.idempotencyKey);
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
    assertClientIdempotencyKey(input.request.idempotencyKey);
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
        const byOption = assertListingAvailabilitySupported(account.channel, request.kind) === 'option';
        const adapter = this.adapters.get(account.channel);
        if (byOption && !adapter.providerAccountId(account)) {
          throw new ConflictException('Option-level availability requires a verified provider account identity.');
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

        // 옵션 단위 몰은 살아 있는 옵션 전부를 얼리고, 몰이 판매자 재고를 받지 않는 옵션은 거절한다.
        if (byOption) assertAvailabilityOptionSupport(adapter, options);
        const frozenOptionCodes = byOption
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
            expectedProviderAccountId: adapter.providerAccountId(account),
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
        where: { id: input.executionId, organizationId: input.organizationId, ...LISTING_AVAILABILITY_ROW },
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
      assertListingAvailabilityAccount(execution, snapshot, scope.account, this.adapters);
      await assertFrozenAvailabilityOptions(tx, input.organizationId, snapshot, this.adapters.get(snapshot.mallKey));
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
        where: { id: input.executionId, organizationId: input.organizationId, ...LISTING_AVAILABILITY_ROW },
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
      assertListingAvailabilityAccount(execution, snapshot, scope.account, this.adapters);
      await assertTargetProviderEvidence(tx, execution, input.report, this.adapters, null);
      const adapter = this.adapters.get(snapshot.mallKey);
      const byOption = isOptionLevelAvailability(snapshot);
      if (input.report.outcome === 'confirmed' && byOption) {
        await assertFrozenAvailabilityOptions(tx, input.organizationId, snapshot, adapter);
        assertOptionAvailabilityConfirmation(snapshot, input.report, adapter);
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
        if (!byOption && input.report.evidence.observedStatus !== undefined) {
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
    snapshot: TargetExecutionIntent;
  }): Promise<TargetExecutionResult> {
    assertClientIdempotencyKey(input.request.idempotencyKey);
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
        const intent = input.snapshot;
        assertTargetRequestMatchesSnapshot(input.request, intent);
        // Refuse before any provider call: a confirmation could not record an option without its KID.
        if (intent.product.options.some((option) => option.optionCode === null)) {
          throw new ConflictException('A KID must be issued before registration for every selected sales product option.');
        }

        await tx.$queryRaw(Prisma.sql`
          SELECT id
          FROM registration_targets
          WHERE id = ${intent.targetId}::uuid
            AND organization_id = ${input.organizationId}::uuid
          FOR UPDATE
        `);
        const target = await tx.registrationTarget.findFirst({
          where: {
            id: intent.targetId,
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
          || target.version !== intent.targetVersion) {
          throw new ConflictException('Registration target changed while it was being prepared.');
        }
        if (target.channelAccountId !== intent.channelAccountId) {
          throw new ConflictException('Registration target account does not match the frozen execution.');
        }

        const account = await tx.channelAccount.findFirst({
          where: {
            id: target.channelAccountId,
            organizationId: input.organizationId,
            status: 'active',
          },
          select: { id: true, channel: true, vendorId: true, externalAccountId: true },
        });
        if (!account) throw new ConflictException('Registration target account is not active.');
        const adapter = this.adapters.get(account.channel);

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
        if (!product || product.id !== intent.product.id
          || product.version !== intent.product.version) {
          throw new ConflictException('Sales product changed while the execution was being prepared.');
        }

        const targetOptionIds = target.selectedOptions.map((option) => option.salesProductOptionId);
        const snapshotOptionIds = intent.product.options.map((option) => option.id);
        if (!sameStringArray(targetOptionIds, snapshotOptionIds)) {
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
        // 새 등록은 KID 를 받은 판매 상품(active)만 연다 — 초안은 코드가 없고 보관은 판매를 접었다(KID-313).
        if (intent.kind === 'register' && !canStartRegistration(product.status as SalesProductStatus)) {
          throw new ConflictException('Only a selling product with a KID can start a new registration.');
        }
        if (intent.kind === 'register'
          && options.some((option) => option.supplyStatus === 'unused')) {
          throw new ConflictException('Unused sales product options cannot start a new registration.');
        }

        // 새 리스팅을 만드는 register 만 막는다 — 몰 상품을 이름으로 가리키는 register 는 그 리스팅에 다시 보내는 것이다.
        if (intent.kind === 'register' && !intent.channelListingId) {
          await assertAccountNotRegistered(tx, input.organizationId, target.salesProductId, target.channelAccountId);
        }

        if (intent.channelListingId) {
          const listing = await tx.channelListing.findFirst({
            where: {
              id: intent.channelListingId,
              organizationId: input.organizationId,
              channelAccountId: target.channelAccountId,
            },
            select: { id: true },
          });
          if (!listing) throw new ConflictException('Registration listing does not belong to the target account.');
        }

        // 몰마다 다른 실행 시점 사실은 채널 어댑터가 이 트랜잭션 안에서 얼린다(KID-321). 대상에는 쓰지 않는다.
        const adapterPayload = await adapter.prepareAdapterPayload(ownerTransaction(tx), {
          organizationId: input.organizationId,
          channelAccountId: account.id,
          account: { id: account.id, channel: account.channel, vendorId: account.vendorId, externalAccountId: account.externalAccountId },
          salesProductId: target.salesProductId,
          registrationTargetId: target.id,
          kind: intent.kind,
          registrationInput: intent.registrationInput as RegistrationMallInput,
          adapterValues: intent.adapterValues ?? {},
          channelListingId: intent.channelListingId,
          product: intent.product,
        });
        // 상세는 새 상품 문서를 보내는 실행만 얼린다 — 가격 수정 · 품절 · 재개는 상세를 보내지 않는다.
        // 대표이미지 자산도 같은 실행만 `adapterPayload.representativeImage` 로 얼린다(KID-313 W3a).
        const { representativeImage, ...intentSnapshot } = intent;
        const sendsDocument = intent.kind === 'register' || intent.kind === 'composition_change';
        const frozen = freezeTargetExecutionSnapshot({
          ...intentSnapshot,
          detailPage: sendsDocument ? intent.detailPage : null,
          adapterPayload: sendsDocument && representativeImage ? { ...adapterPayload, representativeImage } : adapterPayload,
        });

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
            expectedProviderAccountId: adapter.providerAccountId(account),
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
        where: { id: input.executionId, organizationId: input.organizationId, ...TARGET_EXECUTION_ROW },
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
        select: { id: true, channel: true, vendorId: true, externalAccountId: true },
      });
      if (!account) throw new ConflictException('Registration target account is not active.');
      const providerIdentity = this.adapters.get(account.channel).providerAccountId(account);
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
        || (snapshot.kind === 'register' && !canStartRegistration(product.status as SalesProductStatus))) {
        throw new ConflictException('Sales product changed after execution preparation.');
      }
      const snapshotOptionIds = snapshot.product.options.map(option => option.id);
      if (!sameStringArray(target.selectedOptions.map(option => option.salesProductOptionId), snapshotOptionIds)) {
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
        ...TARGET_EXECUTION_ROW,
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
        where: { id: input.executionId, organizationId: input.organizationId, ...TARGET_EXECUTION_ROW },
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

      await assertTargetProviderEvidence(tx, execution, input.report, this.adapters, externalListingId);

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
        if (snapshot.kind === 'register') await this.completeFirstRegistration(tx, input.organizationId, snapshot, resolved);
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

  /**
   * 새 몰 상품을 확인한 `register` 만의 뒷일(KID-321, 몰 중립): 어댑터가 준비 때 셀피아 매칭을 얼렸으면 그
   * 레시피를 업체상품코드가 같은 몰 옵션에 건다. 확인과 같은 트랜잭션이다. 콘텐츠 작업공간은 붙이지 않는다 —
   * 몰 상품은 판매 상품을 거쳐 그 작업공간에 닿는다(KID-313 W3b).
   */
  private async completeFirstRegistration(
    tx: Prisma.TransactionClient,
    organizationId: string,
    snapshot: TargetExecutionSnapshot,
    resolved: TargetConfirmation,
  ): Promise<void> {
    const handle = ownerTransaction(tx);
    const recipe = preparedRegistrationRecipe(snapshot);
    if (recipe) {
      if (!this.recipes) throw new ConflictException('Channel option recipe capability is unavailable.');
      await applyPreparedRecipeToOptions(handle, this.recipes, { organizationId, channelListingId: resolved.listingId, recipe });
    }
  }
}

/** 몰이 품절 · 재개를 받는 단위(`option` · `listing`). 받는 길이 없으면 거절한다. */
function assertListingAvailabilitySupported(channel: string, kind: 'sold_out' | 'resume'): 'option' | 'listing' {
  const capability = getListingAvailabilityCapability(channel, kind);
  if (!capability) throw new ConflictException(`The channel has no verified ${kind} route.`);
  return capability.axis;
}

function isOptionLevelAvailability(snapshot: ListingAvailabilitySnapshot): boolean {
  return getListingAvailabilityCapability(snapshot.mallKey, snapshot.kind)?.axis === 'option';
}

function optionRegistrationType(rawJson: Prisma.JsonValue | null): string | null {
  return rawJson && typeof rawJson === 'object' && !Array.isArray(rawJson) && typeof rawJson.registrationType === 'string'
    ? rawJson.registrationType
    : null;
}

/** 옵션 단위 몰: 살아 있는 옵션이 있어야 하고, 몰이 판매자 재고를 받지 않는 옵션(`excluded`)이 없어야 한다. */
function assertAvailabilityOptionSupport(
  adapter: ChannelAdapter,
  options: Array<{ externalOptionId: string; rawJson: Prisma.JsonValue | null }>,
): void {
  if (options.length === 0) throw new ConflictException('Option-level availability requires active options.');
  if (options.some((option) => adapter.availabilityOption({ registrationType: optionRegistrationType(option.rawJson) }) === 'excluded')) {
    throw new ConflictException('One or more options do not accept seller stock changes on this channel.');
  }
}

function assertListingAvailabilityAccount(
  execution: ProductRegistrationExecution,
  snapshot: ListingAvailabilitySnapshot,
  account: { id: string; channel: string; vendorId: string | null; externalAccountId: string | null },
  adapters: ChannelAdapterRegistryPort,
): void {
  assertListingAvailabilitySupported(account.channel, snapshot.kind);
  const identity = adapters.get(account.channel).providerAccountId(account);
  if (account.channel !== snapshot.mallKey || identity !== execution.expectedProviderAccountId) {
    throw new ConflictException('Listing availability provider account changed after preparation.');
  }
}

async function assertFrozenAvailabilityOptions(
  tx: Prisma.TransactionClient,
  organizationId: string,
  snapshot: ListingAvailabilitySnapshot,
  adapter: ChannelAdapter,
): Promise<void> {
  if (!isOptionLevelAvailability(snapshot)) return;
  const options = await tx.channelListingOption.findMany({
    where: { organizationId, listingId: snapshot.channelListingId, isActive: true,
      externalOptionId: { in: snapshot.optionCodes } },
    select: { externalOptionId: true, rawJson: true },
  });
  if (options.length !== snapshot.optionCodes.length) {
    throw new ConflictException('Frozen availability options are no longer active.');
  }
  assertAvailabilityOptionSupport(adapter, options);
}

/** 옵션 단위 확인: 얼린 옵션 전부를 몰에서 다시 읽은 재고가 있어야 하고, 모두 보낼 수 있는 옵션이어야 한다. */
function assertOptionAvailabilityConfirmation(
  snapshot: ListingAvailabilitySnapshot,
  report: ReportListingAvailabilityInput,
  adapter: ChannelAdapter,
): void {
  const observations = report.evidence.observedOptionStocks ?? [];
  const ids = new Set(observations.map((option) => option.externalOptionId));
  if (report.evidence.externalListingId !== snapshot.externalListingId
    || observations.length !== snapshot.optionCodes.length || ids.size !== observations.length
    || snapshot.optionCodes.some((id) => !ids.has(id))
    || observations.some((option) => adapter.availabilityOption({ registrationType: option.registrationType ?? null }) !== 'sendable'
      || !Number.isSafeInteger(option.stock) || option.stock < 0
      || (snapshot.kind === 'sold_out' ? option.stock !== 0 : option.stock === 0))) {
    throw new ConflictException('Option-level confirmation requires a matching stock reread for every frozen sendable option.');
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

/** 클라이언트가 보낸 멱등 키. 대표이미지 반영의 이름공간은 받지 않는다. */
function assertClientIdempotencyKey(idempotencyKey: string): void {
  if (isReservedExecutionIdempotencyKey(idempotencyKey)) {
    throw new BadRequestException('Registration idempotency key uses a reserved prefix.');
  }
}

function assertTargetExecutionRow(execution: ProductRegistrationExecution): void {
  if (execution.registrationTargetId === null) {
    throw new ConflictException('Listing availability execution is not a registration-target execution.');
  }
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
  snapshot: TargetExecutionIntent,
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

const EVIDENCE_REJECTIONS = {
  account_mismatch: 'Provider account evidence does not match the selected account.',
  untrusted_url: 'Observed provider URL is outside the registered admin origin.',
  invalid_listing_id: 'Provider listing identity does not match the channel listing id format.',
  missing_account: 'Confirmed registration requires the frozen provider account identity.',
} as const;

/**
 * 몰이 보여 준 증거가 이 실행의 계정 · 몰 관리자 화면 · 몰 상품 id 형식에 맞는가 — 판정은 그 계정 채널의
 * 어댑터가 한다(KID-321). 확인(`confirmed`)은 준비가 얼린 계정 식별자, 신뢰하는 관리자 URL, 또는 앞선
 * 보고의 같은 증거 중 하나가 있어야 한다.
 */
async function assertTargetProviderEvidence(
  tx: Prisma.TransactionClient,
  execution: ProductRegistrationExecution,
  report: ReportTargetExecutionInput | ReportListingAvailabilityInput,
  adapters: ChannelAdapterRegistryPort,
  /** 몰 상품 id 형식을 볼 id. 가용성 실행은 얼린 canonical listing 과 같은지 따로 보므로 넘기지 않는다. */
  checkedListingId: string | null,
): Promise<void> {
  const providerAccountId = report.evidence.providerAccountId?.trim() || null;
  const observedUrl = report.evidence.observedUrl?.trim() || null;
  const externalListingId = checkedListingId?.trim() || null;
  const confirmed = report.outcome === 'confirmed';
  if (!confirmed && providerAccountId === null && observedUrl === null && externalListingId === null) return;

  const account = await tx.channelAccount.findFirst({
    where: { id: execution.channelAccountId, organizationId: execution.organizationId },
    select: { id: true, channel: true, vendorId: true, externalAccountId: true },
  });
  if (!account) throw new ConflictException('Registration execution account no longer exists.');
  const adapter = adapters.get(account.channel);
  const decision = adapter.validateConfirmationEvidence(execution.expectedProviderAccountId, {
    providerAccountId, observedUrl, externalListingId,
  });
  // 확인이 아닌 보고는 계정 식별자를 빼도 된다 — 있는 값만 맞으면 된다.
  if (!decision.ok && (confirmed || decision.reason !== 'missing_account')) {
    throw new ConflictException(EVIDENCE_REJECTIONS[decision.reason]);
  }
  if (!confirmed || providerAccountId !== null || observedUrl !== null) return;
  if (!targetPriorProviderEvidence(execution, adapter)) {
    throw new ConflictException('Confirmed registration requires provider account or trusted product evidence.');
  }
}

/** 앞선 보고가 이미 이 몰의 계정 식별자나 신뢰하는 관리자 URL 을 남겼는가. */
function targetPriorProviderEvidence(
  execution: ProductRegistrationExecution,
  adapter: ChannelAdapter,
): boolean {
  const value = execution.resultJson;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const evidence = value as Record<string, unknown>;
  const providerAccountId = typeof evidence.providerAccountId === 'string' ? evidence.providerAccountId.trim() || null : null;
  const observedUrl = typeof evidence.observedUrl === 'string' ? evidence.observedUrl.trim() || null : null;
  if (providerAccountId === null && observedUrl === null) return false;
  return adapter.validateConfirmationEvidence(execution.expectedProviderAccountId, {
    providerAccountId, observedUrl, externalListingId: null,
  }).ok;
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
  /** 이 확인이 몰 상품 행을 새로 만들었는가. */
  created: boolean;
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
  const created = listingId === null;
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
    return { listingId, created, options: confirmedOptions };
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
  return { listingId, created, options: confirmedOptions };
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

/**
 * 이미 이 계정에 올라간 상품에 새 `register` 를 열지 않는다(KID-320 S7). 막는 근거는 둘이다: 이 상품의 살아 있는
 * 리스팅, 또는 성공한 등록성 실행(register · update · composition_change) 가운데 그 실행이 만든 리스팅이 아직
 * 내려지지 않은 것(카탈로그가 아직 안 가져왔으면 실행만으로 막는다). 취소된 실행은 몰에 아무것도 하지 않았으므로
 * 앞선 성공을 지우지 않는다. 내린 리스팅만 남은 계정은 막지 않는다. 빠른 등록처럼 계획을 거치지 않는 제출도 여기서 막힌다.
 */
async function assertAccountNotRegistered(
  tx: Prisma.TransactionClient,
  organizationId: string,
  salesProductId: string,
  channelAccountId: string,
): Promise<void> {
  const listing = await tx.channelListing.findFirst({
    where: { organizationId, salesProductId, channelAccountId, isActive: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: { externalId: true },
  });
  if (listing) {
    throw new ConflictException({
      code: REGISTRATION_ALREADY_REGISTERED_CODE,
      message: `이미 이 몰 계정에 등록된 상품입니다(몰 상품 ${listing.externalId}).`,
    });
  }
  const [succeeded] = await tx.$queryRaw<{ id: string; external_listing_id: string | null }[]>(Prisma.sql`
    SELECT e.id::text AS id, e.external_listing_id
    FROM product_registration_executions e
    JOIN registration_targets t ON t.id = e.registration_target_id AND t.organization_id = e.organization_id
    WHERE e.organization_id = ${organizationId}::uuid
      AND t.sales_product_id = ${salesProductId}::uuid
      AND e.channel_account_id = ${channelAccountId}::uuid
      AND e.execution_kind IN (${Prisma.join([...LISTING_SHAPING_EXECUTION_KINDS])})
      AND e.status = 'succeeded'
      AND NOT EXISTS (
        SELECT 1
        FROM channel_listings l
        WHERE l.organization_id = e.organization_id
          AND l.channel_account_id = e.channel_account_id
          AND l.is_active = false
          AND (l.id = e.channel_listing_id OR (e.external_listing_id IS NOT NULL AND l.external_id = e.external_listing_id))
      )
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1
  `);
  if (succeeded) {
    const name = succeeded.external_listing_id ? `몰 상품 ${succeeded.external_listing_id}` : `실행 ${succeeded.id}`;
    throw new ConflictException({ code: REGISTRATION_ALREADY_REGISTERED_CODE, message: `이미 이 몰 계정에 등록된 상품입니다(${name}).` });
  }
}
