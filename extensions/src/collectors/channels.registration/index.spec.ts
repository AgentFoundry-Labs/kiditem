import { describe, expect, it } from 'vitest';
import type { RegistrationPlan } from '@kiditem/shared/channels-operations';
import { registrationCollector, type RegistrationFillSession, type RegistrationSite } from './index';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';

function plan(overrides: Partial<RegistrationPlan> = {}): RegistrationPlan {
  return {
    executionKind: 'register',
    mallKey: 'domeggook',
    channelAccountId: ACCOUNT,
    registrationTargetId: TARGET,
    salesProductId: null,
    channelListingId: null,
    externalListingId: null,
    expectedProviderAccountId: null,
    submit: true,
    payloadHash: 'hash',
    payload: { snapshot: null, form: { url: 'https://domeggook.com/sc/item/regFrm' } },
    startedAt: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

const FILL = { steps: ['상품명'], warnings: [], manualSteps: [], dialogs: [] };

function site(session: Partial<RegistrationFillSession>, log: string[] = []): RegistrationSite {
  return {
    writer: (mallKey) => (mallKey === 'domeggook' || mallKey === 'wing'
      ? {
        async fill(input) {
          log.push(`fill submit=${input.submit}`);
          return {
            fill: FILL,
            decision: { press: false, skipped: 'no_verified_submit' },
            providerAccountId: null,
            observedUrl: 'https://domeggook.com/sc/item/regFrm',
            async submit() {
              log.push('submit');
              return { pressed: true, accepted: true, externalListingId: '123', observedUrl: null, mallMessage: null };
            },
            async done() {
              log.push('done');
            },
            ...session,
          };
        },
      }
      : null),
  };
}

async function run(collectorPlan: RegistrationPlan, registrationSite: RegistrationSite) {
  const chunks: Array<{ chunkKind: string; payload: unknown[] }> = [];
  const stream = registrationCollector.collect(collectorPlan, registrationSite, { signal: new AbortController().signal, tabId: null }) as AsyncGenerator<{ chunkKind: string; payload: unknown[] }, { outcome?: string; result?: Record<string, unknown> } | void>;
  for (;;) {
    const step = await stream.next();
    if (step.done) return { chunks, finish: step.value ?? {} };
    chunks.push({ chunkKind: step.value.chunkKind, payload: step.value.payload });
  }
}

describe('channels.registration — 몰 쓰기 수집기(KID-256)', () => {
  it('몰 폼(검증된 누르기 없음): 채우기 청크 하나를 내고 [등록]은 누르지 않는다 — not_submitted·not_attempted, 탭은 운영자에게 넘긴다', async () => {
    const log: string[] = [];
    const { chunks, finish } = await run(plan(), site({}, log));

    expect(chunks).toEqual([{ chunkKind: 'registration_fill', payload: [FILL] }]);
    expect(log).toEqual(['fill submit=true', 'done']);
    expect(finish).toEqual({
      result: {
        providerOutcome: 'not_attempted',
        mallOutcome: 'not_submitted',
        submitted: false,
        submitSkipped: 'no_verified_submit',
        externalListingId: null,
        mallMessage: null,
        fill: FILL,
        evidence: null,
      },
    });
  });

  it('관문이 누르라고 하면(Wing) 채우기 청크 뒤에 누르고 몰 증거를 청크로 낸다 — 새 상품번호와 판매자 계정이 보이면 confirmed', async () => {
    const log: string[] = [];
    const { chunks, finish } = await run(
      plan({ mallKey: 'wing', expectedProviderAccountId: 'A00012345' }),
      site({
        decision: { press: true },
        providerAccountId: 'A00012345',
        async submit() {
          log.push('submit');
          return { pressed: true, accepted: true, externalListingId: '15321', observedUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list', mallMessage: null };
        },
      }, log),
    );

    expect(log).toEqual(['fill submit=true', 'submit', 'done']);
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['registration_fill', 'registration_evidence']);
    expect(chunks[1]!.payload).toEqual([{
      // 이 증거가 가리키는 얼린 문서(M1 finalize가 대조한다).
      payloadHash: 'hash',
      channelAccountId: ACCOUNT,
      externalListingId: '15321',
      observedUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list',
      providerAccountId: 'A00012345',
      observedStatus: 'confirmed',
      message: null,
      options: [],
    }]);
    expect(finish).toMatchObject({ result: { providerOutcome: 'succeeded', mallOutcome: 'confirmed', submitted: true, submitSkipped: null, externalListingId: '15321' } });
    expect((finish as { outcome?: string }).outcome).toBeUndefined();
  });

  it('눌렀는데 결과를 못 읽으면 reconciling(submitted) — 운영자가 등록상품ID로 닫는다; 몰이 거절하면 reconciling(uncertain, submission_rejected)', async () => {
    const unknown = await run(plan({ mallKey: 'wing' }), site({
      decision: { press: true },
      async submit() {
        return { pressed: true, accepted: null, externalListingId: null, observedUrl: null, mallMessage: '확인 모달이 남았습니다' };
      },
    }));
    expect(unknown.finish).toMatchObject({ outcome: 'reconciling', result: { providerOutcome: 'uncertain', mallOutcome: 'submitted', submitted: true, mallMessage: '확인 모달이 남았습니다' } });

    const rejected = await run(plan({ mallKey: 'wing' }), site({
      decision: { press: true },
      async submit() {
        return { pressed: true, accepted: false, externalListingId: null, observedUrl: null, mallMessage: '필수 항목 누락' };
      },
    }));
    expect(rejected.finish).toMatchObject({ outcome: 'reconciling', result: { providerOutcome: 'uncertain', mallOutcome: 'uncertain', submitted: true } });
    expect(rejected.chunks[1]!.payload[0]).toMatchObject({ observedStatus: 'submission_rejected', message: '필수 항목 누락' });
  });

  it('등록 버튼을 못 찾아 누르지 못했으면 제출이 아니다 — 폼만 채운 것으로 끝나고 몰의 말을 남긴다', async () => {
    const { chunks, finish } = await run(plan({ mallKey: 'wing' }), site({
      decision: { press: true },
      async submit() {
        return { pressed: false, accepted: null, externalListingId: null, observedUrl: null, mallMessage: '상품등록 버튼을 찾지 못했습니다.' };
      },
    }));
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['registration_fill']);
    expect(finish).toEqual({
      result: expect.objectContaining({ providerOutcome: 'not_attempted', mallOutcome: 'not_submitted', submitted: false, submitSkipped: 'submit_button_missing', mallMessage: '상품등록 버튼을 찾지 못했습니다.' }),
    });
  });

  it('누르기가 실패해도 탭은 운영자에게 넘긴다', async () => {
    const log: string[] = [];
    await expect(run(plan({ mallKey: 'wing' }), site({
      decision: { press: true },
      async submit() {
        throw new Error('버튼이 사라졌다');
      },
    }, log))).rejects.toThrow('버튼이 사라졌다');
    expect(log).toEqual(['fill submit=true', 'done']);
  });

  it('쓰기 모듈이 없는 몰·폼 지시 없는 plan은 RUNTIME_PLAN_INVALID', async () => {
    await expect(run(plan({ mallKey: 'coupang-direct' }), site({}))).rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
    await expect(run(plan({ payload: { snapshot: null, form: null } }), site({}))).rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
    await expect(run({ ...plan(), mallKey: '' } as RegistrationPlan, site({}))).rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
  });

  it('몰 화면의 판매자 계정이 plan과 다르면 채운 뒤라도 청크를 내지 않고 멈춘다(REGISTRATION_ACCOUNT_MISMATCH)', async () => {
    const log: string[] = [];
    await expect(run(plan({ mallKey: 'wing', expectedProviderAccountId: 'A00012345' }), site({ providerAccountId: 'A99999999' }, log)))
      .rejects.toMatchObject({ code: 'REGISTRATION_ACCOUNT_MISMATCH' });
    expect(log).toEqual(['fill submit=true', 'done']);
  });
});
