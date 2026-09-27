import { ChannelIntegrityAdapter } from '../integrity/channel-integrity.adapter';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  KiditemConflictError,
  KiditemError,
  KiditemInvalidValueError,
  KiditemNotFoundError,
  KiditemPreconditionError,
} from '@kiditem/shared/errors';
import { Prisma } from '@prisma/client';
import {
  REGISTRATION_KIND,
  type RegistrationAvailabilityListing,
} from '@kiditem/shared/channels-operations';
import {
  TargetExecutionSnapshotSchema,
  type TargetExecutionSnapshot,
  type RegistrationMallInput,
  REGISTRATION_ALREADY_REGISTERED_CODE,
  type SalesProductStatus,
} from '@kiditem/shared/sales-product';
import { getListingAvailabilityCapability } from '../../../domain/registration/mall-adapter-manifest';
import { canStartRegistration } from '../../../domain/sales-product/sales-product-status';
import { LISTING_SHAPING_EXECUTION_KINDS } from '../../../domain/registration/registration-account-state';
import { preparedRegistrationRecipe } from '../../../domain/registration/registration-item-code';
import { PrismaService } from '../../../../prisma/prisma.service';
import { applyPreparedRecipeToOptions } from '../persistence/registered-option-recipes';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { readOperationsByPlan } from '../../../../common/operation/transaction/operations-by-plan';
import {
  freezeProductRegistrationPayload,
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
  PlannedTargetExecution,
  RegistrationAccountFacts,
  RegistrationConfirmationEvidence,
  RegistrationOperationRepositoryPort,
  TargetExecutionIntent,
} from '../../../application/port/out/repository/registration-operation.repository.port';

const channelIntegrity = new ChannelIntegrityAdapter();

const PLAN_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * 몰 등록 실행(`channels.registration`)의 Channels 영속 조합(KID-364, 옛 등록 실행 울타리 저장소를 옮김).
 *
 * plan 은 대상 · 계정 · 상품 · 옵션 · 리스팅을 잠가 확인하고 몰마다 다른 준비 사실을 채널 어댑터로 얼린다 — 행을
 * 쓰지 않는다(실행 행은 실행 계약이 쓰고, 겹침은 잠금 키가 막는다). 몰이 확정한 등록은 finish 트랜잭션 안에서
 * 리스팅 · 옵션 · 레시피로 반영한다. 몰마다 다른 계정 식별자 · 확인 증거 · 옵션 규칙은 채널 어댑터가 답한다(KID-321)
 * ([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 */
@Injectable()
export class RegistrationOperationRepositoryAdapter implements RegistrationOperationRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_ADAPTER_REGISTRY_PORT)
    private readonly adapters: ChannelAdapterRegistryPort,
    @Optional()
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly recipes?: ChannelOptionRecipePort,
  ) {}

  async readActiveAccount(organizationId: string, channelAccountId: string): Promise<RegistrationAccountFacts> {
    const account = await this.prisma.channelAccount.findFirst({
      where: { id: channelAccountId, organizationId },
      select: { id: true, channel: true, vendorId: true, externalAccountId: true, status: true },
    });
    if (!account) throw new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND');
    if (account.status !== 'active') throw new KiditemPreconditionError('CHANNELS_ACCOUNT_INACTIVE');
    return { id: account.id, channel: account.channel, expectedProviderAccountId: this.adapters.get(account.channel).providerAccountId(account) };
  }

  async planTarget(input: { organizationId: string; intent: TargetExecutionIntent; expectedVersion: number }): Promise<PlannedTargetExecution> {
    const { organizationId, intent } = input;
    // 확인 전에 거절한다: KID 없는 옵션은 확인 때 몰 옵션으로 기록할 수 없다.
    if (intent.product.options.some((option) => option.optionCode === null)) {
      throw new KiditemPreconditionError('CHANNELS_KID_REQUIRED');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM registration_targets
        WHERE id = ${intent.targetId}::uuid AND organization_id = ${organizationId}::uuid
        FOR UPDATE
      `);
      const target = await tx.registrationTarget.findFirst({
        where: { id: intent.targetId, organizationId, archivedAt: null },
        select: {
          id: true, salesProductId: true, channelAccountId: true, version: true,
          selectedOptions: { orderBy: { sortOrder: 'asc' }, select: { salesProductOptionId: true } },
        },
      });
      if (!target) throw new KiditemNotFoundError('CHANNELS_REGISTRATION_TARGET_NOT_FOUND');
      if (target.version !== input.expectedVersion || target.version !== intent.targetVersion) {
        throw new KiditemConflictError('CHANNELS_REGISTRATION_TARGET_STALE', { details: { reason: 'TARGET_VERSION_CHANGED' } });
      }
      if (target.channelAccountId !== intent.channelAccountId) {
        throw new KiditemConflictError('CHANNELS_REGISTRATION_TARGET_STALE', { details: { reason: 'TARGET_ACCOUNT_CHANGED' } });
      }

      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM channel_accounts
        WHERE id = ${target.channelAccountId}::uuid AND organization_id = ${organizationId}::uuid
        FOR UPDATE
      `);
      const account = await tx.channelAccount.findFirst({
        where: { id: target.channelAccountId, organizationId, status: 'active' },
        select: { id: true, channel: true, vendorId: true, externalAccountId: true },
      });
      if (!account) throw new KiditemPreconditionError('CHANNELS_ACCOUNT_INACTIVE');
      const adapter = this.adapters.get(account.channel);

      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM sales_products
        WHERE id = ${target.salesProductId}::uuid AND organization_id = ${organizationId}::uuid
        FOR UPDATE
      `);
      const product = await tx.salesProduct.findFirst({
        where: { id: target.salesProductId, organizationId },
        select: { id: true, version: true, status: true },
      });
      if (!product || product.id !== intent.product.id || product.version !== intent.product.version) {
        throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'SALES_PRODUCT_CHANGED' } });
      }

      const targetOptionIds = target.selectedOptions.map((option) => option.salesProductOptionId);
      const snapshotOptionIds = intent.product.options.map((option) => option.id);
      if (!sameStringArray(targetOptionIds, snapshotOptionIds)) {
        throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'TARGET_OPTIONS_CHANGED' } });
      }
      const options = await tx.salesProductOption.findMany({
        where: { organizationId, salesProductId: target.salesProductId, id: { in: snapshotOptionIds } },
        select: { id: true, supplyStatus: true },
      });
      if (options.length !== new Set(snapshotOptionIds).size) {
        throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'OPTIONS_LEFT_PRODUCT' } });
      }
      // 새 등록은 KID 를 받은 판매 상품(active)만 연다 — 초안은 코드가 없고 보관은 판매를 접었다(KID-313).
      if (intent.kind === 'register' && !canStartRegistration(product.status as SalesProductStatus)) {
        throw new KiditemPreconditionError('CHANNELS_SALES_PRODUCT_NOT_SELLING');
      }
      if (intent.kind === 'register' && options.some((option) => option.supplyStatus === 'unused')) {
        throw new KiditemPreconditionError('CHANNELS_PREFLIGHT_FAILED', { details: { reason: 'UNUSED_OPTION_SELECTED' } });
      }
      // 새 리스팅을 만드는 register 만 막는다 — 몰 상품을 이름으로 가리키는 register 는 그 리스팅에 다시 보내는 것이다.
      if (intent.kind === 'register' && !intent.channelListingId) {
        await assertAccountNotRegistered(tx, organizationId, target.salesProductId, target.channelAccountId);
      }
      if (intent.kind !== 'register' && !intent.channelListingId) {
        throw new KiditemPreconditionError('CHANNELS_PREFLIGHT_FAILED', { details: { reason: 'LISTING_REQUIRED' } });
      }

      let externalListingId: string | null = null;
      if (intent.channelListingId) {
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM channel_listings
          WHERE id = ${intent.channelListingId}::uuid AND organization_id = ${organizationId}::uuid
            AND channel_account_id = ${target.channelAccountId}::uuid
          FOR UPDATE
        `);
        const listing = await tx.channelListing.findFirst({
          where: { id: intent.channelListingId, organizationId, channelAccountId: target.channelAccountId },
          select: { id: true, externalId: true, isActive: true },
        });
        if (!listing) throw new KiditemNotFoundError('CHANNELS_LISTING_NOT_FOUND');
        if (!listing.isActive) throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'LISTING_INACTIVE' } });
        externalListingId = listing.externalId;
      }

      // 몰마다 다른 실행 시점 사실은 채널 어댑터가 이 트랜잭션 안에서 얼린다(KID-321). 대상에는 쓰지 않는다.
      const adapterPayload = await adapter.prepareAdapterPayload(ownerTransaction(tx), {
        organizationId,
        channelAccountId: account.id,
        account,
        salesProductId: target.salesProductId,
        registrationTargetId: target.id,
        kind: intent.kind,
        registrationInput: intent.registrationInput as RegistrationMallInput,
        adapterValues: intent.adapterValues ?? {},
        channelListingId: intent.channelListingId,
        product: intent.product,
      });
      // 상세 · 대표이미지는 새 상품 문서를 보내는 실행(등록 · 구성 전환)만 얼린다(KID-313 W3a).
      const { representativeImage, ...intentSnapshot } = intent;
      const sendsDocument = intent.kind === 'register' || intent.kind === 'composition_change';
      const snapshot = freezeTargetExecutionSnapshot({
        ...intentSnapshot,
        detailPage: sendsDocument ? intent.detailPage : null,
        adapterPayload: sendsDocument && representativeImage ? { ...adapterPayload, representativeImage } : adapterPayload,
      }).payload;
      await assertFrozenTargetOptionTransitions(tx, organizationId, snapshot, target.channelAccountId);
      if (snapshot.kind === 'composition_change') {
        const optionIds = (snapshot.optionTransitions ?? []).map((transition) => transition.channelListingOptionId);
        const active = await tx.channelListingOption.count({
          where: { organizationId, listingId: snapshot.channelListingId!, id: { in: optionIds }, isActive: true },
        });
        if (active !== optionIds.length) {
          throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'COMPOSITION_OPTIONS_INACTIVE' } });
        }
      }
      return {
        snapshot,
        mallKey: account.channel,
        expectedProviderAccountId: adapter.providerAccountId(account),
        externalListingId,
      };
    }, PLAN_TRANSACTION_OPTIONS);
  }

  async planAvailability(input: {
    organizationId: string;
    channelAccountId: string;
    action: 'sold_out' | 'resume';
    items: ReadonlyArray<{ channelListingId?: string; channelListingOptionIds?: readonly string[] }>;
  }): Promise<{ account: RegistrationAccountFacts; listings: RegistrationAvailabilityListing[] }> {
    const { organizationId } = input;
    const account = await this.readActiveAccount(organizationId, input.channelAccountId);
    const capability = getListingAvailabilityCapability(account.channel, input.action);
    if (!capability) throw new KiditemPreconditionError('CHANNELS_MALL_UNSUPPORTED', { details: { reason: 'AVAILABILITY_ROUTE_MISSING' } });
    const byOption = capability.axis === 'option';
    const adapter = this.adapters.get(account.channel);
    if (byOption && !account.expectedProviderAccountId) {
      throw new KiditemPreconditionError('CHANNELS_PREFLIGHT_FAILED', { details: { reason: 'PROVIDER_ACCOUNT_IDENTITY_MISSING' } });
    }
    const listingIds = input.items.flatMap((item) => item.channelListingId ? [item.channelListingId] : []);
    const optionIds = input.items.flatMap((item) => item.channelListingOptionIds ?? []);
    const optionRows = optionIds.length === 0 ? [] : await this.prisma.channelListingOption.findMany({
      where: { organizationId, id: { in: [...new Set(optionIds)] }, isActive: true, listing: { channelAccountId: account.id } },
      select: { id: true, listingId: true },
    });
    if (optionRows.length !== new Set(optionIds).size) {
      throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'OPTION_NOT_IN_ACCOUNT' } });
    }
    // 리스팅마다 바꿀 옵션: 리스팅 id 로 가리키면 살아 있는 옵션 전부, 옵션 id 로 가리키면 그 옵션만.
    const wanted = new Map<string, Set<string> | 'all'>();
    for (const id of listingIds) wanted.set(id, 'all');
    for (const row of optionRows) {
      const current = wanted.get(row.listingId);
      if (current === 'all') continue;
      wanted.set(row.listingId, new Set([...(current ?? []), row.id]));
    }
    const listings = await this.prisma.channelListing.findMany({
      where: { organizationId, channelAccountId: account.id, id: { in: [...wanted.keys()] }, isActive: true },
      select: {
        id: true, externalId: true,
        options: {
          where: { organizationId, isActive: true },
          orderBy: { externalOptionId: 'asc' },
          select: { id: true, externalOptionId: true, salesProductOptionId: true, sellerSku: true, rawJson: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    if (listings.length !== wanted.size) throw new KiditemNotFoundError('CHANNELS_LISTING_NOT_FOUND');
    return {
      account,
      listings: listings.map((listing) => {
        const selection = wanted.get(listing.id)!;
        // 옵션 단위 몰은 가리킨 옵션만(리스팅으로 가리키면 살아 있는 옵션 전부) 얼리고, 얼린 옵션 가운데 몰이 판매자 재고를
        // 받지 않는 것이 있으면 거절한다. 리스팅 단위 몰은 리스팅 전체를 바꾸므로 살아 있는 옵션 전부를 얼린다.
        const options = selection === 'all' || !byOption ? listing.options : listing.options.filter((option) => selection.has(option.id));
        if (byOption) assertAvailabilityOptionSupport(adapter, options, 'CHANNELS_PREFLIGHT_FAILED');
        return {
          channelListingId: listing.id,
          externalListingId: listing.externalId,
          options: options.map((option) => ({
            salesProductOptionId: option.salesProductOptionId,
            channelListingOptionId: option.id,
            externalOptionId: option.externalOptionId,
            sellerSku: option.sellerSku,
          })),
        };
      }),
    };
  }

  async recordListingStatuses(transaction: OwnerTransaction, input: {
    organizationId: string;
    channelAccountId: string;
    listings: ReadonlyArray<{ channelListingId: string; externalListingId: string; status: string }>;
  }): Promise<void> {
    const tx = ownerTransactionClient(transaction) as Prisma.TransactionClient;
    for (const listing of input.listings) {
      const updated = await tx.channelListing.updateMany({
        where: { id: listing.channelListingId, organizationId: input.organizationId, channelAccountId: input.channelAccountId, externalId: listing.externalListingId },
        data: { status: listing.status },
      });
      if (updated.count !== 1) throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'LISTING_CHANGED' } });
    }
  }

  async confirmTarget(transaction: OwnerTransaction, input: {
    organizationId: string;
    channelAccountId: string;
    expectedProviderAccountId: string | null;
    snapshot: TargetExecutionSnapshot;
    evidence: RegistrationConfirmationEvidence;
    confirmedByOperator: boolean;
  }): Promise<{ channelListingId: string }> {
    const tx = ownerTransactionClient(transaction) as Prisma.TransactionClient;
    const scope = { organizationId: input.organizationId, channelAccountId: input.channelAccountId };
    if (input.evidence.channelAccountId !== input.channelAccountId) {
      throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'EVIDENCE_ACCOUNT_MISMATCH' } });
    }
    const account = await tx.channelAccount.findFirst({
      where: { id: input.channelAccountId, organizationId: input.organizationId },
      select: { id: true, channel: true },
    });
    if (!account) throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'ACCOUNT_GONE' } });
    const adapter = this.adapters.get(account.channel);
    const decision = adapter.validateConfirmationEvidence(input.expectedProviderAccountId, {
      // 운영자 확인은 몰 화면을 사람이 본 것이다 — 계정 식별자는 plan 이 얼린 것으로 두고 몰 상품 id 형식만 본다.
      providerAccountId: input.confirmedByOperator ? input.expectedProviderAccountId : input.evidence.providerAccountId,
      observedUrl: input.evidence.observedUrl,
      externalListingId: input.evidence.externalListingId,
    });
    const tolerated = input.confirmedByOperator && !decision.ok && decision.reason === 'missing_account';
    if (!decision.ok && !tolerated) {
      throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: decision.reason } });
    }
    if (!input.confirmedByOperator && input.evidence.providerAccountId === null && input.evidence.observedUrl === null) {
      throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'TRUSTED_EVIDENCE_MISSING' } });
    }
    const resolved = await resolveTargetConfirmationListing(tx, scope, input.snapshot, input.evidence, input.evidence.externalListingId);
    await applyTargetConfirmationRecipes(transaction, this.recipes, input.organizationId, input.snapshot, input.evidence, resolved);
    if (input.snapshot.kind === 'register') await this.completeFirstRegistration(transaction, input.organizationId, input.snapshot, resolved);
    return { channelListingId: resolved.listingId };
  }

  /**
   * 새 몰 상품을 확인한 `register` 만의 뒷일(KID-321, 몰 중립): 어댑터가 준비 때 셀피아 매칭을 얼렸으면 그
   * 레시피를 업체상품코드가 같은 몰 옵션에 건다. 확인과 같은 트랜잭션이다.
   */
  private async completeFirstRegistration(
    handle: OwnerTransaction,
    organizationId: string,
    snapshot: TargetExecutionSnapshot,
    resolved: TargetConfirmation,
  ): Promise<void> {
    const recipe = preparedRegistrationRecipe(snapshot);
    if (!recipe) return;
    if (!this.recipes) throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'RECIPE_CAPABILITY_UNAVAILABLE' } });
    await applyPreparedRecipeToOptions(handle, this.recipes, { organizationId, channelListingId: resolved.listingId, recipe });
  }
}

/**
 * 이미 이 계정에 올라간 상품에 새 `register` 를 열지 않는다(KID-320 S7). 막는 근거는 둘이다: 이 상품의 살아 있는
 * 리스팅, 또는 성공한 등록성 실행(register · update · composition_change) 가운데 그 실행이 연결한 리스팅이 아직
 * 내려지지 않은 것(카탈로그가 아직 안 가져왔으면 실행만으로 막는다). 취소된 실행은 앞선 성공을 지우지 않는다.
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
    throw new KiditemConflictError(REGISTRATION_ALREADY_REGISTERED_CODE, {
      details: { existing: { externalListingId: listing.externalId } },
    });
  }
  const succeeded = await readOperationsByPlan(tx, {
    organizationId,
    kinds: [REGISTRATION_KIND],
    planContainsAny: LISTING_SHAPING_EXECUTION_KINDS.map((executionKind) => ({ executionKind, salesProductId, channelAccountId })),
    statuses: ['succeeded'],
  });
  if (succeeded.length === 0) return;
  const inactive = await tx.channelListing.findMany({
    where: { organizationId, channelAccountId, isActive: false },
    select: { id: true, externalId: true },
  });
  for (const operation of succeeded) {
    // 빠른 등록(대상 없음)이나 관문이 [등록]을 거른 실행은 폼만 채웠다 — 몰에 올린 증거가 아니다.
    const result = jsonRecord(operation.result);
    if (jsonRecord(operation.plan).registrationTargetId == null || result.mallOutcome === 'not_submitted') continue;
    const listingId = typeof result.channelListingId === 'string' ? result.channelListingId : null;
    const externalListingId = typeof result.externalListingId === 'string' ? result.externalListingId : null;
    const takenDown = inactive.some((row) => row.id === listingId || (externalListingId !== null && row.externalId === externalListingId));
    if (takenDown) continue;
    throw new KiditemConflictError(REGISTRATION_ALREADY_REGISTERED_CODE, {
      details: { existing: { externalListingId, executionId: operation.id } },
    });
  }
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
  /** 준비 때는 송신 전 점검 실패, 얼린 뒤 다시 볼 때는 준비 후 변경(409)으로 답한다. */
  refusal: 'CHANNELS_PREFLIGHT_FAILED' | 'CHANNELS_EXECUTION_STALE',
): void {
  if (options.length === 0) throw new KiditemError(refusal, { details: { reason: 'NO_ACTIVE_OPTIONS' } });
  if (options.some((option) => adapter.availabilityOption({ registrationType: optionRegistrationType(option.rawJson) }) === 'excluded')) {
    throw new KiditemError(refusal, { details: { reason: 'OPTION_REFUSES_SELLER_STOCK' } });
  }
}

function freezeTargetExecutionSnapshot(snapshot: TargetExecutionSnapshot): {
  payload: TargetExecutionSnapshot;
  hash: string;
} {
  const parsed = TargetExecutionSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'TARGET_SNAPSHOT_INVALID' } });
  }
  const frozen = freezeProductRegistrationPayload(
    parsed.data as unknown as RegistrationSubmissionJson, channelIntegrity.sha256,
  );
  return {
    payload: frozen.payload as unknown as TargetExecutionSnapshot,
    hash: frozen.hash,
  };
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

type TargetProductOption = TargetExecutionSnapshot['product']['options'][number];

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
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'TRANSITIONS_NOT_ALLOWED' } });
    }
    return;
  }
  if (!snapshot.channelListingId || transitions.length === 0) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'TRANSITIONS_REQUIRED' } });
  }

  const oldIds = transitions.map((transition) => transition.channelListingOptionId);
  const newIds = transitions.map((transition) => transition.salesProductOptionId);
  if (new Set(oldIds).size !== oldIds.length
    || new Set(newIds).size !== newIds.length
    || newIds.some((id) => !snapshot.product.options.some((option) => option.id === id))) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'TRANSITIONS_INVALID' } });
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
  if (!listing) throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'COMPOSITION_LISTING_NOT_IN_ACCOUNT' } });

  const rows = await tx.channelListingOption.findMany({
    where: {
      organizationId,
      listingId: snapshot.channelListingId,
      id: { in: oldIds },
    },
    select: { id: true },
  });
  if (rows.length !== oldIds.length) {
    throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'COMPOSITION_OPTION_NOT_IN_LISTING' } });
  }
}

async function resolveTargetConfirmationListing(
  tx: Prisma.TransactionClient,
  execution: { organizationId: string; channelAccountId: string },
  snapshot: TargetExecutionSnapshot,
  evidence: RegistrationConfirmationEvidence,
  externalListingId: string,
): Promise<TargetConfirmation> {
  const account = await tx.channelAccount.findFirst({
    where: {
      id: execution.channelAccountId,
      organizationId: execution.organizationId,
    },
    select: { id: true, channel: true },
  });
  if (!account) throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'ACCOUNT_GONE' } });

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
    throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'FROZEN_LISTING_GONE' } });
  }
  if (frozenListing && frozenListing.externalId !== externalListingId) {
    throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'PROVIDER_LISTING_MISMATCH' } });
  }
  if (frozenListing && existingIdentity && frozenListing.id !== existingIdentity.id) {
    throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'PROVIDER_LISTING_OTHER_CANONICAL' } });
  }

  let listingId = existingIdentity?.id ?? null;
  const created = listingId === null;
  if (!listingId) {
    if (snapshot.kind === 'composition_change') {
      throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'COMPOSITION_LISTING_UNKNOWN' } });
    }
    const created = await tx.channelListing.create({
      data: {
        organizationId: execution.organizationId,
        channelAccountId: execution.channelAccountId,
        salesProductId: snapshot.product.id,
        externalId: externalListingId,
        ...(evidence.observedStatus !== null ? { status: evidence.observedStatus } : {}),
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
    if (!existing) throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'CANONICAL_LISTING_GONE' } });
    if (existing.salesProductId && existing.salesProductId !== snapshot.product.id) {
      throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'LISTING_OF_OTHER_PRODUCT' } });
    }
    const data: Prisma.ChannelListingUpdateManyMutationInput = {
      ...(existing.salesProductId ? {} : { salesProductId: snapshot.product.id }),
      ...(evidence.observedStatus !== null ? { status: evidence.observedStatus } : {}),
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
        throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'CANONICAL_LISTING_CHANGED' } });
      }
    }
  }

  const optionById = new Map(snapshot.product.options.map((option) => [option.id, option]));
  const evidenceOptions = evidence.options;
  const externalOptionIds = evidenceOptions.map((option) => option.externalOptionId);
  const commonOptionIds = evidenceOptions.map((option) => option.salesProductOptionId);
  if (new Set(externalOptionIds).size !== externalOptionIds.length
    || new Set(commonOptionIds).size !== commonOptionIds.length) {
    throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'DUPLICATE_OPTION_EVIDENCE' } });
  }
  for (const option of evidenceOptions) {
    if (!optionById.has(option.salesProductOptionId)) {
      throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'OPTION_NOT_IN_PRODUCT' } });
    }
  }

  if (snapshot.applyCompositionTemplate && !sameStringSet(commonOptionIds, [...optionById.keys()])) {
    throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'TEMPLATE_OPTIONS_INCOMPLETE' } });
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
      throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'COMPOSITION_TRANSITIONS_INCOMPLETE' } });
    }
    const localByExternalId = new Map(localOptions.map((option) => [option.externalOptionId, option]));
    const confirmedOptions = evidenceOptions.map((observed) => {
      const localOption = localByExternalId.get(observed.externalOptionId);
      const transition = localOption ? transitionByLocalId.get(localOption.id) : undefined;
      const commonOption = optionById.get(observed.salesProductOptionId);
      if (!localOption || !transition || !commonOption
        || transition.salesProductOptionId !== commonOption.id) {
        throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'COMPOSITION_TRANSITION_MISMATCH' } });
      }
      return { localOption, commonOption };
    });
    if (!sameStringSet(
      confirmedOptions.map((option) => option.localOption.id),
      transitions.map((transition) => transition.channelListingOptionId),
    )) {
      throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'COMPOSITION_TRANSITION_OMITTED' } });
    }
    return { listingId, created, options: confirmedOptions };
  }

  const confirmedOptions: TargetConfirmedOption[] = [];
  for (const observed of evidenceOptions) {
    const commonOption = optionById.get(observed.salesProductOptionId)!;
    const existing = await tx.channelListingOption.findFirst({
      where: {
        organizationId: execution.organizationId,
        listingId,
        externalOptionId: observed.externalOptionId,
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
        throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'OPTION_LINKED_ELSEWHERE' } });
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
          throw new KiditemConflictError('CHANNELS_EXECUTION_STALE', { details: { reason: 'CANONICAL_OPTION_CHANGED' } });
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
        externalOptionId: observed.externalOptionId,
        salesProductOptionId: commonOption.id,
        kidItemCode: issuedKidItemCode(commonOption),
        ...(observed.sellerSku !== null ? { sellerSku: observed.sellerSku } : {}),
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
  evidence: RegistrationConfirmationEvidence,
  resolved: TargetConfirmation,
): Promise<void> {
  const compositionChange = snapshot.kind === 'composition_change';
  const applyTemplate = snapshot.applyCompositionTemplate;
  if (!compositionChange && !applyTemplate) return;
  if (compositionChange && evidence.options.length === 0) {
    throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'COMPOSITION_OPTION_EVIDENCE_MISSING' } });
  }
  if (!compositionChange && resolved.options.length === 0) return;
  if (!recipes) throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'RECIPE_CAPABILITY_UNAVAILABLE' } });

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
    throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'KID_NOT_ISSUED_AT_CONFIRMATION' } });
  }
  return option.optionCode;
}
