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

const LISTING_A = '33333333-3333-4333-8333-333333333333';
const LISTING_B = '44444444-4444-4444-8444-444444444444';
const OPTION_A = '55555555-5555-4555-8555-555555555555';
const OPTION_B = '66666666-6666-4666-8666-666666666666';

function availabilityPlan(overrides: Partial<RegistrationPlan> = {}, action: 'sold_out' | 'resume' = 'sold_out'): RegistrationPlan {
  return plan({
    executionKind: action,
    registrationTargetId: null,
    payload: {
      action,
      listings: [
        { channelListingId: LISTING_A, externalListingId: '100', options: [{ salesProductOptionId: null, channelListingOptionId: OPTION_A, externalOptionId: '100-1', sellerSku: null }] },
        { channelListingId: LISTING_B, externalListingId: '200', options: [{ salesProductOptionId: null, channelListingOptionId: OPTION_B, externalOptionId: '200-1', sellerSku: null }] },
      ],
    },
    ...overrides,
  });
}

type AvailabilityInput = Parameters<NonNullable<ReturnType<RegistrationSite['writer']> & { availability?: unknown }>['availability'] & ((...args: any[]) => any)>[0];

function availabilitySite(run: Record<string, unknown>, log: Array<Record<string, unknown>> = []): RegistrationSite {
  return {
    writer: () => ({
      async availability(input: AvailabilityInput) {
        log.push(input as Record<string, unknown>);
        return {
          answer: { sent: 2, failed: 0, confirmed: 2, warnings: [], requestOnly: false },
          observed: [],
          providerAccountId: null,
          observedUrl: null,
          ...run,
        };
      },
    }),
  } as RegistrationSite;
}

const soldOut = (externalListingId: string, externalOptionId: string, status: string | null = '진열안함') => ({
  externalListingId,
  status,
  options: [{ externalOptionId, stock: 0, status }],
});

describe('channels.registration — 품절·재개 묶음(KID-256)', () => {
  it('리스팅 단위 몰: 보낸 뒤 다시 읽은 상태를 리스팅마다 증거로 싣고, 다 바뀌었으면 succeeded(confirmed)', async () => {
    const log: Array<Record<string, unknown>> = [];
    const { chunks, finish } = await run(availabilityPlan(), availabilitySite({
      answer: { sent: 2, failed: 0, confirmed: 2, warnings: ['1건은 이미 진열안함이었습니다.'], requestOnly: false },
      observed: [soldOut('100', '100'), soldOut('200', '200')],
    }, log));

    expect(log).toEqual([{ resume: false, byOption: false, expectedProviderAccountId: null, listings: [{ externalListingId: '100', externalOptionIds: ['100-1'] }, { externalListingId: '200', externalOptionIds: ['200-1'] }] }]);
    // 리스팅마다 증거 청크 하나(M1 최종 규칙).
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['registration_fill', 'registration_evidence', 'registration_evidence']);
    expect(chunks[0]!.payload).toEqual([{ steps: ['몰에 2건을 보냈습니다.', '다시 읽어 2건이 바뀐 것을 확인했습니다.'], warnings: ['1건은 이미 진열안함이었습니다.'], manualSteps: [], dialogs: [] }]);
    expect(chunks.slice(1).map((chunk) => chunk.payload)).toEqual([
      [{ payloadHash: 'hash', channelAccountId: ACCOUNT, externalListingId: '100', observedUrl: null, providerAccountId: null, observedStatus: '진열안함', message: null, options: [] }],
      [{ payloadHash: 'hash', channelAccountId: ACCOUNT, externalListingId: '200', observedUrl: null, providerAccountId: null, observedStatus: '진열안함', message: null, options: [] }],
    ]);
    expect(finish).toMatchObject({ result: { providerOutcome: 'succeeded', mallOutcome: 'confirmed', submitted: true, submitSkipped: null } });
    expect(finish).not.toHaveProperty('outcome');
  });

  it('옵션 단위 몰(쿠팡 윙): 얼린 옵션만 짚어 보내고, 다시 읽은 옵션 재고를 observedOptions로 싣는다', async () => {
    const log: Array<Record<string, unknown>> = [];
    const { chunks, finish } = await run(availabilityPlan({ mallKey: 'coupang', expectedProviderAccountId: 'A00012345' }), availabilitySite({
      observed: [
        { externalListingId: '100', status: null, options: [{ externalOptionId: '100-1', stock: 0, status: null }, { externalOptionId: '100-2', stock: 5, status: null }] },
        { externalListingId: '200', status: null, options: [{ externalOptionId: '200-1', stock: 0, status: null }] },
      ],
      providerAccountId: 'A00012345',
      observedUrl: 'https://wing.coupang.com/vendor-inventory/list',
    }, log));

    expect(log[0]).toMatchObject({ byOption: true, expectedProviderAccountId: 'A00012345' });
    expect(chunks.slice(1).flatMap((chunk) => chunk.payload)).toEqual([
      {
        payloadHash: 'hash', channelAccountId: ACCOUNT, externalListingId: '100', observedUrl: 'https://wing.coupang.com/vendor-inventory/list',
        providerAccountId: 'A00012345', observedStatus: null, message: null, options: [],
        observedOptions: [{ externalOptionId: '100-1', stock: 0, status: null }],
      },
      {
        payloadHash: 'hash', channelAccountId: ACCOUNT, externalListingId: '200', observedUrl: 'https://wing.coupang.com/vendor-inventory/list',
        providerAccountId: 'A00012345', observedStatus: null, message: null, options: [],
        observedOptions: [{ externalOptionId: '200-1', stock: 0, status: null }],
      },
    ]);
    expect(finish).toMatchObject({ result: { mallOutcome: 'confirmed' } });
  });

  it('다시 읽어 아직 안 바뀐 리스팅이 있으면 reconciling(uncertain) — 증거는 읽은 그대로 싣는다', async () => {
    const { chunks, finish } = await run(availabilityPlan(), availabilitySite({
      answer: { sent: 2, failed: 0, confirmed: 1, warnings: [], requestOnly: false },
      observed: [soldOut('100', '100'), { externalListingId: '200', status: '진열함', options: [{ externalOptionId: '200', stock: null, status: '진열함' }] }],
    }));
    expect(chunks.filter((chunk) => chunk.chunkKind === 'registration_evidence').map((chunk) => chunk.payload.length)).toEqual([1, 1]);
    expect(finish).toMatchObject({ outcome: 'reconciling', result: { providerOutcome: 'uncertain', mallOutcome: 'uncertain', submitted: true } });
  });

  it('재개는 판매중으로 다시 읽혀야 확인이다', async () => {
    const { finish } = await run(availabilityPlan({}, 'resume'), availabilitySite({
      observed: [
        { externalListingId: '100', status: '진열함', options: [{ externalOptionId: '100', stock: null, status: null }] },
        { externalListingId: '200', status: '진열함', options: [{ externalOptionId: '200', stock: null, status: null }] },
      ],
    }));
    expect(finish).toMatchObject({ result: { mallOutcome: 'confirmed' } });
  });

  it('승인 요청 몰(온채널)은 보낸 것이 곧 반영이 아니다 — reconciling(awaiting_approval)', async () => {
    const { finish } = await run(availabilityPlan({ mallKey: 'onch' }), availabilitySite({
      answer: { sent: 2, failed: 0, warnings: ['온채널은 관리자 승인을 거칩니다 — 보낸 것이 곧 반영은 아닙니다.'], requestOnly: true },
    }));
    expect(finish).toMatchObject({ outcome: 'reconciling', result: { providerOutcome: 'uncertain', mallOutcome: 'awaiting_approval', submitted: true } });
  });

  it('몰이 하나도 받지 않았으면 실패로 끝난다(몰의 말을 싣는다)', async () => {
    await expect(run(availabilityPlan(), availabilitySite({
      answer: { sent: 0, failed: 2, confirmed: 0, warnings: ['도매꾹이 수정을 받지 않았습니다: 수정할 수 없는 상품입니다.'], requestOnly: false },
      observed: [],
    }))).rejects.toMatchObject({ code: 'MALL_WRITE_FAILED', message: expect.stringContaining('수정할 수 없는 상품입니다') });
  });

  it('보내기를 부탁받지 않았으면(submit false) 몰에 가지 않는다 — not_submitted', async () => {
    const log: Array<Record<string, unknown>> = [];
    const { chunks, finish } = await run(availabilityPlan({ submit: false }), availabilitySite({}, log));
    expect(log).toEqual([]);
    expect(chunks).toEqual([]);
    expect(finish).toMatchObject({ result: { providerOutcome: 'not_attempted', mallOutcome: 'not_submitted', submitted: false, submitSkipped: 'not_requested' } });
  });
});

const LISTING = '77777777-7777-4777-8777-777777777777';

function pricePlan(overrides: Partial<RegistrationPlan> = {}): RegistrationPlan {
  return plan({
    executionKind: 'update',
    mallKey: 'kakao',
    channelListingId: LISTING,
    externalListingId: '779522307',
    payload: { snapshot: { updateFields: ['salePrice'], product: { options: [{ salePrice: 2500 }] } }, form: null },
    ...overrides,
  });
}

function priceSite(answer: Record<string, unknown>, log: Array<Record<string, unknown>> = []): RegistrationSite {
  return {
    writer: () => ({
      async price(input: { externalListingId: string; price: number }) {
        log.push(input);
        return { success: true, sent: 1, failed: 0, confirmed: 1, warnings: [], submissionAttempted: true, ...answer };
      },
    }),
  } as RegistrationSite;
}

describe('channels.registration — 가격 수정(update·salePrice, KID-256)', () => {
  it('얼린 판매가를 그 리스팅에 보내고, 다시 읽어 바뀌었으면 증거와 함께 succeeded(confirmed)', async () => {
    const log: Array<Record<string, unknown>> = [];
    const { chunks, finish } = await run(pricePlan(), priceSite({
      results: [{ code: '779522307', before: 2220, after: 2500, confirmed: true, observedUrl: 'https://shopping-seller.kakao.com/product/store-seller/list' }],
    }, log));
    expect(log).toEqual([{ externalListingId: '779522307', price: 2500 }]);
    expect(chunks).toEqual([
      { chunkKind: 'registration_fill', payload: [{ steps: ['판매가 2,500원을 보냈습니다(2,220원 → 2,500원).'], warnings: [], manualSteps: [], dialogs: [] }] },
      { chunkKind: 'registration_evidence', payload: [{
        payloadHash: 'hash', channelAccountId: ACCOUNT, externalListingId: '779522307',
        observedUrl: 'https://shopping-seller.kakao.com/product/store-seller/list', providerAccountId: null, observedStatus: null, message: null, options: [],
      }] },
    ]);
    expect(finish).toMatchObject({ result: { providerOutcome: 'succeeded', mallOutcome: 'confirmed', submitted: true, externalListingId: '779522307' } });
    expect(finish).not.toHaveProperty('outcome');
  });

  it('보냈지만 다시 읽은 가격이 다르면 reconciling(submitted)', async () => {
    const { finish } = await run(pricePlan(), priceSite({ confirmed: 0, results: [{ code: '779522307', before: 2220, after: 2220, confirmed: false }] }));
    expect(finish).toMatchObject({ outcome: 'reconciling', result: { providerOutcome: 'uncertain', mallOutcome: 'submitted', submitted: true } });
  });

  it('보내기 전에 멈췄거나(옵션 상품) 몰이 거절하면 실패로 끝난다', async () => {
    await expect(run(pricePlan(), priceSite({ sent: 0, failed: 1, confirmed: 0, submissionAttempted: false, warnings: ['옵션이 있는 상품 1개는 옵션마다 가격이라 보내지 않았습니다.'] })))
      .rejects.toMatchObject({ code: 'MALL_WRITE_FAILED', message: expect.stringContaining('옵션이 있는 상품') });
    await expect(run(pricePlan(), priceSite({ sent: 0, failed: 1, confirmed: 0, warnings: ['카카오 톡스토어이 가격 변경을 받지 않았습니다(HTTP 500).'] })))
      .rejects.toMatchObject({ code: 'MALL_WRITE_FAILED' });
  });

  it('보내기를 부탁받지 않았으면 몰에 가지 않는다 · 판매가나 몰 상품 번호가 없으면 계획 오류다', async () => {
    const log: Array<Record<string, unknown>> = [];
    const { finish } = await run(pricePlan({ submit: false }), priceSite({}, log));
    expect(log).toEqual([]);
    expect(finish).toMatchObject({ result: { mallOutcome: 'not_submitted', submitted: false, submitSkipped: 'not_requested' } });
    await expect(run(pricePlan({ externalListingId: null }), priceSite({}))).rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
    await expect(run(pricePlan({ payload: { snapshot: { updateFields: ['salePrice'], product: { options: [] } }, form: null } }), priceSite({}))).rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
  });
});

const SALES_PRODUCT = '88888888-8888-4888-8888-888888888888';
const ASSET = '99999999-9999-4999-8999-999999999999';

function thumbnailPlan(overrides: Partial<RegistrationPlan> = {}): RegistrationPlan {
  return plan({
    executionKind: 'thumbnail_update',
    mallKey: 'coupang',
    registrationTargetId: null,
    salesProductId: SALES_PRODUCT,
    channelListingId: LISTING,
    externalListingId: '15966710321',
    expectedProviderAccountId: 'A00012345',
    submit: false,
    payload: {
      dataUrl: 'data:image/png;base64,AAAA', filename: 'thumb.png', mimeType: 'image/png',
      salesProductId: SALES_PRODUCT, channelListingId: LISTING, externalListingId: '15966710321', assetId: ASSET, productName: '말랑 키링',
    },
    ...overrides,
  });
}

describe('channels.registration — 대표이미지(thumbnail_update, KID-256)', () => {
  it('수정 화면에 사진을 올리고 [저장]은 운영자에게 남긴다 — 증거(관찰 주소·계정·말)와 함께 reconciling', async () => {
    const log: Array<Record<string, unknown>> = [];
    const done: string[] = [];
    const site = {
      writer: () => ({
        async thumbnail(input: Record<string, unknown>) {
          log.push(input);
          return {
            fill: { steps: ['원래 대표이미지 지우기', '새 대표이미지 올리기'], warnings: [], manualSteps: ['열린 쿠팡 윙 수정 화면에서 [저장]을 눌러 주세요.'], dialogs: [] },
            providerAccountId: 'A00012345',
            observedUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2',
            done: async () => { done.push('done'); },
          };
        },
      }),
    } as unknown as RegistrationSite;
    const { chunks, finish } = await run(thumbnailPlan(), site);
    expect(log).toEqual([{
      externalListingId: '15966710321', productName: '말랑 키링', expectedProviderAccountId: 'A00012345',
      image: { dataUrl: 'data:image/png;base64,AAAA', filename: 'thumb.png', mimeType: 'image/png' },
    }]);
    expect(done).toEqual(['done']);
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['registration_fill', 'registration_evidence']);
    expect(chunks[1]!.payload).toEqual([{
      payloadHash: 'hash', channelAccountId: ACCOUNT, externalListingId: '15966710321',
      observedUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2', providerAccountId: 'A00012345', observedStatus: null,
      message: '대표이미지를 수정 화면에 올렸습니다. [저장]은 운영자가 누릅니다.', options: [],
    }]);
    expect(finish).toMatchObject({
      outcome: 'reconciling',
      result: { providerOutcome: 'uncertain', mallOutcome: 'uncertain', submitted: false, submitSkipped: 'operator_saves', externalListingId: '15966710321' },
    });
  });

  it('몰 화면 계정이 실행 계정과 다르면 증거 없이 멈춘다', async () => {
    const site = {
      writer: () => ({
        thumbnail: async () => ({ fill: { steps: [], warnings: [], manualSteps: [], dialogs: [] }, providerAccountId: 'B999', observedUrl: null, done: async () => undefined }),
      }),
    } as unknown as RegistrationSite;
    await expect(run(thumbnailPlan(), site)).rejects.toMatchObject({ code: 'REGISTRATION_ACCOUNT_MISMATCH' });
  });

  it('대표이미지를 바꾸는 모듈이 없는 몰이면 계획 오류다', async () => {
    await expect(run(thumbnailPlan({ mallKey: 'domeggook' }), { writer: () => ({}) } as unknown as RegistrationSite)).rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
  });
});
