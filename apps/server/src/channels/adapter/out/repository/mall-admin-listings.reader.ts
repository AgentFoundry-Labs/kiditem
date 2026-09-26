import type { Prisma } from '@prisma/client';
import { isMallAdminListingOperationMall } from '@kiditem/shared/channels-operations';
import {
  MALL_ADMIN_LISTING_MALL_KEYS,
  MALL_ADMIN_LISTING_READERS,
  MALL_ADMIN_LISTINGS_PARSER_VERSION,
  MALL_ADMIN_LISTINGS_SOURCE_TYPE,
  MallAdminListingsPlanSchema,
  MallAdminListingsPublicationSchema,
  type MallAdminListingsAttempt,
  type MallAdminListingsControl,
  type MallAdminListingsPublication,
  type MallAdminListingsSource,
} from '@kiditem/shared/mall-admin-listings';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { readMallAccountRowIds } from './mall-account-rows';

export const MALL_ADMIN_LISTINGS_EXPIRED_MESSAGE =
  '몰 등록 상품 가져오기 시간이 지났습니다. 다시 가져와 주세요.';

/** 이 원천의 시도 행. 계정을 주면 그 몰 계정 행의 시도만 고른다. */
export function mallAdminListingsRunWhere(organizationId: string, channelAccountId?: string) {
  return {
    organizationId,
    sourceType: MALL_ADMIN_LISTINGS_SOURCE_TYPE,
    parserVersion: MALL_ADMIN_LISTINGS_PARSER_VERSION,
    ...(channelAccountId ? { channelAccountId } : {}),
  } satisfies Prisma.SourceImportRunWhereInput;
}

const ATTEMPT_SELECT = {
  id: true,
  status: true,
  freshnessGeneration: true,
  plan: true,
  expiresAt: true,
  importedAt: true,
  errorCode: true,
  errorMessage: true,
  qualityReport: true,
  attemptToken: true,
} satisfies Prisma.SourceImportRunSelect;

type AttemptRow = Prisma.SourceImportRunGetPayload<{ select: typeof ATTEMPT_SELECT }>;

function expired(run: Pick<AttemptRow, 'status' | 'expiresAt'>, now: number): boolean {
  return run.status === SOURCE_IMPORT_RUN_RUNNING_STATUS
    && (!run.expiresAt || run.expiresAt.getTime() <= now);
}

/** 화면이 보는 시도 모양. 임대가 지난 RUNNING 은 끝난 것으로 읽는다. */
export function mallAdminListingsAttempt(
  run: Omit<AttemptRow, 'qualityReport' | 'attemptToken'>,
  now = Date.now(),
): MallAdminListingsAttempt {
  const lapsed = expired(run, now);
  return {
    attemptId: run.id,
    state: lapsed || run.status === SOURCE_IMPORT_RUN_FAILED_STATUS
      ? 'FAILED'
      : run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
        ? 'COMPLETE'
        : 'RUNNING',
    generation: String(run.freshnessGeneration ?? 0n),
    plan: MallAdminListingsPlanSchema.parse(run.plan),
    expiresAt: (run.expiresAt ?? new Date(0)).toISOString(),
    completedAt: run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
      ? run.importedAt?.toISOString() ?? null
      : null,
    errorCode: lapsed ? 'ATTEMPT_EXPIRED' : run.errorCode,
    errorMessage: lapsed ? MALL_ADMIN_LISTINGS_EXPIRED_MESSAGE : run.errorMessage,
  } satisfies MallAdminListingsAttempt;
}

/** 확장이 받는 시도 모양. 쓰기 토큰이 붙는다. */
export function mallAdminListingsControl(
  run: Omit<AttemptRow, 'qualityReport'>,
  now = Date.now(),
): MallAdminListingsControl {
  return { ...mallAdminListingsAttempt(run, now), attemptToken: run.attemptToken };
}

function publicationOf(report: Prisma.JsonValue | null): MallAdminListingsPublication | null {
  const publication = report && typeof report === 'object' && !Array.isArray(report)
    ? (report as Record<string, unknown>).publication
    : undefined;
  const parsed = MallAdminListingsPublicationSchema.safeParse(publication);
  return parsed.success ? parsed.data : null;
}

/**
 * 직접 읽기기가 있는 몰마다 — 받을 몰 계정 행, 그 행의 최근 시도, 최근 완료와 그 완료가 남긴
 * 결과. 계정 행이 없는 몰도 목록에 선다(가져올 곳이 없다는 사실).
 */
export async function readMallAdminListingsSource(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<MallAdminListingsSource> {
  const accounts = await readMallAccountRowIds(tx, organizationId, MALL_ADMIN_LISTING_MALL_KEYS);
  const malls = [];
  for (const mallKey of MALL_ADMIN_LISTING_MALL_KEYS) {
    const channelAccountId = accounts.get(mallKey) ?? null;
    // 실행 kind로 옮긴 몰은 옛 시도를 읽지 않는다(ADR-0025) — 실행은 서비스가 실행 계약에서 채운다.
    const [latest, complete] = channelAccountId && !isMallAdminListingOperationMall(mallKey)
      ? await Promise.all([
          tx.sourceImportRun.findFirst({
            where: mallAdminListingsRunWhere(organizationId, channelAccountId),
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: ATTEMPT_SELECT,
          }),
          tx.sourceImportRun.findFirst({
            where: {
              ...mallAdminListingsRunWhere(organizationId, channelAccountId),
              status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
              publicationSequence: { not: null },
            },
            orderBy: [{ publicationSequence: 'desc' }, { id: 'desc' }],
            select: ATTEMPT_SELECT,
          }),
        ])
      : [null, null];
    malls.push({
      mallKey,
      mallName: MALL_ADMIN_LISTING_READERS[mallKey].mallName,
      channelAccountId,
      latestAttempt: latest ? mallAdminListingsAttempt(latest) : null,
      latestComplete: complete ? mallAdminListingsAttempt(complete) : null,
      latestPublication: complete ? publicationOf(complete.qualityReport) : null,
      latestOperation: null,
      latestSucceeded: null,
    });
  }
  return { malls } satisfies MallAdminListingsSource;
}
