import type { ReadinessCheck, ReadinessResponse } from '@kiditem/shared/readiness';

export type AutoOpenWhen = 'anyIssue' | 'collectionIssue';

export interface ReadinessModalViewModel {
  checks: ReadinessCheck[];
  allOk: boolean;
  doneCount: number;
  totalCount: number;
  pendingCount: number;
  progressRatio: number;
  actionChecks: ReadinessCheck[];
  okChecks: ReadinessCheck[];
  headline: string;
  subhead: string;
}

const HIDDEN_READINESS_KEYS = new Set(['rocket_sales']);

function visibleChecks(checks: ReadinessCheck[]): ReadinessCheck[] {
  // Older cached responses can still contain the retired Rocket readiness row.
  // Keep it out of both rendering and readiness arithmetic so it cannot reopen
  // or block the modal after the server-side check has been removed.
  return checks.filter((check) => !HIDDEN_READINESS_KEYS.has(check.key));
}

function isReady(check: ReadinessCheck): boolean {
  return check.status === 'ok' && (check.missingDates?.length ?? 0) === 0;
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shouldAutoOpen(data: ReadinessResponse, mode: AutoOpenWhen): boolean {
  const checks = visibleChecks(data.checks);
  if (checks.every(isReady)) return false;
  if (mode === 'anyIssue') return true;

  return checks.some((check) => {
    const missingDateCount = check.missingDates?.length ?? 0;
    return check.collector === 'extension' && (check.status !== 'ok' || missingDateCount > 0);
  });
}

export function buildReadinessModalViewModel(data: ReadinessResponse | undefined): ReadinessModalViewModel {
  const checks = visibleChecks(data?.checks ?? []);
  const okChecks: ReadinessCheck[] = [];
  const actionChecks: ReadinessCheck[] = [];

  for (const check of checks) {
    if (isReady(check)) okChecks.push(check);
    else actionChecks.push(check);
  }

  const doneCount = okChecks.length;
  const totalCount = checks.length;
  const pendingCount = totalCount - doneCount;
  const progressRatio = totalCount ? doneCount / totalCount : 0;
  const allOk = data ? checks.every(isReady) : false;

  return {
    checks,
    allOk,
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
