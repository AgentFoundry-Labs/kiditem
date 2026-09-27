import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { orderMallAccountApi } from '@/lib/order-mall-account-api';
import { isMallAutoLoginBlocked } from '@/lib/mall-login-block';
import {
  RegistrationOperationInProgress,
  closeRegistrationOperation,
  confirmRegistrationOperation,
  extensionMallWriteSites,
  listRegistrationOperations,
  readRegistrationOperation,
  startRegistrationOperation,
  waitForRegistrationOperation,
} from './registration-operation';

// 등록 실행 = `channels.registration` 실행 하나(KID-364). 실행 시작(`operation-start`)은 진짜이고, 가짜는 확장 메시지
// 경계와 서버 HTTP(`apiClient`)·저장 자격 API뿐이다.
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/lib/order-mall-account-api', () => ({ orderMallAccountApi: { password: vi.fn() } }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const TARGET = '11111111-1111-4111-8111-111111111111';
const LISTING = '22222222-2222-4222-8222-222222222222';
const PRODUCT = '33333333-3333-4333-8333-333333333333';
const ASSET = '44444444-4444-4444-8444-444444444444';
const OPERATION_ID = '55555555-5555-4555-8555-555555555555';
const OPTION = '66666666-6666-4666-8666-666666666666';
const ACCOUNT = '77777777-7777-4777-8777-777777777777';
const FORM = { url: 'https://mall.example/register', manualSteps: [] };

const FULL = {
  operationRuntime: true,
  operationLoginV1: true,
  channelsRegistrationOperationKindV1: true,
  'mallWriteSite.art09': true,
  'mallWriteSite.coupang': true,
  'mallWriteSite.kidsnote': true,
  'mallWriteSite.kakao': false,
};

function extension(capabilities: Record<string, boolean> = FULL, reply: Record<string, unknown> = { success: true, operationId: OPERATION_ID, reused: false }) {
  const starts: Array<Record<string, unknown>> = [];
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
    const body = message as Record<string, unknown>;
    if (body.action === 'ping') return { success: true, capabilities } as never;
    starts.push(body);
    return reply as never;
  });
  return starts;
}

function operation(patch: Partial<OperationView> = {}): OperationView {
  return {
    id: OPERATION_ID, kind: 'channels.registration', status: 'executing', lockKeys: [], plan: null, progress: null,
    result: null, window: null, errorCode: null, errorMessage: null, startedAt: '2026-09-27T09:00:00.000Z',
    finishedAt: null, expiresAt: '2026-09-27T09:30:00.000Z', attempts: 1, maxAttempts: 1, scheduledFor: null,
    ...patch,
  };
}

const RESULT = {
  providerOutcome: 'uncertain', mallOutcome: 'submitted', submitted: true, submitSkipped: null,
  externalListingId: null, mallMessage: null,
  fill: { steps: ['상품명'], warnings: [], manualSteps: [], dialogs: [] },
  evidence: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(detectExtensionId).mockResolvedValue('ext');
  vi.mocked(orderMallAccountApi.password).mockResolvedValue({ loginId: 'art-id', password: 'art-pw' } as never);
});

describe('startRegistrationOperation — scope는 executionKind별로 정확히', () => {
  it('⭐ register: 등록 대상·버전·제출 의도·어댑터 기본값을 싣고, 그 몰의 저장 자격은 확장 메시지에만 싣는다', async () => {
    const starts = extension();
    await expect(startRegistrationOperation({
      mallKey: 'art09',
      idempotencyKey: 'reg-1',
      scope: {
        executionKind: 'register', registrationTargetId: TARGET, expectedVersion: 3, submit: true,
        adapterDefaults: { quantity: '1' }, adapterValues: { categoryPath: '완구' }, applyCompositionTemplate: false, form: FORM,
      },
    })).resolves.toEqual({ operationId: OPERATION_ID, reused: false });
    expect(starts).toEqual([{
      action: 'operation.start',
      kind: 'channels.registration',
      scope: {
        executionKind: 'register', registrationTargetId: TARGET, expectedVersion: 3, idempotencyKey: 'reg-1', submit: true,
        adapterDefaults: { quantity: '1' }, adapterValues: { categoryPath: '완구' }, applyCompositionTemplate: false, form: FORM,
      },
      idempotencyKey: 'reg-1',
      credentials: { loginId: 'art-id', password: 'art-pw' },
    }]);
  });

  it('update(가격): updateFields salePrice와 몰 상품을 싣고 제출 의도는 기본 false', async () => {
    const starts = extension();
    await startRegistrationOperation({
      mallKey: 'kidsnote', idempotencyKey: 'price-1',
      scope: { executionKind: 'update', registrationTargetId: TARGET, expectedVersion: 2, channelListingId: LISTING, updateFields: ['salePrice'] },
    });
    expect(starts[0]?.scope).toEqual({
      executionKind: 'update', registrationTargetId: TARGET, expectedVersion: 2, channelListingId: LISTING,
      updateFields: ['salePrice'], idempotencyKey: 'price-1', submit: false,
    });
  });

  it('thumbnail_update: 판매 상품과 자산·몰 상품만', async () => {
    const starts = extension();
    await startRegistrationOperation({
      mallKey: 'coupang', idempotencyKey: 'thumb-1',
      scope: { executionKind: 'thumbnail_update', salesProductId: PRODUCT, channelListingId: LISTING, assetId: ASSET },
    });
    expect(starts[0]?.scope).toEqual({
      executionKind: 'thumbnail_update', salesProductId: PRODUCT, channelListingId: LISTING, assetId: ASSET,
      idempotencyKey: 'thumb-1', submit: false,
    });
  });

  it.each(['sold_out', 'resume'] as const)('%s: 몰 계정 하나의 리스팅 묶음 = 실행 하나(항목은 리스팅 id나 옵션 id)', async (executionKind) => {
    const starts = extension();
    await startRegistrationOperation({
      mallKey: 'art09', idempotencyKey: `${executionKind}-1`,
      scope: { executionKind, channelAccountId: ACCOUNT, items: [{ channelListingId: LISTING }, { channelListingOptionIds: [OPTION] }] },
    });
    expect(starts).toHaveLength(1);
    expect(starts[0]?.scope).toEqual({
      executionKind, channelAccountId: ACCOUNT, items: [{ channelListingId: LISTING }, { channelListingOptionIds: [OPTION] }],
      idempotencyKey: `${executionKind}-1`, submit: false,
    });
  });

  it('빠른 등록: 등록 대상 없이 수집 상품·계정·폼만, 제출하지 않는다', async () => {
    const starts = extension();
    await startRegistrationOperation({
      mallKey: 'art09', idempotencyKey: 'quick-1',
      scope: { executionKind: 'register', sourceProductId: PRODUCT, channelAccountId: ACCOUNT, submit: false, form: FORM },
    });
    expect(starts[0]?.scope).toEqual({
      executionKind: 'register', sourceProductId: PRODUCT, channelAccountId: ACCOUNT, submit: false, form: FORM, idempotencyKey: 'quick-1',
    });
  });

  it('scope 계약에 맞지 않으면(빠른 등록에 제출 의도) 확장에 보내지 않는다', async () => {
    const starts = extension();
    await expect(startRegistrationOperation({
      mallKey: 'art09', idempotencyKey: 'quick-2',
      scope: { executionKind: 'register', sourceProductId: PRODUCT, channelAccountId: ACCOUNT, submit: true, form: FORM },
    })).rejects.toThrow('보낼 내용이 올바르지 않습니다.');
    expect(starts).toEqual([]);
  });

  it('그 몰의 쓰기 사이트(mallWriteSite.<몰>)가 없는 빌드는 업데이트 문장으로 거절하고 시작을 보내지 않는다', async () => {
    const starts = extension();
    await expect(startRegistrationOperation({
      mallKey: 'kakao', idempotencyKey: 'k',
      scope: { executionKind: 'register', registrationTargetId: TARGET, expectedVersion: 1, submit: false },
    })).rejects.toThrow('확장 프로그램을 업데이트해 주세요.');
    expect(starts).toEqual([]);
  });

  it('등록 kind 표시가 없는 옛 빌드도 거절한다', async () => {
    const starts = extension({ operationRuntime: true, 'mallWriteSite.art09': true });
    await expect(startRegistrationOperation({
      mallKey: 'art09', idempotencyKey: 'k',
      scope: { executionKind: 'register', registrationTargetId: TARGET, expectedVersion: 1, submit: false },
    })).rejects.toThrow('확장 프로그램을 업데이트해 주세요.');
    expect(starts).toEqual([]);
  });

  it('같은 대상의 실행이 이미 있으면 그 실행 번호와 함께 거절한다(다시 보내지 않는다)', async () => {
    extension(FULL, {
      success: false, errorCode: 'OPERATION_IN_PROGRESS', error: '같은 대상의 실행이 진행 중입니다.',
      details: { existing: { operationId: OPERATION_ID } },
    });
    const started = startRegistrationOperation({
      mallKey: 'art09', idempotencyKey: 'k',
      scope: { executionKind: 'register', registrationTargetId: TARGET, expectedVersion: 1, submit: true },
    });
    await expect(started).rejects.toBeInstanceOf(RegistrationOperationInProgress);
    await expect(started).rejects.toMatchObject({ existingOperationId: OPERATION_ID });
  });
});

describe('extensionMallWriteSites', () => {
  it('등록 kind를 도는 빌드의 몰 쓰기 사이트 키만 돌려준다', async () => {
    extension();
    await expect(extensionMallWriteSites()).resolves.toEqual(['art09', 'coupang', 'kidsnote']);
    extension({ operationRuntime: true, 'mallWriteSite.art09': true });
    await expect(extensionMallWriteSites()).resolves.toEqual([]);
    vi.mocked(detectExtensionId).mockResolvedValue(null);
    await expect(extensionMallWriteSites()).resolves.toEqual([]);
  });
});

describe('waitForRegistrationOperation', () => {
  const noSleep = () => Promise.resolve();

  it('⭐ reconciling은 기다림을 끝내고 "확인 필요"로 돌려준다 — 실패도 성공도 아니다', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ operation: operation({ status: 'executing' }) })
      .mockResolvedValueOnce({ operation: operation({ status: 'reconciling', result: RESULT }) });
    const read = await waitForRegistrationOperation(OPERATION_ID, { sleep: noSleep });
    expect(read.state).toBe('needs_confirmation');
    expect(read.label).toBe('확인 필요');
    expect(read.result?.mallOutcome).toBe('submitted');
    expect(apiClient.get).toHaveBeenCalledWith(`/api/operations/${OPERATION_ID}`);
  });

  it('succeeded는 확인됨, 등록상품ID를 결과에서 읽는다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation({
      status: 'succeeded', finishedAt: '2026-09-27T09:01:00.000Z',
      result: { ...RESULT, providerOutcome: 'succeeded', mallOutcome: 'confirmed', externalListingId: '9001' },
    }) });
    const read = await waitForRegistrationOperation(OPERATION_ID, { sleep: noSleep });
    expect(read).toMatchObject({ state: 'confirmed', label: '확인 완료' });
    expect(read.result?.externalListingId).toBe('9001');
  });

  it('failed는 운영자 문장으로(원문 코드 대신)', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation({
      status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: 'login required', finishedAt: '2026-09-27T09:01:00.000Z',
    }) });
    const read = await waitForRegistrationOperation(OPERATION_ID, { sleep: noSleep });
    expect(read.state).toBe('failed');
    expect(read.message).not.toContain('SITE_LOGIN_REQUIRED');
    expect(read.message).not.toContain('login required');
  });

  it('⭐ 저장 자격으로 로그인했는데 몰이 거절해 실패로 끝나면 그 몰의 자동 로그인을 멈춘다(D10)', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation({
      status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', finishedAt: new Date().toISOString(),
      plan: { executionKind: 'register', mallKey: 'art09' },
      result: { login: { reason: 'credentials_rejected', mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.' } },
    }) });
    expect(isMallAutoLoginBlocked('art09')).toBe(false);
    await waitForRegistrationOperation(OPERATION_ID, { sleep: noSleep });
    expect(isMallAutoLoginBlocked('art09')).toBe(true);
  });

  it('상한을 넘기면 진행 중으로 돌려준다(실행은 확장에서 계속된다)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ operation: operation({ status: 'executing' }) });
    let clock = 0;
    const read = await waitForRegistrationOperation(OPERATION_ID, { sleep: noSleep, now: () => (clock += 1_000), timeoutMs: 3_000 });
    expect(read).toMatchObject({ state: 'running', label: '진행 중' });
  });

  it('다른 kind의 실행 번호는 거절한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operation: operation({ kind: 'channels.mall_admin_listings' }) });
    await expect(readRegistrationOperation(OPERATION_ID)).rejects.toThrow('등록 실행이 아닙니다.');
  });
});

describe('확인·닫기(KID-218) · 목록', () => {
  it('confirm은 등록상품ID로 확인을 보낸다', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ operation: operation({ status: 'succeeded' }) });
    await confirmRegistrationOperation(OPERATION_ID, {
      externalListingId: ' 9001 ',
      options: [{ salesProductOptionId: OPTION, externalOptionId: 'v-1' }],
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/channels/registration-operations/${OPERATION_ID}/confirm`,
      { externalListingId: '9001', options: [{ salesProductOptionId: OPTION, externalOptionId: 'v-1' }] },
    );
  });

  it('등록상품ID가 비면 보내지 않는다', async () => {
    await expect(confirmRegistrationOperation(OPERATION_ID, { externalListingId: '  ' })).rejects.toThrow('등록상품ID를 입력해 주세요.');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('close는 "등록되지 않음"을 까닭과 함께 보낸다', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ operation: operation({ status: 'failed' }) });
    await closeRegistrationOperation(OPERATION_ID);
    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/channels/registration-operations/${OPERATION_ID}/close`,
      { reason: '운영자가 몰에서 확인: 등록되지 않음' },
    );
  });

  it('목록은 등록 kind 하나를 조회 하나로 읽는다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ operations: [operation({ status: 'reconciling', result: RESULT })] });
    const list = await listRegistrationOperations(50);
    expect(apiClient.get).toHaveBeenCalledWith('/api/operations?kinds=channels.registration&limit=50');
    expect(list.operations).toHaveLength(1);
  });
});

/**
 * 몰 쓰기의 길은 등록 실행 하나다(ADR-0014 · KID-364). 옛 등록 실행 · 품절 실행 · 대표이미지 실행 경로와 확장 액션을
 * 웹이 들고 있지 않고, 확인·닫기 경로는 이 파일 하나만 부른다 — 화면마다 호출을 두면 "두 번 보내지 않는다"가 갈라진다.
 */
describe('몰 쓰기 경로 잠금', () => {
  const webSrc = path.resolve(__dirname, '../../..');
  // 검증 잡에 rg가 없다 — Node로 소스를 돈다(스펙·테스트 파일은 뺀다).
  const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(spec|test)\.tsx?$/.test(entry.name) ? [full] : [];
  });
  const filesMatching = (pattern: string) => {
    const regex = new RegExp(pattern);
    return sources(webSrc)
      .filter((file) => regex.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(webSrc, file));
  };

  it('옛 실행 경로와 확장 쓰기 액션이 웹에 없다', () => {
    expect(filesMatching(
      'registration-executions|registration-targets/[^\'"`]*/executions|listing-availability-executions|thumbnail-executions/[^\'"`]*/(report|resend|applied|not-applied)|thumbnail-executions/failed'
      + '|registerToMallForm|registerToKidsnoteForm|registerToWingForm|registerRepresentativeImage|\'sendMallAvailability\'|\'readMallAvailability\'|\'sendMallPrice\'',
    )).toEqual([]);
  });

  it('확인·닫기 경로는 registration-operation.ts 하나만 부른다', () => {
    expect(filesMatching('registration-operations')).toEqual(['app/(channels)/_shared/registration-operation.ts']);
  });
});
