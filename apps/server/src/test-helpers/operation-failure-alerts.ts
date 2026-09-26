import type { PrismaClient } from '@prisma/client';
import type { AlertItem } from '@kiditem/shared/alerts';
import { SourceFailureAlerts } from '../alerts/alerts.service';

/**
 * 정책 B(KID-355): 옮긴 kind의 실패는 실행 표에만 남는다. owner 스펙은 알림 표에 행이 없고(`rows`), 알림 reader가
 * 실행 표에서 만든 알림(`items`)이 보이는지를 이것으로 본다.
 */
export async function operationFailureAlerts(
  prisma: PrismaClient,
  organizationId: string,
): Promise<{ rows: number; items: AlertItem[] }> {
  const [rows, items] = await Promise.all([
    prisma.alert.count({ where: { organizationId } }),
    new SourceFailureAlerts(prisma as never).list(organizationId),
  ]);
  return { rows, items };
}
