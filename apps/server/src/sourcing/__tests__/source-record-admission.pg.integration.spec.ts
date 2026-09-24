import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SourceRecordRepositoryAdapter } from '../adapter/out/repository/source-record.repository.adapter';
import { SourceRecordDuplicateError } from '../domain/source-record-admission';
import { canonicalSourceRecordIdentity } from '../domain/source-record-identity';
import type { SourceRecordWrite } from '../application/port/out/repository/source-record.repository.port';
import type { SalesProductDraftPort } from '../application/port/out/cross-domain/sales-product-draft.port';
import { realSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

const SOURCE_URL = 'https://detail.1688.com/offer/607635921546.html';

function write(organizationId = TEST_ORGANIZATION_ID, overrides: Partial<SourceRecordWrite> = {}): SourceRecordWrite {
  return {
    organizationId,
    sourceUrl: SOURCE_URL,
    sourcePlatform: 'ALIBABA_1688',
    externalOfferId: '607635921546',
    variantKeyNormalized: '',
    sourceIdentityHash: canonicalSourceRecordIdentity({
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: SOURCE_URL,
      validatedExternalOfferId: '607635921546',
      variantKeyNormalized: '',
    }),
    rawData: { title: '原文', price: '12.50' },
    name: '비눗방울총',
    description: '수집한 설명',
    category: null,
    tags: [],
    thumbnailUrl: 'https://cbu01.alicdn.com/a.jpg',
    imageUrl: 'https://cbu01.alicdn.com/a.jpg',
    costCny: 12.5,
    triggeredByUserId: null,
    images: [
      { url: 'https://cbu01.alicdn.com/a.jpg', role: 'product', label: null, sortOrder: 0, source: 'test', isPrimary: true },
      { url: 'https://cbu01.alicdn.com/b.jpg', role: 'product', label: null, sortOrder: 1, source: 'test', isPrimary: false },
    ],
    ...overrides,
  };
}

/**
 * 원본 기록 입장(KID-313) — 같은 원본은 두 번 수집되지 않고, 원본 기록과 그 초안은 한 커밋이다.
 * 입장 규칙 · 식별자 잠금 · 유일키 · Channels 초안 경로를 모두 진짜로 엮는다.
 */
describe('source record admission (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let records: SourceRecordRepositoryAdapter;
  let drafts: SalesProductDraftPort;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    records = new SourceRecordRepositoryAdapter(prisma as never);
    drafts = realSalesProductDraftPort(prisma);
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  it('admits a source once with its draft in the same commit, and refuses the second collection with a link to that draft', async () => {
    const first = await records.admit(write(), drafts);

    const draft = await prisma.salesProduct.findUniqueOrThrow({ where: { id: first.salesProductId } });
    expect(draft).toMatchObject({
      status: 'draft', code: null, name: '비눗방울총', description: '수집한 설명',
      sourceRecordId: first.sourceRecordId, sourcePlatform: 'ALIBABA_1688', sourceUrl: SOURCE_URL,
      imageUrls: ['https://cbu01.alicdn.com/a.jpg', 'https://cbu01.alicdn.com/b.jpg'],
    });
    // 원가와 원문은 초안에 복사하지 않는다 — 초안은 원본 기록에서 읽는다.
    expect(draft.sourceRaw).toBeNull();
    await expect(records.read({ organizationId: TEST_ORGANIZATION_ID, sourceRecordId: first.sourceRecordId }))
      .resolves.toMatchObject({ costCny: '12.5', rawData: { title: '原文' }, images: [{ url: 'https://cbu01.alicdn.com/a.jpg' }, { url: 'https://cbu01.alicdn.com/b.jpg' }] });

    const second = await records.admit(write(), drafts).catch((error: unknown) => error);

    expect(second).toBeInstanceOf(SourceRecordDuplicateError);
    expect((second as SourceRecordDuplicateError).refusal).toEqual({
      kind: 'refuse',
      reason: 'draft_exists',
      existing: { sourceRecordId: first.sourceRecordId, salesProductId: first.salesProductId, salesProductStatus: 'draft' },
    });
    expect(await prisma.sourceRecord.count()).toBe(1);
    expect(await prisma.salesProduct.count()).toBe(1);
  });

  it('says a selling product already came from this source once its KID is issued', async () => {
    const first = await records.admit(write(), drafts);
    await prisma.salesProduct.update({ where: { id: first.salesProductId }, data: { code: 'KID00000001', status: 'active' } });

    const refused = await records.admit(write(), drafts).catch((error: unknown) => error);

    expect((refused as SourceRecordDuplicateError).refusal.reason).toBe('selling_product_exists');
  });

  it('lets two concurrent collections of the same source leave exactly one record and one draft', async () => {
    const results = await Promise.allSettled([records.admit(write(), drafts), records.admit(write(), drafts)]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')!;
    expect(rejected.reason).toBeInstanceOf(SourceRecordDuplicateError);
    expect(await prisma.sourceRecord.count()).toBe(1);
    expect(await prisma.salesProduct.count()).toBe(1);
  });

  it('rolls the source record back when its draft cannot be created', async () => {
    const failing: SalesProductDraftPort = {
      ...drafts,
      findForSourceRecord: drafts.findForSourceRecord.bind(drafts),
      createDraft: async () => { throw new Error('draft insert failed'); },
    };

    await expect(records.admit(write(), failing)).rejects.toThrow('draft insert failed');

    expect(await prisma.sourceRecord.count()).toBe(0);
    expect(await prisma.sourceRecordImage.count()).toBe(0);
    // 원본 기록이 남지 않았으니 다시 수집하면 처음부터 들어온다.
    await expect(records.admit(write(), drafts)).resolves.toMatchObject({ sourceRecordId: expect.any(String) });
  });

  it('keeps organizations apart: the same source is a fresh collection in another organization, and reads stay fenced', async () => {
    const mine = await records.admit(write(TEST_ORGANIZATION_ID), drafts);
    const theirs = await records.admit(write(OTHER_ORGANIZATION_ID), drafts);

    expect(theirs.sourceRecordId).not.toBe(mine.sourceRecordId);
    await expect(records.read({ organizationId: OTHER_ORGANIZATION_ID, sourceRecordId: mine.sourceRecordId }))
      .resolves.toBeNull();
    expect(await records.findIdBySourceUrl(OTHER_ORGANIZATION_ID, SOURCE_URL)).toBe(theirs.sourceRecordId);
  });

  it('replays an owner-keyed admission with the first result and refuses a changed request under the same key', async () => {
    const receipt = { organizationId: TEST_ORGANIZATION_ID, capabilityKey: 'sourcing.ingestCandidate', idempotencyKey: 'agent-1', requestHash: 'hash-1' };
    const first = await records.admitOnce(receipt, write(), drafts);

    await expect(records.admitOnce(receipt, write(), drafts)).resolves.toEqual(first);
    await expect(records.admitOnce({ ...receipt, requestHash: 'hash-2' }, write(), drafts))
      .rejects.toThrow('owner_idempotency_input_conflict');
    expect(await prisma.sourceRecord.count()).toBe(1);
  });
});
