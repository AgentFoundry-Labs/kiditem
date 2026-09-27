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
import { RegistrationFormPayloadSchema } from './payload';

/** 관문(`sites/mall-write/submit-gate.ts`)이 정한 것. 누르지 않으면 까닭(없으면 부탁받지 않았다). */
export type RegistrationSubmitDecision = { press: true } | { press: false; skipped: string | null };

/** 몰이 [등록] 뒤에 보인 것. `accepted`: 받았다·거절했다·모른다(null). */
export interface RegistrationSubmission {
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

export interface RegistrationWriter {
  fill(input: { form: Record<string, unknown>; submit: boolean; expectedProviderAccountId: string | null }): Promise<RegistrationFillSession>;
}

/** 이 수집기가 쓰는 사이트: 몰 키 → 그 몰 쓰기 모듈(`sites/mall-write`가 쓰기 모듈이 있는 몰만 찾아 준다). */
export interface RegistrationSite {
  writer(mallKey: string): Partial<RegistrationWriter> | null;
}

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
export const REGISTRATION_ACCOUNT_MISMATCH = 'REGISTRATION_ACCOUNT_MISMATCH' as const;

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
 * 다른 사실이다 — finish는 `succeeded`에 `mallOutcome`을 싣고, reconciling·실패로 가르는 것은 owner finalize다. 채우기
 * 실패·로그인은 실패로 끝난다. 탭은 성공해도 남긴다(운영자가 본다).
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
      const payload = RegistrationFormPayloadSchema.safeParse(plan.payload);
      if (!payload.success || !payload.data.form || !writer.fill) {
        throw invalid('등록 계획에 몰 폼 지시가 없습니다.', { mallKey: plan.mallKey, executionKind: plan.executionKind });
      }
      const session = await writer.fill({ form: payload.data.form, submit: plan.submit, expectedProviderAccountId: plan.expectedProviderAccountId });
      try {
        // 몰 화면의 판매자 계정을 읽는 몰(Wing)은 plan의 계정과 대조한다 — 다른 계정의 폼에 쓴 것을 남기지 않는다.
        if (plan.expectedProviderAccountId && session.providerAccountId && session.providerAccountId !== plan.expectedProviderAccountId) {
          throw new RuntimeError(REGISTRATION_ACCOUNT_MISMATCH, '몰에 로그인된 판매자 계정이 등록할 계정과 다릅니다. 열린 탭의 계정을 확인해 주세요.', {
            mallKey: plan.mallKey,
          });
        }
        yield { chunkKind: REGISTRATION_FILL_CHUNK_KIND, payload: [session.fill], progress: { ...progress, stage: 'filled' } };
        const submission = session.decision.press ? await session.submit() : null;
        const { outcome, observed } = mallOutcomeOf(submission, session.providerAccountId);
        let evidence: RegistrationEvidence | null = null;
        if (submission) {
          evidence = {
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
          result: {
            providerOutcome: providerOutcomeOf(outcome),
            mallOutcome: outcome,
            submitted: submission !== null,
            submitSkipped: session.decision.press ? null : session.decision.skipped,
            externalListingId: submission?.externalListingId ?? null,
            mallMessage: submission?.mallMessage ?? null,
            fill: session.fill,
            evidence,
          },
        };
      } finally {
        await session.done();
      }
    }
    throw invalid(`이 확장이 아직 실행하지 못하는 등록 종류입니다: ${plan.executionKind}`, { mallKey: plan.mallKey, executionKind: plan.executionKind });
  },
};

registerCollector(registrationCollector);
