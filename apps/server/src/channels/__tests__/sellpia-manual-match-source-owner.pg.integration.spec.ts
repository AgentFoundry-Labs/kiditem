import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SELLPIA_LOGIN_LOCK_KEY,
  SELLPIA_MANUAL_MATCH_CHUNK_KIND,
  SELLPIA_MANUAL_MATCH_KIND,
} from '@kiditem/shared/sellpia-operations';
import type { SellpiaManualMatchRow } from '@kiditem/shared/sellpia-manual-match';
import type { OperationBeginResponse } from '@kiditem/shared/operation';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { makeChannelsOperations } from '../../test-helpers/channels-operations';
import { lockProductSource } from '../../products/adapter/out/persistence/transaction/product-source-lock';

const ACCOUNT_ID = '71000000-0000-4000-8000-000000000001';

function rows(): SellpiaManualMatchRow[] {
  return [
    { productCode: '6402-1', aliasTitle: 'Match Alias', itemCount: 2, matchedType: 'E', evidenceCount: 1 },
    { productCode: '6402-1', aliasTitle: 'Match Alias', itemCount: 2, matchedType: 'M', evidenceCount: 2 },
    { productCode: '6402-2', aliasTitle: 'Not Current', itemCount: 1, matchedType: 'M', evidenceCount: 1 },
  ];
}

/**
 * 셀피아 수동상품매칭 = `channels.sellpia_manual_match` 실행 하나(KID-363 L3). plan이 활성 셀피아 SKU 코드를 대상으로
 * 얼리고 셀피아 로그인 잠금을 잡는다. 확장은 근거 줄을 `match_results`로 보내고, finish 트랜잭션만 상품 잠금 아래에서
 * 대상이 그대로인지 확인한 뒤 현재 리스팅 이름에 있는 별칭만 스냅샷 하나로 바꿔 쓴다.
 */
describe('Sellpia manual match over the operation contract (PG integration)', () => {
  let prisma: PrismaClient;
  let channels: ReturnType<typeof makeChannelsOperations>;
  let firstSkuId: string;
  let secondSkuId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    channels = makeChannelsOperations(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({ data: { id: ACCOUNT_ID, organizationId: ORG, channel: 'coupang', name: 'Wing' } });
    const catalogRun = await prisma.sourceImportRun.create({
      data: { organizationId: ORG, channelAccountId: ACCOUNT_ID, sourceType: 'coupang_wing_catalog', status: 'completed', fileName: 'catalog.xlsx', fileHash: randomUUID() },
    });
    await prisma.channelListing.create({
      data: { organizationId: ORG, channelAccountId: ACCOUNT_ID, externalId: `LISTING-${randomUUID()}`, displayName: 'Match Alias', lastImportRunId: catalogRun.id, isActive: true },
    });
    firstSkuId = (await prisma.masterProduct.create({
      data: { organizationId: ORG, code: '6402-1', sourceAccountKey: 'kiditem', sourceProductCode: '6402-1', sourceOptionCode: '', name: 'First SKU', currentStock: 10 },
    })).id;
    secondSkuId = (await prisma.masterProduct.create({
      data: { organizationId: ORG, code: '6402-2', sourceAccountKey: 'kiditem', sourceProductCode: '6402-2', sourceOptionCode: '', name: 'Second SKU', currentStock: 10 },
    })).id;
  });

  function begin(): Promise<OperationBeginResponse> {
    return channels.operations.begin(ORG, { kind: SELLPIA_MANUAL_MATCH_KIND, scope: {} }, { userId: null });
  }

  function finish(begun: OperationBeginResponse, items: SellpiaManualMatchRow[], outcome: 'succeeded' | 'failed' = 'succeeded') {
    return channels.runBegun(begun, () => [{ chunkKind: SELLPIA_MANUAL_MATCH_CHUNK_KIND, items }], { outcome });
  }

  async function aliases() {
    return prisma.sellpiaManualMatchAlias.findMany({
      where: { organizationId: ORG },
      select: { masterProductId: true, aliasTitle: true, itemCount: true, matchedType: true, evidenceCount: true },
      orderBy: { aliasTitle: 'asc' },
    });
  }

  it('freezes the sorted active Sellpia codes under the Sellpia login lock and refuses a second run', async () => {
    const begun = await begin();
    expect(begun.operation).toMatchObject({
      status: 'executing',
      lockKeys: [SELLPIA_LOGIN_LOCK_KEY],
      plan: {
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourcePath: '/product_manual_match.html',
        targetCount: 2,
        targetCodes: ['6402-1', '6402-2'],
      },
    });
    await expect(begin()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    await expect(channels.manualMatch.readSource(ORG)).resolves.toMatchObject({
      latestOperation: { id: begun.operation.id, status: 'executing' },
      currentSnapshot: null,
    });
  });

  it('keeps only aliases present in current listing names, sums evidence, keeps the stronger type, and replaces one snapshot', async () => {
    const operation = await finish(await begin(), rows());

    expect(operation).toMatchObject({ status: 'succeeded', result: { targets: 2, matched: 1 } });
    expect(await aliases()).toEqual([
      { masterProductId: firstSkuId, aliasTitle: 'Match Alias', itemCount: 2, matchedType: 'M', evidenceCount: 3 },
    ]);
    const source = await channels.manualMatch.readSource(ORG);
    expect(source.latestOperation).toMatchObject({ id: operation.id, status: 'succeeded' });
    expect(source.currentSnapshot).toMatchObject({ targetCount: 2, matchedTargetCount: 1, aliasCount: 1 });
    expect(await prisma.sellpiaManualMatchSnapshot.count()).toBe(1);
    expect(await prisma.sourceImportRun.count({ where: { sourceType: 'sellpia_product_manual_match' } })).toBe(0);
    expect(await prisma.operationChunk.count()).toBe(0);

    // 다음 실행은 스냅샷을 갈아 끼운다(조직마다 하나).
    await finish(await begin(), [rows()[1]!]);
    expect(await prisma.sellpiaManualMatchSnapshot.count()).toBe(1);
    expect(await aliases()).toEqual([
      { masterProductId: firstSkuId, aliasTitle: 'Match Alias', itemCount: 2, matchedType: 'M', evidenceCount: 2 },
    ]);
  });

  it('keeps the prior snapshot when a later run fails', async () => {
    await finish(await begin(), rows());
    const prior = await channels.manualMatch.readSource(ORG);

    const failed = await finish(await begin(), [], 'failed');
    expect(failed.status).toBe('failed');
    expect((await channels.manualMatch.readSource(ORG)).currentSnapshot).toEqual(prior.currentSnapshot);
    expect(await aliases()).toHaveLength(1);
  });

  it('refuses to publish when the active Sellpia codes changed after the plan, and keeps the prior snapshot', async () => {
    await finish(await begin(), rows());
    const prior = (await channels.manualMatch.readSource(ORG)).currentSnapshot;
    const begun = await begin();
    await prisma.masterProduct.update({ where: { id: secondSkuId }, data: { code: '6402-3' } });

    await expect(finish(begun, rows())).rejects.toMatchObject({
      code: 'SOURCE_SNAPSHOT_INVALID',
      details: { reason: 'sellpia_targets_changed' },
    });
    expect((await channels.manualMatch.readSource(ORG)).currentSnapshot).toEqual(prior);
    await channels.fail(begun);
    expect(await prisma.operationLock.count()).toBe(0);
  });

  it('refuses a row for a code outside the frozen targets, or the same row twice', async () => {
    const outside = await begin();
    await expect(finish(outside, [{ ...rows()[0]!, productCode: '9999-1' }]))
      .rejects.toMatchObject({ code: 'SOURCE_SNAPSHOT_INVALID', details: { reason: 'sellpia_match_row_outside_plan' } });
    await channels.fail(outside);

    await expect(finish(await begin(), [rows()[0]!, rows()[0]!]))
      .rejects.toMatchObject({ code: 'SOURCE_SNAPSHOT_INVALID', details: { reason: 'sellpia_match_row_duplicate' } });
    expect(await prisma.sellpiaManualMatchSnapshot.count()).toBe(0);
  });

  it('serializes publication behind an in-flight inventory owner mutation', async () => {
    const begun = await begin();
    let lockAcquired!: () => void;
    const lockReady = new Promise<void>((resolve) => { lockAcquired = resolve; });
    let releaseLock!: () => void;
    const lockRelease = new Promise<void>((resolve) => { releaseLock = resolve; });
    const mutation = prisma.$transaction(async (tx) => {
      await lockProductSource(tx, ORG);
      lockAcquired();
      await lockRelease;
      await tx.masterProduct.update({ where: { id: secondSkuId }, data: { code: '6402-3' } });
    }, { maxWait: 10_000, timeout: 30_000 });
    await lockReady;

    const completion = finish(begun, rows());
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseLock();
    await expect(completion).rejects.toMatchObject({ details: { reason: 'sellpia_targets_changed' } });
    await mutation;
    expect(await prisma.sellpiaManualMatchSnapshot.count()).toBe(0);
  });

  it('accepts aliases from listings published by an operation (lastOperationId) and a completed Rocket PO run, not an uncertified legacy one', async () => {
    await prisma.channelListing.updateMany({ where: { organizationId: ORG }, data: { isActive: false } });
    const rocket = await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'rocket', name: 'Rocket' } });
    const rocketRun = await prisma.sourceImportRun.create({
      data: { organizationId: ORG, channelAccountId: rocket.id, sourceType: 'coupang_rocket_po_catalog', parserVersion: 'rocket-po-v1', status: 'completed', importedAt: new Date() },
    });
    const legacyRun = await prisma.sourceImportRun.create({
      data: { organizationId: ORG, channelAccountId: rocket.id, sourceType: 'coupang_rocket_po_catalog', parserVersion: null, status: 'completed', importedAt: new Date() },
    });
    await prisma.channelListing.createMany({
      data: [
        { organizationId: ORG, channelAccountId: rocket.id, externalId: 'ROCKET-PO', displayName: 'Rocket Alias', lastImportRunId: rocketRun.id, isActive: true },
        { organizationId: ORG, channelAccountId: rocket.id, externalId: 'LEGACY', displayName: 'Legacy Rocket Alias', lastImportRunId: legacyRun.id, isActive: true },
        { organizationId: ORG, channelAccountId: rocket.id, externalId: 'CSV-OP', displayName: 'Operation Alias', lastOperationId: randomUUID(), isActive: true },
      ],
    });

    await finish(await begin(), [
      { productCode: '6402-1', aliasTitle: 'Rocket Alias', itemCount: 1, matchedType: 'M', evidenceCount: 1 },
      { productCode: '6402-2', aliasTitle: 'Legacy Rocket Alias', itemCount: 1, matchedType: 'M', evidenceCount: 1 },
      { productCode: '6402-2', aliasTitle: 'Operation Alias', itemCount: 1, matchedType: 'P', evidenceCount: 1 },
    ]);
    expect((await aliases()).map(({ aliasTitle, masterProductId }) => [aliasTitle, masterProductId])).toEqual([
      ['Operation Alias', secondSkuId],
      ['Rocket Alias', firstSkuId],
    ]);
  });

  it('reads only its own organization', async () => {
    await finish(await begin(), rows());
    await expect(channels.manualMatch.readSource(OTHER_ORGANIZATION_ID)).resolves.toEqual({ latestOperation: null, currentSnapshot: null });
  });
});
