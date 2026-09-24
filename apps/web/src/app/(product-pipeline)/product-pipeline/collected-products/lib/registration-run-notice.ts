import type { PublishTask } from '@/app/(channels)/_shared/use-mall-publish-run';

export interface RegistrationRunNotice {
  tone: 'success' | 'warning' | 'error';
  /** 서버가 등록 실행을 확인했다(`succeeded`). 이때만 등록상품으로 올라갔다고 말한다. */
  registered: boolean;
  title: string;
  description?: string;
}

/**
 * 등록 실행(확인 창의 "등록 실행") 한 건의 결과 문구. 보낸 것 · 누른 것은 등록이 아니다 — 서버가 몰 증거로
 * 확인한 실행만 등록됐다고 말하고, 확인이 남은 실행은 확인이 남았다고 말한다.
 */
export function registrationRunNotice(task: PublishTask): RegistrationRunNotice {
  const outcome = task.outcome;
  if (task.status === 'succeeded') {
    return {
      tone: 'success',
      registered: true,
      title: `${task.mallName}에 등록했어요 — 등록상품에 올렸습니다`,
      ...(outcome?.productNo ? { description: `몰 상품번호 ${outcome.productNo}` } : {}),
    };
  }
  const detail = [task.error, outcome?.error, ...(outcome?.manualSteps ?? []), ...(outcome?.warnings ?? [])]
    .filter((line): line is string => Boolean(line?.trim()));
  const description = [...new Set(detail)].join(' ') || undefined;
  if (task.status === 'reconciling') {
    return {
      tone: 'warning',
      registered: false,
      title: `${task.mallName}에 보냈지만 등록 확인이 남았어요`,
      ...(description ? { description } : {}),
    };
  }
  return {
    tone: 'error',
    registered: false,
    title: task.status === 'cancelled' ? `${task.mallName} 등록 실행을 멈췄어요` : `${task.mallName} 등록 실행이 멈췄어요`,
    ...(description ? { description } : {}),
  };
}
