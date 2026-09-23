import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RegistrationTargetRepositoryAdapter } from '../adapter/out/persistence/registration-target.repository.adapter';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import type {
  RegistrationMallInput,
  RegistrationTargetResolveInput,
  RegistrationTargetUpdateInput,
} from '@kiditem/shared/sales-product';
import type { RegistrationTargetCreateRecord } from '../application/port/out/persistence/registration-target.repository.port';
import type { PrismaClient } from '@prisma/client';
import { productTransactionalRead } from './product-transactional-read.fake';
import { realRegistrationContentWorkspace } from '../../test-helpers/registration-content-workspace';
import { ownerTransaction } from '../../prisma/owner-transaction';

describe('registration target repository (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: RegistrationTargetRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new RegistrationTargetRepositoryAdapter(
      prisma as unknown as PrismaService,
      productTransactionalRead(),
      realRegistrationContentWorkspace(prisma),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /**
   * 상품 × 몰 계정당 등록 설정은 하나다(KID-310 · ADR-0022). 행사용 등록은 같은 원천 재고를
   * 쓰는 **다른 판매상품**이지 같은 상품의 둘째 설정이 아니다.
   */
  it('refuses a second active target for one product and account, and resolves canonical option prices', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const first = await repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: productId,
      channelAccountId: accountId,
      selectedOptions: [{ salesProductOptionId: options[0]!.id }],
    }));

    await expect(repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: productId,
      channelAccountId: accountId,
      selectedOptions: [selected(options[0]!.id)],
    }))).rejects.toThrow();

    await expect(repository.list(TEST_ORGANIZATION_ID, productId)).resolves.toEqual([
      expect.objectContaining({
        id: first,
        version: 1,
        selectedOptions: [{ salesProductOptionId: options[0]!.id }],
        product: expect.objectContaining({
          options: expect.arrayContaining([expect.objectContaining({
            id: options[0]!.id,
            salePrice: 3_000,
            normalPrice: 5_000,
          })]),
        }),
      }),
    ]);
  });

  it('creates an active target after the prior target is archived', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const previousTargetId = await repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: productId,
      channelAccountId: accountId,
      selectedOptions: [selected(options[0]!.id)],
    }));
    const archivedAt = new Date('2026-09-21T00:10:00.000Z');

    await prisma.registrationTarget.update({
      where: { id: previousTargetId },
      data: { archivedAt },
    });

    const replacementTargetId = await repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: productId,
      channelAccountId: accountId,
      selectedOptions: [selected(options[0]!.id)],
    }));

    expect(replacementTargetId).not.toBe(previousTargetId);
    await expect(prisma.registrationTarget.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: productId },
    })).resolves.toBe(2);
    await expect(prisma.registrationTarget.findUniqueOrThrow({ where: { id: previousTargetId } }))
      .resolves.toMatchObject({ archivedAt });
    await expect(repository.list(TEST_ORGANIZATION_ID, productId)).resolves.toEqual([
      expect.objectContaining({ id: replacementTargetId }),
    ]);
    await expect(repository.resolve(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
    })).resolves.toBe(replacementTargetId);
  });

  it('serializes concurrent resolves so one product-account pair creates one default target', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const input: RegistrationTargetResolveInput = { salesProductId: productId, channelAccountId: accountId };

    const targetIds = await Promise.all([
      repository.resolve(TEST_ORGANIZATION_ID, input),
      repository.resolve(TEST_ORGANIZATION_ID, input),
    ]);

    expect(targetIds[0]).toBe(targetIds[1]);
    const targets = await repository.list(TEST_ORGANIZATION_ID, productId);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      id: targetIds[0],
      channelAccountId: accountId,
      registrationInput: { mallCategory: null, mallFields: {}, adapter: {} },
      selectedThumbnailAssetId: null,
      selectedDetailPageRevisionId: null,
      selectedOptions: options.map((option) => ({ salesProductOptionId: option.id })),
    });
  });

  it('reuses the sole target without overwriting its edited settings', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const targetId = await repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: productId,
      channelAccountId: accountId,
      selectedOptions: [selected(options[0]!.id)],
    }));
    await repository.update(TEST_ORGANIZATION_ID, targetId, updateInput({
      expectedVersion: 1,
      registrationInput: mallInput({ mallCategory: { key: 'existing-category', label: null } }),
      selectedOptions: [selected(options[1]!.id)],
    }));

    await expect(repository.resolve(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
    })).resolves.toBe(targetId);
    await expect(repository.get(TEST_ORGANIZATION_ID, targetId)).resolves.toMatchObject({
      version: 2,
      registrationInput: { mallCategory: { key: 'existing-category', label: null } },
      selectedOptions: [{ salesProductOptionId: options[1]!.id }],
    });
  });

  it('rejects organization and channel-account mismatches', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const otherAccountId = await createAccount(prisma, OTHER_ORGANIZATION_ID);
    const { productId } = await createProduct(prisma, TEST_ORGANIZATION_ID);

    await expect(repository.resolve(OTHER_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
    })).rejects.toMatchObject({ code: 'invalid' });
    await expect(repository.resolve(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: otherAccountId,
    })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('keeps exactly one active setting per product and account, and resolves it without a choice', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const otherAccountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const firstProduct = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const secondProduct = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const firstTargetId = await repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: firstProduct.productId,
      channelAccountId: accountId,
      selectedOptions: [selected(firstProduct.options[0]!.id)],
    }));

    // 행사용 등록은 별도 판매상품으로 만든다 — 같은 상품 × 몰에 설정을 둘 둘 수 없다.
    await expect(repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: firstProduct.productId,
      channelAccountId: accountId,
      selectedOptions: [selected(firstProduct.options[1]!.id)],
    }))).rejects.toBeTruthy();

    // 다른 계정 · 다른 상품은 자기 설정을 가진다.
    const otherAccountTargetId = await repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: firstProduct.productId,
      channelAccountId: otherAccountId,
      selectedOptions: [selected(firstProduct.options[0]!.id)],
    }));
    const otherProductTargetId = await repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: secondProduct.productId,
      channelAccountId: accountId,
      selectedOptions: [selected(secondProduct.options[0]!.id)],
    }));
    expect(new Set([firstTargetId, otherAccountTargetId, otherProductTargetId]).size).toBe(3);

    await expect(repository.resolve(TEST_ORGANIZATION_ID, {
      salesProductId: firstProduct.productId,
      channelAccountId: accountId,
    })).resolves.toBe(firstTargetId);

    // 보관한 뒤에는 같은 자리에 새 설정을 만든다.
    await prisma.registrationTarget.update({
      where: { id: firstTargetId },
      data: { archivedAt: new Date() },
    });
    const replacement = await repository.resolve(TEST_ORGANIZATION_ID, {
      salesProductId: firstProduct.productId,
      channelAccountId: accountId,
    });
    expect(replacement).not.toBe(firstTargetId);
    await expect(repository.list(TEST_ORGANIZATION_ID, firstProduct.productId))
      .resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ id: firstTargetId })]));
    await expect(repository.get(TEST_ORGANIZATION_ID, firstTargetId)).resolves.toBeNull();
  });

  it('does not inherit unused options or create new targets for an archived product', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await prisma.salesProductOption.update({
      where: { id: options[0]!.id },
      data: { supplyStatus: 'unused', optionKey: `~${options[0]!.id}` },
    });

    const targetId = await repository.resolve(TEST_ORGANIZATION_ID, {
      salesProductId: productId,
      channelAccountId: accountId,
    });
    await expect(repository.get(TEST_ORGANIZATION_ID, targetId)).resolves.toMatchObject({
      selectedOptions: [{ salesProductOptionId: options[1]!.id }],
    });

    const allUnusedProduct = await createProduct(prisma, TEST_ORGANIZATION_ID);
    for (const option of allUnusedProduct.options) {
      await prisma.salesProductOption.update({
        where: { id: option.id },
        data: { supplyStatus: 'unused', optionKey: `~${option.id}` },
      });
    }
    const emptyTargetId = await repository.resolve(TEST_ORGANIZATION_ID, {
      salesProductId: allUnusedProduct.productId,
      channelAccountId: accountId,
    });
    await expect(repository.get(TEST_ORGANIZATION_ID, emptyTargetId)).resolves.toMatchObject({ selectedOptions: [] });

    const archivedProduct = await createProduct(prisma, TEST_ORGANIZATION_ID);
    await prisma.salesProduct.update({ where: { id: archivedProduct.productId }, data: { status: 'archived' } });
    await expect(repository.resolve(TEST_ORGANIZATION_ID, {
      salesProductId: archivedProduct.productId,
      channelAccountId: accountId,
    })).rejects.toMatchObject({ code: 'invalid' });
    await expect(repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: archivedProduct.productId,
      channelAccountId: accountId,
      selectedOptions: [selected(archivedProduct.options[0]!.id)],
    }))).rejects.toMatchObject({ code: 'invalid' });
    await expect(repository.list(TEST_ORGANIZATION_ID, archivedProduct.productId)).resolves.toEqual([]);
  });

  it('guards updates by version, replaces only target selections, and leaves execution evidence intact', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const targetId = await repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: productId,
      channelAccountId: accountId,
      selectedOptions: [selected(options[0]!.id)],
    }));
    const frozenPayload = { salePrice: 3_000, optionCode: options[0]!.optionCode };
    const executionId = randomUUID();
    await prisma.productRegistrationExecution.create({
      data: {
        id: executionId,
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId: targetId,
        channelAccountId: accountId,
        executionKind: 'create',
        idempotencyKey: `target-test-${executionId}`,
        requestHash: 'request-hash',
        submissionPayloadJson: frozenPayload,
        submissionPayloadHash: 'payload-hash',
        status: 'succeeded',
        providerOutcome: 'succeeded',
      },
    });

    const update = updateInput({
      expectedVersion: 1,
      registrationInput: mallInput({ adapter: { coupang: { wingCategoryKey: '123' } } }),
      selectedOptions: [selected(options[1]!.id)],
    });
    await expect(repository.update(TEST_ORGANIZATION_ID, targetId, update)).resolves.toBeUndefined();
    await expect(repository.get(TEST_ORGANIZATION_ID, targetId)).resolves.toMatchObject({
      version: 2,
      registrationInput: { adapter: { coupang: { wingCategoryKey: '123' } } },
      selectedOptions: [{ salesProductOptionId: options[1]!.id }],
    });
    await expect(repository.update(TEST_ORGANIZATION_ID, targetId, update))
      .rejects.toMatchObject({ code: 'conflict' });

    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: executionId },
      select: { submissionPayloadJson: true, submissionPayloadHash: true, status: true },
    })).resolves.toEqual({
      submissionPayloadJson: frozenPayload,
      submissionPayloadHash: 'payload-hash',
      status: 'succeeded',
    });
  });

  it('fences organizations and prevents new retired-option selections while retaining existing ones', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const otherOrganizationId = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

    await expect(repository.create(otherOrganizationId, createInput({
      salesProductId: productId,
      channelAccountId: accountId,
      selectedOptions: [selected(options[0]!.id)],
    }))).rejects.toMatchObject({ code: 'invalid' });

    const targetId = await repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: productId,
      channelAccountId: accountId,
      selectedOptions: [selected(options[0]!.id)],
    }));
    await prisma.salesProductOption.update({
      where: { id: options[0]!.id },
      data: { supplyStatus: 'unused', optionKey: `~${options[0]!.id}` },
    });
    await expect(repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: productId,
      channelAccountId: accountId,
      selectedOptions: [selected(options[0]!.id)],
    }))).rejects.toMatchObject({ code: 'invalid' });

    await expect(repository.update(TEST_ORGANIZATION_ID, targetId, updateInput({
      expectedVersion: 1,
      selectedOptions: [selected(options[0]!.id)],
    }))).resolves.toBeUndefined();
    await expect(repository.get(TEST_ORGANIZATION_ID, targetId)).resolves.toMatchObject({
      version: 2,
      selectedOptions: [{ salesProductOptionId: options[0]!.id }],
      product: { options: expect.arrayContaining([expect.objectContaining({ id: options[0]!.id })]) },
    });
  });

  it('refuses product facts in the mall values and names the keys', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const targetId = await repository.resolve(TEST_ORGANIZATION_ID, { salesProductId: productId, channelAccountId: accountId });

    const refusal = repository.update(TEST_ORGANIZATION_ID, targetId, updateInput({
      expectedVersion: 1,
      registrationInput: { name: '몰 전용 이름', salePrice: 9_900, mallFields: {} } as never,
      selectedOptions: [selected(options[0]!.id)],
    }));
    await expect(refusal).rejects.toMatchObject({ code: 'invalid' });
    await expect(refusal).rejects.toThrow(/name, salePrice/);
    await expect(repository.create(TEST_ORGANIZATION_ID, createInput({
      salesProductId: productId,
      channelAccountId: await createAccount(prisma, TEST_ORGANIZATION_ID),
      registrationInput: { detailHtml: '<p>몰 상세</p>' } as never,
    }))).rejects.toMatchObject({ code: 'invalid' });
    await expect(repository.get(TEST_ORGANIZATION_ID, targetId)).resolves.toMatchObject({ version: 1 });
  });

  it('stores the selected content ids only when they belong to the product\'s own workspace', async () => {
    const accountId = await createAccount(prisma, TEST_ORGANIZATION_ID);
    const { productId, options } = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const other = await createProduct(prisma, TEST_ORGANIZATION_ID);
    const content = realRegistrationContentWorkspace(prisma);
    const importDetail = (salesProductId: string) => prisma.$transaction(async (tx) => {
      await content.ensureSalesProductWorkspace(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID, salesProductId, displayName: '공통 상품', createdByUserId: null,
      });
      return content.importDetailPage(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID, salesProductId, source: 'sabangnet',
        html: '<p>상세</p>', extraHtml: [], digest: `digest-${salesProductId}`, createdByUserId: null,
      });
    });
    const own = await importDetail(productId);
    const foreign = await importDetail(other.productId);
    const ownRevisionId = own.kind === 'appended' ? own.revisionId : '';
    const foreignRevisionId = foreign.kind === 'appended' ? foreign.revisionId : '';
    const targetId = await repository.resolve(TEST_ORGANIZATION_ID, { salesProductId: productId, channelAccountId: accountId });

    await repository.update(TEST_ORGANIZATION_ID, targetId, updateInput({
      expectedVersion: 1,
      selectedDetailPageRevisionId: ownRevisionId,
      selectedOptions: [selected(options[0]!.id)],
    }));
    await expect(repository.get(TEST_ORGANIZATION_ID, targetId)).resolves.toMatchObject({
      version: 2,
      selectedDetailPageRevisionId: ownRevisionId,
      selectedThumbnailAssetId: null,
    });
    await expect(repository.update(TEST_ORGANIZATION_ID, targetId, updateInput({
      expectedVersion: 2,
      selectedDetailPageRevisionId: foreignRevisionId,
      selectedOptions: [selected(options[0]!.id)],
    }))).rejects.toThrow('Selected detail revision is not source-owned.');
    await expect(repository.get(TEST_ORGANIZATION_ID, targetId)).resolves.toMatchObject({
      version: 2,
      selectedDetailPageRevisionId: ownRevisionId,
    });
  });
});

function createInput(overrides: Partial<RegistrationTargetCreateRecord>): RegistrationTargetCreateRecord {
  return {
    salesProductId: overrides.salesProductId!,
    channelAccountId: overrides.channelAccountId!,
    registrationInput: overrides.registrationInput ?? mallInput(),
    selectedOptions: overrides.selectedOptions ?? [],
  };
}

function mallInput(overrides: Partial<RegistrationMallInput> = {}): RegistrationMallInput {
  return { mallCategory: null, mallFields: {}, adapter: {}, ...overrides };
}

function updateInput(overrides: Partial<RegistrationTargetUpdateInput> & { expectedVersion: number }): RegistrationTargetUpdateInput {
  return {
    registrationInput: mallInput(),
    selectedThumbnailAssetId: null,
    selectedDetailPageRevisionId: null,
    selectedOptions: [],
    ...overrides,
  };
}

function selected(salesProductOptionId: string) {
  return { salesProductOptionId };
}

async function createAccount(prisma: PrismaClient, organizationId: string): Promise<string> {
  const id = randomUUID();
  await prisma.channelAccount.create({
    data: {
      id,
      organizationId,
      channel: `test-${id.slice(0, 8)}`,
      name: 'Integration account',
      externalAccountId: `external-${id}`,
      status: 'active',
    },
  });
  return id;
}

async function createProduct(prisma: PrismaClient, organizationId: string) {
  const productId = randomUUID();
  await prisma.salesProduct.create({
    data: {
      id: productId,
      organizationId,
      code: `SP-${productId.slice(0, 8)}`,
      name: '공통 상품',
    },
  });
  const options = await Promise.all([
    prisma.salesProductOption.create({
      data: {
        id: randomUUID(),
        organizationId,
        salesProductId: productId,
        optionCode: `${productId.slice(0, 8)}-0001`,
        optionKey: '파랑',
        values: ['파랑'],
        salePrice: 3_000,
        normalPrice: 5_000,
        sortOrder: 0,
      },
    }),
    prisma.salesProductOption.create({
      data: {
        id: randomUUID(),
        organizationId,
        salesProductId: productId,
        optionCode: `${productId.slice(0, 8)}-0002`,
        optionKey: '노랑',
        values: ['노랑'],
        salePrice: 4_000,
        normalPrice: null,
        sortOrder: 1,
      },
    }),
  ]);
  return { productId, options };
}
