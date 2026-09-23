import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';
import { realRegistrableDetailPages, realRegistrationContentWorkspace } from '../../test-helpers/registration-content-workspace';
import { ownerTransaction } from '../../prisma/owner-transaction';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RegistrationContentWorkspacePort } from '../../content/application/port/in/workspace/registration-content-workspace.port';
import { SalesProductRepositoryAdapter } from '../adapter/out/persistence/sales-product.repository.adapter';
import { RegistrationTargetRepositoryAdapter } from '../adapter/out/persistence/registration-target.repository.adapter';
import { SalesProductMallSheetService } from '../application/service/sales-product/sales-product-mall-sheet.service';
import { productTransactionalRead } from './product-transactional-read.fake';

/**
 * 몰 시트의 상세는 그 몰의 등록 대상이 고른 revision 이다(KID-313 W2). 고르지 않았으면 현재 revision 이고,
 * 다른 몰의 등록 대상이 고른 것은 이 시트와 상관없다.
 */
describe('mall sheets send the detail revision the registration target chose (PostgreSQL)', () => {
  const OLD_HTML = '<p>예전 상세</p>';
  const CURRENT_HTML = '<p>지금 상세</p>';
  const DETAIL_COLUMN = '상품설명(PC/태블릿)';
  let prisma: PrismaClient;
  let content: RegistrationContentWorkspacePort;
  let sheets: SalesProductMallSheetService;
  let write: ReturnType<typeof vi.fn>;
  let teacherAccountId: string;
  let otherMallAccountId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    content = realRegistrationContentWorkspace(prismaService);
    const repository = new SalesProductRepositoryAdapter(
      prismaService,
      productTransactionalRead(),
      new RegistrationTargetRepositoryAdapter(prismaService, productTransactionalRead(), content),
      content,
      realRegistrableDetailPages(prismaService),
    );
    // 몰 양식 파일 · 카테고리표는 저장소 경계 밖이다 — 만든 행만 받아 둔다.
    write = vi.fn().mockResolvedValue(Buffer.from('sheet'));
    const files = {
      categoryTables: async () => ({ paths: {}, esmBySite: {}, coupang: {}, icecream: { byCode: {}, ambiguous: {}, notices: {}, brands: {} } }),
      write,
    } as unknown as ConstructorParameters<typeof SalesProductMallSheetService>[1];
    sheets = new SalesProductMallSheetService(repository, files, { log() {}, warn() {} }, realRegistrableDetailPages(prismaService));
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    write.mockClear();
    teacherAccountId = await createAccount('teacher-mall');
    otherMallAccountId = await createAccount('11st');
  });

  async function createAccount(channel: string): Promise<string> {
    const id = randomUUID();
    await prisma.channelAccount.create({ data: {
      id, organizationId: TEST_ORGANIZATION_ID, channel, name: channel, externalAccountId: `external-${id}`, status: 'active',
    } });
    return id;
  }

  /** 가져온 revision 들(앞 → 뒤)을 가진 판매상품. 마지막 것이 현재 revision 이다. */
  async function productWithRevisions(code: string, htmls: readonly string[], imageUrls = ['https://example.com/product.jpg']) {
    const productId = randomUUID();
    const optionId = randomUUID();
    await prisma.salesProduct.create({ data: {
      id: productId, organizationId: TEST_ORGANIZATION_ID, code, status: 'active', name: `상품 ${code}`, imageUrls,
    } });
    await prisma.salesProductOption.create({ data: {
      id: optionId, organizationId: TEST_ORGANIZATION_ID, salesProductId: productId, optionCode: `${code}-0001`,
      optionKey: '', values: [], salePrice: 2_000, supplyStatus: 'selling', sortOrder: 0,
    } });
    const revisionIds = await prisma.$transaction(async (tx) => {
      await content.ensureSalesProductWorkspace(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID, salesProductId: productId, displayName: `상품 ${code}`, createdByUserId: null,
      });
      const ids: string[] = [];
      for (const [index, html] of htmls.entries()) {
        const result = await content.importDetailPage(ownerTransaction(tx), {
          organizationId: TEST_ORGANIZATION_ID, salesProductId: productId, source: 'sabangnet', html, digest: `digest-${index}`, createdByUserId: null,
        });
        if (result.kind === 'appended') ids.push(result.revisionId);
      }
      return ids;
    });
    return { productId, optionId, revisionIds };
  }

  /** 가져온 revision 둘(예전 → 지금)을 가진 판매상품. 지금 것이 현재 revision 이다. */
  async function productWithTwoRevisions(code: string) {
    const { productId, optionId, revisionIds } = await productWithRevisions(code, [OLD_HTML, CURRENT_HTML]);
    return { productId, optionId, oldRevisionId: revisionIds[0]! };
  }

  async function createTarget(input: {
    productId: string;
    optionId: string;
    channelAccountId: string;
    selectedDetailPageRevisionId: string | null;
    createdAt: Date;
    mallFields?: Record<string, string>;
  }) {
    const target = await prisma.registrationTarget.create({ data: {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: input.productId,
      channelAccountId: input.channelAccountId,
      selectedDetailPageRevisionId: input.selectedDetailPageRevisionId,
      registrationInput: { mallCategory: null, mallFields: input.mallFields ?? { supplyPrice: '1500', categoryCode: '0001' }, adapter: {} },
      createdAt: input.createdAt,
    } });
    await prisma.registrationTargetOption.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, registrationTargetId: target.id, salesProductOptionId: input.optionId, sortOrder: 0,
    } });
  }

  it('puts the chosen revision in the file, the current one without a choice, and ignores another mall\'s choice', async () => {
    const chosen = await productWithTwoRevisions('KID00000101');
    const unchosen = await productWithTwoRevisions('KID00000102');
    const otherMallChoice = await productWithTwoRevisions('KID00000103');
    const earlier = new Date('2026-09-01T00:00:00Z');
    const later = new Date('2026-09-02T00:00:00Z');
    await createTarget({ ...chosen, channelAccountId: teacherAccountId, selectedDetailPageRevisionId: chosen.oldRevisionId, createdAt: earlier });
    await createTarget({ ...unchosen, channelAccountId: teacherAccountId, selectedDetailPageRevisionId: null, createdAt: earlier });
    // 다른 몰의 등록 대상이 먼저 만들어졌고 예전 revision 을 골랐다 — 이 시트의 몰 대상은 고르지 않았다.
    await createTarget({ ...otherMallChoice, channelAccountId: otherMallAccountId, selectedDetailPageRevisionId: otherMallChoice.oldRevisionId, createdAt: earlier });
    await createTarget({ ...otherMallChoice, channelAccountId: teacherAccountId, selectedDetailPageRevisionId: null, createdAt: later });

    await sheets.file(TEST_ORGANIZATION_ID, 'teacherville', {
      salesProductIds: [chosen.productId, unchosen.productId, otherMallChoice.productId],
    });

    const rows = write.mock.calls[0]![1] as Array<Record<string, unknown>>;
    expect(rows.map((row) => row[DETAIL_COLUMN])).toEqual([OLD_HTML, CURRENT_HTML, CURRENT_HTML]);
  });

  it('ESM takes the revision of the first sheet mall in its own order (G마켓, then 옥션), not creation order', async () => {
    const gmarketAccountId = await createAccount('gmarket');
    const auctionAccountId = await createAccount('auction');
    const product = await productWithRevisions('KID00000201', ['<p>A</p>', '<p>B</p>', '<p>C</p>']);
    const [revisionA, revisionB] = product.revisionIds;
    const esmFields = { supplyPrice: '1500', categoryCode: '00000001', esmCategoryCode: '1234' };
    // 옥션 대상을 먼저 만들고 A 를 골랐다. 나중에 만든 G마켓 대상은 B 를 골랐다.
    await createTarget({ ...product, channelAccountId: auctionAccountId, selectedDetailPageRevisionId: revisionA!, createdAt: new Date('2026-09-01T00:00:00Z'), mallFields: esmFields });
    await createTarget({ ...product, channelAccountId: gmarketAccountId, selectedDetailPageRevisionId: revisionB!, createdAt: new Date('2026-09-02T00:00:00Z'), mallFields: esmFields });

    await sheets.file(TEST_ORGANIZATION_ID, 'esm', { salesProductIds: [product.productId] });

    const rows = write.mock.calls[0]![1] as Array<Record<string, unknown>>;
    expect(rows.map((row) => row['상품상세설명'])).toEqual(['<p>B</p>']);
  });

  it('lists for [사진 올리기] an image that only an older revision chosen by a target carries', async () => {
    const OWN = 'http://localhost:4000/files';
    const product = await productWithRevisions('KID00000301', [
      `<p><img src="${OWN}/only-old.jpg"></p>`,
      `<p><img src="${OWN}/current.jpg"></p>`,
    ], ['https://example.com/product.jpg']);
    await createTarget({ ...product, channelAccountId: otherMallAccountId, selectedDetailPageRevisionId: product.revisionIds[0]!, createdAt: new Date('2026-09-01T00:00:00Z') });

    const pending = await sheets.pendingPublicImages(TEST_ORGANIZATION_ID, { salesProductIds: [product.productId] });

    expect([...pending.urls].sort()).toEqual([`${OWN}/current.jpg`, `${OWN}/only-old.jpg`]);
    expect(pending.products).toBe(1);
  });
});
