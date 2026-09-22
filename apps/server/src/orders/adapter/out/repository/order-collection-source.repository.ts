import { createHash, randomUUID } from 'node:crypto';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { redact } from '../../../../common/redact';
import {
  OPERATOR_CANCEL_CODE,
  OPERATOR_CANCEL_MESSAGE,
} from '../../../../common/operator-cancel';
import type {
  OrderCollectionSourceStatus,
  OrderCollectionTodayOrders,
} from '@kiditem/shared/order-collection-source';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { addDays, businessDateKey, kstDayStart } from '../../../../common/kst';
import { MALL_CHANNELS } from '@kiditem/shared/channel-registry';
import { readCompletedImportRowCountsByScope } from '../../../../core/read/source-import-run.reader';
import {
  ORDER_COLLECTION_MALL_ACCOUNT_ROW_ORDER,
  findOrderCollectionMall,
  orderCollectionMallAccountChannels,
  orderCollectionMallAccountFilter,
  pickOrderCollectionMallAccounts,
  type OrderCollectionMallKey,
} from '../../../domain/order-collection-malls';
import type {
  OrderCollectionArtifact,
  OrderCollectionAttempt,
  OrderCollectionAttemptControl,
  OrderCollectionConfirmedCoverage,
  OrderCollectionMode,
  OrderCollectionPlan,
  OrderCollectionSourcePort,
  OrderCollectionSourceDownload,
  OrderCollectionSourceSubmission,
} from '../../../application/port/in/order-collection-source.port';

const SOURCE_TYPE = 'order_collection_mall' as const;
/** 오늘 주문을 만드는 수집 원천. 대시보드의 '오늘 주문' 과 같은 목록이다. */
const ORDER_COLLECTION_ORDER_SOURCE_TYPES = [
  SOURCE_TYPE,
  'coupang_direct_order_capture',
] as const;
/** 몰 키가 계획에 없는 원천은 그 원천 자체가 한 몰이다. */
const MALL_KEY_BY_SOURCE_TYPE: Readonly<Record<string, string>> = {
  coupang_direct_order_capture: 'coupang-direct',
};
const PARSER_VERSION = 'order-collection-v1';
const SOURCE_ALERT_TITLE = '몰 주문 수집 실패';
const ATTEMPT_EXPIRES_IN_MS = 30 * 60_000;
const COVERAGE_CAPABLE_MALLS = new Set(['haebub-mall', 'domeggook']);
const ARTIFACT_SELECT = {
  id: true,
  organizationId: true,
  sourceImportRunId: true,
  sourceFileName: true,
  sourceContentType: true,
  sourceBytes: true,
  createdAt: true,
} as const;

type Tx = Prisma.TransactionClient;
type SourceRun = Prisma.SourceImportRunGetPayload<{}>;
type ArtifactRow = Prisma.OrderCollectionArtifactGetPayload<{ select: typeof ARTIFACT_SELECT }>;

/** 상태 한 칸을 짓는 데 필요한 행들. 몰 하나짜리 읽기와 화면 목록이 같은 것을 고른다. */
type StatusRuns = {
  running: Pick<SourceRun, 'id' | 'plan' | 'createdAt' | 'expiresAt'> | null;
  lastComplete: Pick<SourceRun, 'id' | 'importedAt' | 'publicationSequence'> | null;
  lastRow: Pick<
    SourceRun,
    'id' | 'status' | 'expiresAt' | 'errorCode' | 'errorMessage' | 'importedAt' | 'updatedAt'
  > | null;
};

/**
 * 진행 중 칸을 짓는 데 필요한 열만. `plan` JSONB 는 한 수집의 seenRowKeys 수천 개를
 * 담을 수 있어, 나머지 열까지 함께 읽으면 2초 폴링이 그만큼을 매번 실어 나른다.
 */
const RUNNING_SELECT = {
  id: true,
  channelAccountId: true,
  plan: true,
  createdAt: true,
  expiresAt: true,
} as const;

/** 마지막 완료분 칸이 쓰는 열만. */
const LAST_COMPLETE_SELECT = {
  id: true,
  channelAccountId: true,
  importedAt: true,
  publicationSequence: true,
} as const;

/** 마지막 시도 칸이 쓰는 열만 — 상태 · 임대 · 실패 이유 · 끝난 시각. */
const LAST_ROW_SELECT = {
  id: true,
  channelAccountId: true,
  status: true,
  expiresAt: true,
  errorCode: true,
  errorMessage: true,
  importedAt: true,
  updatedAt: true,
} as const;

const NO_STATUS_RUNS: StatusRuns = { running: null, lastComplete: null, lastRow: null };
const LATEST_FIRST = [{ createdAt: 'desc' }, { id: 'desc' }] as const;

@Injectable()
export class OrderCollectionSourceRepository implements OrderCollectionSourcePort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async beginAttempt(input: {
    organizationId: string;
    userId?: string;
    idempotencyKey: string;
    mallKey: string;
    collectionDate: string | null;
    collectionMode: OrderCollectionMode;
    selectionMode?: 'manual' | 'automatic';
    seenRowKeys?: string[];
  }): Promise<OrderCollectionAttempt & { attemptToken: string }> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const account = await this.findMallAccount(tx, input.organizationId, input.mallKey);
      const mall = { key: account.mallKey, name: account.mallName };
      const plan: OrderCollectionPlan = {
        sourceType: SOURCE_TYPE,
        parserVersion: PARSER_VERSION,
        mallKey: mall.key,
        mallName: mall.name,
        channelAccountId: account.id,
        collectionDate: input.collectionDate,
        collectionMode: input.collectionMode,
        ...(input.selectionMode ? { selectionMode: input.selectionMode } : {}),
        ...(input.seenRowKeys ? { seenRowKeys: [...input.seenRowKeys] } : {}),
      };
      const requestFingerprint = canonicalOwnerInputHash({
        mallKey: mall.key,
        channelAccountId: account.id,
        collectionDate: input.collectionDate,
        collectionMode: input.collectionMode,
        selectionMode: input.selectionMode ?? null,
        seenRowKeys: input.seenRowKeys ?? null,
      });

      const replay = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint) {
          throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        }
        const row = expired(replay)
          ? await this.failIn(
              tx,
              replay,
              'ATTEMPT_EXPIRED',
              'Order collection expired.',
            )
          : replay;
        return this.controlView(tx, row);
      }

      const running = await tx.sourceImportRun.findMany({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: account.id,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const active = running.find((row) => !expired(row));
      if (active) {
        // Without a message the error response carries only "Conflict Exception".
        throw new ConflictException({
          code: 'ATTEMPT_IN_PROGRESS',
          attemptId: active.id,
          message: 'ATTEMPT_IN_PROGRESS',
        });
      }
      for (const expiredRun of running) {
        await this.failIn(
          tx,
          expiredRun,
          'ATTEMPT_EXPIRED',
          'Order collection expired.',
        );
      }

      const row = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: account.id,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          attemptToken: randomUUID(),
          plan: json(plan),
          parserVersion: PARSER_VERSION,
          expiresAt: new Date(Date.now() + ATTEMPT_EXPIRES_IN_MS),
          ...(input.userId ? { createdBy: input.userId } : {}),
        },
      });
      return this.controlView(tx, row);
    });
  }

  async readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<OrderCollectionAttempt | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.sourceImportRun.findFirst({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
        },
      });
      return row ? this.attemptView(tx, row) : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<OrderCollectionAttemptControl | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.sourceImportRun.findFirst({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
        },
      });
      return row ? this.controlView(tx, row) : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /**
   * 공용 시작 컨트롤이 폴링하는 몰별 현재 상태. 진행 중 판정은 begin이 409를 내는
   * 판정과 같은 규칙이고, 임대가 지난 RUNNING 행은 여기서 끝내지 않고 마지막 시도
   * 자리에 만료로만 비친다. 끝내는 일은 owner의 쓰기 경로가 한다.
   */
  async readSourceStatus(input: {
    organizationId: string;
    mallKey: string;
  }): Promise<OrderCollectionSourceStatus> {
    return this.prisma.$transaction(async (tx) => {
      const account = await this.findMallAccount(tx, input.organizationId, input.mallKey);
      const scope = {
        organizationId: input.organizationId,
        sourceType: SOURCE_TYPE,
        channelAccountId: account.id,
      } as const;

      // 목록 읽기와 같은 규칙으로 좁힌다(KID-216). 임대가 지난 RUNNING 행은 아무도
      // 돌리고 있지 않으므로 DB 가 거르고, 칸을 짓는 데 쓰는 열만 읽는다 — 이 조회는
      // 카드마다 2초로 돌고 `plan` JSONB 는 seenRowKeys 수천 개를 담을 수 있다.
      return sourceStatusView(account, {
        running: await tx.sourceImportRun.findFirst({
          where: {
            ...scope,
            status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
            expiresAt: { gt: new Date() },
          },
          orderBy: [...LATEST_FIRST],
          select: RUNNING_SELECT,
        }),
        lastComplete: await tx.sourceImportRun.findFirst({
          where: { ...scope, status: SOURCE_IMPORT_RUN_COMPLETED_STATUS },
          orderBy: [{ importedAt: 'desc' }, ...LATEST_FIRST],
          select: LAST_COMPLETE_SELECT,
        }),
        lastRow: await tx.sourceImportRun.findFirst({
          where: scope,
          orderBy: [...LATEST_FIRST],
          select: LAST_ROW_SELECT,
        }),
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /**
   * 주문 수집 화면 한 장이 읽는 몰 전체의 현재 상태. 레지스트리 순서로 몰마다 한 칸을
   * 돌려주며, 이 조직에 계정 행이 없는 몰은 범위와 상태를 모두 비운 칸이다(찾지 못한
   * 것이 아니라 아직 설정되지 않은 것이다). 몰 하나짜리 읽기와 같은 판정을 쓰고,
   * 시도는 몰마다 따로 묻지 않고 조직 범위 묶음 조회 세 번으로 읽는다(KID-170 D2).
   */
  async readSourceStatuses(input: {
    organizationId: string;
  }): Promise<OrderCollectionSourceStatus[]> {
    return this.prisma.$transaction(async (tx) => {
      const { own, shared } = orderCollectionMallAccountChannels();
      const accounts = await tx.channelAccount.findMany({
        where: {
          organizationId: input.organizationId,
          OR: [
            { channel: { in: own }, externalAccountId: { in: own } },
            { channel: { in: shared } },
          ],
        },
        orderBy: [...ORDER_COLLECTION_MALL_ACCOUNT_ROW_ORDER],
        select: { id: true, channel: true, externalAccountId: true },
      });
      const accountByMallKey = new Map(
        [...pickOrderCollectionMallAccounts(accounts)].map(([mallKey, account]) => [mallKey, account.id]),
      );
      const runs = await this.findStatusRuns(
        tx,
        input.organizationId,
        [...new Set(accountByMallKey.values())],
      );

      return MALL_CHANNELS.map((mall) => {
        const id = accountByMallKey.get(mall.key);
        return id === undefined
          ? {
            mallKey: mall.key,
            channelAccountId: null,
            running: null,
            lastComplete: null,
            lastAttempt: null,
          } satisfies OrderCollectionSourceStatus
          : sourceStatusView({ id, mallKey: mall.key }, runs.get(id) ?? NO_STATUS_RUNS);
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /**
   * 오늘 수집이 실어 온 주문 수. 대시보드의 '오늘 주문' 과 **같은 Core 읽기**를 쓴다 — 여기서
   * 따로 세면 두 화면이 또 다른 수를 말한다(사장님 2026-09-22: 63 대 82).
   *
   * 쿠팡직배송은 몰 키가 없는 원천이라 그 원천 자체가 한 몰이다.
   */
  async readTodayOrderCounts(input: {
    organizationId: string;
  }): Promise<OrderCollectionTodayOrders> {
    const start = kstDayStart(new Date());
    const end = addDays(start, 1);
    const rows = await readCompletedImportRowCountsByScope(this.prisma, {
      organizationId: input.organizationId,
      sourceTypes: ORDER_COLLECTION_ORDER_SOURCE_TYPES,
      from: start,
      to: end,
    });
    if (rows === null) return { total: null, byMall: {} };
    const byMall: Record<string, number> = {};
    for (const row of rows) {
      const mallKey = row.mallKey ?? MALL_KEY_BY_SOURCE_TYPE[row.sourceType];
      if (!mallKey) continue;
      byMall[mallKey] = (byMall[mallKey] ?? 0) + row.rowCount;
    }
    return { total: rows.reduce((sum, row) => sum + row.rowCount, 0), byMall };
  }

  /** 계정마다 진행 중·마지막 완료분·마지막 시도 행. 계정 수와 무관하게 조회 세 번이다. */
  private async findStatusRuns(
    tx: Tx,
    organizationId: string,
    channelAccountIds: readonly string[],
  ): Promise<Map<string, StatusRuns>> {
    const byAccount = new Map<string, StatusRuns>();
    if (channelAccountIds.length === 0) return byAccount;
    const scope: Prisma.SourceImportRunWhereInput = {
      organizationId,
      sourceType: SOURCE_TYPE,
      channelAccountId: { in: [...channelAccountIds] },
    };
    const perAccount = [{ channelAccountId: 'asc' }] as const;

    const runs = (id: string | null): StatusRuns | null => {
      if (!id) return null;
      const current = byAccount.get(id)
        ?? { running: null, lastComplete: null, lastRow: null };
      byAccount.set(id, current);
      return current;
    };

    // 임대가 지난 RUNNING 행은 아무도 돌리고 있지 않다(`expired`와 같은 규칙: 임대가
    // 없는 행도 지난 것으로 읽는다). 계정마다 살아 있는 가장 나중 시도 한 행만 읽어,
    // 끝나지 않은 채 쌓인 행을 2초 폴링마다 통째로 끌어오지 않는다.
    for (const row of await tx.sourceImportRun.findMany({
      where: {
        ...scope,
        status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        expiresAt: { gt: new Date() },
      },
      orderBy: [...perAccount, ...LATEST_FIRST],
      distinct: ['channelAccountId'],
      select: RUNNING_SELECT,
    })) {
      const current = runs(row.channelAccountId);
      if (current) current.running = row;
    }
    for (const row of await tx.sourceImportRun.findMany({
      where: { ...scope, status: SOURCE_IMPORT_RUN_COMPLETED_STATUS },
      orderBy: [...perAccount, { importedAt: 'desc' }, ...LATEST_FIRST],
      distinct: ['channelAccountId'],
      select: LAST_COMPLETE_SELECT,
    })) {
      const current = runs(row.channelAccountId);
      if (current) current.lastComplete = row;
    }
    for (const row of await tx.sourceImportRun.findMany({
      where: scope,
      orderBy: [...perAccount, ...LATEST_FIRST],
      distinct: ['channelAccountId'],
      select: LAST_ROW_SELECT,
    })) {
      const current = runs(row.channelAccountId);
      if (current) current.lastRow = row;
    }
    return byAccount;
  }

  async validateCompletion(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    mallKey: string;
    source: OrderCollectionSourceSubmission;
    confirmedCoverage: OrderCollectionConfirmedCoverage | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      const plan = readPlan(row.plan);
      if (plan.mallKey !== input.mallKey) {
        throw new ConflictException('ORDER_COLLECTION_MALL_MISMATCH');
      }
      assertConfirmedCoverage(plan, input.confirmedCoverage);
      const checksum = submissionHash(input.source.bytes);
      if (row.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS) {
        if (
          row.contentChecksum !== checksum ||
          !sameConfirmedCoverage(row, input.confirmedCoverage) ||
          !(await this.findArtifact(tx, input.organizationId, row.id))
        ) {
          throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
        }
        return;
      }
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) throw new ConflictException('ATTEMPT_EXPIRED');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async recordCollectedRows(input: {
    organizationId: string;
    attemptId: string;
    rowCount: number;
  }): Promise<void> {
    if (!Number.isInteger(input.rowCount) || input.rowCount < 0) return;
    await this.prisma.sourceImportRun.updateMany({
      where: {
        id: input.attemptId,
        organizationId: input.organizationId,
        sourceType: SOURCE_TYPE,
      },
      data: { rowCount: input.rowCount },
    });
  }

  async completeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    mallKey: string;
    source: OrderCollectionSourceSubmission;
    confirmedCoverage: OrderCollectionConfirmedCoverage | null;
  }): Promise<OrderCollectionArtifact> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) throw new ConflictException('ATTEMPT_FENCE_LOST');
      const plan = readPlan(row.plan);
      if (plan.mallKey !== input.mallKey) {
        throw new ConflictException('ORDER_COLLECTION_MALL_MISMATCH');
      }
      assertConfirmedCoverage(plan, input.confirmedCoverage);
      const submissionChecksum = submissionHash(input.source.bytes);
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        if (
          row.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS &&
          row.contentChecksum === submissionChecksum &&
          sameConfirmedCoverage(row, input.confirmedCoverage)
        ) {
          const replay = await this.findArtifact(tx, input.organizationId, row.id);
          if (replay) return toArtifact(replay);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) {
        throw new ConflictException('ATTEMPT_EXPIRED');
      }

      const artifact = await tx.orderCollectionArtifact.create({
        data: {
          organizationId: input.organizationId,
          sourceImportRunId: row.id,
          sourceFileName: input.source.fileName,
          sourceContentType: input.source.contentType,
          sourceBytes: new Uint8Array(input.source.bytes),
        },
      });
      const completedAt = new Date();
      await tx.sourceImportRun.update({
        where: { id: row.id, organizationId: input.organizationId },
        data: {
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          importedAt: completedAt,
          lastVerifiedAt: completedAt,
          verificationCount: { increment: 1 },
          contentChecksum: submissionChecksum,
          coverageStartDate: input.confirmedCoverage
            ? dateOnly(input.confirmedCoverage.startDate)
            : null,
          coverageEndDate: input.confirmedCoverage
            ? dateOnly(input.confirmedCoverage.endDate)
            : null,
          errorCode: null,
          errorMessage: null,
        },
      });
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: alertDedupeKey(row),
        attemptId: row.id,
      });
      return toArtifact(artifact);
    });
  }

  async failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
    source?: OrderCollectionSourceSubmission;
  }): Promise<OrderCollectionAttempt> {
    const message = redact(input.message).slice(0, 300);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      if (row.attemptToken !== input.attemptToken) throw new ConflictException('ATTEMPT_FENCE_LOST');
      const source = input.source;
      const checksum = source ? submissionHash(source.bytes) : null;
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        if (row.status === SOURCE_IMPORT_RUN_FAILED_STATUS && row.errorCode === input.code && row.contentChecksum === checksum) {
          return this.attemptView(tx, row);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) {
        throw new ConflictException('ATTEMPT_EXPIRED');
      }

      if (source) {
        await tx.orderCollectionArtifact.create({
          data: {
            organizationId: input.organizationId,
            sourceImportRunId: row.id,
            sourceFileName: source.fileName,
            sourceContentType: source.contentType,
            sourceBytes: new Uint8Array(source.bytes),
          },
        });
      }
      const failed = await this.failIn(tx, row, input.code, message, checksum ?? undefined);
      return this.attemptView(tx, failed);
    });
  }

  /**
   * Operator stop without the attempt token. It fails through the same terminal
   * path as an extension-reported failure, so `USER_CANCELLED` is suppressed by
   * the alert rule; a terminal attempt is returned as is.
   */
  async cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<OrderCollectionAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, input.organizationId);
      const row = await this.findRun(tx, input.organizationId, input.attemptId);
      if (row.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        return this.attemptView(tx, row);
      }
      const failed = expired(row)
        ? await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Order collection expired.')
        : await this.failIn(tx, row, OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE);
      return this.attemptView(tx, failed);
    });
  }

  async readSourceDownload(input: {
    organizationId: string;
    artifactId: string;
  }): Promise<OrderCollectionSourceDownload> {
    const row = await this.prisma.orderCollectionArtifact.findFirst({
      where: {
        id: input.artifactId,
        organizationId: input.organizationId,
        sourceImportRun: { organizationId: input.organizationId, sourceType: SOURCE_TYPE },
      },
      select: {
        sourceBytes: true,
        sourceFileName: true,
        sourceContentType: true,
      },
    });
    if (!row) throw new NotFoundException('ORDER_COLLECTION_ARTIFACT_NOT_FOUND');
    return {
      bytes: Buffer.from(row.sourceBytes),
      fileName: row.sourceFileName,
      contentType: row.sourceContentType,
    };
  }

  /**
   * 몰 계정 식별(ADR-0012: 몰 하나 = 계정 행 하나). 시작 경로와 같은 조회라 모르는 몰과
   * 계정 행이 없는 몰은 같은 오류로 끝난다.
   */
  private async findMallAccount(tx: Tx, organizationId: string, mallKey: string): Promise<{
    id: string;
    mallKey: OrderCollectionMallKey;
    mallName: string;
  }> {
    const mall = findOrderCollectionMall(mallKey);
    if (!mall) throw new NotFoundException('ORDER_COLLECTION_MALL_NOT_FOUND');
    const account = await tx.channelAccount.findFirst({
      where: { organizationId, ...orderCollectionMallAccountFilter(mall) },
      orderBy: [...ORDER_COLLECTION_MALL_ACCOUNT_ROW_ORDER],
      select: { id: true },
    });
    if (!account) throw new NotFoundException('ORDER_COLLECTION_MALL_NOT_FOUND');
    return { id: account.id, mallKey: mall.key, mallName: mall.name };
  }

  private async findRun(tx: Tx, organizationId: string, attemptId: string): Promise<SourceRun> {
    const row = await tx.sourceImportRun.findFirst({
      where: { id: attemptId, organizationId, sourceType: SOURCE_TYPE },
    });
    if (!row) throw new NotFoundException('ORDER_COLLECTION_ATTEMPT_NOT_FOUND');
    return row;
  }

  private async attemptView(tx: Tx, row: SourceRun): Promise<OrderCollectionAttempt> {
    const artifact = await this.findArtifact(tx, row.organizationId, row.id);
    const plan = readPlan(row.plan);
    return {
      attemptId: row.id,
      sourceImportRunId: row.id,
      state: attemptStateOf(row),
      plan,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      artifactId: artifact?.id ?? null,
      coverageStartDate: row.coverageStartDate ? businessDateKey(row.coverageStartDate) : null,
      coverageEndDate: row.coverageEndDate ? businessDateKey(row.coverageEndDate) : null,
      ...attemptFailure(row),
    };
  }

  private async controlView(tx: Tx, row: SourceRun): Promise<OrderCollectionAttempt & { attemptToken: string }> {
    return { ...(await this.attemptView(tx, row)), attemptToken: row.attemptToken };
  }

  private async failIn(
    tx: Tx,
    row: SourceRun,
    code: string,
    message: string,
    checksum?: string,
  ): Promise<SourceRun> {
    const failed = await tx.sourceImportRun.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: {
        status: SOURCE_IMPORT_RUN_FAILED_STATUS,
        errorCode: code,
        errorMessage: message,
        ...(checksum ? { contentChecksum: checksum } : {}),
      },
    });
    await this.alerts.recordTerminalOutcome(tx, {
      code,
      organizationId: row.organizationId,
      sourceType: SOURCE_TYPE,
      attemptId: row.id,
      dedupeKey: alertDedupeKey(row),
      title: SOURCE_ALERT_TITLE,
      message: message,
      href: '/order-collection',
    });
    return failed;
  }

  private async findArtifact(tx: Tx, organizationId: string, sourceImportRunId: string): Promise<ArtifactRow | null> {
    return tx.orderCollectionArtifact.findFirst({
      where: { organizationId, sourceImportRunId },
      select: {
        ...ARTIFACT_SELECT,
      },
    });
  }

  private async lock(tx: Tx, organizationId: string): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${SOURCE_TYPE}`}, 0))::text AS lock
      FROM (SELECT ${organizationId}::uuid AS organization_id) AS tenant WHERE organization_id = ${organizationId}::uuid`;
  }
}

function readPlan(value: Prisma.JsonValue | null): OrderCollectionPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ORDER_COLLECTION_PLAN_MISSING');
  }
  const plan = value as Record<string, unknown>;
  if (
    plan.sourceType !== SOURCE_TYPE ||
    typeof plan.parserVersion !== 'string' ||
    typeof plan.mallKey !== 'string' ||
    typeof plan.mallName !== 'string' ||
    typeof plan.channelAccountId !== 'string' ||
    (plan.collectionDate !== null && typeof plan.collectionDate !== 'string') ||
    (plan.collectionMode !== 'browser' && plan.collectionMode !== 'manual-upload') ||
    (plan.selectionMode !== undefined &&
      plan.selectionMode !== 'manual' && plan.selectionMode !== 'automatic') ||
    (plan.seenRowKeys !== undefined &&
      (!Array.isArray(plan.seenRowKeys) ||
        plan.seenRowKeys.length > 8_000 ||
        plan.seenRowKeys.some((key) => typeof key !== 'string' || key.length > 2_000)))
  ) {
    throw new Error('ORDER_COLLECTION_PLAN_INVALID');
  }
  return plan as OrderCollectionPlan;
}

function assertConfirmedCoverage(
  plan: OrderCollectionPlan,
  coverage: OrderCollectionConfirmedCoverage | null,
): void {
  if (!coverage) return;
  if (!isDateOnly(coverage.startDate) || !isDateOnly(coverage.endDate)) {
    throw new BadRequestException('INVALID_ORDER_COLLECTION_CONFIRMED_COVERAGE');
  }
  if (
    !COVERAGE_CAPABLE_MALLS.has(plan.mallKey) ||
    !plan.collectionDate ||
    coverage.startDate !== plan.collectionDate ||
    coverage.endDate !== plan.collectionDate
  ) {
    throw new ConflictException('ORDER_COLLECTION_COVERAGE_MISMATCH');
  }
}

function sameConfirmedCoverage(
  row: SourceRun,
  coverage: OrderCollectionConfirmedCoverage | null,
): boolean {
  return (
    (row.coverageStartDate ? businessDateKey(row.coverageStartDate) : null) ===
      (coverage?.startDate ?? null) &&
    (row.coverageEndDate ? businessDateKey(row.coverageEndDate) : null) ===
      (coverage?.endDate ?? null)
  );
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = dateOnly(value);
  return !Number.isNaN(parsed.getTime()) && businessDateKey(parsed) === value;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function expired(row: Pick<SourceRun, 'status' | 'expiresAt'>): boolean {
  return row.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && (!row.expiresAt || row.expiresAt.getTime() <= Date.now());
}

function attemptStateOf(
  row: Pick<SourceRun, 'status' | 'expiresAt'>,
): 'RUNNING' | 'COMPLETE' | 'FAILED' {
  if (row.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS) return 'COMPLETE';
  return row.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && !expired(row) ? 'RUNNING' : 'FAILED';
}

/** 임대만 지난 채 RUNNING으로 남은 행은 만료로 읽는다. 읽기는 그 행을 끝내지 않는다. */
function attemptFailure(
  row: Pick<SourceRun, 'status' | 'expiresAt' | 'errorCode' | 'errorMessage'>,
): Readonly<{ errorCode: string | null; errorMessage: string | null }> {
  return expired(row)
    ? { errorCode: 'ATTEMPT_EXPIRED', errorMessage: 'Order collection expired.' }
    : { errorCode: row.errorCode, errorMessage: row.errorMessage };
}

/**
 * 몰 한 곳의 현재 상태. 행을 고르는 일과 답을 짓는 일을 갈라, 몰 하나짜리 읽기와
 * 화면 전체 목록이 같은 진행 중·만료·마지막 완료분 판정을 쓰게 한다.
 */
function sourceStatusView(
  account: Readonly<{ id: string; mallKey: string }>,
  { running, lastComplete, lastRow }: StatusRuns,
): OrderCollectionSourceStatus {
  return {
    mallKey: account.mallKey,
    channelAccountId: account.id,
    running: running ? {
      attemptId: running.id,
      collectionMode: readPlan(running.plan).collectionMode,
      startedAt: running.createdAt.toISOString(),
      expiresAt: running.expiresAt?.toISOString() ?? null,
    } : null,
    lastComplete: lastComplete ? {
      attemptId: lastComplete.id,
      completedAt: lastComplete.importedAt?.toISOString() ?? null,
      publicationSequence: lastComplete.publicationSequence?.toString() ?? null,
    } : null,
    lastAttempt: lastRow ? {
      attemptId: lastRow.id,
      state: attemptStateOf(lastRow),
      ...attemptFailure(lastRow),
      endedAt: endedAt(lastRow, attemptStateOf(lastRow)),
    } : null,
  } satisfies OrderCollectionSourceStatus;
}

/**
 * 시도가 끝난 시각. 완료분은 발행 시각, 실패는 마지막 기록 시각이고, 아직 RUNNING인
 * 채로 임대만 지난 행은 그 임대가 끝난 시각이다.
 */
function endedAt(
  row: Pick<SourceRun, 'status' | 'expiresAt' | 'importedAt' | 'updatedAt'>,
  state: 'RUNNING' | 'COMPLETE' | 'FAILED',
): string | null {
  if (state === 'RUNNING') return null;
  if (row.status === SOURCE_IMPORT_RUN_RUNNING_STATUS) return row.expiresAt?.toISOString() ?? null;
  return (row.importedAt ?? row.updatedAt).toISOString();
}

function alertDedupeKey(row: SourceRun): string {
  const plan = readPlan(row.plan);
  return `source:${SOURCE_TYPE}:${plan.mallKey}`;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toArtifact(row: ArtifactRow): OrderCollectionArtifact {
  return {
    artifactId: row.id,
    sourceImportRunId: row.sourceImportRunId,
    sourceFileName: row.sourceFileName,
    sourceContentType: row.sourceContentType,
    createdAt: row.createdAt.toISOString(),
    sourceDownloadAvailable: Boolean(row.sourceBytes),
  };
}

function submissionHash(source: Buffer): string {
  const hash = createHash('sha256');
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(source.length));
  hash.update(length).update(source);
  return hash.digest('hex');
}
