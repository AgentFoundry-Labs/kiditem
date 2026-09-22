import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  SABANGNET_MALL_LISTINGS_PARSER_VERSION,
  SABANGNET_MALL_LISTINGS_SOURCE_TYPE,
  SabangnetMallListingsPlanSchema,
  SabangnetMallListingsPublicationSchema,
  sabangnetShopIdsByMallKey,
  type SabangnetMallListingsAttempt,
  type SabangnetMallListingsControl,
  type SabangnetMallListingsSource,
} from '@kiditem/shared/sabangnet-mall-listings';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { readMallAccountRowIds } from './mall-account-rows';

export const SABANGNET_MALL_LISTINGS_EXPIRED_MESSAGE =
  '사방넷 등록 상품 가져오기 시간이 지났습니다. 다시 가져와 주세요.';

/** 이 원천의 시도 행 — 조직 단위라 계정 칸은 비어 있다. */
export function sabangnetMallListingsRunWhere(organizationId: string) {
  return {
    organizationId,
    sourceType: SABANGNET_MALL_LISTINGS_SOURCE_TYPE,
    parserVersion: SABANGNET_MALL_LISTINGS_PARSER_VERSION,
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
export function sabangnetMallListingsAttempt(
  run: Omit<AttemptRow, 'qualityReport' | 'attemptToken'>,
  now = Date.now(),
): SabangnetMallListingsAttempt {
  const lapsed = expired(run, now);
  return {
    attemptId: run.id,
    state: lapsed || run.status === SOURCE_IMPORT_RUN_FAILED_STATUS
      ? 'FAILED'
      : run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
        ? 'COMPLETE'
        : 'RUNNING',
    generation: String(run.freshnessGeneration ?? 0n),
    plan: SabangnetMallListingsPlanSchema.parse(run.plan),
    expiresAt: (run.expiresAt ?? new Date(0)).toISOString(),
    completedAt: run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
      ? run.importedAt?.toISOString() ?? null
      : null,
    errorCode: lapsed ? 'ATTEMPT_EXPIRED' : run.errorCode,
    errorMessage: lapsed ? SABANGNET_MALL_LISTINGS_EXPIRED_MESSAGE : run.errorMessage,
  } satisfies SabangnetMallListingsAttempt;
}

/** 확장이 받는 시도 모양. 쓰기 토큰이 붙는다. */
export function sabangnetMallListingsControl(
  run: Omit<AttemptRow, 'qualityReport'>,
  now = Date.now(),
): SabangnetMallListingsControl {
  return { ...sabangnetMallListingsAttempt(run, now), attemptToken: run.attemptToken };
}

const PublicationListSchema = z.array(SabangnetMallListingsPublicationSchema);

function publicationOf(report: Prisma.JsonValue | null) {
  const malls = report && typeof report === 'object' && !Array.isArray(report)
    ? (report as Record<string, unknown>).malls
    : undefined;
  const parsed = PublicationListSchema.safeParse(malls);
  return parsed.success ? parsed.data : [];
}

/**
 * 사방넷 가져오기의 현재 — 받을 몰(계정 행), 최근 시도, 최근 완료와 그 완료가 몰마다
 * 남긴 결과.
 */
export async function readSabangnetMallListingsSource(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<SabangnetMallListingsSource> {
  const shopIds = sabangnetShopIdsByMallKey();
  const [accounts, latest, complete] = await Promise.all([
    readMallAccountRowIds(tx, organizationId, [...shopIds.keys()]),
    tx.sourceImportRun.findFirst({
      where: sabangnetMallListingsRunWhere(organizationId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: ATTEMPT_SELECT,
    }),
    tx.sourceImportRun.findFirst({
      where: {
        ...sabangnetMallListingsRunWhere(organizationId),
        status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
        publicationSequence: { not: null },
      },
      orderBy: [{ publicationSequence: 'desc' }, { id: 'desc' }],
      select: ATTEMPT_SELECT,
    }),
  ]);
  const malls = [...shopIds].map(([mallKey, ids]) => ({
    mallKey,
    channelAccountId: accounts.get(mallKey) ?? null,
    sabangnetShopIds: [...ids],
  }));
  return {
    ready: malls.some((mall) => mall.channelAccountId !== null),
    malls,
    latestAttempt: latest ? sabangnetMallListingsAttempt(latest) : null,
    latestComplete: complete ? sabangnetMallListingsAttempt(complete) : null,
    latestPublication: complete ? publicationOf(complete.qualityReport) : [],
  } satisfies SabangnetMallListingsSource;
}
