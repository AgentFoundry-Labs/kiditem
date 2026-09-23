import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { RegistrationContentFactsRepositoryAdapter } from '../adapter/out/repository/registration-content-facts.repository.adapter';

/**
 * 등록 상태 reader 가 Content 에서 읽는 것은 판매 상품 작업공간의 두 현재 포인터뿐이다(KID-320) — 현재 상세
 * revision id 와 현재 대표이미지 자산 id. 여러 상품을 한 번에 읽는다.
 */
describe('registration content facts (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let facts: RegistrationContentFactsRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    facts = new RegistrationContentFactsRepositoryAdapter(prisma as unknown as PrismaService);
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function workspace(organizationId = ORG) {
    const salesProductId = randomUUID();
    const created = await prisma.contentWorkspace.create({ data: { organizationId, ownerType: 'sales_product', salesProductId } });
    return { salesProductId, workspace: created };
  }

  async function currentContent(organizationId: string, workspaceId: string) {
    const page = await prisma.detailPage.create({ data: { organizationId, contentWorkspaceId: workspaceId, source: 'manual' } });
    const revision = await prisma.detailPageRevision.create({ data: { organizationId, detailPageId: page.id, html: '<p/>' } });
    const asset = await prisma.contentAsset.create({ data: {
      organizationId, contentWorkspaceId: workspaceId, source: 'upload', assetKey: `upload:${randomUUID()}`, url: 'https://cdn.example/a.png', role: 'thumbnail',
    } });
    await prisma.contentWorkspace.update({ where: { id: workspaceId }, data: { currentDetailPageRevisionId: revision.id, currentThumbnailAssetId: asset.id } });
    return { revisionId: revision.id, assetId: asset.id };
  }

  it('reads the current detail revision and representative asset of many products, null when unset or deleted', async () => {
    const full = await workspace();
    const fullContent = await currentContent(ORG, full.workspace.id);
    const empty = await workspace();
    const deleted = await workspace();
    const deletedContent = await currentContent(ORG, deleted.workspace.id);
    await prisma.contentAsset.update({ where: { id: deletedContent.assetId }, data: { isDeleted: true } });
    const foreign = await workspace(OTHER_ORGANIZATION_ID);
    await currentContent(OTHER_ORGANIZATION_ID, foreign.workspace.id);

    const read = await facts.readCurrentContentIds({
      organizationId: ORG,
      salesProductIds: [full.salesProductId, empty.salesProductId, deleted.salesProductId, foreign.salesProductId, randomUUID()],
    });

    expect(read).toEqual(new Map([
      [full.salesProductId, { detailPageRevisionId: fullContent.revisionId, thumbnailAssetId: fullContent.assetId }],
      [empty.salesProductId, { detailPageRevisionId: null, thumbnailAssetId: null }],
      [deleted.salesProductId, { detailPageRevisionId: deletedContent.revisionId, thumbnailAssetId: null }],
    ]));
  });
});
