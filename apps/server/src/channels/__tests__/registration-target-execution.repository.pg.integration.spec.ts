import { realRegistrationContentWorkspace } from '../../test-helpers/registration-content-workspace';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationExecutionRepositoryAdapter } from '../adapter/out/repository/registration-execution.repository.adapter';
import { RegistrationTargetRepositoryAdapter } from '../adapter/out/persistence/registration-target.repository.adapter';
import { ChannelOptionRecipeRepositoryAdapter } from '../adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelOptionRecipeService } from '../application/service/listing/channel-option-recipe.service';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import type {
  RegistrationMallInput,
  PrepareListingAvailabilityInput,
  PrepareTargetExecutionInput,
  ReportTargetExecutionInput,
  TargetExecutionSnapshot,
} from '@kiditem/shared/sales-product';
import type { Prisma, PrismaClient } from '@prisma/client';
import { productTransactionalRead } from './product-transactional-read.fake';
import { channelAdapters, realRegistrationPreflight } from './channel-adapters';
import { ownerTransaction } from '../../prisma/owner-transaction';
import { RegistrationDraftAdapter } from '../adapter/out/persistence/registration-draft.adapter';
import type { TargetExecutionIntent } from '../application/port/out/repository/registration-execution.repository.port';
import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import {
  freezeProductRegistrationPayload,
  type RegistrationSubmissionJson,
} from '../domain/registration/registration-submission-payload';
import { ChannelsProductMappingGenerationAdapter } from "../adapter/out/products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

describe('registration target execution repository (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let targets: RegistrationTargetRepositoryAdapter;
  let repository: RegistrationExecutionRepositoryAdapter;
  let recipes: ChannelOptionRecipeService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    targets = new RegistrationTargetRepositoryAdapter(prisma as unknown as PrismaService, productTransactionalRead(), realRegistrationContentWorkspace(prisma));
    recipes = new ChannelOptionRecipeService(
      new ChannelOptionRecipeRepositoryAdapter(
        prisma as unknown as PrismaService,
        new ProductTransactionalReadRepositoryAdapter(),
      new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
      ),
    );
    repository = new RegistrationExecutionRepositoryAdapter(
      prisma as unknown as PrismaService,
      // 등록 확인이 판매 상품의 콘텐츠 작업공간을 몰 상품에 붙인다 — 실제 Content 어댑터로 엮는다.
      new RegistrationDraftAdapter(realRegistrationContentWorkspace(prisma)),
      channelAdapters({ registration: realRegistrationPreflight(prisma, recipes) }),
      recipes,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('treats a thumbnail_update execution id as unknown on the target routes and leaves the row alone', async () => {
    const account = await prisma.channelAccount.create({ data: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Wing', status: 'active' } });
    const thumbnail = await prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID, channelAccountId: account.id, executionKind: 'thumbnail_update',
        idempotencyKey: `thumbnail_update:${randomUUID()}`, requestHash: 'a'.repeat(64), requestedByUserId: TEST_USER_ID,
        submissionPayloadJson: { kind: 'thumbnail_update', generationId: randomUUID() }, submissionPayloadHash: 'a'.repeat(64),
        status: 'executing', providerOutcome: 'uncertain',
      },
    });
    const before = await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: thumbnail.id } });
    const ids = { organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, executionId: thumbnail.id };

    await expect(repository.getTarget(ids)).rejects.toBeInstanceOf(NotFoundException);
    await expect(repository.startTarget(ids)).rejects.toBeInstanceOf(NotFoundException);
    await expect(repository.reportTarget({ ...ids, report: { payloadHash: 'a'.repeat(64) } as unknown as ReportTargetExecutionInput }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: thumbnail.id } })).toEqual(before);
  });

  it('refuses a listing availability idempotency key in the thumbnail_update namespace, for prepare and for the key lookup', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true });
    const listing = await prisma.channelListing.findUniqueOrThrow({ where: { id: fixture.listingId! } });
    await expect(repository.prepareListingAvailability({
      organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID,
      request: { channelAccountId: fixture.accountId, externalListingId: listing.externalId, kind: 'sold_out', optionCodes: ['option-1'], idempotencyKey: 'thumbnail_update:capability-invocation:x' },
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(repository.findListingAvailabilityByKey({
      organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, idempotencyKey: 'thumbnail_update:capability-invocation:x',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.productRegistrationExecution.count()).toBe(0);
  });

  it('treats a thumbnail_update execution id as unknown on the listing availability routes', async () => {
    const account = await prisma.channelAccount.create({ data: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Wing 2', status: 'active' } });
    const thumbnail = await prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID, channelAccountId: account.id, executionKind: 'thumbnail_update',
        idempotencyKey: `thumbnail_update:${randomUUID()}`, requestHash: 'a'.repeat(64), requestedByUserId: TEST_USER_ID,
        submissionPayloadJson: { kind: 'thumbnail_update', generationId: randomUUID() }, status: 'reconciling', providerOutcome: 'uncertain',
      },
    });
    const before = await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: thumbnail.id } });
    const ids = { organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, executionId: thumbnail.id };
    await expect(repository.startListingAvailability(ids)).rejects.toBeInstanceOf(NotFoundException);
    await expect(repository.reportListingAvailability({ ...ids, report: {} as never })).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: thumbnail.id } })).toEqual(before);
  });

  it('refuses a target idempotency key in the thumbnail_update namespace', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true });
    await expect(repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID,
      request: { ...requestFor('ignored'), idempotencyKey: 'thumbnail_update:capability-invocation:x', channelListingId: fixture.listingId! },
      snapshot: fixture.snapshot,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.productRegistrationExecution.count()).toBe(0);
  });

  it.each([
    'inactive account', 'provider identity', 'archived target', 'target version',
    'product version', 'product status', 'option supply status', 'selected membership', 'inactive listing',
  ])('refuses a fresh start after a changed %s without claiming a lease', async change => {
    const fixture = await createFixture(prisma, targets, { listing: true });
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID,
      request: { ...requestFor(`start-fence-${change}`), channelListingId: fixture.listingId! }, snapshot: fixture.snapshot,
    });
    if (change === 'inactive account') await prisma.channelAccount.update({ where: { id: fixture.accountId }, data: { status: 'inactive' } });
    if (change === 'provider identity') await prisma.channelAccount.update({ where: { id: fixture.accountId }, data: { vendorId: 'another-vendor', externalAccountId: 'another-vendor' } });
    if (change === 'archived target') await prisma.registrationTarget.update({ where: { id: fixture.targetId }, data: { archivedAt: new Date() } });
    if (change === 'target version') await prisma.registrationTarget.update({ where: { id: fixture.targetId }, data: { version: { increment: 1 } } });
    if (change === 'product version') await prisma.salesProduct.update({ where: { id: fixture.productId }, data: { version: { increment: 1 } } });
    if (change === 'product status') await prisma.salesProduct.update({ where: { id: fixture.productId }, data: { status: 'archived' } });
    if (change === 'option supply status') await prisma.salesProductOption.update({ where: { id: fixture.optionId }, data: { supplyStatus: 'unused' } });
    if (change === 'selected membership') await prisma.registrationTargetOption.deleteMany({ where: { organizationId: TEST_ORGANIZATION_ID, registrationTargetId: fixture.targetId } });
    if (change === 'inactive listing') await prisma.channelListing.update({ where: { id: fixture.listingId! }, data: { isActive: false } });
    await expect(repository.startTarget({ organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, executionId: prepared.executionId })).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } })).toMatchObject({ status: 'prepared', providerOutcome: 'not_attempted', leaseToken: null, leaseClaimedAt: null, startedAt: null });
  });

  it('refuses a composition start when its frozen actual option was deactivated', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true });
    const optionTransitions = [{ channelListingOptionId: fixture.listingOptionId!, salesProductOptionId: fixture.optionId }];
    const prepared = await repository.prepareTarget({ organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID,
      request: { ...requestFor('composition-start-fence'), kind: 'composition_change', channelListingId: fixture.listingId!, optionTransitions },
      snapshot: { ...fixture.snapshot, kind: 'composition_change', optionTransitions } });
    await prisma.channelListingOption.update({ where: { id: fixture.listingOptionId! }, data: { isActive: false } });
    await expect(repository.startTarget({ organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, executionId: prepared.executionId })).rejects.toThrow('no longer active');
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } })).toMatchObject({ status: 'prepared', providerOutcome: 'not_attempted', leaseToken: null });
  });

  it('grants exactly one concurrent start and replays that receipt after the target is archived', async () => {
    const fixture = await createFixture(prisma, targets);
    const prepared = await repository.prepareTarget({ organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID, request: requestFor('concurrent-start-fence'), snapshot: fixture.snapshot });
    const start = { organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, executionId: prepared.executionId };
    const results = await Promise.all([repository.startTarget(start), repository.startTarget(start)]);
    expect(results.filter(result => result.maySubmit)).toHaveLength(1);
    expect(new Set(results.map(result => result.leaseToken)).size).toBe(1);
    await prisma.registrationTarget.update({ where: { id: fixture.targetId }, data: { archivedAt: new Date() } });
    expect(await repository.startTarget(start)).toMatchObject({ maySubmit: false, status: 'executing', leaseToken: results[0]!.leaseToken });
    await prisma.productRegistrationExecution.update({ where: { id: prepared.executionId }, data: { status: 'succeeded', providerOutcome: 'succeeded' } });
    expect(await repository.startTarget(start)).toMatchObject({ maySubmit: false, status: 'succeeded' });
  });

  it('freezes raw intent separately, claims a provider lease once, and replays the frozen snapshot', async () => {
    const fixture = await createFixture(prisma, targets);
    const request = requestFor('target-intent-1');
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: fixture.snapshot,
    });

    expect(prepared).toMatchObject({
      targetId: fixture.targetId,
      channelAccountId: fixture.accountId,
      status: 'prepared',
      providerOutcome: 'not_attempted',
      maySubmit: false,
    });
    const stored = await prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: { requestHash: true, submissionPayloadHash: true },
    });
    expect(stored.requestHash).not.toBe(stored.submissionPayloadHash);

    const started = await repository.startTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    expect(started).toMatchObject({ status: 'executing', providerOutcome: 'uncertain', maySubmit: true });
    expect(started.leaseToken).toEqual(expect.any(String));

    const repeated = await repository.startTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    expect(repeated).toMatchObject({
      executionId: started.executionId,
      status: 'executing',
      providerOutcome: 'uncertain',
      maySubmit: false,
      leaseToken: started.leaseToken,
    });
    await expect(repository.getTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    })).resolves.toMatchObject({ payload: fixture.snapshot, maySubmit: false });
  });

  it('freezes the detail revision html and id in the execution payload, unchanged by later content edits', async () => {
    const fixture = await createFixture(prisma, targets);
    const detailPage = { revisionId: randomUUID(), html: '<p>동결한 상세</p>' };
    const request = requestFor('target-detail-freeze-1');
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: { ...fixture.snapshot, detailPage },
    });

    expect(prepared.payload.detailPage).toEqual(detailPage);
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: { submissionPayloadJson: true },
    })).resolves.toMatchObject({ submissionPayloadJson: { detailPage } });
    await expect(repository.findTargetReplay({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      targetId: fixture.targetId,
      request,
    })).resolves.toMatchObject({ payload: { detailPage } });
  });

  it('replays an old intent after target and product edits while rejecting idempotency reuse', async () => {
    const fixture = await createFixture(prisma, targets);
    const request = requestFor('target-replay-1');
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: fixture.snapshot,
    });
    await targets.update(TEST_ORGANIZATION_ID, fixture.targetId, {
      expectedVersion: 1,
      registrationInput: { mallCategory: null, mallFields: { changed: true }, adapter: {} },
      selectedThumbnailAssetId: null,
      selectedDetailPageRevisionId: null,
      selectedOptions: [{ salesProductOptionId: fixture.optionId }],
    });
    await prisma.salesProduct.update({
      where: { id: fixture.productId },
      data: { version: { increment: 1 } },
    });
    const changedSnapshot = {
      ...fixture.snapshot,
      targetVersion: 2,
      product: { ...fixture.snapshot.product, version: 2, name: '변경된 공통 상품' },
    };

    await expect(repository.findTargetReplay({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      targetId: fixture.targetId,
      request,
    })).resolves.toMatchObject({ executionId: prepared.executionId, payload: fixture.snapshot });
    await expect(repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: changedSnapshot,
    })).resolves.toMatchObject({ executionId: prepared.executionId, payload: fixture.snapshot });
    await expect(repository.findTargetReplay({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      targetId: fixture.targetId,
      request: { ...request, kind: 'update' },
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('freezes adapter defaults, including string zero keys and values, across live edits and replay', async () => {
    const fixture = await createFixture(prisma, targets);
    const adapterDefaults = { '0': '0', fulfillmentMode: '0' };
    const request: PrepareTargetExecutionInput = {
      ...requestFor('target-adapter-defaults-1'),
      adapterDefaults,
    };
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: { ...fixture.snapshot, adapterDefaults },
    });
    expect(prepared.payload.adapterDefaults).toEqual(adapterDefaults);

    await targets.update(TEST_ORGANIZATION_ID, fixture.targetId, {
      expectedVersion: 1,
      registrationInput: { mallCategory: null, mallFields: { changed: true }, adapter: {} },
      selectedThumbnailAssetId: null,
      selectedDetailPageRevisionId: null,
      selectedOptions: [{ salesProductOptionId: fixture.optionId }],
    });
    await prisma.salesProduct.update({
      where: { id: fixture.productId },
      data: { version: { increment: 1 } },
    });

    const changedSnapshot = {
      ...fixture.snapshot,
      targetVersion: 2,
      adapterDefaults: { ...adapterDefaults },
      product: { ...fixture.snapshot.product, version: 2, name: '변경된 공통 상품' },
    };
    await expect(repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: changedSnapshot,
    })).resolves.toMatchObject({
      executionId: prepared.executionId,
      payload: {
        targetVersion: 1,
        adapterDefaults,
        product: { version: 1, name: '공통 상품' },
      },
    });

    const changedDefaults = { ...adapterDefaults, '0': '1' };
    await expect(repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request: { ...request, adapterDefaults: changedDefaults },
      snapshot: { ...changedSnapshot, adapterDefaults: changedDefaults },
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('freezes explicit per-run adapter values and never writes them into reusable target settings', async () => {
    const fixture = await createFixture(prisma, targets);
    const adapterValues = { deliveryType: '이번 실행 값', '0': '0' };
    const request: PrepareTargetExecutionInput = {
      ...requestFor('target-adapter-values-1'),
      adapterValues,
    };
    const snapshot: TargetExecutionIntent = { ...fixture.snapshot, adapterValues };

    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot,
    });

    expect(prepared.payload.adapterValues).toEqual(adapterValues);
    await expect(targets.get(TEST_ORGANIZATION_ID, fixture.targetId)).resolves.toMatchObject({
      registrationInput: { mallCategory: { key: 'category-1', label: null }, mallFields: {}, adapter: {} },
    });
    await expect(repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request: { ...request, adapterValues: { ...adapterValues, deliveryType: '다른 실행 값' } },
      snapshot: { ...snapshot, adapterValues: { ...adapterValues, deliveryType: '다른 실행 값' } },
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(targets.get(TEST_ORGANIZATION_ID, fixture.targetId)).resolves.toMatchObject({
      registrationInput: { mallCategory: { key: 'category-1', label: null }, mallFields: {}, adapter: {} },
    });
  });

  it('includes updateFields in the target intent and rejects conflicting idempotency reuse', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true });
    const request: PrepareTargetExecutionInput = {
      ...requestFor('target-price-update-1'),
      kind: 'update',
      channelListingId: fixture.listingId!,
      updateFields: ['salePrice'],
    };
    const snapshot: TargetExecutionIntent = {
      ...fixture.snapshot,
      kind: 'update',
      channelListingId: fixture.listingId,
      updateFields: ['salePrice'],
    };
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot,
    });
    expect(prepared.payload.updateFields).toEqual(['salePrice']);

    await expect(repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request: { ...request, updateFields: undefined },
      snapshot: { ...snapshot, updateFields: undefined },
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(repository.findTargetReplay({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      targetId: fixture.targetId,
      request,
    })).resolves.toMatchObject({
      executionId: prepared.executionId,
      payload: { updateFields: ['salePrice'] },
    });
  });

  it.each([
    { mode: 'omitted' as const },
    { mode: 'partial' as const },
  ])('rejects $mode provider option identities atomically for a templated registration', async ({ mode }) => {
    const fixture = await createFixture(prisma, targets, { component: false });
    const expanded = await addSecondSelectedOption(prisma, targets, fixture);
    const request: PrepareTargetExecutionInput = {
      ...requestFor(`target-template-${mode}-1`),
      expectedVersion: 2,
      applyCompositionTemplate: true,
    };
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: { ...expanded.snapshot, applyCompositionTemplate: true },
    });
    const started = await repository.startTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    const evidence: ReportTargetExecutionInput['evidence'] = {
      channelAccountId: fixture.accountId,
      externalListingId: `template-${mode}-listing-1`,
      providerAccountId: 'vendor-1',
      observedUrl: 'https://wing.coupang.com/products/template-registration-1',
      ...(mode === 'partial' ? {
        options: [{
          salesProductOptionId: fixture.optionId,
          externalOptionId: 'template-first-option-1',
        }],
      } : {}),
    };

    await expect(repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'confirmed',
        evidence,
      },
    })).rejects.toBeInstanceOf(ConflictException);

    await expect(prisma.channelListing.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        externalId: `template-${mode}-listing-1`,
      },
    })).resolves.toBe(0);
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: {
        status: true,
        providerOutcome: true,
        channelListingId: true,
        externalListingId: true,
        resultJson: true,
      },
    })).resolves.toEqual({
      status: 'executing',
      providerOutcome: 'uncertain',
      channelListingId: null,
      externalListingId: null,
      resultJson: null,
    });
  });

  it.each([
    { mode: 'wrong provider identity' as const, providerAccountId: 'vendor-2' },
    { mode: 'missing provider identity' as const, providerAccountId: undefined },
  ])('requires the frozen provider identity for a trusted mall URL ($mode)', async ({ providerAccountId }) => {
    const fixture = await createFixture(prisma, targets, { channel: 'smartstore' });
    const request = requestFor('target-frozen-provider-identity-1');
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: fixture.snapshot,
    });
    const started = await repository.startTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    await prisma.channelAccount.update({
      where: { id: fixture.accountId },
      data: { vendorId: 'vendor-2', externalAccountId: 'vendor-2' },
    });

    await expect(repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'confirmed',
        evidence: {
          channelAccountId: fixture.accountId,
          externalListingId: 'frozen-provider-listing-1',
          observedUrl: 'https://sell.smartstore.naver.com/products/frozen-provider-listing-1',
          ...(providerAccountId ? { providerAccountId } : {}),
        },
      },
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(prisma.channelListing.count({
      where: { organizationId: TEST_ORGANIZATION_ID, externalId: 'frozen-provider-listing-1' },
    })).resolves.toBe(0);
  });

  it('keeps a null frozen provider identity unknown after live account metadata changes', async () => {
    const fixture = await createFixture(prisma, targets, {
      channel: 'smartstore',
      providerIdentity: null,
    });
    const request = requestFor('target-null-provider-identity-1');
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: fixture.snapshot,
    });
    const started = await repository.startTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    await prisma.channelAccount.update({
      where: { id: fixture.accountId },
      data: { vendorId: 'vendor-2', externalAccountId: 'vendor-2' },
    });

    const baseEvidence = {
      channelAccountId: fixture.accountId,
      externalListingId: 'null-provider-listing-1',
      observedUrl: 'https://sell.smartstore.naver.com/products/null-provider-listing-1',
    };
    await expect(repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'confirmed',
        evidence: { ...baseEvidence, providerAccountId: 'vendor-2' },
      },
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'confirmed',
        evidence: baseEvidence,
      },
    })).resolves.toMatchObject({ status: 'succeeded', providerOutcome: 'succeeded' });
  });

  it('keeps uncertain submissions reconciling, requires provider proof for confirmation, and applies recipes in the same transaction', async () => {
    const fixture = await createFixture(prisma, targets, {
      listing: true,
      component: true,
      existingOptionLink: false,
    });
    const request: PrepareTargetExecutionInput = {
      ...requestFor('target-composition-1'),
      kind: 'composition_change',
      channelListingId: fixture.listingId!,
      optionTransitions: [{
        channelListingOptionId: fixture.listingOptionId!,
        salesProductOptionId: fixture.optionId,
      }],
    };
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: {
        ...fixture.snapshot,
        kind: 'composition_change',
        channelListingId: fixture.listingId,
        optionTransitions: request.optionTransitions,
      },
    });
    const started = await repository.startTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    const baseEvidence = {
      channelAccountId: fixture.accountId,
      externalListingId: 'provider-listing-1',
      options: [{
        salesProductOptionId: fixture.optionId,
        externalOptionId: 'provider-option-1',
        sellerSku: 'provider-echo-sku',
      }],
    };
    await expect(repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: randomUUID(),
        payloadHash: started.payloadHash,
        outcome: 'submitted',
        evidence: { ...baseEvidence, providerAccountId: 'vendor-1' },
      },
    })).rejects.toThrow('lease');
    await expect(repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: 'stale-payload-hash',
        outcome: 'submitted',
        evidence: { ...baseEvidence, providerAccountId: 'vendor-1' },
      },
    })).rejects.toThrow('payload hash');
    await expect(repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'confirmed',
        evidence: baseEvidence,
      },
    })).rejects.toThrow('frozen provider account identity');

    const submitted = await repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'submitted',
        evidence: { ...baseEvidence, providerAccountId: 'vendor-1' },
      },
    });
    expect(submitted).toMatchObject({ status: 'reconciling', providerOutcome: 'uncertain', maySubmit: false });

    const confirmed = await repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'confirmed',
        evidence: { ...baseEvidence, providerAccountId: 'vendor-1' },
      },
    });
    expect(confirmed).toMatchObject({ status: 'succeeded', providerOutcome: 'succeeded', leaseToken: null });
    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: fixture.listingOptionId! },
      select: { salesProductOptionId: true, kidItemCode: true, sellerSku: true },
    })).resolves.toEqual({
      salesProductOptionId: fixture.optionId,
      kidItemCode: 'KID00000001',
      sellerSku: 'EXISTING-SKU',
    });
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: fixture.listingOptionId! },
      select: { masterProductId: true, quantity: true },
    })).resolves.toEqual([{ masterProductId: fixture.masterProductId, quantity: 1 }]);

    await expect(repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: randomUUID(),
        payloadHash: started.payloadHash,
        outcome: 'confirmed',
        evidence: { ...baseEvidence, providerAccountId: 'vendor-1' },
      },
    })).resolves.toMatchObject({ status: 'succeeded', maySubmit: false });

    const templateRequest: PrepareTargetExecutionInput = {
      ...requestFor('target-template-1'),
      channelListingId: fixture.listingId!,
      applyCompositionTemplate: true,
    };
    const templatePrepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request: templateRequest,
      snapshot: { ...fixture.snapshot, channelListingId: fixture.listingId, applyCompositionTemplate: true },
    });
    const templateStarted = await repository.startTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: templatePrepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    await repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: templatePrepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: templateStarted.leaseToken!,
        payloadHash: templateStarted.payloadHash,
        outcome: 'confirmed',
        evidence: {
          channelAccountId: fixture.accountId,
          externalListingId: 'provider-listing-1',
          providerAccountId: 'vendor-1',
          options: [{
            salesProductOptionId: fixture.optionId,
            externalOptionId: 'provider-option-1',
          }],
        },
      },
    });
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: fixture.listingOptionId! },
    })).resolves.toHaveLength(1);
  });

  it.each([
    { channel: 'smartstore', origin: 'https://sell.smartstore.naver.com', applyTemplate: true },
    { channel: 'kidkids', origin: 'https://partner.kidkids.net', applyTemplate: true },
    { channel: 'kidkids', origin: 'https://partner.kidkids.net', applyTemplate: false },
  ])('creates canonical listing and option links for a new $channel registration using its registered admin origin', async ({ channel, origin, applyTemplate }) => {
    const fixture = await createFixture(prisma, targets, { component: true, channel });
    const request: PrepareTargetExecutionInput = {
      ...requestFor('target-new-listing-1'),
      applyCompositionTemplate: applyTemplate,
    };
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: { ...fixture.snapshot, applyCompositionTemplate: applyTemplate },
    });
    const started = await repository.startTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    const confirmed = await repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'confirmed',
        evidence: {
          channelAccountId: fixture.accountId,
          externalListingId: `${channel}-listing-1`,
          observedUrl: `${origin}/products/${channel}-listing-1`,
          providerAccountId: 'vendor-1',
          observedStatus: 'active',
          options: [{
            salesProductOptionId: fixture.optionId,
            externalOptionId: `${channel}-option-1`,
            sellerSku: `${channel}-SKU-1`,
          }],
        },
      },
    });

    const listing = await prisma.channelListing.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: fixture.accountId,
        externalId: `${channel}-listing-1`,
      },
      select: { id: true, salesProductId: true, channelName: true, displayName: true, status: true },
    });
    const option = await prisma.channelListingOption.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, listingId: listing.id, externalOptionId: `${channel}-option-1` },
      select: { id: true, salesProductOptionId: true, sellerSku: true, kidItemCode: true },
    });
    const inventoryComponents = await prisma.channelListingOptionInventoryComponent.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: option.id },
    });
    const execution = await prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: { channelListingId: true, resultJson: true },
    });

    expect(confirmed).toMatchObject({ status: 'succeeded', providerOutcome: 'succeeded' });
    expect(listing).toMatchObject({
      id: execution.channelListingId,
      salesProductId: fixture.productId,
      channelName: null,
      displayName: null,
      status: 'active',
    });
    expect(option).toMatchObject({ salesProductOptionId: fixture.optionId, sellerSku: `${channel}-SKU-1` });
    expect(option.kidItemCode).toBe(fixture.snapshot.product.options[0].optionCode);
    expect(inventoryComponents).toHaveLength(applyTemplate ? 1 : 0);
    expect(execution.resultJson).toMatchObject({ outcome: 'confirmed' });
  });

  it('rolls back canonical confirmation writes when the real recipe target validation fails', async () => {
    const fixture = await createFixture(prisma, targets, {
      listing: true,
      component: true,
      existingOptionLink: false,
    });
    const request: PrepareTargetExecutionInput = {
      ...requestFor('target-composition-rollback-1'),
      kind: 'composition_change',
      channelListingId: fixture.listingId!,
      optionTransitions: [{
        channelListingOptionId: fixture.listingOptionId!,
        salesProductOptionId: fixture.optionId,
      }],
    };
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: {
        ...fixture.snapshot,
        kind: 'composition_change',
        channelListingId: fixture.listingId,
        optionTransitions: request.optionTransitions,
      },
    });
    const started = await repository.startTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });

    // The frozen common option still names this source identity, but the Products
    // reader can no longer resolve it when the confirmation transaction runs.
    await prisma.masterProduct.delete({ where: { id: fixture.masterProductId } });

    await expect(repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'confirmed',
        evidence: {
          channelAccountId: fixture.accountId,
          externalListingId: 'provider-listing-1',
          providerAccountId: 'vendor-1',
          options: [{
            salesProductOptionId: fixture.optionId,
            externalOptionId: 'provider-option-1',
          }],
        },
      },
    })).rejects.toBeInstanceOf(BadRequestException);

    await expect(prisma.channelListingOption.findUnique({
      where: { id: fixture.listingOptionId! },
      select: { salesProductOptionId: true },
    })).resolves.toEqual({ salesProductOptionId: null });
    await expect(prisma.channelListingOptionInventoryComponent.count({
      where: { channelListingOptionId: fixture.listingOptionId! },
    })).resolves.toBe(0);
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: { status: true, providerOutcome: true, channelListingId: true, resultJson: true },
    })).resolves.toEqual({
      status: 'executing',
      providerOutcome: 'uncertain',
      channelListingId: fixture.listingId,
      resultJson: null,
    });
  });

  it('swaps every confirmed composition link in place with one generation bump', async () => {
    const change = await prepareTwoOptionCompositionChange(prisma, targets, repository);
    const generationBefore = await readGeneration(prisma);

    await expect(repository.reportTarget(change.confirmedReport()))
      .resolves.toMatchObject({ status: 'succeeded', providerOutcome: 'succeeded' });

    expect(await readGeneration(prisma)).toBe(generationBefore + 1n);
    await expect(readChannelOptions(prisma, change.channelOptionIds)).resolves.toEqual([
      { id: change.channelOptionIds[0], externalOptionId: 'provider-option-1', salesProductOptionId: change.newOptionIds[0], kidItemCode: 'KID00000003',
        inventoryComponents: [{ masterProductId: change.masterProductId, quantity: 3 }] },
      { id: change.channelOptionIds[1], externalOptionId: 'provider-option-2', salesProductOptionId: change.newOptionIds[1], kidItemCode: 'KID00000004',
        inventoryComponents: [{ masterProductId: change.masterProductId, quantity: 4 }] },
    ].sort((left, right) => left.id.localeCompare(right.id)));
    await expect(prisma.salesProductOption.count({ where: { id: { in: change.oldOptionIds } } })).resolves.toBe(2);
  });

  it('leaves every link, KID, recipe and the generation unchanged when a later transition mismatches', async () => {
    const change = await prepareTwoOptionCompositionChange(prisma, targets, repository);
    const generationBefore = await readGeneration(prisma);
    const before = await readChannelOptions(prisma, change.channelOptionIds);
    await prisma.salesProductOptionComponent.updateMany({
      where: { salesProductOptionId: change.newOptionIds[1] },
      data: { quantity: 99 },
    });

    await expect(repository.reportTarget(change.confirmedReport())).rejects.toBeInstanceOf(BadRequestException);

    await expect(readChannelOptions(prisma, change.channelOptionIds)).resolves.toEqual(before);
    expect(await readGeneration(prisma)).toBe(generationBefore);
  });

  it('refuses to prepare a composition change for an option whose KID was never issued', async () => {
    await expect(prepareTwoOptionCompositionChange(prisma, targets, repository, { unissuedSecondCode: true }))
      .rejects.toThrow(/KID must be issued before registration/);
    await expect(prisma.productRegistrationExecution.count()).resolves.toBe(0);
  });

  it('refuses to prepare a registration whose selling option has no issued KID', async () => {
    const fixture = await createFixture(prisma, targets);
    const snapshot = {
      ...fixture.snapshot,
      product: {
        ...fixture.snapshot.product,
        options: fixture.snapshot.product.options.map((option) => ({ ...option, optionCode: null })),
      },
    };

    const prepare = repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request: requestFor('target-unissued-create-1'),
      snapshot,
    });
    await expect(prepare).rejects.toBeInstanceOf(ConflictException);
    await expect(prepare).rejects.toThrow(/KID must be issued before registration/);
    await expect(prisma.productRegistrationExecution.count()).resolves.toBe(0);
  });

  it('still refuses a confirmation that would create a channel option from a frozen option without a KID', async () => {
    const fixture = await createFixture(prisma, targets);
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request: requestFor('target-unissued-backstop-1'),
      snapshot: fixture.snapshot,
    });
    const started = await repository.startTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    // Only a frozen payload written before the prepare guard existed can carry a null code.
    const row = await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } });
    const payload = row.submissionPayloadJson as unknown as TargetExecutionSnapshot;
    const unissued = freezeProductRegistrationPayload({
      ...payload,
      product: { ...payload.product, options: payload.product.options.map((option) => ({ ...option, optionCode: null })) },
    } as unknown as RegistrationSubmissionJson, new ChannelIntegrityAdapter().sha256);
    await prisma.productRegistrationExecution.update({
      where: { id: prepared.executionId },
      data: { submissionPayloadJson: unissued.payload as Prisma.InputJsonValue, submissionPayloadHash: unissued.hash },
    });

    await expect(repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: unissued.hash,
        outcome: 'confirmed',
        evidence: {
          channelAccountId: fixture.accountId,
          providerAccountId: 'vendor-1',
          externalListingId: 'provider-listing-unissued',
          options: [{ salesProductOptionId: fixture.optionId, externalOptionId: 'provider-option-unissued' }],
        },
      },
    })).rejects.toThrow(/KID must be issued/);

    await expect(prisma.channelListingOption.count({
      where: { organizationId: TEST_ORGANIZATION_ID, externalOptionId: 'provider-option-unissued' },
    })).resolves.toBe(0);
  });

  it('leaves an existing link and recipe untouched when the provider result is unresolved', async () => {
    const fixture = await createFixture(prisma, targets, {
      listing: true,
      component: true,
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: fixture.listingOptionId!,
        masterProductId: fixture.masterProductId,
        quantity: 2,
      },
    });
    const request: PrepareTargetExecutionInput = {
      ...requestFor('target-uncertain-existing-recipe-1'),
      kind: 'update',
      channelListingId: fixture.listingId!,
    };
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: { ...fixture.snapshot, kind: 'update', channelListingId: fixture.listingId },
    });
    const started = await repository.startTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });

    const unresolved = await repository.reportTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'uncertain',
        evidence: {
          channelAccountId: fixture.accountId,
          externalListingId: 'provider-listing-1',
          providerAccountId: 'vendor-1',
        },
      },
    });

    expect(unresolved).toMatchObject({ status: 'reconciling', providerOutcome: 'uncertain' });
    expect(unresolved.result).toMatchObject({ outcome: 'uncertain' });
    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: fixture.listingOptionId! },
      select: { salesProductOptionId: true, kidItemCode: true, sellerSku: true },
    })).resolves.toEqual({
      salesProductOptionId: fixture.optionId,
      kidItemCode: null,
      sellerSku: 'EXISTING-SKU',
    });
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: fixture.listingOptionId! },
      select: { masterProductId: true, quantity: true },
    })).resolves.toEqual([{ masterProductId: fixture.masterProductId, quantity: 2 }]);
  });

  it('lists the actor-scoped target history with target execution kinds and a fifty-row cap', async () => {
    const fixture = await createFixture(prisma, targets);
    const request = requestFor('target-history-prepared-1');
    const prepared = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
      snapshot: fixture.snapshot,
    });
    const baseTime = Date.now();
    const payload = prepared.payload as unknown as Prisma.InputJsonValue;
    await prisma.productRegistrationExecution.createMany({
      data: Array.from({ length: 51 }, (_, index) => ({
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId: fixture.targetId,
        channelAccountId: fixture.accountId,
        executionKind: 'register',
        idempotencyKey: `target-history-${index}`,
        requestHash: `target-history-request-${index}`,
        submissionPayloadJson: payload,
        submissionPayloadHash: prepared.payloadHash,
        status: 'succeeded',
        providerOutcome: 'succeeded',
        requestedByUserId: TEST_USER_ID,
        resultJson: { marker: index },
        createdAt: new Date(baseTime + index * 1_000),
      })),
    });
    await prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId: fixture.targetId,
        channelAccountId: fixture.accountId,
        executionKind: 'create',
        idempotencyKey: 'target-history-legacy',
        requestHash: 'target-history-legacy-request',
        submissionPayloadJson: payload,
        submissionPayloadHash: prepared.payloadHash,
        status: 'succeeded',
        providerOutcome: 'succeeded',
        requestedByUserId: TEST_USER_ID,
        resultJson: { marker: 'legacy' },
        createdAt: new Date(baseTime + 100_000),
      },
    });

    const history = await repository.listTarget({
      organizationId: TEST_ORGANIZATION_ID,
      targetId: fixture.targetId,
      requestedByUserId: TEST_USER_ID,
    });
    expect(history).toHaveLength(50);
    expect(history.map((item) => (item.result as { marker: number }).marker))
      .toEqual(Array.from({ length: 50 }, (_, index) => 50 - index));
    expect(history.every((item) => item.payload.kind === 'register')).toBe(true);
    await expect(repository.listTarget({
      organizationId: TEST_ORGANIZATION_ID,
      targetId: fixture.targetId,
      requestedByUserId: randomUUID(),
    })).resolves.toEqual([]);
    await expect(repository.listTarget({
      organizationId: OTHER_ORGANIZATION_ID,
      targetId: fixture.targetId,
      requestedByUserId: TEST_USER_ID,
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('freezes listing-only availability, fences one submit, and updates only observed canonical status', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true, channel: 'kidkids' });
    const request: PrepareListingAvailabilityInput = {
      channelAccountId: fixture.accountId,
      externalListingId: 'provider-listing-1',
      kind: 'sold_out',
      optionCodes: ['provider-option-1'],
      idempotencyKey: 'listing-availability-sold-out-1',
    };
    const prepared = await repository.prepareListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
    });
    expect(prepared).toMatchObject({
      channelAccountId: fixture.accountId,
      status: 'prepared',
      providerOutcome: 'not_attempted',
      maySubmit: false,
      payload: {
        subject: 'channel_listing',
        channelListingId: fixture.listingId,
        channelAccountId: fixture.accountId,
        mallKey: 'kidkids',
        externalListingId: 'provider-listing-1',
        kind: 'sold_out',
        optionCodes: ['provider-option-1'],
      },
    });
    const stored = await prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: { registrationTargetId: true, channelListingId: true, expectedProviderAccountId: true },
    });
    expect(stored).toEqual({
      registrationTargetId: null,
      channelListingId: fixture.listingId,
      expectedProviderAccountId: 'vendor-1',
    });
    await expect(repository.getTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    })).rejects.toBeInstanceOf(NotFoundException);

    await expect(repository.prepareListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request: { ...request, optionCodes: ['not-an-option'] },
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(repository.prepareListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: randomUUID(),
      request,
    })).rejects.toBeInstanceOf(ConflictException);

    const started = await repository.startListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      executionId: prepared.executionId,
    });
    expect(started).toMatchObject({ status: 'executing', providerOutcome: 'uncertain', maySubmit: true });
    await expect(repository.startListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      executionId: prepared.executionId,
    })).resolves.toMatchObject({ status: 'executing', maySubmit: false, leaseToken: started.leaseToken });

    await expect(repository.reportListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      executionId: prepared.executionId,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'confirmed',
        evidence: {
          channelAccountId: fixture.accountId,
          externalListingId: 'provider-listing-1',
          providerAccountId: 'wrong-vendor',
        },
      },
    })).rejects.toBeInstanceOf(ConflictException);

    const submitted = await repository.reportListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      executionId: prepared.executionId,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'awaiting_approval',
        evidence: { channelAccountId: fixture.accountId, providerAccountId: 'vendor-1' },
      },
    });
    expect(submitted).toMatchObject({ status: 'reconciling', providerOutcome: 'uncertain' });
    expect(submitted.result).toMatchObject({ outcome: 'awaiting_approval' });
    await expect(prisma.channelListing.findUniqueOrThrow({
      where: { id: fixture.listingId! },
      select: { status: true },
    })).resolves.toEqual({ status: null });

    const confirmed = await repository.reportListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      executionId: prepared.executionId,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'confirmed',
        evidence: {
          channelAccountId: fixture.accountId,
          externalListingId: 'provider-listing-1',
          providerAccountId: 'vendor-1',
          observedStatus: '일시품절',
        },
      },
    });
    expect(confirmed).toMatchObject({ status: 'succeeded', providerOutcome: 'succeeded', leaseToken: null });
    expect(confirmed.result).toMatchObject({ outcome: 'confirmed' });
    await expect(prisma.channelListing.findUniqueOrThrow({
      where: { id: fixture.listingId! },
      select: { status: true, salesProductId: true },
    })).resolves.toEqual({ status: '일시품절', salesProductId: fixture.productId });
    await expect(repository.reportListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      executionId: prepared.executionId,
      report: {
        leaseToken: randomUUID(),
        payloadHash: started.payloadHash,
        outcome: 'confirmed',
        evidence: {
          channelAccountId: fixture.accountId,
          externalListingId: 'provider-listing-1',
          providerAccountId: 'vendor-1',
          observedStatus: '판매중',
        },
      },
    })).resolves.toMatchObject({ status: 'succeeded', result: { outcome: 'confirmed' } });
  });

  it.each(['sold_out', 'resume'] as const)('rejects Rocket %s before creating an availability intent', async (kind) => {
    const fixture = await createFixture(prisma, targets, { listing: true, channel: 'rocket' });
    await expect(repository.prepareListingAvailability({ organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID, request: { channelAccountId: fixture.accountId,
        externalListingId: 'provider-listing-1', kind, optionCodes: [], idempotencyKey: `rocket-${kind}` },
    })).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.productRegistrationExecution.count({ where: { channelAccountId: fixture.accountId } })).toBe(0);
  });

  it('requires exact Wing stock reread evidence and preserves whole-listing status for option changes', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true, channel: 'coupang' });
    const prepared = await repository.prepareListingAvailability({
      organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID,
      request: { channelAccountId: fixture.accountId, externalListingId: 'provider-listing-1',
        kind: 'sold_out', optionCodes: [], idempotencyKey: 'wing-availability-1' },
    });
    expect(prepared.payload.optionCodes).toEqual(['provider-option-1']);
    expect(prepared.expectedProviderAccountId).toBe('vendor-1');
    const started = await repository.startListingAvailability({ organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID, executionId: prepared.executionId });
    const report = { leaseToken: started.leaseToken!, payloadHash: started.payloadHash,
      outcome: 'confirmed' as const, evidence: { channelAccountId: fixture.accountId,
        externalListingId: 'provider-listing-1', providerAccountId: 'vendor-1', observedStatus: '품절' } };
    const reportInput = { organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID,
      executionId: prepared.executionId };
    await expect(repository.reportListingAvailability({ ...reportInput, report })).rejects.toBeInstanceOf(ConflictException);
    for (const observations of [
      [{ externalOptionId: 'other-option', stock: 0, registrationType: 'NORMAL' as const }],
      [{ externalOptionId: 'provider-option-1', stock: 1, registrationType: 'NORMAL' as const }],
    ]) {
      await expect(repository.reportListingAvailability({ ...reportInput,
        report: { ...report, evidence: { ...report.evidence, observedOptionStocks: observations } },
      })).rejects.toBeInstanceOf(ConflictException);
    }
    const confirmed = await repository.reportListingAvailability({ ...reportInput,
      report: { ...report, evidence: { ...report.evidence, observedOptionStocks: [
        { externalOptionId: 'provider-option-1', stock: 0, registrationType: 'NORMAL' },
      ] } },
    });
    expect(confirmed).toMatchObject({ status: 'succeeded', result: { observedOptionStocks: [
      { externalOptionId: 'provider-option-1', stock: 0, registrationType: 'NORMAL' },
    ] } });
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: fixture.listingId! },
      select: { status: true } })).toEqual({ status: null });
  });

  it('rejects RFM before intent and rejects provider account drift before a send lease', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true, channel: 'coupang' });
    const input = { organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID,
      request: { channelAccountId: fixture.accountId, externalListingId: 'provider-listing-1',
        kind: 'resume' as const, optionCodes: [], idempotencyKey: 'wing-account-fence' } };
    await prisma.channelListingOption.updateMany({ where: { listingId: fixture.listingId! },
      data: { rawJson: { registrationType: 'RFM' } } });
    await expect(repository.prepareListingAvailability(input)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.productRegistrationExecution.count({ where: { channelAccountId: fixture.accountId } })).toBe(0);
    await prisma.channelListingOption.updateMany({ where: { listingId: fixture.listingId! },
      data: { rawJson: { registrationType: 'NORMAL' } } });
    const prepared = await repository.prepareListingAvailability(input);
    await prisma.channelAccount.update({ where: { id: fixture.accountId }, data: { vendorId: 'another-vendor' } });
    await expect(repository.startListingAvailability({ organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID, executionId: prepared.executionId })).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId },
      select: { status: true, leaseToken: true } })).toEqual({ status: 'prepared', leaseToken: null });
  });

  it('rejects unsupported seller systems and keeps registration-target executions on their own API', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true, channel: 'rocket' });
    await expect(repository.prepareListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request: {
        channelAccountId: fixture.accountId,
        externalListingId: 'provider-listing-1',
        kind: 'sold_out',
        optionCodes: [],
        idempotencyKey: 'listing-unsupported-rocket-1',
      },
    })).rejects.toBeInstanceOf(ConflictException);

    const targetRequest: PrepareTargetExecutionInput = {
      ...requestFor('shared-execution-contract-1'),
      channelListingId: fixture.listingId!,
    };
    const targetExecution = await repository.prepareTarget({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request: targetRequest,
      snapshot: { ...fixture.snapshot, channelListingId: fixture.listingId },
    });
    await expect(repository.prepareListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request: {
        channelAccountId: fixture.accountId,
        externalListingId: 'provider-listing-1',
        kind: 'sold_out',
        optionCodes: [],
        idempotencyKey: targetRequest.idempotencyKey,
      },
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(repository.listListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: fixture.accountId,
      externalListingId: 'provider-listing-1',
    })).resolves.toEqual([]);
    await expect(repository.getTarget({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: targetExecution.executionId,
      requestedByUserId: TEST_USER_ID,
    })).resolves.toMatchObject({ executionId: targetExecution.executionId });
  });

  it('lists only the actor-scoped listing history and caps it at the latest fifty rows', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true, channel: 'kidkids' });
    const request: PrepareListingAvailabilityInput = {
      channelAccountId: fixture.accountId,
      externalListingId: 'provider-listing-1',
      kind: 'sold_out',
      optionCodes: [],
      idempotencyKey: 'listing-history-failed-seed-1',
    };
    const prepared = await repository.prepareListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      request,
    });
    const started = await repository.startListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      executionId: prepared.executionId,
    });
    await repository.reportListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      executionId: prepared.executionId,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'not_submitted',
        evidence: { channelAccountId: fixture.accountId },
      },
    });

    const baseTime = Date.now();
    const payload = prepared.payload as unknown as Prisma.InputJsonValue;
    await prisma.productRegistrationExecution.createMany({
      data: Array.from({ length: 51 }, (_, index) => ({
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId: null,
        channelAccountId: fixture.accountId,
        channelListingId: fixture.listingId,
        executionKind: 'sold_out',
        expectedProviderAccountId: 'vendor-1',
        idempotencyKey: `listing-history-${index}`,
        requestHash: `listing-history-request-${index}`,
        submissionPayloadJson: payload,
        submissionPayloadHash: prepared.payloadHash,
        status: 'succeeded',
        providerOutcome: 'succeeded',
        externalListingId: 'provider-listing-1',
        requestedByUserId: TEST_USER_ID,
        resultJson: { marker: index },
        createdAt: new Date(baseTime + index * 1_000),
      })),
    });

    const history = await repository.listListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: fixture.accountId,
      externalListingId: 'provider-listing-1',
    });
    expect(history).toHaveLength(50);
    expect(history.map((item) => (item.result as { marker: number }).marker))
      .toEqual(Array.from({ length: 50 }, (_, index) => 50 - index));
    await expect(repository.listListingAvailability({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: randomUUID(),
      channelAccountId: fixture.accountId,
      externalListingId: 'provider-listing-1',
    })).resolves.toEqual([]);
    await expect(repository.listListingAvailability({
      organizationId: OTHER_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: fixture.accountId,
      externalListingId: 'provider-listing-1',
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * KID-321: 쿠팡 WING 등록은 따로 선 경로가 아니라 target `register` 실행이다. 준비는 채널 어댑터가
   * 얼리는 몰 사실(adapterPayload)을 담고, 확인은 어댑터의 증거 규칙을 지나며, 몰 상품이 처음 생기면
   * 판매 상품의 콘텐츠 작업공간을 붙이고 셀피아 레시피를 건다.
   */
  describe('mall-neutral register on the target path', () => {
    const WING_LISTING_ID = '1234567890';
    const WING_URL = `https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify?sellerProductId=${WING_LISTING_ID}`;

    /** 판매 상품의 콘텐츠 작업공간 — 상품을 만드는 길이 만들어 두는 것을 여기서 직접 만든다. */
    async function withWorkspace<T extends { productId: string }>(fixture: T): Promise<T> {
      await prisma.$transaction((tx) => realRegistrationContentWorkspace(prisma).ensureSalesProductWorkspace(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID, salesProductId: fixture.productId, displayName: '공통 상품', createdByUserId: null,
      }));
      return fixture;
    }

    async function wingFixture() {
      const fixture = await withWorkspace(await createFixture(prisma, targets, { channel: 'coupang', component: true }));
      const registrationInput = {
        mallCategory: null,
        mallFields: {},
        adapter: { coupang: { wingCategoryKey: '64687', wingProduct: { sellerProductName: 'WING 등록명', variants: [{ maximumBuyForPerson: 3 }] } } },
      };
      const adapterValues = { sellpiaInventorySkuId: fixture.masterProductId, sellpiaQuantity: '2' };
      const request: PrepareTargetExecutionInput = { ...requestFor(`wing-register-${randomUUID()}`), adapterValues };
      const snapshot = { ...fixture.snapshot, registrationInput, adapterValues };
      return { fixture, request, snapshot };
    }

    async function prepareAndStart(request: PrepareTargetExecutionInput, snapshot: TargetExecutionIntent) {
      const prepared = await repository.prepareTarget({ organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, request, snapshot });
      const started = await repository.startTarget({ organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, executionId: prepared.executionId });
      return { prepared, started };
    }

    it('registers on Coupang Wing end to end: freezes the adapter payload, confirms by vendor and Wing URL, attaches content and applies the Sellpia recipe', async () => {
      const { fixture, request, snapshot } = await wingFixture();
      const { prepared, started } = await prepareAndStart(request, snapshot);

      const row = await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } });
      expect(row).toMatchObject({ executionKind: 'register', expectedProviderAccountId: 'vendor-1' });
      expect(row.submissionPayloadJson).toMatchObject({
        adapterPayload: {
          wingProduct: {
            sellerProductName: 'WING 등록명',
            productName: '공통 상품',
            variants: [{ maximumBuyForPerson: 3, vendorItemCode: 'KID00000001' }],
          },
          sellpiaMatch: { sellpiaInventorySkuId: fixture.masterProductId, quantity: 2 },
          existingChannelListing: null,
          vendorItemCode: 'KID00000001',
        },
      });
      // 준비는 대상에 아무것도 쓰지 않는다 — 몰 사실은 실행 payload 에만 있다.
      await expect(prisma.registrationTarget.findUniqueOrThrow({ where: { id: fixture.targetId }, select: { registrationInput: true, version: true } }))
        .resolves.toEqual({ registrationInput: fixture.snapshot.registrationInput, version: 1 });

      const confirmed = await repository.reportTarget({
        organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, executionId: prepared.executionId,
        report: {
          leaseToken: started.leaseToken!, payloadHash: started.payloadHash, outcome: 'confirmed',
          evidence: {
            channelAccountId: fixture.accountId, providerAccountId: 'vendor-1', observedUrl: WING_URL, externalListingId: WING_LISTING_ID,
            options: [{ salesProductOptionId: fixture.optionId, externalOptionId: '88001122', sellerSku: 'KID00000001' }],
          },
        },
      });
      expect(confirmed).toMatchObject({ status: 'succeeded', providerOutcome: 'succeeded' });

      const listing = await prisma.channelListing.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: fixture.accountId, externalId: WING_LISTING_ID },
        select: { id: true, salesProductId: true, options: { select: { id: true, kidItemCode: true, inventoryComponents: { select: { masterProductId: true, quantity: true } } } } },
      });
      expect(listing).toMatchObject({
        salesProductId: fixture.productId,
        options: [{ kidItemCode: 'KID00000001', inventoryComponents: [{ masterProductId: fixture.masterProductId, quantity: 2 }] }],
      });
      await expect(prisma.contentWorkspace.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: fixture.productId, status: 'active', isDeleted: false },
        select: { channelListingId: true },
      })).resolves.toEqual({ channelListingId: listing.id });
    });

    it('refuses Wing confirmation from a foreign vendor, a non-Wing URL or a non-numeric listing id and writes no listing', async () => {
      const { fixture, request, snapshot } = await wingFixture();
      const { prepared, started } = await prepareAndStart(request, snapshot);
      const report = (evidence: Partial<ReportTargetExecutionInput['evidence']>) => repository.reportTarget({
        organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, executionId: prepared.executionId,
        report: {
          leaseToken: started.leaseToken!, payloadHash: started.payloadHash, outcome: 'confirmed',
          evidence: { channelAccountId: fixture.accountId, providerAccountId: 'vendor-1', observedUrl: WING_URL, externalListingId: WING_LISTING_ID, ...evidence },
        },
      });
      await expect(report({ providerAccountId: 'vendor-9' })).rejects.toBeInstanceOf(ConflictException);
      await expect(report({ providerAccountId: undefined })).rejects.toBeInstanceOf(ConflictException);
      await expect(report({ observedUrl: 'https://www.coupang.com/vp/products/1' })).rejects.toBeInstanceOf(ConflictException);
      await expect(report({ externalListingId: 'W-123' })).rejects.toBeInstanceOf(ConflictException);
      expect(await prisma.channelListing.count({ where: { organizationId: TEST_ORGANIZATION_ID, channelAccountId: fixture.accountId } })).toBe(0);
      await expect(prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId }, select: { status: true } }))
        .resolves.toEqual({ status: 'executing' });
    });

    it('replays a Wing register by idempotency key without running the Sellpia preflight again', async () => {
      const { fixture, request, snapshot } = await wingFixture();
      const real = realRegistrationPreflight(prisma, recipes);
      const preflight = vi.fn(real.preflightExternalProductRegistration.bind(real));
      const counted = new RegistrationExecutionRepositoryAdapter(
        prisma as unknown as PrismaService,
        new RegistrationDraftAdapter(realRegistrationContentWorkspace(prisma)),
        channelAdapters({ registration: { preflightExternalProductRegistration: preflight } }),
        recipes,
      );
      const prepared = await counted.prepareTarget({ organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, request, snapshot });
      await expect(counted.prepareTarget({ organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, request, snapshot }))
        .resolves.toMatchObject({ executionId: prepared.executionId, payload: { adapterPayload: { vendorItemCode: 'KID00000001' } } });
      await expect(counted.findTargetReplay({ organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, targetId: fixture.targetId, request }))
        .resolves.toMatchObject({ executionId: prepared.executionId });
      expect(preflight).toHaveBeenCalledTimes(1);
      expect(await prisma.productRegistrationExecution.count({ where: { registrationTargetId: fixture.targetId } })).toBe(1);
    });

    it('freezes an empty adapter payload and the external account id for a generic mall register confirmed by its admin URL', async () => {
      const fixture = await withWorkspace(await createFixture(prisma, targets, { channel: 'kidkids' }));
      const { prepared, started } = await prepareAndStart(requestFor('kidkids-register-1'), fixture.snapshot);
      expect(prepared.payload.adapterPayload).toEqual({});
      expect(prepared.expectedProviderAccountId).toBe('vendor-1');
      await expect(repository.reportTarget({
        organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, executionId: prepared.executionId,
        report: {
          leaseToken: started.leaseToken!, payloadHash: started.payloadHash, outcome: 'confirmed',
          evidence: { channelAccountId: fixture.accountId, providerAccountId: 'vendor-1', observedUrl: 'https://partner.kidkids.net/goods/kk-1', externalListingId: 'kk-1' },
        },
      })).resolves.toMatchObject({ status: 'succeeded' });
      const listing = await prisma.channelListing.findFirstOrThrow({ where: { channelAccountId: fixture.accountId, externalId: 'kk-1' }, select: { id: true } });
      await expect(prisma.contentWorkspace.findFirstOrThrow({ where: { salesProductId: fixture.productId }, select: { channelListingId: true } }))
        .resolves.toEqual({ channelListingId: listing.id });
    });

    it('keeps the content workspace on its first listing when the same product is registered on a second mall', async () => {
      const first = await withWorkspace(await createFixture(prisma, targets, { channel: 'kidkids' }));
      const confirm = async (accountId: string, executionId: string, lease: string, hash: string, externalListingId: string, origin: string) =>
        repository.reportTarget({
          organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID, executionId,
          report: { leaseToken: lease, payloadHash: hash, outcome: 'confirmed',
            evidence: { channelAccountId: accountId, providerAccountId: 'vendor-1', observedUrl: `${origin}/goods/${externalListingId}`, externalListingId } },
        });
      const one = await prepareAndStart(requestFor('first-mall-1'), first.snapshot);
      await confirm(first.accountId, one.prepared.executionId, one.started.leaseToken!, one.started.payloadHash, 'kk-1', 'https://partner.kidkids.net');
      const firstListing = await prisma.channelListing.findFirstOrThrow({ where: { externalId: 'kk-1' }, select: { id: true } });

      const secondAccount = await prisma.channelAccount.create({ data: { organizationId: TEST_ORGANIZATION_ID, channel: 'smartstore', name: 'second mall', externalAccountId: 'vendor-1', status: 'active' } });
      const secondTarget = await targets.create(TEST_ORGANIZATION_ID, {
        salesProductId: first.productId, channelAccountId: secondAccount.id,
        registrationInput: first.snapshot.registrationInput as RegistrationMallInput,
        selectedOptions: [{ salesProductOptionId: first.optionId }],
      });
      const two = await prepareAndStart(requestFor('second-mall-1'), { ...first.snapshot, targetId: secondTarget, channelAccountId: secondAccount.id });
      await expect(confirm(secondAccount.id, two.prepared.executionId, two.started.leaseToken!, two.started.payloadHash, 'ss-1', 'https://sell.smartstore.naver.com'))
        .resolves.toMatchObject({ status: 'succeeded' });
      await expect(prisma.contentWorkspace.findFirstOrThrow({ where: { salesProductId: first.productId }, select: { channelListingId: true } }))
        .resolves.toEqual({ channelListingId: firstListing.id });
    });

    it('freezes the detail page only for register and composition change', async () => {
      const fixture = await createFixture(prisma, targets, { listing: true });
      const detailPage = { revisionId: randomUUID(), html: '<p>상세</p>' };
      const prepared = await repository.prepareTarget({
        organizationId: TEST_ORGANIZATION_ID, requestedByUserId: TEST_USER_ID,
        request: { ...requestFor('update-no-detail-1'), kind: 'update', channelListingId: fixture.listingId!, updateFields: ['salePrice'] },
        snapshot: { ...fixture.snapshot, kind: 'update', channelListingId: fixture.listingId, updateFields: ['salePrice'], detailPage },
      });
      expect(prepared.payload.detailPage).toBeNull();
      await expect(prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId }, select: { submissionPayloadJson: true } }))
        .resolves.toMatchObject({ submissionPayloadJson: { detailPage: null } });
    });
  });
});

function requestFor(idempotencyKey: string): PrepareTargetExecutionInput {
  return {
    expectedVersion: 1,
    kind: 'register',
    idempotencyKey,
    applyCompositionTemplate: false,
    optionTransitions: [],
  };
}

async function createFixture(
  prisma: PrismaClient,
  targets: RegistrationTargetRepositoryAdapter,
  input: {
    listing?: boolean;
    component?: boolean;
    channel?: string;
    existingOptionLink?: boolean;
    providerIdentity?: string | null;
  } = {},
) {
  const accountId = randomUUID();
  const productId = randomUUID();
  const optionId = randomUUID();
  const listingId = input.listing ? randomUUID() : null;
  const listingOptionId = input.listing ? randomUUID() : null;
  const masterProductId = randomUUID();
  await prisma.channelAccount.create({
    data: {
      id: accountId,
      organizationId: TEST_ORGANIZATION_ID,
      channel: input.channel ?? 'smartstore',
      name: `${input.channel ?? 'smartstore'} test account`,
      externalAccountId: input.providerIdentity === null ? null : 'vendor-1',
      vendorId: input.providerIdentity === null ? null : (input.providerIdentity ?? 'vendor-1'),
      status: 'active',
    },
  });
  await prisma.salesProduct.create({
    data: {
      id: productId,
      organizationId: TEST_ORGANIZATION_ID,
      code: `SP-${productId.slice(0, 8)}`,
      status: 'active',
      name: '공통 상품',
      version: 1,
    },
  });
  await prisma.salesProductOption.create({
    data: {
      id: optionId,
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: productId,
      optionCode: 'KID00000001',
      optionKey: '파랑',
      values: ['파랑'],
      salePrice: 3_000,
      normalPrice: 5_000,
      supplyStatus: 'selling',
      sortOrder: 0,
    },
  });
  if (input.component) {
    await seedSourceProduct(prisma, {
      id: masterProductId,
      organizationId: TEST_ORGANIZATION_ID,
      code: `SOURCE-${productId.slice(0, 8)}`,
      name: '원천 상품',
      currentStock: 10,
    });
    await prisma.salesProductOptionComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductOptionId: optionId,
        masterProductId,
        quantity: 1,
      },
    });
  }
  if (listingId && listingOptionId) {
    await prisma.channelListing.create({
      data: {
        id: listingId,
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: accountId,
        salesProductId: productId,
        externalId: 'provider-listing-1',
        channelName: input.channel ?? 'smartstore',
        isActive: true,
      },
    });
    await prisma.channelListingOption.create({
      data: {
        id: listingOptionId,
        organizationId: TEST_ORGANIZATION_ID,
        listingId,
        externalOptionId: 'provider-option-1',
        ...(input.existingOptionLink !== false ? { salesProductOptionId: optionId } : {}),
        sellerSku: 'EXISTING-SKU',
        isActive: true,
      },
    });
  }
  const target = await targets.create(TEST_ORGANIZATION_ID, {
    salesProductId: productId,
    channelAccountId: accountId,
    registrationInput: { mallCategory: { key: 'category-1', label: null }, mallFields: {}, adapter: {} },
    selectedOptions: [{ salesProductOptionId: optionId }],
  });
  const timestamp = new Date().toISOString();
  const snapshot: TargetExecutionIntent = {
    targetId: target,
    targetVersion: 1,
    channelAccountId: accountId,
    kind: 'register',
    channelListingId: listingId,
    applyCompositionTemplate: false,
    product: {
      id: productId,
      code: `SP-${productId.slice(0, 8)}`,
      ownCode: null,
      sabangnetGoodsNo: null,
      sourcePlatform: null,
      sourceUrl: null,
      description: '',
      targetAudience: null,
      ageGroup: null,
      productSize: null,
      colorVariantNames: [],
      boxSetQuantity: null,
      registrationDefaults: null,
      kcStatus: 'unknown' as const,
      sourceRecordId: null,
      name: '공통 상품',
      shortName: null,
      englishName: null,
      printName: null,
      modelName: null,
      modelNo: null,
      brand: null,
      manufacturer: null,
      originCountry: null,
      originRegion: null,
      keywords: [],
      standardCategory: null,
      status: 'active',
      taxType: 'taxable',
      deliveryFeeType: null,
      deliveryFee: null,
      optionAxes: ['색상'],
      stockManaged: false,
      imageUrls: [],
      noticeCategory: null,
      noticeValues: [],
      certifications: [],
      importDeclarationNo: null,
      adminMemo: null,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      options: [{
        id: optionId,
        optionCode: 'KID00000001',
        values: ['파랑'],
        optionKey: '파랑',
        alias: null,
        barcode: null,
        salePrice: 3_000,
        normalPrice: 5_000,
        supplyStatus: 'selling',
        safetyStock: null,
        sortOrder: 0,
        referenceCost: null,
        components: input.component ? [{
          masterProductId,
          sellpiaCode: 'SELLPIA-1',
          name: '원천 상품',
          optionName: '파랑',
          quantity: 1,
          currentStock: 10,
        }] : [],
        linkedChannelOptionCount: input.listing ? 1 : 0,
      }],
      channelOverrides: [],
      channelListings: [],
    },
    detailPage: null,
    registrationInput: { mallCategory: { key: 'category-1', label: null }, mallFields: {}, adapter: {} },
  };
  return {
    accountId,
    productId,
    optionId,
    targetId: target,
    listingId,
    listingOptionId,
    masterProductId,
    snapshot,
  };
}

async function addSecondSelectedOption(
  prisma: PrismaClient,
  targets: RegistrationTargetRepositoryAdapter,
  fixture: Awaited<ReturnType<typeof createFixture>>,
) {
  const secondOptionId = randomUUID();
  await prisma.salesProductOption.create({
    data: {
      id: secondOptionId,
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: fixture.productId,
      optionCode: 'KID00000002',
      optionKey: '초록',
      values: ['초록'],
      salePrice: 4_000,
      normalPrice: 6_000,
      supplyStatus: 'selling',
      sortOrder: 1,
    },
  });
  await targets.update(TEST_ORGANIZATION_ID, fixture.targetId, {
    expectedVersion: 1,
    registrationInput: fixture.snapshot.registrationInput as RegistrationMallInput,
    selectedThumbnailAssetId: null,
    selectedDetailPageRevisionId: null,
    selectedOptions: [{ salesProductOptionId: fixture.optionId }, { salesProductOptionId: secondOptionId }],
  });
  const firstOption = fixture.snapshot.product.options[0];
  const secondOption = {
    ...firstOption,
    id: secondOptionId,
    optionCode: 'KID00000002',
    optionKey: '초록',
    values: ['초록'],
    components: [],
    referenceCost: null,
        linkedChannelOptionCount: 0,
  };
  return {
    ...fixture,
    secondOptionId,
    snapshot: {
      ...fixture.snapshot,
      targetVersion: 2,
      product: {
        ...fixture.snapshot.product,
        options: [firstOption, secondOption],
      },
    },
  };
}

async function readGeneration(prisma: PrismaClient): Promise<bigint> {
  const state = await prisma.masterProductAbcFormulaState.findUnique({
    where: { organizationId: TEST_ORGANIZATION_ID },
    select: { mappingGeneration: true },
  });
  return state?.mappingGeneration ?? 0n;
}

function readChannelOptions(prisma: PrismaClient, ids: readonly string[]) {
  return prisma.channelListingOption.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true, externalOptionId: true, salesProductOptionId: true, kidItemCode: true,
      inventoryComponents: { select: { masterProductId: true, quantity: true }, orderBy: { masterProductId: 'asc' } },
    },
    orderBy: { id: 'asc' },
  });
}

/**
 * One listing with two linked channel options whose confirmed recipes move to two
 * new SalesProductOptions (quantities 3 and 4) through one composition change.
 */
async function prepareTwoOptionCompositionChange(
  prisma: PrismaClient,
  targets: RegistrationTargetRepositoryAdapter,
  repository: RegistrationExecutionRepositoryAdapter,
  input: { unissuedSecondCode?: boolean } = {},
) {
  const fixture = await createFixture(prisma, targets, { listing: true, component: true });
  const firstChannelOptionId = fixture.listingOptionId!;
  const oldSecondId = randomUUID();
  const secondChannelOptionId = randomUUID();
  const newIds = [randomUUID(), randomUUID()] as const;
  const newCodes = ['KID00000003', input.unissuedSecondCode ? null : 'KID00000004'] as const;
  await prisma.salesProductOption.create({
    data: {
      id: oldSecondId, organizationId: TEST_ORGANIZATION_ID, salesProductId: fixture.productId,
      optionCode: 'KID00000002', optionKey: '빨강', values: ['빨강'], salePrice: 3_000, normalPrice: 5_000,
      supplyStatus: 'selling', sortOrder: 1,
      components: { create: { masterProductId: fixture.masterProductId, quantity: 2 } },
    },
  });
  await prisma.channelListingOption.update({ where: { id: firstChannelOptionId }, data: { kidItemCode: 'KID00000001' } });
  await prisma.channelListingOption.create({
    data: {
      id: secondChannelOptionId, organizationId: TEST_ORGANIZATION_ID, listingId: fixture.listingId!,
      externalOptionId: 'provider-option-2', salesProductOptionId: oldSecondId, kidItemCode: 'KID00000002', isActive: true,
    },
  });
  await prisma.channelListingOptionInventoryComponent.createMany({
    data: [
      { organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: firstChannelOptionId, masterProductId: fixture.masterProductId, quantity: 1 },
      { organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: secondChannelOptionId, masterProductId: fixture.masterProductId, quantity: 2 },
    ],
  });
  for (const [index, id] of newIds.entries()) {
    await prisma.salesProductOption.create({
      data: {
        id, organizationId: TEST_ORGANIZATION_ID, salesProductId: fixture.productId,
        optionCode: newCodes[index], optionKey: `새 구성 ${index}`, values: [`새 구성 ${index}`],
        salePrice: 3_000, normalPrice: 5_000, supplyStatus: 'selling', sortOrder: 2 + index,
        components: { create: { masterProductId: fixture.masterProductId, quantity: 3 + index } },
      },
    });
  }
  await targets.update(TEST_ORGANIZATION_ID, fixture.targetId, {
    expectedVersion: 1,
    registrationInput: fixture.snapshot.registrationInput as RegistrationMallInput,
    selectedThumbnailAssetId: null,
    selectedDetailPageRevisionId: null,
    selectedOptions: newIds.map(salesProductOptionId => ({ salesProductOptionId })),
  });
  const template = fixture.snapshot.product.options[0];
  const optionTransitions = [
    { channelListingOptionId: firstChannelOptionId, salesProductOptionId: newIds[0] },
    { channelListingOptionId: secondChannelOptionId, salesProductOptionId: newIds[1] },
  ];
  const snapshot: TargetExecutionIntent = {
    ...fixture.snapshot,
    targetVersion: 2,
    kind: 'composition_change',
    channelListingId: fixture.listingId,
    optionTransitions,
    product: {
      ...fixture.snapshot.product,
      options: newIds.map((id, index) => ({
        ...template,
        id,
        optionCode: newCodes[index],
        optionKey: `새 구성 ${index}`,
        values: [`새 구성 ${index}`],
        sortOrder: 2 + index,
        components: [{ ...template.components[0]!, quantity: 3 + index }],
      })),
    },
  };
  const prepared = await repository.prepareTarget({
    organizationId: TEST_ORGANIZATION_ID,
    requestedByUserId: TEST_USER_ID,
    request: { ...requestFor(`two-option-composition-${randomUUID()}`), expectedVersion: 2, kind: 'composition_change', channelListingId: fixture.listingId!, optionTransitions },
    snapshot,
  });
  const started = await repository.startTarget({
    organizationId: TEST_ORGANIZATION_ID, executionId: prepared.executionId, requestedByUserId: TEST_USER_ID,
  });
  return {
    masterProductId: fixture.masterProductId,
    channelOptionIds: [firstChannelOptionId, secondChannelOptionId],
    oldOptionIds: [fixture.optionId, oldSecondId],
    newOptionIds: newIds,
    confirmedReport: () => ({
      organizationId: TEST_ORGANIZATION_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      report: {
        leaseToken: started.leaseToken!,
        payloadHash: started.payloadHash,
        outcome: 'confirmed' as const,
        evidence: {
          channelAccountId: fixture.accountId,
          externalListingId: 'provider-listing-1',
          providerAccountId: 'vendor-1',
          options: [
            { salesProductOptionId: newIds[0], externalOptionId: 'provider-option-1' },
            { salesProductOptionId: newIds[1], externalOptionId: 'provider-option-2' },
          ],
        },
      },
    }),
  };
}
