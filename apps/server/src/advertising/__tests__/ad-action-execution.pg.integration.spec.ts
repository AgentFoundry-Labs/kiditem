import { createHash } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AD_ACTION_EVIDENCE_CHUNK_KIND, AD_ACTION_KIND } from '@kiditem/shared/advertising-operations';
import type { OperationClaimResult } from '@kiditem/shared/operation';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { seedAdReportRun } from '../../test-helpers/ad-ledger-seeds';
import { businessDateKey } from '../../common/kst';
import { OPERATION_PORT, type OperationPort } from '../../common/operation/application/port/in/operation.port';
import { PrismaService } from '../../prisma/prisma.service';
import { AdvertisingModule } from '../advertising.module';
import { AdActionService } from '../application/service/ad-action.service';
import { AdCampaignsService } from '../application/service/ad-campaigns.service';
import { AdStrategyService } from '../application/service/ad-strategy.service';
import { periodBounds } from '../domain/ad-metrics';
import { enableAdActionOperations } from './test-helpers/ad-action-operations';

const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

/**
 * 광고 액션은 결정이고, 실행 상태는 그 결정의 `advertising.ad_action` 실행(operations)에서만 읽는다(KID-386).
 * 승인·캠페인 등록이 실행을 준비하고, 확장이 claim·finish하면 목록·필터·집계·키워드 제안·중복 검사가 같은 말을 한다.
 */
describe('AdAction execution read from its advertising.ad_action operation (PG integration)', () => {
  let prisma: PrismaClient;
  let module: TestingModule;
  let actions: AdActionService;
  let strategy: AdStrategyService;
  let campaigns: AdCampaignsService;
  let operations: OperationPort;
  let accountId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    module = await Test.createTestingModule({ imports: [EventEmitterModule.forRoot(), AdvertisingModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    enableAdActionOperations(module);
    actions = module.get(AdActionService);
    strategy = module.get(AdStrategyService);
    campaigns = module.get(AdCampaignsService);
    operations = module.get(OPERATION_PORT, { strict: false });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    accountId = (await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Ads', externalAccountId: 'ads', isPrimary: true, vendorId: 'VENDOR-A' },
    })).id;
  });

  async function seedListing(externalId: string, channelAccountId = accountId, organizationId = ORG) {
    return prisma.channelListing.create({
      data: { organizationId, channelAccountId, externalId, displayName: `상품 ${externalId}`, isActive: true },
    });
  }

  async function register(campaignName: string, listingIds: string[]) {
    return strategy.registerCampaign({
      campaignName,
      adGroupName: 'A등급_그룹',
      grade: 'A',
      dailyBudget: 30_000,
      operationMode: '매출최적화',
      listings: listingIds.map((listingId) => ({ listingId })),
      targetRoas: 350,
    }, ORG);
  }

  async function seedAction(values: {
    targetLabel: string;
    actionType?: string;
    approvalStatus?: string;
    targetType?: string;
    externalId?: string;
    organizationId?: string;
    createdAt?: Date;
  }) {
    return (await prisma.adAction.create({
      data: {
        organizationId: values.organizationId ?? ORG,
        actionType: values.actionType ?? 'change_bid',
        targetType: values.targetType ?? 'keyword',
        externalId: values.externalId ?? null,
        targetLabel: values.targetLabel,
        reason: `${values.targetLabel} 연관 없음`,
        approvalStatus: values.approvalStatus ?? 'pending_review',
        ...(values.createdAt ? { createdAt: values.createdAt } : {}),
      },
    })).id;
  }

  const claim = async (): Promise<OperationClaimResult> => {
    const claimed = await operations.claimForOrganization(ORG, { kinds: [AD_ACTION_KIND], workerId: 'ext-popup' });
    if (!claimed) throw new Error('nothing to claim');
    return claimed;
  };

  async function succeed(claimed: OperationClaimResult, campaignId: string | null) {
    const payload = [{ campaignId, campaignName: null, observedAt: new Date().toISOString(), message: null }];
    await operations.putChunk({
      organizationId: ORG,
      operationId: claimed.operation.id,
      token: claimed.token,
      chunkKind: AD_ACTION_EVIDENCE_CHUNK_KIND,
      sequence: 1,
      request: { checksum: checksum(payload), payload },
    });
    await operations.finish({
      organizationId: ORG,
      operationId: claimed.operation.id,
      token: claimed.token,
      request: { outcome: 'succeeded', result: { providerOutcome: campaignId ? 'created' : 'uncertain' } },
    });
  }

  const fail = (claimed: OperationClaimResult) => operations.finish({
    organizationId: ORG,
    operationId: claimed.operation.id,
    token: claimed.token,
    request: { outcome: 'failed', errorCode: 'ADVERTISING_AD_CENTER_FORM_CHANGED', errorMessage: '완료 버튼을 찾지 못했습니다.' },
  });

  const listed = async (query: Record<string, string> = {}) =>
    (await actions.getActions({ limit: 200, ...query }, ORG));

  const statusOf = async (actionId: string) =>
    (await listed()).items.find((item) => item.id === actionId);

  it('a campaign registration is approved and prepared with its account and product keys', async () => {
    const listing = await seedListing('PRODUCT-A');
    const result = await register('봄 캠페인', [listing.id]);

    expect(result).toEqual({ ok: true, actionId: expect.any(String), operationId: expect.any(String) });
    const action = await prisma.adAction.findUniqueOrThrow({ where: { id: result.actionId } });
    expect(action).toMatchObject({
      approvalStatus: 'approved',
      actionType: 'create_campaign',
      channelAccountId: accountId,
      operationId: result.operationId,
    });
    expect(action.payload).toMatchObject({ campaignName: '봄 캠페인', productIds: ['PRODUCT-A'], dailyBudget: 30_000, targetRoas: 350 });
    const operation = await operations.get(ORG, result.operationId!);
    expect(operation).toMatchObject({ kind: AD_ACTION_KIND, status: 'prepared', plan: { actionId: result.actionId, channelAccountId: accountId } });
  });

  it('reads queued → running → done / uncertain / failed from the operation and filters and counts on the same words', async () => {
    const created = await register('생성됨', [(await seedListing('P-1')).id]);
    const unsure = await register('확인 필요', [(await seedListing('P-2')).id]);
    const failed = await register('실패', [(await seedListing('P-3')).id]);
    const waiting = await register('대기', [(await seedListing('P-4')).id]);
    const pending = await seedAction({ targetLabel: '검토 대기' });
    const manual = await seedAction({ targetLabel: '입찰가', approvalStatus: 'pending_review' });
    await actions.approveActions([manual], ORG);

    const first = await claim();
    expect(first.operation.id).toBe(created.operationId);
    expect(await statusOf(created.actionId)).toMatchObject({ executeStatus: 'running', operationId: created.operationId });
    await succeed(first, 'C-1');
    await succeed(await claim(), null);
    await fail(await claim());

    const byId = Object.fromEntries((await listed()).items.map((item) => [item.id, {
      executeStatus: item.executeStatus,
      operationId: item.operationId,
      providerOutcome: item.providerOutcome,
      campaignId: item.campaignId,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      executedAt: item.executedAt ? 'set' : null,
    }]));
    const none = { providerOutcome: null, campaignId: null, errorCode: null, errorMessage: null, executedAt: null };
    expect(byId).toEqual({
      [created.actionId]: { ...none, executeStatus: 'done', operationId: created.operationId, providerOutcome: 'created', campaignId: 'C-1', executedAt: 'set' },
      [unsure.actionId]: { ...none, executeStatus: 'uncertain', operationId: unsure.operationId, providerOutcome: 'uncertain', executedAt: 'set' },
      [failed.actionId]: {
        ...none,
        executeStatus: 'failed',
        operationId: failed.operationId,
        errorCode: 'ADVERTISING_AD_CENTER_FORM_CHANGED',
        errorMessage: '완료 버튼을 찾지 못했습니다.',
      },
      [waiting.actionId]: { ...none, executeStatus: 'queued', operationId: waiting.operationId },
      [pending]: { ...none, executeStatus: 'not_prepared', operationId: null },
      [manual]: { ...none, executeStatus: 'not_prepared', operationId: null },
    });
    // The counts are execution words only; the retired scrape runs are not read (KID-386 → KID-365).
    expect((await listed()).summary).toEqual({ pendingReview: 1, approvedQueued: 1, running: 0, done: 1, uncertain: 1, failed: 1 });

    const idsByWord: Record<string, string[]> = {
      queued: [waiting.actionId],
      done: [created.actionId],
      uncertain: [unsure.actionId],
      failed: [failed.actionId],
      not_prepared: [pending, manual],
      running: [],
    };
    for (const [word, ids] of Object.entries(idsByWord)) {
      const filtered = await listed({ executeStatus: word });
      expect(filtered.items.map((item) => item.id).sort(), word).toEqual([...ids].sort());
    }
  });

  it('approving a failed registration again prepares a new run; approving while a run is live or after it applied prepares nothing', async () => {
    const failed = await register('다시', [(await seedListing('P-1')).id]);
    await fail(await claim());
    await expect(actions.approveActions([failed.actionId], ORG)).resolves.toEqual({ updated: 1 });
    const retried = await prisma.adAction.findUniqueOrThrow({ where: { id: failed.actionId } });
    expect(retried.operationId).not.toBe(failed.operationId);
    expect(await statusOf(failed.actionId)).toMatchObject({ executeStatus: 'queued', operationId: retried.operationId });

    // 준비된 실행이 살아 있으면 다시 승인해도 새로 만들지 않는다.
    await actions.approveActions([failed.actionId], ORG);
    expect((await prisma.adAction.findUniqueOrThrow({ where: { id: failed.actionId } })).operationId).toBe(retried.operationId);

    // 광고센터에 반영된 뒤에는 다시 승인해도 두 번째 캠페인을 만들지 않는다.
    await succeed(await claim(), 'C-9');
    await actions.approveActions([failed.actionId], ORG);
    expect((await prisma.adAction.findUniqueOrThrow({ where: { id: failed.actionId } })).operationId).toBe(retried.operationId);
    expect(await prisma.operation.count({ where: { kind: AD_ACTION_KIND } })).toBe(2);
  });

  it('an approved registration left without a run (a crash between approval and preparation) reads not_prepared, and approving it again prepares it', async () => {
    const listing = await seedListing('P-1');
    const action = await prisma.adAction.create({
      data: {
        organizationId: ORG,
        actionType: 'create_campaign',
        targetType: 'campaign',
        targetLabel: '끊긴 등록',
        reason: 'A등급 전략 기반 캠페인 등록',
        approvalStatus: 'approved',
        channelAccountId: accountId,
        payload: { campaignName: '끊긴 등록', productIds: [listing.externalId], dailyBudget: 30_000, targetRoas: null },
      },
    });
    expect(await statusOf(action.id)).toMatchObject({ executeStatus: 'not_prepared', operationId: null });
    await actions.approveActions([action.id], ORG);
    expect(await statusOf(action.id)).toMatchObject({ executeStatus: 'queued', operationId: expect.any(String) });
  });

  it('rejecting cancels a prepared run, and is refused while the extension runs it or after it applied', async () => {
    const prepared = await register('취소', [(await seedListing('P-1')).id]);
    await expect(actions.rejectActions([prepared.actionId], ORG)).resolves.toEqual({ updated: 1 });
    expect(await statusOf(prepared.actionId)).toMatchObject({ approvalStatus: 'rejected', executeStatus: 'cancelled' });
    await expect(claimOrNull()).resolves.toBeNull();

    const running = await register('실행 중', [(await seedListing('P-2')).id]);
    const claimed = await claim();
    await expect(actions.rejectActions([running.actionId], ORG)).rejects.toMatchObject({ code: 'ADVERTISING_AD_ACTION_EXECUTING' });
    expect((await prisma.adAction.findUniqueOrThrow({ where: { id: running.actionId } })).approvalStatus).toBe('approved');

    await succeed(claimed, 'C-1');
    await expect(actions.rejectActions([running.actionId], ORG)).rejects.toMatchObject({ code: 'ADVERTISING_AD_ACTION_ALREADY_APPLIED' });
    expect((await prisma.adAction.findUniqueOrThrow({ where: { id: running.actionId } })).approvalStatus).toBe('approved');
  });

  const claimOrNull = () => operations.claimForOrganization(ORG, { kinds: [AD_ACTION_KIND], workerId: 'ext-popup' });

  it('refuses a registration that mixes products of two accounts before creating anything', async () => {
    const other = await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Other', externalAccountId: 'other', isPrimary: false },
    });
    const first = await seedListing('P-1');
    const second = await seedListing('P-2', other.id);
    await expect(register('섞임', [first.id, second.id])).rejects.toMatchObject({ code: 'ADVERTISING_CAMPAIGN_ACCOUNTS_MIXED' });
    expect(await prisma.adAction.count()).toBe(0);
  });

  it('keeps a campaign name taken while its run is queued, running or applied, and frees it after a failure or a rejection', async () => {
    const listing = await seedListing('P-1');
    const first = await register('이름', [listing.id]);
    await expect(register('이름', [listing.id])).rejects.toMatchObject({ code: 'ADVERTISING_CAMPAIGN_ALREADY_REQUESTED' });
    await fail(await claim());
    const second = await register('이름', [listing.id]);
    expect(second.actionId).not.toBe(first.actionId);
    await succeed(await claim(), null);
    await expect(register('이름', [listing.id])).rejects.toMatchObject({
      code: 'ADVERTISING_CAMPAIGN_ALREADY_REQUESTED',
      details: { actionId: second.actionId, executeStatus: 'uncertain' },
    });
    const third = await register('다른 이름', [listing.id]);
    await actions.rejectActions([third.actionId], ORG);
    await expect(register('다른 이름', [listing.id])).resolves.toMatchObject({ ok: true });
  });

  it('keeps a proposal open for dedupe while it awaits review, an approved manual action until it is rejected, and a registration while its run is live', async () => {
    const recent = (label: string, values: Omit<Parameters<typeof seedAction>[0], 'targetLabel'> = {}) =>
      seedAction({ targetLabel: label, ...values });
    await recent('bid pending');
    await recent('bid approved', { approvalStatus: 'approved' });
    await recent('bid rejected', { approvalStatus: 'rejected' });
    await recent('bid stale', { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) });
    await recent('bid foreign', { organizationId: OTHER_ORGANIZATION_ID });
    await register('campaign failed', [(await seedListing('P-1')).id]);
    await register('campaign done', [(await seedListing('P-2')).id]);
    // claim은 오래된 순이다.
    await fail(await claim());
    await succeed(await claim(), 'C-1');
    await register('campaign waiting', [(await seedListing('P-3')).id]);

    const inflight = await actions['repo'].findExistingInflightActions(ORG, new Date(Date.now() - 24 * 60 * 60 * 1000));
    expect(inflight.map((row) => row.targetLabel).sort()).toEqual(['bid approved', 'bid pending', 'campaign waiting']);
  });

  it("carries each keyword's latest pause proposal on the keyword read: awaiting review or approved (applied by hand) reads not_prepared, a rejected one is left out", async () => {
    const date = businessDateKey(periodBounds('7d').to);
    const run = await seedAdReportRun(prisma, { organizationId: ORG, channelAccountId: accountId, start: date, end: date });
    await prisma.channelAdKeywordDailySnapshot.createMany({
      data: [['VID-1', '콩순이'], ['VID-1', '타요'], ['VID-1', '캐치']].map(([vendorItemId, keyword]) => ({
        organizationId: ORG,
        channelAccountId: accountId,
        operationId: run.id,
        date: new Date(`${date}T00:00:00.000Z`),
        campaignId: '1',
        adGroupId: 'group-1',
        vendorItemId,
        keyword,
        impressions: 100,
        clicks: 1,
        spend: 0,
        orders: 0,
        units: 0,
        revenue: 0,
      })),
    });
    const pause = (label: string, approvalStatus: string) =>
      seedAction({ targetLabel: label, actionType: 'pause_keyword', targetType: 'keyword', externalId: 'VID-1', approvalStatus });
    const pending = await pause('콩순이', 'pending_review');
    const approved = await pause('타요', 'pending_review');
    await actions.approveActions([approved], ORG);
    await pause('캐치', 'rejected');

    const { keywords } = await campaigns.getKeywords('7d', ORG);
    const proposals = Object.fromEntries(keywords.map((row) => [row.keyword, row.pauseProposal]));
    expect(proposals).toEqual({
      콩순이: { actionId: pending, approvalStatus: 'pending_review', executeStatus: 'not_prepared', errorMessage: null },
      타요: { actionId: approved, approvalStatus: 'approved', executeStatus: 'not_prepared', errorMessage: null },
      캐치: null,
    });
    expect(await prisma.operation.count()).toBe(1); // 광고 보고서 실행뿐 — 키워드 끄기는 준비하지 않는다.
  });
});
