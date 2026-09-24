import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TargetExecutionResult, TargetExecutionSnapshot } from '@kiditem/shared/sales-product';
import { fillMallRegistrationForm } from '../../_shared/lib/mall-form-registration-api';
import { EMPTY_MALL_REGISTER_VALUES, mallRegisterValuesWithDefaults } from '@/app/(channels)/_shared/mall-register-values';
import { domeggookAdapter } from '@/app/(channels)/_shared/adapters';
import { executeTargetRegistration } from '@/app/(channels)/_shared/target-registration-execution';
import { runOneMallRegistration, summarizeMallRun } from './mall-quick-register-run';

// 몰 폼 확장 호출과 상품 초안 만들기만 바꾼다 — 어댑터 · 실행기 · 등록 실행 판정은 실제 코드다.
vi.mock('../../_shared/lib/mall-form-registration-api', () => ({
  fillMallRegistrationForm: vi.fn(),
  prepareMallRegistration: vi.fn(),
}));
vi.mock('@/app/(channels)/_shared/sales-product-registration', () => ({
  prepareRegistration: vi.fn(async () => ({ draft: { displayName: '할로윈 거미줄' } })),
}));
vi.mock('../../_shared/lib/domeggook-registration-form', () => ({
  DOMEGGOOK_BASE_VALUE: 0,
  domeggookFormFromDraft: () => ({ url: 'https://domeggook.example/register', manualSteps: [] }),
}));

const ITEM = { candidateId: 'record-1', source: 'candidate' as const, salesProductId: 'sales-product-1', name: '할로윈 거미줄', salePrice: 3500, thumbnailUrl: null };
const EXECUTION_ID = '33333333-3333-4333-8333-333333333333';
const LEASE = '44444444-4444-4444-8444-444444444444';

/**
 * 빠른 등록은 폼 채우기다(KID-322). [등록]은 등록 대상 실행(준비 → 시작 → 어댑터 → 결과) 안에서만 누른다 —
 * 같은 어댑터라도 실행 컨텍스트가 있을 때만 `submit: true` 가 나간다. 빠른 등록 결과는 등록됐다고 말하지 않는다.
 */
describe('quick register fills the form only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fillMallRegistrationForm).mockResolvedValue({
      ok: true, mall: 'domeggook', submitted: false, steps: [], warnings: [], manualSteps: ['열린 탭에서 확인하세요.'],
    });
  });

  it('sends `submit: false` with no execution context and never claims the product is registered', async () => {
    const outcome = await runOneMallRegistration('domeggook', ITEM, mallRegisterValuesWithDefaults(EMPTY_MALL_REGISTER_VALUES));

    expect(fillMallRegistrationForm).toHaveBeenCalledWith('domeggook', expect.anything(), expect.anything(), { submit: false });
    expect(outcome.status).toBe('filled');
    const summary = summarizeMallRun([outcome]);
    const said = [outcome.message, ...outcome.manualSteps, summary.title, summary.description].join(' ');
    expect(said).toContain('폼');
    expect(said).not.toMatch(/등록됨|등록했|등록되었|직접 등록하세요/);
  });

  it('the fenced registration run sends `submit: true` with the execution context', async () => {
    vi.mocked(fillMallRegistrationForm).mockResolvedValue({
      ok: true, mall: 'domeggook', submitted: true, accepted: null, steps: [], warnings: [], manualSteps: [],
    });
    const snapshot = {
      targetId: 'target-1', targetVersion: 1, channelAccountId: 'account-1', kind: 'register', channelListingId: null,
      applyCompositionTemplate: false,
      product: { id: 'sales-product-1', name: '할로윈 거미줄', imageUrls: [], options: [{ salePrice: 3500 }], channelOverrides: [] },
      detailPage: null, registrationInput: {}, adapterPayload: {},
    } as unknown as TargetExecutionSnapshot;
    const started = {
      executionId: EXECUTION_ID, targetId: 'target-1', channelAccountId: 'account-1', status: 'executing',
      providerOutcome: 'uncertain', payloadHash: 'hash-1', payload: snapshot, leaseToken: LEASE, maySubmit: true,
      externalListingId: null, result: null,
    } as TargetExecutionResult;
    const client = {
      prepare: vi.fn().mockResolvedValue({ ...started, status: 'prepared', providerOutcome: 'not_attempted', leaseToken: null, maySubmit: false }),
      start: vi.fn().mockResolvedValue(started),
      report: vi.fn().mockResolvedValue({ ...started, status: 'reconciling' }),
    };

    await executeTargetRegistration({
      targetId: 'target-1', expectedVersion: 1, channelAccountId: 'account-1', mallKey: 'domeggook',
      adapter: domeggookAdapter, client,
    });

    expect(fillMallRegistrationForm).toHaveBeenCalledWith('domeggook', expect.anything(), expect.anything(), {
      submit: true,
      executionContext: { executionId: EXECUTION_ID, payloadHash: 'hash-1', leaseToken: LEASE },
    });
  });
});

describe('mall form guidance', () => {
  it('no mall form tells the operator to register by hand — the fenced run presses [등록]', () => {
    const dir = path.resolve(__dirname, '../../_shared/lib');
    const forms = readdirSync(dir).filter((file) => file.endsWith('-registration-form.ts'));
    expect(forms.length).toBeGreaterThan(5);
    for (const file of forms) {
      expect(readFileSync(path.join(dir, file), 'utf8'), file).not.toContain('직접 등록하세요');
    }
  });
});
