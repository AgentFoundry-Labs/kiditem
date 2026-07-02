import type { ReadinessCheck, ReadinessResponse } from '@kiditem/shared/readiness';

export type AutoOpenWhen = 'anyIssue' | 'collectionIssue';

export interface ReadinessModalViewModel {
  checks: ReadinessCheck[];
  doneCount: number;
  totalCount: number;
  pendingCount: number;
  progressRatio: number;
  actionChecks: ReadinessCheck[];
  okChecks: ReadinessCheck[];
  headline: string;
  subhead: string;
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shouldAutoOpen(data: ReadinessResponse, mode: AutoOpenWhen): boolean {
  if (data.allOk) return false;
  if (mode === 'anyIssue') return true;

  return data.checks.some((check) => {
    const missingDateCount = check.missingDates?.length ?? 0;
    return check.collector === 'extension' && (check.status !== 'ok' || missingDateCount > 0);
  });
}

export function buildReadinessModalViewModel(data: ReadinessResponse | undefined): ReadinessModalViewModel {
  const checks = data?.checks ?? [];
  const okChecks: ReadinessCheck[] = [];
  const actionChecks: ReadinessCheck[] = [];

  for (const check of checks) {
    if (check.status === 'ok') okChecks.push(check);
    else actionChecks.push(check);
  }

  const doneCount = okChecks.length;
  const totalCount = checks.length;
  const pendingCount = totalCount - doneCount;
  const progressRatio = totalCount ? doneCount / totalCount : 0;
  const allOk = data?.allOk ?? false;

  return {
    checks,
    doneCount,
    totalCount,
    pendingCount,
    progressRatio,
    actionChecks,
    okChecks,
    headline: allOk
      ? 'AI 가 직접 운영합니다'
      : pendingCount === 1
        ? '거의 다 됐어요, 하나만 더'
        : `${pendingCount}개만 업데이트하면 돼요`,
    subhead: allOk
      ? '모든 데이터가 어제까지 잘 들어왔어요.'
      : '어제까지의 숫자를 채워두면 오늘 대시보드가 정확해져요.',
  };
}
