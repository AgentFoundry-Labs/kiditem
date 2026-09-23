import { productTransactionalRead } from './product-transactional-read.fake';
import { RegistrationTargetRepositoryAdapter } from '../adapter/out/persistence/registration-target.repository.adapter';
import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { RegistrationExecutionRepositoryAdapter } from '../adapter/out/repository/registration-execution.repository.adapter';
import { hashRegistrationSubmissionPayload } from '../domain/registration/registration-submission-payload';
import { RegistrationDraftAdapter } from '../adapter/out/persistence/registration-draft.adapter';
import { REGISTRATION_EXECUTION_LEASE_MS } from '../domain/registration/registration-execution-state';
import { ownerTransaction, ownerTransactionClient } from '../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../common/owner-transaction';
import type { PrismaService } from '../../prisma/prisma.service';

const channelIntegrity = new ChannelIntegrityAdapter();

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const BUNDLE_MASTER_PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const SALES_PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const SALES_PRODUCT_OPTION_ID = '55555555-5555-4555-8555-555555555555';
/** 직접 작성한 판매상품 — 원천 기록(후보)이 없다. */
const DIRECT_SALES_PRODUCT_ID = '66666666-6666-4666-8666-666666666666';
const DIRECT_SALES_PRODUCT_OPTION_ID = '77777777-7777-4777-8777-777777777777';

describe('registration execution fence (PG integration)', () => {
  let prisma: PrismaClient;
  let targets: RegistrationTargetRepositoryAdapter;
  /** 동결 시 선택값이 정본으로 바뀌는 것을 재는 테스트만 켠다. */
  let canonicalThumbnailUrl: string | null = null;
  let repository: RegistrationExecutionRepositoryAdapter;
  let candidateId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    // 울타리는 실행 행만 쓰고 설정은 설정 어댑터를 통해 만진다(ADR-0014).
    // 실제 두 어댑터를 그대로 엮어야 한 트랜잭션 계약이 여기서 검증된다.
    repository = new RegistrationExecutionRepositoryAdapter(
      prisma as unknown as PrismaService,
      new RegistrationDraftAdapter(workspaceFake(), thumbnailSourceFake()),
    );
    targets = new RegistrationTargetRepositoryAdapter(
      prisma as unknown as PrismaService,
      productTransactionalRead(),
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    canonicalThumbnailUrl = null;
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({
      data: [ACCOUNT_ID, SECOND_ACCOUNT_ID].map((id, index) => ({
        id,
        organizationId: TEST_ORGANIZATION_ID,
        channel: index === 0 ? 'coupang' : 'rocket',
        externalAccountId: `account-${index}`,
        name: `Account ${index}`,
        status: 'active',
      })),
    });
    candidateId = (await prisma.sourceRecord.create({
      data: { sourceIdentityHash: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://1688.com/item/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: 'Kids rain boots',
      },
    })).id;
    await prisma.salesProduct.create({
      data: {
        id: SALES_PRODUCT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        sourceRecordId: candidateId,
        code: 'CANDIDATE-REGISTRATION-FENCE',
        status: 'active',
        name: 'Kids rain boots',
      },
    });
    await prisma.salesProductOption.create({
      data: {
        id: SALES_PRODUCT_OPTION_ID,
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: SALES_PRODUCT_ID,
        optionCode: 'KID-FENCE-0001',
        optionKey: '단일',
        values: [],
        salePrice: 12900,
        normalPrice: 15900,
        supplyStatus: 'selling',
        sortOrder: 0,
      },
    });
  });

  /**
   * 두 게이트가 사는 자리.
   *
   * 보관한 상품에는 등록 설정을 만들지 않고, 판매가를 정하지 않은 초안은 설정이 있어도 제출
   * 동결에서 막는다 — 초안은 설정을 만들어 두고 값을 채워 가는 것이 정상이라 설정 생성에
   * 가격을 요구하지 않는다(KID-310 · ADR-0022).
   */
  it('refuses a target on an archived product, and freezes only a priced draft', async () => {
    await prisma.salesProduct.update({
      where: { id: SALES_PRODUCT_ID },
      data: { status: 'archived' },
    });
    await expect(createTarget(ACCOUNT_ID)).rejects.toThrow('보관된 판매상품');

    await prisma.salesProduct.update({
      where: { id: SALES_PRODUCT_ID },
      data: { status: 'active' },
    });
    await prisma.salesProductOption.update({
      where: { id: SALES_PRODUCT_OPTION_ID },
      data: { salePrice: null },
    });
    await expect(repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    })).rejects.toThrow('아직 판매가를 정하지 않은');
  });

  /**
   * 등록 설정을 만드는 문은 `channels/registration-targets` 하나다(KID-310 · ADR-0022).
   * 제출 동결이 설정을 대신 만들면 그 자리에서 KID 발급을 건너뛰어, 코드 없는 상품이 몰로 나간다.
   */
  it('refuses to freeze a product with no registration setting and issues its KID when one is made', async () => {
    await prisma.salesProduct.update({ where: { id: SALES_PRODUCT_ID }, data: { code: null, status: 'draft' } });
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    };
    await expect(repository.prepare(input)).rejects.toThrow('등록 설정');
    expect(await prisma.registrationTarget.count({ where: { salesProductId: SALES_PRODUCT_ID } })).toBe(0);

    await createTarget(ACCOUNT_ID);
    await expect(repository.prepare(input)).resolves.toMatchObject({ status: 'prepared' });
    const product = await prisma.salesProduct.findUniqueOrThrow({ where: { id: SALES_PRODUCT_ID } });
    expect(product.code).toMatch(/^KID[0-9]{8}$/);
  });

  it('returns one draft under concurrent same-account creation', async () => {
    const [left, right] = await Promise.all([
      createTarget(ACCOUNT_ID),
      createTarget(ACCOUNT_ID),
    ]);

    expect(left.preparationId).toBe(right.preparationId);
    expect(await prisma.registrationTarget.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: SALES_PRODUCT_ID },
    })).toBe(1);
  });

  it('keeps independent active drafts for separate channel accounts', async () => {
    const first = await createTarget(ACCOUNT_ID);

    const second = await createTarget(SECOND_ACCOUNT_ID);

    expect(second.preparationId).not.toBe(first.preparationId);
    expect(await prisma.registrationTarget.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: SALES_PRODUCT_ID,
        archivedAt: null,
      },
    })).toBe(2);
  });

  it('durably prepares, starts, reconciles, and finalizes one external WING execution', async () => {
    await createTarget(ACCOUNT_ID);
    const idempotencyKey = randomUUID();
    const prepared = await repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey,
    });
    expect(prepared).toMatchObject({
      status: 'prepared', providerOutcome: 'not_attempted', expectedProviderAccountId: 'account-0',
    });
    const replay = await repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey,
    });
    expect(replay.executionId).toBe(prepared.executionId);
    await expect(repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Changed name',
      registrationInput: { wingProduct: { productName: 'Changed name' } },
      idempotencyKey,
    })).rejects.toBeInstanceOf(ConflictException);

    const started = await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    expect(started).toMatchObject({ status: 'executing', providerOutcome: 'uncertain' });
    expect((await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    })).executionId).toBe(prepared.executionId);
    await expect(repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })).rejects.toBeInstanceOf(ConflictException);

    const unresolved = await repository.markUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      evidence: { reason: 'browser_timeout' },
    });
    expect(unresolved).toMatchObject({ status: 'reconciling', providerOutcome: 'uncertain' });

    const frozen = await repository.loadFrozenSubmission(
      TEST_ORGANIZATION_ID,
      prepared.preparationId,
      prepared.executionId,
    );
    expect(frozen.executionId).toBe(prepared.executionId);
    expect(frozen.preparationId).toBe(prepared.preparationId);
    const frozenRow = await prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: {
        registrationTargetId: true,
        channelAccountId: true,
        submissionPayloadJson: true,
        submissionPayloadHash: true,
        leaseToken: true,
      },
    });
    expect(frozenRow).toMatchObject({
      registrationTargetId: prepared.preparationId,
      channelAccountId: ACCOUNT_ID,
    });
    await repository.recordProviderResult(
      TEST_ORGANIZATION_ID, prepared.preparationId, frozen.submissionLeaseToken!,
      { externalListingId: '427011919', channel: 'coupang', rawResult: { source: 'wing' } },
      prepared.executionId,
    );
    const completed = await repository.finalizeRegistered(
      TEST_ORGANIZATION_ID, prepared.preparationId, frozen.submissionLeaseToken!,
      async (opaqueTx) => ({ listingId: await createListingBranch(tx(opaqueTx), '427011919') }),
      prepared.executionId,
    );
    expect(completed.status).toBe('registered');
    await expect(repository.get({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    })).resolves.toMatchObject({ status: 'succeeded', listingId: completed.listingId });
  });

  it('runs the same fence for a directly authored product that has no source record', async () => {
    await createDirectlyAuthoredProduct();
    await createTarget(ACCOUNT_ID, DIRECT_SALES_PRODUCT_ID);

    const prepared = await repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: DIRECT_SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Direct rain boots',
      registrationInput: { wingProduct: { productName: 'Direct rain boots' } },
      idempotencyKey: randomUUID(),
    });
    expect(prepared).toMatchObject({ status: 'prepared', providerOutcome: 'not_attempted' });
    expect(await prisma.registrationTarget.findUniqueOrThrow({
      where: { id: prepared.preparationId },
      select: { salesProductId: true, channelAccountId: true },
    })).toEqual({ salesProductId: DIRECT_SALES_PRODUCT_ID, channelAccountId: ACCOUNT_ID });

    await expect(repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: DIRECT_SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    })).resolves.toMatchObject({ status: 'executing', providerOutcome: 'uncertain' });

    const frozen = await repository.loadFrozenSubmission(
      TEST_ORGANIZATION_ID, prepared.preparationId, prepared.executionId,
    );
    expect(frozen).toMatchObject({
      salesProductId: DIRECT_SALES_PRODUCT_ID,
      sourceRecordId: null,
    });

    await repository.recordProviderResult(
      TEST_ORGANIZATION_ID, prepared.preparationId, frozen.submissionLeaseToken!,
      { externalListingId: '427011920', channel: 'coupang', rawResult: { source: 'wing' } },
      prepared.executionId,
    );
    await expect(repository.finalizeRegistered(
      TEST_ORGANIZATION_ID, prepared.preparationId, frozen.submissionLeaseToken!,
      async (opaqueTx) => ({
        listingId: await createListingBranch(tx(opaqueTx), '427011920', DIRECT_SALES_PRODUCT_ID),
      }),
      prepared.executionId,
    )).resolves.toMatchObject({ status: 'registered' });
  });

  it('keeps the source record as execution provenance and refuses a new registration once the product is archived', async () => {
    await createTarget(ACCOUNT_ID);
    const prepared = await repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    });

    await prisma.salesProduct.update({
      where: { id: SALES_PRODUCT_ID },
      data: { status: 'archived' },
    });

    // 이미 남은 실행의 출처 표시는 그대로다.
    await expect(repository.loadFrozenSubmission(
      TEST_ORGANIZATION_ID, prepared.preparationId, prepared.executionId,
    )).resolves.toMatchObject({
      salesProductId: SALES_PRODUCT_ID,
      sourceRecordId: candidateId,
    });

    // 보관한 상품으로 새 준비를 열지는 않는다(KID-313).
    await expect(repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: SECOND_ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not downgrade provider success when an unresolved report was waiting on the execution lock', async () => {
    await createTarget(ACCOUNT_ID);
    const prepared = await repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    });
    await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });

    let releaseSuccessWriter!: () => void;
    let reportExecutionLocked!: () => void;
    const successWriterRelease = new Promise<void>((resolve) => {
      releaseSuccessWriter = resolve;
    });
    const executionLocked = new Promise<void>((resolve) => {
      reportExecutionLocked = resolve;
    });
    const successWriter = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT id
        FROM product_registration_executions
        WHERE id = ${prepared.executionId}::uuid
          AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `);
      reportExecutionLocked();
      await successWriterRelease;
      await transaction.productRegistrationExecution.update({
        where: { id: prepared.executionId },
        data: {
          status: 'executing',
          providerOutcome: 'succeeded',
          providerSubmissionId: '427011919',
          externalListingId: '427011919',
          resultJson: { source: 'wing' },
        },
      });
    });
    await executionLocked;

    const unresolved = repository.markUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      evidence: { reason: 'late_browser_timeout' },
    });
    const observation = await Promise.race([
      unresolved.then(() => 'settled' as const, () => 'settled' as const),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);
    expect(observation).toBe('blocked');

    releaseSuccessWriter();
    await successWriter;
    await expect(unresolved).resolves.toMatchObject({
      status: 'executing',
      providerOutcome: 'succeeded',
    });
    await expect(repository.get({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    })).resolves.toMatchObject({
      status: 'executing',
      providerOutcome: 'succeeded',
      listingId: null,
    });
  });

  it('replays a concurrent same-hash external preparation after the candidate lock', async () => {
    await createTarget(ACCOUNT_ID);
    const idempotencyKey = randomUUID();
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey,
    };
    const [left, right] = await Promise.all([
      repository.prepare(input),
      repository.prepare(input),
    ]);
    expect(left.executionId).toBe(right.executionId);
    expect(await prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, idempotencyKey },
    })).toBe(1);
  });

  it('resumes the same prepared manual execution after the browser page is reopened', async () => {
    await createTarget(ACCOUNT_ID);
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
    };
    const prepared = await repository.prepare({
      ...base,
      idempotencyKey: randomUUID(),
    });

    const resumed = await repository.prepare({
      ...base,
      idempotencyKey: randomUUID(),
    });

    expect(resumed.executionId).toBe(prepared.executionId);
    expect(await prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, registrationTargetId: prepared.preparationId },
    })).toBe(1);
  });

  it('allocates a bundle KID in the candidate-locked transaction and freezes its full payload hash', async () => {
    await createTarget(ACCOUNT_ID);
    const input = createExternalRegistrationInput(randomUUID(), { quantity: 2 });
    const prepared = await repository.prepare(input);
    if (!prepared.kidItemCode) throw new Error('bundle preparation did not return an assigned KID');

    const execution = await prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: {
        requestHash: true,
        submissionPayloadHash: true,
        submissionPayloadJson: true,
      },
    });
    const payload = execution.submissionPayloadJson as {
      registrationInput: {
        kidItemCode: string;
        sellpiaMatch: { code: string };
        wingProduct: { variants: Array<{ vendorItemCode: string }> };
      };
    };

    expect(prepared.kidItemCode).toMatch(/^KID[0-9]{8}$/);
    expect(payload.registrationInput.sellpiaMatch.code).toBe('KID00000001');
    expect(payload.registrationInput.kidItemCode).toBe(prepared.kidItemCode);
    expect(payload.registrationInput.wingProduct.variants[0]?.vendorItemCode)
      .toBe(prepared.kidItemCode);
    expect(execution.requestHash).toBe(execution.submissionPayloadHash);
    expect(execution.requestHash).toBe(hashRegistrationSubmissionPayload(payload, channelIntegrity.sha256));
    expect(prepared.requestHash).toBe(execution.requestHash);
  });

  it('replays a bundle preparation by key and rejects a changed request under that key', async () => {
    await createTarget(ACCOUNT_ID);
    const idempotencyKey = randomUUID();
    const input = createExternalRegistrationInput(idempotencyKey, { quantity: 2 });
    const first = await repository.prepare(input);
    const replay = await repository.prepare(input);

    expect(replay).toMatchObject({
      executionId: first.executionId,
      preparationId: first.preparationId,
      kidItemCode: first.kidItemCode,
      requestHash: first.requestHash,
    });

    await expect(repository.prepare({
      ...input,
      displayName: 'Changed bundle request',
      registrationInput: {
        ...input.registrationInput,
        wingProduct: { productName: 'Changed bundle request', variants: [{ vendorItemCode: 'KID00000001' }] },
      },
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('serializes concurrent bundle preparations with distinct keys and reuses one assigned KID', async () => {
    await createTarget(ACCOUNT_ID);
    const firstInput = createExternalRegistrationInput(randomUUID(), { quantity: 2 });
    const secondInput = createExternalRegistrationInput(randomUUID(), { quantity: 2 });
    const [first, second] = await Promise.all([
      repository.prepare(firstInput),
      repository.prepare(secondInput),
    ]);

    expect(second.executionId).toBe(first.executionId);
    expect(second.preparationId).toBe(first.preparationId);
    expect(second.kidItemCode).toBe(first.kidItemCode);
    expect(await prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, registrationTargetId: first.preparationId },
    })).toBe(1);
  });

  it('resumes a prepared bundle under a new key without changing its assigned KID', async () => {
    await createTarget(ACCOUNT_ID);
    const first = await repository.prepare(createExternalRegistrationInput(randomUUID(), { quantity: 2 }));
    const resumed = await repository.prepare(createExternalRegistrationInput(randomUUID(), { quantity: 2 }));

    expect(resumed).toMatchObject({
      executionId: first.executionId,
      preparationId: first.preparationId,
      kidItemCode: first.kidItemCode,
      requestHash: first.requestHash,
    });
    expect(await prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, registrationTargetId: first.preparationId },
    })).toBe(1);
  });

  it('reuses the bundle KID after a definitive pre-provider failure', async () => {
    await createTarget(ACCOUNT_ID);
    const sourceInput = createExternalRegistrationInput(randomUUID(), { quantity: 2 });
    const first = await repository.prepare(sourceInput);
    const firstFrozen = await repository.loadFrozenSubmission(
      TEST_ORGANIZATION_ID,
      first.preparationId,
      first.executionId,
    );
    expect(firstFrozen.executionId).toBe(first.executionId);
    expect(firstFrozen.submissionPayloadJson).toMatchObject({
      registrationInput: { kidItemCode: first.kidItemCode },
    });
    await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: first.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    await repository.markNotSubmitted({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: first.executionId,
      requestedByUserId: TEST_USER_ID,
      evidence: { reason: 'extension_failed_before_provider_submission' },
    });

    const retry = await repository.prepare({
      ...sourceInput,
      idempotencyKey: randomUUID(),
    });

    expect(retry.executionId).not.toBe(first.executionId);
    expect(retry.preparationId).toBe(first.preparationId);
    expect(retry.kidItemCode).toBe(first.kidItemCode);
    const retryFrozen = await repository.loadFrozenSubmission(
      TEST_ORGANIZATION_ID,
      retry.preparationId,
      retry.executionId,
    );
    expect(retryFrozen.executionId).toBe(retry.executionId);
    expect(retryFrozen.submissionPayloadJson).toMatchObject({
      registrationInput: { kidItemCode: retry.kidItemCode },
    });
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: first.executionId },
      select: { status: true, providerOutcome: true },
    })).resolves.toEqual({ status: 'failed', providerOutcome: 'definitive_failure' });
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: retry.executionId },
      select: { status: true, providerOutcome: true },
    })).resolves.toEqual({ status: 'prepared', providerOutcome: 'not_attempted' });
  });

  it('uses the source Master KID for a singleton instead of allocating a bundle code', async () => {
    await createTarget(ACCOUNT_ID);
    const sourceCode = 'KID00000007';
    const prepared = await repository.prepare(createExternalRegistrationInput(randomUUID(), {
      quantity: 1,
      sourceCode,
    }));
    if (!prepared.kidItemCode) throw new Error('singleton preparation did not return a KID');

    const execution = await prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: { submissionPayloadJson: true },
    });
    const payload = execution.submissionPayloadJson as {
      registrationInput: {
        kidItemCode: string;
        sellpiaMatch: { code: string };
        wingProduct: { variants: Array<{ vendorItemCode: string }> };
      };
    };
    expect(prepared.kidItemCode).toBe(sourceCode);
    expect(payload.registrationInput.kidItemCode).toBe(sourceCode);
    expect(payload.registrationInput.sellpiaMatch.code).toBe(sourceCode);
    expect(payload.registrationInput.wingProduct.variants[0]?.vendorItemCode).toBe(sourceCode);
  });

  it('rolls back a failed bundle allocation without leaving an execution or preparation', async () => {
    const failingDrafts = new RegistrationDraftAdapter(
      workspaceFake(), thumbnailSourceFake(),
    );
    vi.spyOn(failingDrafts, 'freezeForSubmission').mockRejectedValueOnce(
      new Error('forced transaction rollback after allocation'),
    );
    const failingRepository = new RegistrationExecutionRepositoryAdapter(
      prisma as unknown as PrismaService,
      failingDrafts,
    );
    await createTarget(ACCOUNT_ID);
    const input = createExternalRegistrationInput(randomUUID(), { quantity: 2 });

    await expect(failingRepository.prepare(input)).rejects.toThrow(
      'forced transaction rollback after allocation',
    );
    expect(await prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(0);
    // 설정은 이 트랜잭션이 만든 것이 아니라 그대로 남고, 실행만 사라진다.
    expect(await prisma.registrationTarget.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: SALES_PRODUCT_ID },
    })).toBe(1);

    await expect(repository.prepare({
      ...input,
      idempotencyKey: randomUUID(),
    })).resolves.toMatchObject({ status: 'prepared', kidItemCode: expect.stringMatching(/^KID[0-9]{8}$/) });
  });

  it('abandons a never-submitted execution and reuses its target for a changed payload', async () => {
    await createTarget(ACCOUNT_ID);
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
    };
    const staleIdempotencyKey = randomUUID();
    const stale = await repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: staleIdempotencyKey,
    });

    // A later attempt with a changed payload (e.g. an edited category) freezes a
    // different hash, so the prepared execution can no longer resume. Because the
    // stale intent never reached the provider, the execution is abandoned while
    // the durable registration target remains the same.
    const fresh = await repository.prepare({
      ...base,
      displayName: 'Kids rain boots (edited)',
      registrationInput: { wingProduct: { productName: 'Kids rain boots', wingCategoryKey: '64687' } },
      idempotencyKey: randomUUID(),
    });

    expect(fresh.status).toBe('prepared');
    expect(fresh.executionId).not.toBe(stale.executionId);
    expect(fresh.preparationId).toBe(stale.preparationId);
    await expect(prisma.registrationTarget.findUniqueOrThrow({
      where: { id: stale.preparationId },
      select: { archivedAt: true },
    })).resolves.toEqual({
      archivedAt: null,
    });
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: stale.executionId },
      select: {
        status: true,
        providerOutcome: true,
        completedAt: true,
        leaseToken: true,
        leaseClaimedAt: true,
      },
    })).resolves.toEqual({
      status: 'cancelled',
      providerOutcome: 'not_attempted',
      completedAt: expect.any(Date),
      leaseToken: null,
      leaseClaimedAt: null,
    });
    expect(await prisma.registrationTarget.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: SALES_PRODUCT_ID,
        archivedAt: null,
      },
    })).toBe(1);

    // Superseding never erases the frozen idempotency ledger. Retrying the old
    // request must surface its terminal cancellation instead of reviving it.
    await expect(repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: staleIdempotencyKey,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('restarts a reconciled unknown WING attempt only after the channel absence was verified', async () => {
    await createTarget(ACCOUNT_ID);
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
    };
    const stale = await repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    });
    await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: stale.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    await repository.markUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: stale.executionId,
      requestedByUserId: TEST_USER_ID,
      evidence: { reason: 'browser_timeout' },
    });

    await expect(repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    })).resolves.toMatchObject({
      executionId: stale.executionId,
      status: 'reconciling',
      providerOutcome: 'uncertain',
    });

    const fresh = await repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
      providerAbsenceVerified: true,
    });

    expect(fresh).toMatchObject({ status: 'prepared', providerOutcome: 'not_attempted' });
    expect(fresh.executionId).not.toBe(stale.executionId);
    expect(fresh.preparationId).toBe(stale.preparationId);
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: stale.executionId },
      select: { status: true, providerOutcome: true, completedAt: true, leaseToken: true },
    })).resolves.toEqual({
      status: 'cancelled',
      providerOutcome: 'uncertain',
      completedAt: expect.any(Date),
      leaseToken: null,
    });
    await expect(prisma.registrationTarget.findUniqueOrThrow({
      where: { id: stale.preparationId },
      select: { archivedAt: true },
    })).resolves.toEqual({
      archivedAt: null,
    });
  });

  it('restarts a started unknown attempt only after the channel absence was verified', async () => {
    await createTarget(ACCOUNT_ID);
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
    };
    const prepared = await repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    });
    // Without a fresh provider lookup, a started execution remains protected.
    await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });

    await expect(repository.prepare({
      ...base,
      displayName: 'Changed after start',
      registrationInput: { wingProduct: { productName: 'Changed after start' } },
      idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(ConflictException);

    const fresh = await repository.prepare({
      ...base,
      displayName: 'Changed after verified absence',
      registrationInput: { wingProduct: { productName: 'Changed after verified absence' } },
      idempotencyKey: randomUUID(),
      providerAbsenceVerified: true,
    });

    expect(fresh).toMatchObject({ status: 'prepared', providerOutcome: 'not_attempted' });
    expect(fresh.executionId).not.toBe(prepared.executionId);
  });

  it('serializes start behind a concurrent supersede and never resurrects the stale execution', async () => {
    await createTarget(ACCOUNT_ID);
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
    };
    const stale = await repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    });

    let releaseSupersede!: () => void;
    let reportCandidateLocked!: () => void;
    const supersedeRelease = new Promise<void>((resolve) => {
      releaseSupersede = resolve;
    });
    const candidateLocked = new Promise<void>((resolve) => {
      reportCandidateLocked = resolve;
    });
    let didPause = false;
    const pausedPrisma = {
      $transaction: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) =>
        prisma.$transaction(async (transaction) => callback(new Proxy(transaction, {
          get(target, property, receiver) {
            if (property !== '$queryRaw') return Reflect.get(target, property, receiver);
            return async <R>(query: Prisma.Sql): Promise<R> => {
              const rows = await transaction.$queryRaw<R>(query);
              if (!didPause) {
                didPause = true;
                reportCandidateLocked();
                await supersedeRelease;
              }
              return rows;
            };
          },
        }))),
    };
    const pausedRepository = new RegistrationExecutionRepositoryAdapter(
      pausedPrisma as unknown as PrismaService,
      new RegistrationDraftAdapter(workspaceFake(), thumbnailSourceFake()),
    );
    const supersede = pausedRepository.prepare({
      ...base,
      displayName: 'Kids rain boots (edited while start races)',
      registrationInput: {
        wingProduct: {
          productName: 'Kids rain boots',
          wingCategoryKey: '64687',
        },
      },
      idempotencyKey: randomUUID(),
    });
    await candidateLocked;

    const start = repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: stale.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    const startState = await Promise.race([
      start.then(() => 'settled' as const, () => 'settled' as const),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);
    expect(startState).toBe('blocked');
    releaseSupersede();

    const fresh = await supersede;
    await expect(start).rejects.toBeInstanceOf(ConflictException);
    expect(fresh.executionId).not.toBe(stale.executionId);
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: stale.executionId },
      select: { status: true, providerOutcome: true, startedAt: true },
    })).resolves.toEqual({
      status: 'cancelled',
      providerOutcome: 'not_attempted',
      startedAt: null,
    });
  });

  it('rejects external preparation when the persisted account is not a vendor-identified Wing account', async () => {
    await prisma.channelAccount.update({
      where: { id: ACCOUNT_ID },
      data: { channel: 'rocket', vendorId: null, externalAccountId: null },
    });
    await expect(repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(ConflictException);
  });

  function createExternalRegistrationInput(
    idempotencyKey: string,
    options: { quantity: number; sourceCode?: string },
  ) {
    const sourceCode = options.sourceCode ?? 'KID00000001';
    return {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: {
        sellpiaMatch: {
          sellpiaInventorySkuId: BUNDLE_MASTER_PRODUCT_ID,
          code: sourceCode,
          name: 'Kids rain boots',
          optionName: 'Blue / 130',
          quantity: options.quantity,
        },
        wingProduct: {
          productName: 'Kids rain boots',
          variants: [{ vendorItemCode: sourceCode }],
        },
      },
      idempotencyKey,
    };
  }

  async function createDirectlyAuthoredProduct(): Promise<void> {
    await prisma.salesProduct.create({
      data: {
        id: DIRECT_SALES_PRODUCT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'DIRECTLY-AUTHORED-FENCE',
        status: 'active',
        name: 'Direct rain boots',
      },
    });
    await prisma.salesProductOption.create({
      data: {
        id: DIRECT_SALES_PRODUCT_OPTION_ID,
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: DIRECT_SALES_PRODUCT_ID,
        optionCode: 'KID-DIRECT-0001',
        optionKey: '단일',
        values: [],
        salePrice: 19900,
        supplyStatus: 'selling',
        sortOrder: 0,
      },
    });
  }

  /**
   * 등록 설정을 만드는 길은 하나다 — 상품 × 몰 계정으로 찾거나 만든다(KID-310 · ADR-0022).
   * 울타리 spec 도 그 길로 설정을 세워야 실제 배선과 같은 것을 잰다.
   */
  /** 등록 설정 편집도 살아남은 길 하나로 한다. 설정의 지금 값을 그대로 싣고 고칠 칸만 바꾼다. */
  async function editTarget(
    targetId: string,
    patch: { displayName?: string | null; registrationInput?: Record<string, unknown> },
  ): Promise<void> {
    const current = await prisma.registrationTarget.findUniqueOrThrow({
      where: { id: targetId },
      select: {
        version: true, displayName: true, registrationInput: true,
        selectedOptions: { select: { salesProductOptionId: true, salePrice: true, normalPrice: true, supplyPrice: true } },
      },
    });
    await targets.update(TEST_ORGANIZATION_ID, targetId, {
      expectedVersion: current.version,
      displayName: patch.displayName !== undefined ? patch.displayName : current.displayName,
      registrationInput: patch.registrationInput
        ?? (current.registrationInput as Record<string, unknown>),
      selectedOptions: current.selectedOptions.map((option) => ({
        salesProductOptionId: option.salesProductOptionId,
        salePrice: option.salePrice,
        normalPrice: option.normalPrice,
        supplyPrice: option.supplyPrice,
      })),
    });
  }

  async function createTarget(channelAccountId: string, salesProductId = SALES_PRODUCT_ID) {
    return {
      preparationId: await targets.resolve(TEST_ORGANIZATION_ID, { salesProductId, channelAccountId }),
      status: 'draft' as const,
    };
  }

  /**
   * AI 가 이 판매상품을 위해 만든 생성 썸네일 목록. 대표 사진 울타리가 초안의 사진 목록과
   * 합쳐서 본다 — 정본으로 바뀌는 주소도 이 목록에서 온 사진이다.
   */
  function thumbnailSourceFake() {
    return {
      listGeneratedThumbnailUrls: async () => (canonicalThumbnailUrl ? [canonicalThumbnailUrl] : []), findRepresentativeThumbnailUrls: async () => new Map<string, string>(),
    };
  }

  /**
   * AI 공개 작업공간 port 의 대역. 초안 하나에 작업공간 하나이고, 등록은 그 작업공간을
   * 복제하지 않고 listing 을 가리키게만 한다(KID-310).
   */
  function workspaceFake() {
    return {
      findSalesProductWorkspaceId: async () => null,
      resolveSourceSelections: async (_opaqueTx: OwnerTransaction, input: unknown) => (canonicalThumbnailUrl
        ? { ...(input as Record<string, unknown>), selectedThumbnailUrl: canonicalThumbnailUrl }
        : input),
      validateSourceSelections: async () => undefined,
      ensureSalesProductWorkspace: async (
        ownerTx: OwnerTransaction,
        input: { salesProductId: string },
      ) => ({
        workspaceId: await ensureWorkspace(ownerTx, input.salesProductId),
      }),
      attachToListing: async () => ({ workspaceId: '' }),
    } as never;
  }

  /** 콘텐츠 작업공간은 판매상품 초안이 가진다(KID-310). 후보는 그 초안이 가리킨다. */
  async function ensureWorkspace(
    ownerTx: OwnerTransaction,
    salesProductId: string = SALES_PRODUCT_ID,
  ): Promise<string> {
    const client = ownerTransactionClient(ownerTx);
    const existing = await client.contentWorkspace.findFirst({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId,
        status: 'active',
        isDeleted: false,
      },
    });
    if (existing) return existing.id;
    return (await client.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sales_product',
        salesProductId,
        displayName: 'Kids rain boots',
        normalizedTitle: 'kids rain boots',
        createdByUserId: TEST_USER_ID,
      },
    })).id;
  }

  async function resolveSelections(
    _opaqueTx: OwnerTransaction,
    input: {
      organizationId: string;
      sourceWorkspaceId: string;
      selectedThumbnailUrl: string | null;
      selectedThumbnailGenerationId: string | null;
      selectedThumbnailGenerationCandidateId: string | null;
      selectedDetailPageArtifactId: string | null;
      selectedDetailPageRevisionId: string | null;
      selectedDetailPageGenerationId: string | null;
    },
  ) {
    return input;
  }

  async function createListingBranch(
    client: Prisma.TransactionClient,
    externalId: string,
    salesProductId: string = SALES_PRODUCT_ID,
  ): Promise<string> {
    const listing = await client.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        salesProductId,
        externalId,
        displayName: 'Kids rain boots',
        status: 'active',
      },
    });
    await client.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'channel_listing',
        channelListingId: listing.id,
        originWorkspaceId: (await client.contentWorkspace.findFirstOrThrow({
          where: { organizationId: TEST_ORGANIZATION_ID, salesProductId },
        })).id,
        displayName: 'Kids rain boots',
        normalizedTitle: 'kids rain boots',
        createdByUserId: TEST_USER_ID,
      },
    });
    return listing.id;
  }
});

function tx(
  value: OwnerTransaction,
): Prisma.TransactionClient {
  return ownerTransactionClient(value);
}
