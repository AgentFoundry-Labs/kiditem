import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OPERATION_TOKEN_HEADER, OperationClaimResponseSchema, type OperationClaimResponse } from '@kiditem/shared/operation';
import {
  AD_ACTION_EVIDENCE_CHUNK_KIND,
  AD_ACTION_KIND,
  AD_ACTION_LEASE_MS,
  type AdActionEvidence,
} from '@kiditem/shared/advertising-operations';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { OperationsController } from '../../common/operation/adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../../common/operation/adapter/out/persistence/operation.repository';
import { OPERATION_PORT, type OperationPort } from '../../common/operation/application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../../common/operation/application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from '../../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../../common/operation/application/service/operation.service';
import { AdActionOperationOwner } from '../adapter/in/operation/ad-action-operation-owner';
import { AdActionOperationRepository } from '../adapter/out/persistence/ad-action-operation.repository';

const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

/**
 * 광고 액션 실행(`advertising.ad_action`, KID-386)을 확장이 밟는 길 그대로: 서버 prepare → 조직 범위 claim(10분 임대) →
 * 증거 청크 → finish. 실행 상태는 operations에, 액션에는 `payload.execution` 감사 기록만 남는다.
 */
describe('advertising.ad_action owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let operations: OperationPort;
  let accountId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const ports = channelFactTestPorts(prisma as never);
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [OperationsController],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
        { provide: AdActionOperationOwner, useValue: new AdActionOperationOwner(new AdActionOperationRepository(ports.accounts, prisma as never)) },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { headers: Record<string, string | undefined>; authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: req.headers['x-test-org'] ?? ORG };
      next();
    });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    operations = module.get(OPERATION_PORT);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    accountId = (await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Primary Wing', isPrimary: true, vendorId: 'VENDOR-A' },
    })).id;
  });

  async function seedAction(values: {
    organizationId?: string;
    actionType?: string;
    approvalStatus?: string;
    channelAccountId?: string | null;
    payload?: Record<string, unknown>;
  } = {}) {
    return prisma.adAction.create({
      data: {
        organizationId: values.organizationId ?? ORG,
        actionType: values.actionType ?? 'create_campaign',
        targetType: 'campaign',
        targetLabel: '봄 캠페인',
        reason: 'A등급 전략 기반 캠페인 등록',
        priority: 'high',
        approvalStatus: values.approvalStatus ?? 'approved',
        channelAccountId: values.channelAccountId === undefined ? accountId : values.channelAccountId,
        payload: (values.payload ?? {
          campaignName: '봄 캠페인',
          adGroupName: 'A등급_그룹',
          productIds: ['PRODUCT-A'],
          dailyBudget: 30_000,
          targetRoas: 350,
        }) as never,
      },
    });
  }

  const prepare = (actionId: string, organizationId = ORG) =>
    operations.prepare(organizationId, { kind: AD_ACTION_KIND, scope: { actionId }, maxAttempts: 1 });

  async function claim(organizationId = ORG): Promise<OperationClaimResponse> {
    const response = await request(app.getHttpServer())
      .post('/api/operations/claim')
      .set('x-test-org', organizationId)
      .send({ kinds: [AD_ACTION_KIND], workerId: 'ext-popup' })
      .expect(200);
    return OperationClaimResponseSchema.parse(response.body);
  }

  async function putEvidence(claimed: OperationClaimResponse, evidence: AdActionEvidence) {
    const payload = [evidence];
    await request(app.getHttpServer())
      .put(`/api/operations/${claimed.operation!.id}/chunks/${AD_ACTION_EVIDENCE_CHUNK_KIND}/1`)
      .set(OPERATION_TOKEN_HEADER, claimed.token!)
      .send({ checksum: checksum(payload), payload })
      .expect(200);
  }

  const finish = (claimed: OperationClaimResponse, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/operations/${claimed.operation!.id}/finish`)
      .set(OPERATION_TOKEN_HEADER, claimed.token!)
      .send(body);

  const executionOf = async (actionId: string) =>
    ((await prisma.adAction.findUniqueOrThrow({ where: { id: actionId } })).payload as { execution?: unknown }).execution;

  it('prepares an approved create_campaign locked on the action alone, and the extension claims it with a 10-minute lease', async () => {
    const action = await seedAction();
    const prepared = await prepare(action.id);
    expect(prepared.operation).toMatchObject({ status: 'prepared', attempts: 0, lockKeys: [`resource:ad-action:${action.id}`] });
    expect(prepared.operation.plan).toEqual({
      actionId: action.id,
      channelAccountId: accountId,
      vendorId: 'VENDOR-A',
      actionType: 'create_campaign',
      createCampaign: { name: '봄 캠페인', adGroupName: 'A등급_그룹', productIds: ['PRODUCT-A'], dailyBudget: 30_000, targetRoas: 350 },
      startedAt: expect.any(String),
    });

    const before = Date.now();
    const claimed = await claim();
    expect(claimed.operation).toMatchObject({ id: prepared.operation.id, status: 'executing', attempts: 1 });
    const lease = new Date(claimed.operation!.expiresAt!).getTime() - before;
    expect(lease).toBeGreaterThan(AD_ACTION_LEASE_MS - 5_000);
    expect(lease).toBeLessThanOrEqual(AD_ACTION_LEASE_MS + 5_000);
    // 다른 조직의 확장은 이 실행을 받지 못한다.
    await expect(claim(OTHER_ORG)).resolves.toEqual({ operation: null, token: null });
  });

  it('does not lock the ad center account, so a second campaign of the same account prepares too', async () => {
    const first = await seedAction();
    const second = await seedAction({ payload: { campaignName: '여름 캠페인', productIds: ['PRODUCT-B'], dailyBudget: 20_000 } });
    await prepare(first.id);
    await expect(prepare(second.id)).resolves.toMatchObject({ operation: { status: 'prepared' } });
  });

  it('refuses a second prepare of the same action while the first is live with OPERATION_IN_PROGRESS', async () => {
    const action = await seedAction();
    await prepare(action.id);
    await expect(prepare(action.id)).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
  });

  it('refuses a manual type, an unapproved action, a missing account, a registration without products and another organization\'s action', async () => {
    const manual = await seedAction({ actionType: 'pause_keyword' });
    const pending = await seedAction({ approvalStatus: 'pending_review' });
    const noAccount = await seedAction({ channelAccountId: null });
    const legacy = await seedAction({ payload: { campaignName: '옛 캠페인', dailyBudget: 30_000, listings: [{ listingId: 'x' }] } });
    const foreign = await seedAction({ organizationId: OTHER_ORG, channelAccountId: null });
    await expect(prepare(manual.id)).rejects.toMatchObject({ code: 'ADVERTISING_AD_ACTION_NOT_EXECUTABLE' });
    await expect(prepare(pending.id)).rejects.toMatchObject({ code: 'ADVERTISING_AD_ACTION_NOT_EXECUTABLE' });
    await expect(prepare(noAccount.id)).rejects.toMatchObject({ code: 'ADVERTISING_AD_ACTION_ACCOUNT_MISSING' });
    await expect(prepare(legacy.id)).rejects.toMatchObject({
      code: 'ADVERTISING_AD_ACTION_NOT_EXECUTABLE',
      details: { reason: 'registration_incomplete' },
    });
    await expect(prepare(foreign.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(prisma.operation.count()).resolves.toBe(0);
  });

  it('records a created campaign from the evidence chunk on the action and in the result', async () => {
    const action = await seedAction();
    const prepared = await prepare(action.id);
    const claimed = await claim();
    await putEvidence(claimed, { campaignId: 'C-777', campaignName: '봄 캠페인', observedAt: new Date().toISOString(), message: null });
    const done = await finish(claimed, { outcome: 'succeeded', result: { providerOutcome: 'created' } }).expect(200);

    expect(done.body.operation).toMatchObject({
      status: 'succeeded',
      result: { actionId: action.id, actionType: 'create_campaign', providerOutcome: 'created', campaignId: 'C-777', message: null, linkedExisting: false },
    });
    expect(await executionOf(action.id)).toEqual({
      operationId: prepared.operation.id,
      providerOutcome: 'created',
      campaignId: 'C-777',
      linkedExisting: false,
      errorCode: null,
      message: null,
      finishedAt: expect.any(String),
    });
    // 등록 내용(payload의 다른 칸)은 그대로다.
    const payload = (await prisma.adAction.findUniqueOrThrow({ where: { id: action.id } })).payload as Record<string, unknown>;
    expect(payload.productIds).toEqual(['PRODUCT-A']);
  });

  it('records that the extension linked a campaign of the same name that already existed instead of creating one', async () => {
    const action = await seedAction();
    await prepare(action.id);
    const claimed = await claim();
    await putEvidence(claimed, { campaignId: 'C-OLD', campaignName: '봄 캠페인', observedAt: new Date().toISOString(), message: null });
    const done = await finish(claimed, { outcome: 'succeeded', result: { providerOutcome: 'created', linkedExisting: true } }).expect(200);
    expect(done.body.operation.result).toMatchObject({ providerOutcome: 'created', campaignId: 'C-OLD', linkedExisting: true });
    expect(await executionOf(action.id)).toMatchObject({ providerOutcome: 'created', campaignId: 'C-OLD', linkedExisting: true });
  });

  it('records uncertain when the ad center accepted the form but showed no campaign id, as a succeeded run', async () => {
    const action = await seedAction();
    await prepare(action.id);
    const claimed = await claim();
    await putEvidence(claimed, { campaignId: null, campaignName: null, observedAt: new Date().toISOString(), message: '등록 요청이 접수되었습니다' });
    const done = await finish(claimed, { outcome: 'succeeded', result: { providerOutcome: 'uncertain' } }).expect(200);

    expect(done.body.operation).toMatchObject({ status: 'succeeded', result: { providerOutcome: 'uncertain', campaignId: null, message: '등록 요청이 접수되었습니다' } });
    expect(await executionOf(action.id)).toMatchObject({ providerOutcome: 'uncertain', campaignId: null });
  });

  it('refuses a succeeded finish that claims created without a campaign id and keeps the run open', async () => {
    const action = await seedAction();
    await prepare(action.id);
    const claimed = await claim();
    await finish(claimed, { outcome: 'succeeded', result: { providerOutcome: 'created' } }).expect(400);
    const row = await prisma.operation.findFirstOrThrow({ where: { kind: AD_ACTION_KIND } });
    expect(row.status).toBe('executing');
    expect(await executionOf(action.id)).toBeUndefined();
  });

  it('records the outcome a failed finish reports, so a form submitted before the failure is kept as uncertain', async () => {
    const action = await seedAction();
    await prepare(action.id);
    const claimed = await claim();
    await finish(claimed, {
      outcome: 'failed',
      errorCode: 'ADVERTISING_AD_ACTION_NOT_APPLIED',
      errorMessage: '완료를 누른 뒤 화면을 읽지 못했습니다.',
      result: { providerOutcome: 'uncertain' },
    }).expect(200);
    expect(await executionOf(action.id)).toMatchObject({
      providerOutcome: 'uncertain',
      errorCode: 'ADVERTISING_AD_ACTION_NOT_APPLIED',
    });
  });

  it('records no outcome when the lease ran out, since nobody knows whether the ad center was written', async () => {
    const action = await seedAction();
    const prepared = await prepare(action.id);
    await claim();
    await prisma.operation.update({ where: { id: prepared.operation.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    // The next claim closes the lapsed run (no attempts left) and calls onFailed.
    await expect(claim()).resolves.toEqual({ operation: null, token: null });
    expect(await executionOf(action.id)).toMatchObject({ operationId: prepared.operation.id, providerOutcome: null });
  });

  it('records not_attempted with the reported code when the extension could not reach the form', async () => {
    const action = await seedAction();
    const prepared = await prepare(action.id);
    const claimed = await claim();
    const failed = await finish(claimed, {
      outcome: 'failed',
      errorCode: 'ADVERTISING_AD_CENTER_FORM_CHANGED',
      errorMessage: '캠페인 이름 입력창을 찾지 못했습니다.',
    }).expect(200);

    expect(failed.body.operation).toMatchObject({ status: 'failed', errorCode: 'ADVERTISING_AD_CENTER_FORM_CHANGED' });
    expect(await executionOf(action.id)).toEqual({
      operationId: prepared.operation.id,
      providerOutcome: 'not_attempted',
      campaignId: null,
      linkedExisting: false,
      errorCode: 'ADVERTISING_AD_CENTER_FORM_CHANGED',
      message: '캠페인 이름 입력창을 찾지 못했습니다.',
      finishedAt: expect.any(String),
    });
    // 끝난 실행은 잠금을 놓으므로 같은 액션을 다시 준비할 수 있다.
    await expect(prepare(action.id)).resolves.toMatchObject({ operation: { status: 'prepared' } });
  });
});
