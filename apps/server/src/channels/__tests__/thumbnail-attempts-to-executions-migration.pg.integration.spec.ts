import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';
import { RegistrableThumbnailRepositoryAdapter } from '../../content/adapter/out/repository/registrable-thumbnail.repository.adapter';
import { RegistrableThumbnailService } from '../../content/application/service/registrable-thumbnail.service';
import { fakeStorageImageFetch } from '../../content/__tests__/helpers/fake-storage-image-fetch';
import { RegistrableThumbnailAdapter } from '../adapter/out/content/registrable-thumbnail.adapter';
import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { ThumbnailExecutionPersistenceAdapter } from '../adapter/out/persistence/thumbnail-execution.persistence.adapter';
import { ThumbnailExecutionService } from '../application/service/registration/thumbnail-execution.service';
import { moveThumbnailRegistrationAttemptsToExecutionsMigration as migration } from '../../../../../scripts/data-migrations/v0.1.31/026_move_thumbnail_registration_attempts_to_executions';

const ROLLBACK = new Error('rollback legacy schema');

describe('v0.1.31:026 thumbnail registration attempts → thumbnail_update executions (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /** 이관 대상 테이블은 스키마에서 빠졌으므로 예전 모양을 트랜잭션 안에 되살리고 끝나면 되돌린다. */
  async function withLegacyAttempts<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    let result: T | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DROP TABLE IF EXISTS thumbnail_registration_attempts`;
      await tx.$executeRaw`CREATE TABLE thumbnail_registration_attempts (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, generation_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'uploaded', owner_idempotency_key text, request_hash text,
        provider_outcome text, result_json jsonb, error_message text, screenshot_url text, external_id text,
        started_at timestamptz, finished_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      result = await work(tx);
      throw ROLLBACK;
    }, { timeout: 30_000 }).catch((error: unknown) => { if (error !== ROLLBACK) throw error; });
    return result as T;
  }

  async function attempt(tx: Prisma.TransactionClient, input: {
    generationId: string; status: string; organizationId?: string; ownerKey?: string | null; requestHash?: string | null;
    error?: string | null; screenshot?: string | null; externalId?: string | null;
    startedAt?: string; finishedAt?: string | null; createdAt?: string; updatedAt?: string;
  }): Promise<string> {
    const id = randomUUID();
    await tx.$executeRaw`
      INSERT INTO thumbnail_registration_attempts
        (id, organization_id, generation_id, status, owner_idempotency_key, request_hash, error_message,
         screenshot_url, external_id, started_at, finished_at, created_at, updated_at)
      VALUES (${id}::uuid, ${input.organizationId ?? ORG}::uuid, ${input.generationId}::uuid, ${input.status},
        ${input.ownerKey ?? null}, ${input.requestHash ?? null}, ${input.error ?? null}, ${input.screenshot ?? null},
        ${input.externalId ?? null}, ${input.startedAt ?? '2026-09-01T00:00:00Z'}::timestamptz,
        ${input.finishedAt === undefined ? '2026-09-01T00:01:00Z' : input.finishedAt}::timestamptz,
        ${input.createdAt ?? '2026-09-01T00:00:00Z'}::timestamptz, ${input.updatedAt ?? '2026-09-01T00:02:00Z'}::timestamptz)
    `;
    return id;
  }

  async function account(tx: Prisma.TransactionClient, organizationId = ORG, channel = 'coupang', status = 'active') {
    return tx.channelAccount.create({ data: { organizationId, channel, name: randomUUID(), status } });
  }

  async function listingGeneration(tx: Prisma.TransactionClient, input: { channelName?: string; organizationId?: string; accountStatus?: string } = {}) {
    const organizationId = input.organizationId ?? ORG;
    const owner = await account(tx, organizationId, 'coupang', input.accountStatus ?? 'active');
    const listing = await tx.channelListing.create({
      data: { organizationId, channelAccountId: owner.id, externalId: randomUUID(), channelName: input.channelName ?? '쿠팡 상품명' },
    });
    const workspace = await tx.contentWorkspace.create({
      data: { organizationId, ownerType: 'channel_listing', channelListingId: listing.id, displayName: '작업공간', normalizedTitle: randomUUID() },
    });
    const generation = await tx.thumbnailGeneration.create({
      data: { organizationId, contentWorkspaceId: workspace.id, status: 'succeeded', phase: 'applied', selectedUrl: 'http://storage.local/a.png' },
    });
    return { account: owner, listing, workspace, generation };
  }

  async function productGeneration(tx: Prisma.TransactionClient, input: { selectedUrl?: string | null; candidates?: string[] } = {}) {
    const product = await tx.salesProduct.create({ data: { organizationId: ORG, name: '판매상품' } });
    const workspace = await tx.contentWorkspace.create({
      data: { organizationId: ORG, ownerType: 'sales_product', salesProductId: product.id, displayName: '판매상품 작업공간', normalizedTitle: randomUUID() },
    });
    const generation = await tx.thumbnailGeneration.create({
      data: {
        organizationId: ORG, contentWorkspaceId: workspace.id, status: 'succeeded',
        selectedUrl: input.selectedUrl === undefined ? 'http://storage.local/b.png' : input.selectedUrl,
        candidates: { create: (input.candidates ?? []).map((url, index) => ({ organizationId: ORG, url, sortOrder: index })) },
      },
    });
    return { product, workspace, generation };
  }

  const executions = (tx: Prisma.TransactionClient) => tx.productRegistrationExecution.findMany({
    where: { executionKind: 'thumbnail_update' }, orderBy: { createdAt: 'asc' },
  });

  it('maps uploaded, failed and unfinished attempts to executions with their account, payload, keys and timestamps', async () => {
    const result = await withLegacyAttempts(async (tx) => {
      // listing 의 계정은 쉬고 있어도 그 listing 의 계정이다. 활성 쿠팡 계정은 하나(only)다.
      const listed = await listingGeneration(tx, { channelName: encodeURIComponent('쿠팡 이름'), accountStatus: 'inactive' });
      const product = await productGeneration(tx);
      const only = await account(tx);
      await account(tx, ORG, 'coupang', 'inactive');
      const uploaded = await attempt(tx, { generationId: listed.generation.id, status: 'uploaded', screenshot: 'chrome-extension://shot.png', externalId: 'seller-1' });
      const failed = await attempt(tx, { generationId: product.generation.id, status: 'failed', error: '로그인 필요', createdAt: '2026-09-02T00:00:00Z' });
      const running = await attempt(tx, {
        generationId: product.generation.id, status: 'running', ownerKey: 'capability-invocation:x', requestHash: 'a'.repeat(64),
        error: 'port closed', finishedAt: null, createdAt: '2026-09-03T00:00:00Z', updatedAt: '2026-09-03T00:05:00Z',
      });
      const run = await migration.run(tx, { target: 'office' });
      return { run, rows: await executions(tx), listed, product, only, uploaded, failed, running };
    });

    expect(result.run).toEqual({
      affectedRows: 3,
      details: {
        outcome: 'moved', attempts: 3, moved: 3, movedByStatus: { succeeded: 1, failed: 1, reconciling: 1 },
        alreadyMoved: 0, skipped: 0, skippedBy: { workspace: 0, image: 0, account: 0, supersededLive: 0 },
      },
    });
    const [uploaded, failed, running] = result.rows;
    expect(uploaded).toMatchObject({
      organizationId: ORG,
      channelAccountId: result.listed.account.id,
      channelListingId: null,
      idempotencyKey: `thumbnail_update:legacy:${result.uploaded}`,
      status: 'succeeded', providerOutcome: 'succeeded', lastErrorCode: null, lastErrorMessage: null,
      ownerIdempotencyKey: null,
      startedAt: new Date('2026-09-01T00:00:00Z'), completedAt: new Date('2026-09-01T00:01:00Z'),
      createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:02:00Z'),
      resultJson: { legacyAttemptId: result.uploaded, screenshotPath: 'chrome-extension://shot.png', externalId: 'seller-1' },
      submissionPayloadJson: {
        kind: 'thumbnail_update', generationId: result.listed.generation.id, contentWorkspaceId: result.listed.workspace.id,
        salesProductId: null, channelListingId: result.listed.listing.id, productName: '쿠팡 이름',
        image: { url: 'http://storage.local/a.png', assetId: null, sha256: 'legacy' },
      },
    });
    expect(uploaded!.submissionPayloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(uploaded!.requestHash).toBe(uploaded!.submissionPayloadHash);
    expect(failed).toMatchObject({
      channelAccountId: result.only.id, channelListingId: null,
      status: 'failed', providerOutcome: 'definitive_failure', lastErrorCode: 'thumbnail_rejected', lastErrorMessage: '로그인 필요',
      submissionPayloadJson: expect.objectContaining({ salesProductId: result.product.product.id, productName: '판매상품 작업공간' }),
    });
    expect(running).toMatchObject({
      status: 'reconciling', providerOutcome: 'uncertain', lastErrorCode: 'thumbnail_outcome_unknown', lastErrorMessage: 'port closed',
      ownerIdempotencyKey: 'capability-invocation:x', requestHash: 'a'.repeat(64), completedAt: null,
      // owner 키가 있으면 런타임과 같은 멱등 키라 Agent 재생이 이 실행을 찾는다.
      idempotencyKey: 'thumbnail_update:capability-invocation:x',
    });
  }, 60_000);

  it('counts attempts it cannot place as skipped and leaves them behind without failing', async () => {
    const result = await withLegacyAttempts(async (tx) => {
      await attempt(tx, { generationId: randomUUID(), status: 'uploaded' });
      const noImage = await productGeneration(tx, { selectedUrl: null, candidates: ['http://a/1.png', 'http://a/2.png'] });
      await attempt(tx, { generationId: noImage.generation.id, status: 'uploaded' });
      const noAccount = await productGeneration(tx);
      await attempt(tx, { generationId: noAccount.generation.id, status: 'failed' });
      const theirs = await listingGeneration(tx, { organizationId: OTHER_ORGANIZATION_ID });
      await attempt(tx, { organizationId: OTHER_ORGANIZATION_ID, generationId: theirs.generation.id, status: 'running', ownerKey: 'capability-invocation:old', createdAt: '2026-09-01T00:00:00Z' });
      await attempt(tx, { organizationId: OTHER_ORGANIZATION_ID, generationId: theirs.generation.id, status: 'running', ownerKey: 'capability-invocation:new', createdAt: '2026-09-02T00:00:00Z' });
      await account(tx);
      await account(tx);
      return { run: await migration.run(tx, { target: 'office' }), rows: await executions(tx) };
    });

    expect(result.run.details).toMatchObject({
      attempts: 5, moved: 1, alreadyMoved: 0, skipped: 4,
      skippedBy: { workspace: 1, image: 1, account: 1, supersededLive: 1 },
    });
    expect(result.run.details).toMatchObject({ movedByStatus: { reconciling: 1 } });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ organizationId: OTHER_ORGANIZATION_ID, status: 'reconciling', createdAt: new Date('2026-09-02T00:00:00Z') });
  }, 60_000);

  it('keeps what the operator saw: every legacy uploaded or registered attempt, with or without an owner key, becomes succeeded', async () => {
    const result = await withLegacyAttempts(async (tx) => {
      const ids: string[] = [];
      for (const [status, ownerKey] of [['uploaded', null], ['uploaded', 'capability-invocation:u'], ['registered', null], ['registered', 'capability-invocation:r']] as const) {
        const listed = await listingGeneration(tx);
        ids.push(await attempt(tx, { generationId: listed.generation.id, status, ownerKey, requestHash: ownerKey ? 'e'.repeat(64) : null }));
      }
      const run = await migration.run(tx, { target: 'office' });
      return { run, rows: await executions(tx) };
    });
    expect(result.run.details).toMatchObject({ moved: 4, movedByStatus: { succeeded: 4, failed: 0, reconciling: 0 } });
    expect(result.rows.map((row) => [row.status, row.providerOutcome])).toEqual(Array(4).fill(['succeeded', 'succeeded']));
  }, 60_000);

  it('ends an unreported browser attempt as failed and keeps only owner-keyed live attempts reconciling', async () => {
    const result = await withLegacyAttempts(async (tx) => {
      const listed = await listingGeneration(tx);
      const browser = await attempt(tx, { generationId: listed.generation.id, status: 'running', finishedAt: null, createdAt: '2026-09-01T00:00:00Z' });
      const other = await listingGeneration(tx);
      const agent = await attempt(tx, { generationId: other.generation.id, status: 'running', ownerKey: 'capability-invocation:a', requestHash: 'd'.repeat(64), finishedAt: null });
      const run = await migration.run(tx, { target: 'office' });
      const rows = await executions(tx);
      return { run, rows, browser, agent };
    });
    expect(result.run.details).toMatchObject({ moved: 2, movedByStatus: { failed: 1, reconciling: 1, succeeded: 0 } });
    expect(result.rows.find((row) => row.idempotencyKey === `thumbnail_update:legacy:${result.browser}`)).toMatchObject({
      status: 'failed', providerOutcome: 'definitive_failure', lastErrorCode: 'thumbnail_rejected',
      lastErrorMessage: '이관: 결과를 보고받지 못한 이전 화면 시도', completedAt: new Date('2026-09-01T00:02:00Z'),
    });
    expect(result.rows.find((row) => row.idempotencyKey === 'thumbnail_update:capability-invocation:a')).toMatchObject({
      status: 'reconciling', providerOutcome: 'uncertain', completedAt: null,
    });
  }, 60_000);

  it('keeps the listing in the payload only, so a moved attempt never takes the listing slot of a live execution', async () => {
    const result = await withLegacyAttempts(async (tx) => {
      const busy = await listingGeneration(tx);
      await tx.productRegistrationExecution.create({
        data: {
          organizationId: ORG, channelAccountId: busy.account.id, channelListingId: busy.listing.id, executionKind: 'update',
          idempotencyKey: randomUUID(), requestHash: 'b'.repeat(64), status: 'executing', providerOutcome: 'uncertain',
        },
      });
      await attempt(tx, { generationId: busy.generation.id, status: 'running', ownerKey: 'capability-invocation:busy', requestHash: 'c'.repeat(64) });
      const run = await migration.run(tx, { target: 'office' });
      const [moved] = await executions(tx);
      return { run, moved, busy };
    });
    expect(result.run).toMatchObject({ affectedRows: 1, details: { moved: 1, skipped: 0 } });
    expect(result.moved).toMatchObject({
      status: 'reconciling', channelListingId: null,
      submissionPayloadJson: expect.objectContaining({ channelListingId: result.busy.listing.id }),
    });
  }, 60_000);

  it('keeps an Agent owner key replayable: after the move the same key and hash answer the recorded result without an upload', async () => {
    const generationRef: { id?: string } = {};
    const ownerKey = `capability-invocation:${randomUUID()}`;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`CREATE TABLE thumbnail_registration_attempts (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL, generation_id uuid NOT NULL, status text NOT NULL,
          owner_idempotency_key text, request_hash text, error_message text, screenshot_url text, external_id text,
          started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )`;
        const listed = await listingGeneration(tx);
        generationRef.id = listed.generation.id;
        await attempt(tx, {
          generationId: listed.generation.id, status: 'uploaded', ownerKey,
          requestHash: canonicalOwnerInputHash({ generationId: listed.generation.id }), screenshot: '/tmp/legacy.png',
        });
        await migration.run(tx, { target: 'office' });
      }, { timeout: 30_000 });

      const db = prisma as PrismaService;
      let uploads = 0;
      const service = new ThumbnailExecutionService(
        new RegistrableThumbnailAdapter(new RegistrableThumbnailService(new RegistrableThumbnailRepositoryAdapter(db), fakeStorageImageFetch(new Map()))),
        new ThumbnailExecutionPersistenceAdapter(db),
        { isBlocked: () => false, upload: async () => { uploads += 1; return { outcome: 'uploaded_pending_save', screenshotPath: null }; } },
        new ChannelIntegrityAdapter(),
      );
      const generationId = generationRef.id!;
      await expect(service.runOnServer({
        organizationId: ORG, requestedByUserId: null, generationId,
        owner: { ownerIdempotencyKey: ownerKey, requestHash: canonicalOwnerInputHash({ generationId }) },
      })).resolves.toMatchObject({ generationId, success: true, status: 'succeeded', screenshotPath: '/tmp/legacy.png' });
      expect(uploads).toBe(0);
      expect(await prisma.productRegistrationExecution.findFirstOrThrow({ where: { executionKind: 'thumbnail_update' } }))
        .toMatchObject({ idempotencyKey: `thumbnail_update:${ownerKey}`, ownerIdempotencyKey: ownerKey });
    } finally {
      await prisma.$executeRaw`DROP TABLE IF EXISTS thumbnail_registration_attempts`;
    }
  }, 60_000);

  it('moves nothing twice and reports the earlier move on a rerun', async () => {
    const result = await withLegacyAttempts(async (tx) => {
      const listed = await listingGeneration(tx);
      await attempt(tx, { generationId: listed.generation.id, status: 'uploaded' });
      await attempt(tx, { generationId: listed.generation.id, status: 'failed', createdAt: '2026-09-02T00:00:00Z' });
      const first = await migration.run(tx, { target: 'office' });
      const second = await migration.run(tx, { target: 'office' });
      return { first, second, count: (await executions(tx)).length };
    });

    expect(result.first).toMatchObject({ affectedRows: 2, details: { moved: 2, alreadyMoved: 0 } });
    expect(result.second).toMatchObject({ affectedRows: 0, details: { moved: 0, alreadyMoved: 2, skipped: 0 } });
    expect(result.count).toBe(2);
  }, 60_000);

  it('writes only inside the runner transaction, so a failed run leaves no execution behind', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`CREATE TABLE thumbnail_registration_attempts (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, generation_id uuid NOT NULL, status text NOT NULL,
        owner_idempotency_key text, request_hash text, error_message text, screenshot_url text, external_id text,
        started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      const listed = await listingGeneration(tx);
      await attempt(tx, { generationId: listed.generation.id, status: 'uploaded' });
      const run = await migration.run(tx, { target: 'office' });
      expect(run.affectedRows).toBe(1);
      throw new Error('a later cutover step failed');
    }, { timeout: 30_000 })).rejects.toThrow('a later cutover step failed');

    expect(await prisma.productRegistrationExecution.count({ where: { executionKind: 'thumbnail_update' } })).toBe(0);
    const [table] = await prisma.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass('thumbnail_registration_attempts') IS NOT NULL AS present`;
    expect(table?.present).toBe(false);
  }, 60_000);

  it('does nothing once the attempt table is gone', async () => {
    const run = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DROP TABLE IF EXISTS thumbnail_registration_attempts`;
      return migration.run(tx, { target: 'office' });
    });
    expect(run).toEqual({ affectedRows: 0, details: { outcome: 'absent' } });
  });
});
