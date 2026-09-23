import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { DetailPageRepositoryAdapter } from '../adapter/out/repository/detail-page.repository.adapter';
import { ownerTransaction } from '../../prisma/owner-transaction';
import type { PrismaService } from '../../prisma/prisma.service';
import type {
  AppendRevisionInput,
  CreateDetailPageInput,
} from '../application/port/out/repository/detail-page.repository.port';

/**
 * 상세 페이지 한 표(KID-313 W3b). 이 저장소가 두 현재 포인터(상세 페이지 · 워크스페이스)의 유일한 writer 이고,
 * 옮길지 말지는 도메인 `decideRevisionPointer` 를 워크스페이스 잠금 안에서 따른다.
 */
describe('detail page repository (PG integration)', () => {
  let prisma: PrismaClient;
  let pages: DetailPageRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    pages = new DetailPageRepositoryAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function workspace(): Promise<string> {
    const row = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sales_product',
        salesProductId: randomUUID(),
        status: 'active',
      },
      select: { id: true },
    });
    return row.id;
  }

  function create(contentWorkspaceId: string, overrides: Partial<CreateDetailPageInput> = {}) {
    return prisma.$transaction((tx) => pages.create(ownerTransaction(tx), {
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId,
      source: 'generated',
      templateId: 'bold-vertical',
      title: '아동 장화',
      status: 'pending',
      generationInput: { rawTitle: '아동 장화' },
      triggeredByUserId: TEST_USER_ID,
      ...overrides,
    }));
  }

  function append(detailPageId: string, overrides: Partial<AppendRevisionInput> = {}) {
    return prisma.$transaction((tx) => pages.appendRevision(ownerTransaction(tx), {
      organizationId: TEST_ORGANIZATION_ID,
      detailPageId,
      revisionType: 'manual_edit',
      html: '<p>상세</p>',
      imageUrls: [],
      createdByUserId: TEST_USER_ID,
      ...overrides,
    }));
  }

  function setStatus(detailPageId: string, status: 'pending' | 'processing' | 'ready' | 'failed', errorMessage?: string) {
    return prisma.$transaction((tx) => pages.setStatus(ownerTransaction(tx), {
      organizationId: TEST_ORGANIZATION_ID, detailPageId, status, errorMessage,
    }));
  }

  async function workspaceCurrent(contentWorkspaceId: string): Promise<string | null> {
    const row = await prisma.contentWorkspace.findUniqueOrThrow({
      where: { id: contentWorkspaceId }, select: { currentDetailPageRevisionId: true },
    });
    return row.currentDetailPageRevisionId;
  }

  it('moves a generated page pending → processing → ready only by recording its result', async () => {
    const workspaceId = await workspace();
    const page = await create(workspaceId);
    expect(page).toMatchObject({ source: 'generated', status: 'pending', currentRevisionId: null, generationResult: {} });

    // ready 는 결과를 쓰는 길로만 온다 — 상태만 바꾸는 길은 없다.
    await expect(setStatus(page.id, 'ready')).rejects.toBeInstanceOf(ConflictException);
    const complete = () => prisma.$transaction((tx) => pages.completeGeneration(ownerTransaction(tx), {
      organizationId: TEST_ORGANIZATION_ID,
      detailPageId: page.id,
      title: '말랑 장화',
      generationResult: { templateId: 'bold-vertical', result: { hook: { text: '말랑' } }, processedImages: {} },
    }));
    await expect(complete()).rejects.toBeInstanceOf(ConflictException);

    await setStatus(page.id, 'processing');
    await complete();

    await expect(pages.findById({ organizationId: TEST_ORGANIZATION_ID, detailPageId: page.id })).resolves.toMatchObject({
      status: 'ready',
      title: '말랑 장화',
      errorMessage: null,
      currentRevisionId: null,
      generationResult: { templateId: 'bold-vertical', result: { hook: { text: '말랑' } } },
    });
    // 두 번째 완료는 끝난 페이지를 건드리지 않는다.
    await expect(complete()).rejects.toBeInstanceOf(ConflictException);

    // 웹이 처음 그린 HTML 이 generated revision 이 되고, 사람 편집이 없는 워크스페이스의 현재가 된다.
    const revision = await append(page.id, { revisionType: 'generated', html: '<p>생성 상세</p>', imageUrls: ['https://cdn.example/a.jpg'] });
    expect(revision).toMatchObject({ revisionType: 'generated', becamePageCurrent: true, becameWorkspaceCurrent: true });
    expect(await workspaceCurrent(workspaceId)).toBe(revision.id);
    await expect(pages.listRevisions({ organizationId: TEST_ORGANIZATION_ID, detailPageId: page.id }))
      .resolves.toMatchObject([{ id: revision.id, imageUrls: ['https://cdn.example/a.jpg'] }]);
  });

  it('fails a generation with its message, retries the same page from failed, and refuses to leave ready', async () => {
    const workspaceId = await workspace();
    const page = await create(workspaceId);
    await setStatus(page.id, 'processing');

    await setStatus(page.id, 'failed', '모델 오류');
    await expect(pages.findById({ organizationId: TEST_ORGANIZATION_ID, detailPageId: page.id }))
      .resolves.toMatchObject({ status: 'failed', errorMessage: '모델 오류' });

    await setStatus(page.id, 'pending');
    await expect(pages.findById({ organizationId: TEST_ORGANIZATION_ID, detailPageId: page.id }))
      .resolves.toMatchObject({ status: 'pending', errorMessage: null });

    const manual = await create(workspaceId, { source: 'manual', status: 'ready', templateId: null });
    await expect(setStatus(manual.id, 'pending')).rejects.toBeInstanceOf(ConflictException);
    // 생성이 아닌 페이지는 처음부터 ready 이고, 생성 페이지를 ready 로 만들어 두고 시작할 수 없다.
    await expect(create(workspaceId, { status: 'ready' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('never lets a machine revision replace a human edit as the workspace current, but keeps it in history', async () => {
    const workspaceId = await workspace();
    const manual = await create(workspaceId, { source: 'manual', status: 'ready', templateId: null });
    const edited = await append(manual.id, { revisionType: 'manual_edit', html: '<p>사람</p>' });
    expect(edited).toMatchObject({ becamePageCurrent: true, becameWorkspaceCurrent: true });

    const generated = await create(workspaceId);
    await setStatus(generated.id, 'processing');
    const machine = await append(generated.id, { revisionType: 'generated', html: '<p>기계</p>' });

    // 새 생성 페이지 안에서는 첫 revision 이라 현재가 되지만, 몰로 가는 워크스페이스 현재는 사람 편집 그대로다.
    expect(machine).toMatchObject({ becamePageCurrent: true, becameWorkspaceCurrent: false });
    expect(await workspaceCurrent(workspaceId)).toBe(edited.id);

    // 사람이 그 생성 결과를 고치면 그것이 현재가 된다.
    const human = await append(generated.id, { revisionType: 'manual_edit', html: '<p>고친 기계</p>' });
    expect(human).toMatchObject({ becamePageCurrent: true, becameWorkspaceCurrent: true });
    expect(await workspaceCurrent(workspaceId)).toBe(human.id);
  });

  it('lets an operator pick any revision of the workspace as current, and rejects another workspace\'s revision', async () => {
    const workspaceId = await workspace();
    const foreignWorkspaceId = await workspace();
    const page = await create(workspaceId, { source: 'manual', status: 'ready', templateId: null });
    const first = await append(page.id, { html: '<p>첫</p>' });
    await append(page.id, { html: '<p>둘</p>' });
    const foreignPage = await create(foreignWorkspaceId, { source: 'manual', status: 'ready', templateId: null });
    const foreign = await append(foreignPage.id, { html: '<p>남의 것</p>' });

    await prisma.$transaction((tx) => pages.setCurrentRevision(ownerTransaction(tx), {
      organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId: workspaceId, revisionId: first.id,
    }));
    expect(await workspaceCurrent(workspaceId)).toBe(first.id);
    await expect(pages.findById({ organizationId: TEST_ORGANIZATION_ID, detailPageId: page.id }))
      .resolves.toMatchObject({ currentRevisionId: first.id });

    await expect(prisma.$transaction((tx) => pages.setCurrentRevision(ownerTransaction(tx), {
      organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId: workspaceId, revisionId: foreign.id,
    }))).rejects.toBeInstanceOf(BadRequestException);
    expect(await workspaceCurrent(workspaceId)).toBe(first.id);
    await expect(pages.findRevision({ organizationId: TEST_ORGANIZATION_ID, revisionId: foreign.id }))
      .resolves.toMatchObject({ contentWorkspaceId: foreignWorkspaceId, html: '<p>남의 것</p>' });
  });

  it('serialises concurrent saves on one workspace so both pointers name the same last revision', async () => {
    const workspaceId = await workspace();
    const left = await create(workspaceId, { source: 'manual', status: 'ready', templateId: null });
    const right = await create(workspaceId, { source: 'uploaded', status: 'ready', templateId: null });

    const saved = await Promise.all([
      append(left.id, { html: '<p>왼쪽</p>' }),
      append(right.id, { html: '<p>오른쪽</p>' }),
      append(left.id, { html: '<p>왼쪽 2</p>' }),
    ]);

    const current = await workspaceCurrent(workspaceId);
    expect(saved.map((row) => row.id)).toContain(current);
    const revisions = await prisma.detailPageRevision.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true },
    });
    expect(revisions).toHaveLength(3);
  });

  it('soft-deletes a page and falls the workspace current back to another live page', async () => {
    const workspaceId = await workspace();
    const older = await create(workspaceId, { source: 'manual', status: 'ready', templateId: null });
    const kept = await append(older.id, { html: '<p>남는 것</p>' });
    const newer = await create(workspaceId, { source: 'uploaded', status: 'ready', templateId: null });
    await append(newer.id, { html: '<p>지울 것</p>' });

    await prisma.$transaction((tx) => pages.markDeleted(ownerTransaction(tx), {
      organizationId: TEST_ORGANIZATION_ID, detailPageId: newer.id,
    }));

    expect(await workspaceCurrent(workspaceId)).toBe(kept.id);
    await expect(pages.findById({ organizationId: TEST_ORGANIZATION_ID, detailPageId: newer.id })).resolves.toBeNull();
    await expect(pages.listByWorkspace({ organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId: workspaceId }))
      .resolves.toMatchObject([{ id: older.id }]);
  });
});
