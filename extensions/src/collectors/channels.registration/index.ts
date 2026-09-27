import {
  REGISTRATION_EVIDENCE_CHUNK_KIND,
  REGISTRATION_FILL_CHUNK_KIND,
  REGISTRATION_KIND,
  RegistrationPlanSchema,
  type RegistrationEvidence,
  type RegistrationFill,
  type RegistrationMallOutcome,
  type RegistrationPlan,
  type RegistrationResult,
} from '@kiditem/shared/channels-operations';
import { RuntimeError } from '../../core/errors';
import type { CollectedChunk, CollectFinish, Collector } from '../collector';
import { registerCollector } from '../index';
import { findChannel } from '@kiditem/shared/channel-registry';
import { RegistrationAvailabilityPayloadSchema, RegistrationDocumentPayloadSchema } from './payload';

/** 관문(`sites/mall-write/submit-gate.ts`)이 정한 것. 누르지 않으면 까닭(없으면 부탁받지 않았다). */
export type RegistrationSubmitDecision = { press: true } | { press: false; skipped: string | null };

/** 몰이 [등록] 뒤에 보인 것. `pressed`: 버튼을 실제로 눌렀는가(못 찾았으면 제출이 아니다). `accepted`: 받았다·거절했다·모른다(null). */
export interface RegistrationSubmission {
  pressed: boolean;
  accepted: boolean | null;
  externalListingId: string | null;
  observedUrl: string | null;
  mallMessage: string | null;
}

/** 폼을 채운 쓰기 탭 하나(`sites/mall-write`). `done`이 탭을 운영자에게 넘긴다 — 채운 폼은 성공해도 사람이 본다. */
export interface RegistrationFillSession {
  fill: RegistrationFill;
  decision: RegistrationSubmitDecision;
  providerAccountId: string | null;
  observedUrl: string | null;
  submit(): Promise<RegistrationSubmission>;
  done(): Promise<void>;
}

/** 품절·재개를 보낸 몰의 답과 보낸 뒤 다시 읽은 것(`sites/mall-write`). 몰이 하나도 받지 않은 거절·로그인은 사이트가 던진다. */
export interface RegistrationAvailabilityRun {
  answer: { sent?: number; failed?: number; confirmed?: number; warnings?: string[]; requestOnly?: boolean; stopped?: string };
  /** 다시 읽은 리스팅. `status`는 몰의 말(리스팅 단위 몰), 옵션은 재고(모르면 null)와 몰의 말. */
  observed: Array<{ externalListingId: string; status: string | null; options: Array<{ externalOptionId: string; stock: number | null; status: string | null }> }>;
  providerAccountId: string | null;
  observedUrl: string | null;
}

export interface RegistrationWriter {
  availability(input: {
    resume: boolean;
    /** 옵션 단위로 바꾸는 몰(쿠팡 윙 — 채널 레지스트리 `soldOutScope`)인가. 아니면 리스팅 단위다. */
    byOption: boolean;
    listings: Array<{ externalListingId: string; externalOptionIds: string[] }>;
    expectedProviderAccountId: string | null;
  }): Promise<RegistrationAvailabilityRun>;
  fill(input: {
    executionKind: 'register' | 'update' | 'composition_change';
    externalListingId: string | null;
    form: Record<string, unknown>;
    submit: boolean;
    expectedProviderAccountId: string | null;
  }): Promise<RegistrationFillSession>;
}

/** 이 수집기가 쓰는 사이트: 몰 키 → 그 몰 쓰기 모듈(`sites/mall-write`가 쓰기 모듈이 있는 몰만 찾아 준다). */
export interface RegistrationSite {
  writer(mallKey: string): Partial<RegistrationWriter> | null;
}

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;

/**
 * 몰 증거 한 줄. `payloadHash`는 이 증거가 가리키는 얼린 문서(plan 값)다 — owner finalize가 대조한다(M1 `RegistrationEvidenceSchema`
 * 추가 칸, 합류 전 계약 타입에는 아직 없다).
 */
export type RegistrationEvidenceRow = RegistrationEvidence & {
  payloadHash: string;
  /** 품절·재개(옵션 단위 몰): 보낸 뒤 다시 읽은 얼린 옵션의 재고·상태(M1 추가 칸). */
  observedOptions?: Array<{ externalOptionId: string; stock: number | null; status: string | null }>;
};
export const REGISTRATION_ACCOUNT_MISMATCH = 'REGISTRATION_ACCOUNT_MISMATCH' as const;
export const MALL_WRITE_FAILED = 'MALL_WRITE_FAILED' as const;

/**
 * 다시 읽은 한 줄이 지시를 확인하는가(M1 `observedOptionConfirms`와 같은 규칙을 재고 중심으로): 품절은 재고 0(판매를 멈춘 몰은
 * 읽기가 0으로 접는다), 재개는 재고가 0이 아니면서 재고나 상태 둘 중 하나는 읽힌 것이다.
 */
function observedConfirms(resume: boolean, stock: number | null, status: string | null): boolean {
  if (!resume) return stock === 0;
  return stock !== 0 && (stock !== null || status !== null);
}

type AvailabilityObservation = RegistrationAvailabilityRun['observed'][number];

/** 리스팅 하나가 확인됐는가: 옵션 단위 몰은 얼린 옵션마다, 리스팅 단위 몰은 읽힌 옵션 전부가 지시와 맞아야 한다. */
function listingConfirms(resume: boolean, byOption: boolean, frozen: readonly string[], observed: AvailabilityObservation | undefined): boolean {
  if (!observed || observed.options.length === 0) return false;
  const lines = byOption ? frozen.map((id) => observed.options.find((option) => option.externalOptionId === id)) : observed.options;
  return lines.every((line) => line !== undefined && observedConfirms(resume, line.stock, line.status ?? observed.status));
}

function invalid(message: string, details: Record<string, unknown>): RuntimeError {
  return new RuntimeError(RUNTIME_PLAN_INVALID, message, { kind: REGISTRATION_KIND, ...details });
}

/** 몰이 보인 것을 결과 어휘로(옛 웹 `reportOutcome`과 같은 규칙). 새 상품번호와 판매자 계정이 함께 보여야 확인이다. */
function mallOutcomeOf(submission: RegistrationSubmission | null, providerAccountId: string | null): { outcome: RegistrationMallOutcome; observed: string } {
  if (!submission) return { outcome: 'not_submitted', observed: 'not_submitted' };
  if (submission.accepted === false) return { outcome: 'uncertain', observed: 'submission_rejected' };
  if (submission.accepted === true && submission.externalListingId && providerAccountId) return { outcome: 'confirmed', observed: 'confirmed' };
  return { outcome: 'submitted', observed: 'submitted' };
}

/** 확장이 본 대로의 provider 결과. owner finalize가 최종으로 정한다(누르지 않음 → not_attempted, 확인 → succeeded, 그 밖 → uncertain). */
function providerOutcomeOf(outcome: RegistrationMallOutcome): RegistrationResult['providerOutcome'] {
  if (outcome === 'not_submitted') return 'not_attempted';
  if (outcome === 'confirmed') return 'succeeded';
  return 'uncertain';
}

/**
 * `channels.registration`(KID-364 · 몰 쓰기 모듈 KID-256): plan의 executionKind로 몰 쓰기 모듈을 부른다. 등록 폼(register·
 * update·composition_change)은 쓰기 탭을 열어(로그인 입구가 있으면 그 탭에서 로그인) 폼을 채우고 `registration_fill`을 낸 뒤,
 * 관문(ADR-0019)이 누르라고 할 때만 [등록]을 눌러 `registration_evidence`를 낸다. 누른 것·몰이 받은 것·몰에 올라간 것은
 * 다른 사실이다. finish: 몰이 새 상품번호와 판매자 계정을 보였으면 `succeeded`(confirmed), 눌렀는데 못 읽었거나 몰이 거절했으면
 * `reconciling`(providerOutcome uncertain), 폼만 채웠으면 `succeeded`(not_submitted·not_attempted — 웹이 "폼만 채움"으로 본다).
 * 채우기 실패·로그인은 실패로 끝난다. 탭은 성공해도 남긴다(운영자가 본다).
 */
export const registrationCollector: Collector<RegistrationPlan, RegistrationResult & Record<string, unknown>, RegistrationSite> = {
  kind: REGISTRATION_KIND,
  site: 'mall-write',
  async *collect(rawPlan, site): AsyncGenerator<CollectedChunk, CollectFinish<RegistrationResult & Record<string, unknown>>, undefined> {
    const parsed = RegistrationPlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw invalid('이 확장이 실행할 수 없는 등록 계획입니다.', { mallKey: null });
    const plan = parsed.data;
    const writer = site?.writer(plan.mallKey) ?? null;
    if (!writer) throw invalid(`이 확장에 ${plan.mallKey} 몰 쓰기 모듈이 없습니다.`, { mallKey: plan.mallKey });
    const progress = { mallKey: plan.mallKey, executionKind: plan.executionKind };

    if (plan.executionKind === 'register' || plan.executionKind === 'update' || plan.executionKind === 'composition_change') {
      const payload = RegistrationDocumentPayloadSchema.safeParse(plan.payload);
      if (!payload.success || !payload.data.form || !writer.fill) {
        throw invalid('등록 계획에 몰 폼 지시가 없습니다.', { mallKey: plan.mallKey, executionKind: plan.executionKind });
      }
      const session = await writer.fill({
        executionKind: plan.executionKind,
        externalListingId: plan.externalListingId,
        form: payload.data.form,
        submit: plan.submit,
        expectedProviderAccountId: plan.expectedProviderAccountId,
      });
      try {
        // 몰 화면의 판매자 계정을 읽는 몰(Wing)은 plan의 계정과 대조한다 — 다른 계정의 폼에 쓴 것을 남기지 않는다.
        if (plan.expectedProviderAccountId && session.providerAccountId && session.providerAccountId !== plan.expectedProviderAccountId) {
          throw new RuntimeError(REGISTRATION_ACCOUNT_MISMATCH, '몰에 로그인된 판매자 계정이 등록할 계정과 다릅니다. 열린 탭의 계정을 확인해 주세요.', {
            mallKey: plan.mallKey,
          });
        }
        yield { chunkKind: REGISTRATION_FILL_CHUNK_KIND, payload: [session.fill], progress: { ...progress, stage: 'filled' } };
        const attempt = session.decision.press ? await session.submit() : null;
        // 버튼을 못 찾아 누르지 못했으면 제출이 아니다 — 폼만 채운 것과 같다(까닭은 몰의 말로 남긴다).
        const submission = attempt?.pressed ? attempt : null;
        const { outcome, observed } = mallOutcomeOf(submission, session.providerAccountId);
        let evidence: RegistrationEvidenceRow | null = null;
        if (submission) {
          evidence = {
            payloadHash: plan.payloadHash,
            channelAccountId: plan.channelAccountId,
            externalListingId: submission.externalListingId,
            observedUrl: submission.observedUrl ?? session.observedUrl,
            providerAccountId: session.providerAccountId,
            observedStatus: observed,
            message: submission.mallMessage,
            options: [],
          };
          yield { chunkKind: REGISTRATION_EVIDENCE_CHUNK_KIND, payload: [evidence], progress: { ...progress, stage: 'submitted' } };
        }
        return {
          // 몰에 제출했지만 새 상품번호를 못 읽었다(또는 몰이 거절했다) — 운영자가 몰에서 읽은 등록상품ID로 닫는다(KID-218).
          ...(outcome === 'submitted' || outcome === 'uncertain' || outcome === 'awaiting_approval' ? { outcome: 'reconciling' as const } : {}),
          result: {
            providerOutcome: providerOutcomeOf(outcome),
            mallOutcome: outcome,
            submitted: submission !== null,
            submitSkipped: session.decision.press ? (submission ? null : 'submit_button_missing') : session.decision.skipped,
            externalListingId: submission?.externalListingId ?? null,
            mallMessage: (submission ?? attempt)?.mallMessage ?? null,
            fill: session.fill,
            evidence,
          },
        };
      } finally {
        await session.done();
      }
    }
    if (plan.executionKind === 'sold_out' || plan.executionKind === 'resume') {
      const payload = RegistrationAvailabilityPayloadSchema.safeParse(plan.payload);
      if (!payload.success || !writer.availability) {
        throw invalid('품절·재개 계획에 리스팅 묶음이 없습니다.', { mallKey: plan.mallKey, executionKind: plan.executionKind });
      }
      const resume = plan.executionKind === 'resume';
      const listings = payload.data.listings.map((listing) => ({
        externalListingId: listing.externalListingId,
        externalOptionIds: listing.options.map((option) => option.externalOptionId),
      }));
      // 품절·재개는 등록 관문을 쓰지 않는다 — 요청이 곧 동작이다. 부탁받지 않았으면 몰에 가지 않는다.
      if (!plan.submit) {
        return {
          result: {
            providerOutcome: 'not_attempted', mallOutcome: 'not_submitted', submitted: false, submitSkipped: 'not_requested',
            externalListingId: null, mallMessage: null, fill: { steps: [], warnings: [], manualSteps: [], dialogs: [] }, evidence: null,
          },
        };
      }
      const byOption = findChannel(plan.mallKey)?.soldOutScope === 'option';
      const run = await writer.availability({ resume, byOption, listings, expectedProviderAccountId: plan.expectedProviderAccountId });
      if (plan.expectedProviderAccountId && run.providerAccountId && run.providerAccountId !== plan.expectedProviderAccountId) {
        throw new RuntimeError(REGISTRATION_ACCOUNT_MISMATCH, '몰에 로그인된 판매자 계정이 실행할 계정과 다릅니다. 열린 탭의 계정을 확인해 주세요.', { mallKey: plan.mallKey });
      }
      const sent = run.answer.sent ?? 0;
      const warnings = run.answer.warnings ?? [];
      const byListing = new Map(run.observed.map((observed) => [observed.externalListingId, observed]));
      const confirmed = listings.filter((listing) => listingConfirms(resume, byOption, listing.externalOptionIds, byListing.get(listing.externalListingId)));
      if (sent === 0 && confirmed.length < listings.length && !run.answer.requestOnly) {
        throw new RuntimeError(MALL_WRITE_FAILED, warnings.length > 0 ? warnings.join(' ') : '몰이 판매 상태 변경을 받지 않았습니다.', { mallKey: plan.mallKey });
      }
      const fill: RegistrationFill = {
        steps: [
          `몰에 ${sent}건을 보냈습니다.`,
          ...(run.observed.length > 0 ? [`다시 읽어 ${confirmed.length}건이 바뀐 것을 확인했습니다.`] : []),
        ],
        warnings,
        manualSteps: [],
        dialogs: [],
      };
      yield { chunkKind: REGISTRATION_FILL_CHUNK_KIND, payload: [fill], progress: { ...progress, stage: 'sent' } };
      const evidence = listings.flatMap((listing): RegistrationEvidenceRow[] => {
        const observed = byListing.get(listing.externalListingId);
        if (!observed) return [];
        return [{
          payloadHash: plan.payloadHash,
          channelAccountId: plan.channelAccountId,
          externalListingId: listing.externalListingId,
          observedUrl: run.observedUrl,
          providerAccountId: run.providerAccountId,
          observedStatus: byOption ? observed.status : observed.status ?? (observed.options.every((option) => option.stock === 0) ? '품절' : '판매중'),
          message: null,
          options: [],
          ...(byOption ? {
            observedOptions: listing.externalOptionIds.flatMap((id) => observed.options.filter((option) => option.externalOptionId === id))
              .map((option) => ({ externalOptionId: option.externalOptionId, stock: option.stock, status: option.status })),
          } : {}),
        }];
      });
      if (evidence.length > 0) yield { chunkKind: REGISTRATION_EVIDENCE_CHUNK_KIND, payload: evidence, progress: { ...progress, stage: 'reread' } };
      const outcome: RegistrationMallOutcome = confirmed.length === listings.length ? 'confirmed' : run.answer.requestOnly ? 'awaiting_approval' : 'uncertain';
      return {
        ...(outcome === 'confirmed' ? {} : { outcome: 'reconciling' as const }),
        result: {
          providerOutcome: providerOutcomeOf(outcome),
          mallOutcome: outcome,
          submitted: true,
          submitSkipped: null,
          externalListingId: null,
          mallMessage: null,
          fill,
          evidence: null,
        },
      };
    }
    throw invalid(`이 확장이 아직 실행하지 못하는 등록 종류입니다: ${plan.executionKind}`, { mallKey: plan.mallKey, executionKind: plan.executionKind });
  },
};

registerCollector(registrationCollector);
