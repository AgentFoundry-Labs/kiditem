import { z } from 'zod';

/**
 * 몰 계정 하나에서 판매 상품이 지금 어떤 등록 상태인가(KID-313 결정 11, W4 KID-320).
 *
 * Channels 의 등록 상태 reader 하나가 판매 상품 id 목록 → 계정별 상태를 돌려주고, 모든 화면(수집 상품 ·
 * 판매상품 · 등록 상품 · 리스팅 상세 · 몰 매트릭스)이 이 값만 읽는다. 화면이 실행 표나 리스팅 표를 직접
 * 조합하지 않는다. 판정 규칙은 서버 도메인(`channels/domain/registration/registration-account-state.ts`)이
 * 소유하고 여기는 나르기만 한다.
 *
 * - `unregistered` 미등록: 등록 설정만 있거나 아무것도 보내지 않았다.
 * - `preparing` 준비 중: 실행이 준비됐고 아직 보내지 않았다(`prepared`).
 * - `submitting` 전송 중: 몰로 보내는 중이다(`executing`, provider 결과 없음).
 * - `confirming` 확인 대기: 보냈는데 몰의 답을 아직 모른다(`reconciling`, 또는 provider 는 됐다는데 fence 가 못 닫음).
 * - `registered` 등록됨: 몰에 리스팅이 있다(몰이 보고했든 fence 가 확인했든).
 * - `failed` 실패: 마지막 등록성 실행이 실패했고 몰에 리스팅이 없다.
 *
 * 등록됨 위에 `soldOut`(품절)과 `changedSinceRegistration`(등록 뒤 값이 바뀌어 재전송 필요)이 얹힌다.
 * `thumbnail_update` 실행은 상태에 영향이 없고, `sold_out` · `resume` 는 `soldOut` 만 바꾼다.
 */
export const REGISTRATION_ACCOUNT_STATES = [
  'unregistered',
  'preparing',
  'submitting',
  'confirming',
  'registered',
  'failed',
] as const;
export const RegistrationAccountStateValueSchema = z.enum(REGISTRATION_ACCOUNT_STATES);
export type RegistrationAccountStateValue = z.infer<typeof RegistrationAccountStateValueSchema>;

/** 상태의 근거가 된 마지막 등록성 실행(register · update · composition_change). 없으면 null. */
export const RegistrationAccountLastExecutionSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  status: z.string(),
  providerOutcome: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
}).strict();

export const RegistrationAccountStateSchema = z.object({
  channelAccountId: z.string().uuid(),
  channel: z.string(),
  channelAccountName: z.string().nullable(),
  /** 이 계정의 등록 설정(상품 × 계정당 하나). 리스팅만 있고 설정이 없으면 null. */
  registrationTargetId: z.string().uuid().nullable(),
  /** 몰에 있는 리스팅. 없으면 null. */
  channelListingId: z.string().uuid().nullable(),
  externalListingId: z.string().nullable(),
  state: RegistrationAccountStateValueSchema,
  /** 등록됨 위 품절 표시. 등록되지 않았으면 false. */
  soldOut: z.boolean(),
  /** 등록 뒤 상품 · 옵션 · 등록 설정 · 상세 revision · 대표이미지가 바뀌어 재전송이 필요하다. 등록되지 않았으면 false. */
  changedSinceRegistration: z.boolean(),
  /** 등록 설정이 고른 콘텐츠(Content id). 비면 워크스페이스의 현재 값. */
  selectedThumbnailAssetId: z.string().uuid().nullable(),
  selectedDetailPageRevisionId: z.string().uuid().nullable(),
  lastExecution: RegistrationAccountLastExecutionSchema.nullable(),
}).strict();
export type RegistrationAccountState = z.infer<typeof RegistrationAccountStateSchema>;

/**
 * `GET /api/products/sales-products/:salesProductId/registration/state` 응답. 계정마다 한 줄이고, 등록 설정도
 * 리스팅도 없는 계정은 없다(화면은 없는 계정을 미등록으로 그린다).
 */
export const SalesProductRegistrationStateSchema = z.object({
  accounts: z.array(RegistrationAccountStateSchema),
}).strict();
export type SalesProductRegistrationState = z.infer<typeof SalesProductRegistrationStateSchema>;

/** 화면이 상품 하나를 배지 하나로 줄일 때 쓰는 순서 — 살아 있는 실행이 있으면 그것, 없으면 실패 > 등록됨 > 미등록. */
const SUMMARY_PRIORITY: readonly RegistrationAccountStateValue[] = [
  'submitting',
  'confirming',
  'preparing',
  'failed',
  'registered',
  'unregistered',
];

export function summarizeRegistrationAccounts(
  accounts: readonly Pick<RegistrationAccountState, 'state' | 'soldOut' | 'changedSinceRegistration'>[],
): { state: RegistrationAccountStateValue; registeredCount: number; soldOutCount: number; changedCount: number } {
  let state: RegistrationAccountStateValue = 'unregistered';
  for (const candidate of SUMMARY_PRIORITY) {
    if (accounts.some((account) => account.state === candidate)) {
      state = candidate;
      break;
    }
  }
  return {
    state,
    registeredCount: accounts.filter((account) => account.state === 'registered').length,
    soldOutCount: accounts.filter((account) => account.state === 'registered' && account.soldOut).length,
    changedCount: accounts.filter((account) => account.state === 'registered' && account.changedSinceRegistration).length,
  };
}
