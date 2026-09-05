import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  KeywordSerpSourcePlanSchema,
  type KeywordSerpCapture,
  type KeywordSerpSourceBegin,
  type KeywordSerpSourceAttempt,
  type KeywordSerpSourcePlan,
  type KeywordSerpSource,
  type KeywordSerpSourceControl,
} from "@kiditem/shared/advertising";
import { SourceFailureAlerts } from "../../../../alerts/alerts.service";
import { PrismaService } from "../../../../prisma/prisma.service";
import { canonicalOwnerInputHash as hash } from "../../../../common/owner-idempotency-key";
import { currentBusinessDate } from "../../../domain/business-date";
import {
  KEYWORD_RANK_REPOSITORY_PORT,
  type KeywordRankRepositoryPort,
} from "../../../application/port/out/repository/keyword-rank.repository.port";
import { KeywordRankIngestHandler } from "../../../application/service/keyword-rank-ingest.handler";
import { runWithAdIngestTransaction } from "./ad-ingest-transaction-context";

const SOURCE = "coupang_keyword_serp";
const PARSER = "keyword-serp-v1";
const TTL_MS = 10 * 60_000;
type Attempt = Prisma.SourceImportRunGetPayload<{}>;
type Tx = Prisma.TransactionClient;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const scope = (organizationId: string) => ({
  organizationId,
  sourceType: SOURCE,
  parserVersion: PARSER,
});

/** One keyword's immutable capture and serving projections share this terminal transaction. */
@Injectable()
export class KeywordSerpSourceRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
    @Inject(KEYWORD_RANK_REPOSITORY_PORT)
    private readonly rank: KeywordRankRepositoryPort,
    private readonly ingest: KeywordRankIngestHandler,
  ) {}

  async begin(org: string, key: string, input: KeywordSerpSourceBegin) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const replay = await tx.sourceImportRun.findFirst({
        where: { ...scope(org), idempotencyKey: key },
      });
      if (replay) {
        if (replay.requestFingerprint !== hash(input))
          throw new ConflictException("SOURCE_IDEMPOTENCY_KEY_REUSED");
        const row = expired(replay)
          ? await this.failIn(
              tx,
              replay,
              "ATTEMPT_EXPIRED",
              "Keyword SERP collection expired.",
            )
          : replay;
        return {
          ...view(row),
          attemptToken: row.attemptToken,
        } satisfies KeywordSerpSourceControl;
      }
      const old = await tx.sourceImportRun.findFirst({
        where: { ...scope(org), rankKeyword: input.keyword, status: "running" },
      });
      if (old) {
        if (!expired(old))
          throw new ConflictException({
            code: "ATTEMPT_IN_PROGRESS",
            attemptId: old.id,
          });
        await this.failIn(
          tx,
          old,
          "ATTEMPT_EXPIRED",
          "Keyword SERP collection expired.",
        );
      }
      const plan = await runWithAdIngestTransaction(
        tx,
        async (): Promise<KeywordSerpSourcePlan> => {
          const tracker = await this.rank.getTrackerByKeyword(
            input.keyword,
            org,
          );
          const own = await this.rank.listOwnVendorItems(org);
          return {
            sourceType: SOURCE,
            parserVersion: PARSER,
            ...input,
            explicitVendorItemIds: tracker?.vendorItemIds ?? [],
            ownItems: own.map(({ vendorItemId, productName }) => ({
              vendorItemId,
              productName,
            })),
          };
        },
      );
      const previous = await tx.sourceImportRun.aggregate({
        where: { ...scope(org), rankKeyword: input.keyword },
        _max: { freshnessGeneration: true },
      });
      const row = await tx.sourceImportRun.create({
        data: {
          ...scope(org),
          rankKeyword: input.keyword,
          status: "running",
          idempotencyKey: key,
          requestFingerprint: hash(input),
          attemptToken: randomUUID(),
          freshnessGeneration: (previous._max.freshnessGeneration ?? 0n) + 1n,
          plan: json(plan),
          expiresAt: new Date(Date.now() + TTL_MS),
        },
      });
      return {
        ...view(row),
        attemptToken: row.attemptToken,
      } satisfies KeywordSerpSourceControl;
    });
  }

  async read(org: string, id: string) {
    const row = await this.find(this.prisma, org, id);
    return {
      ...view(row),
      attemptToken: row.attemptToken,
    } satisfies KeywordSerpSourceControl;
  }

  async source(org: string, keyword: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const latest = await tx.sourceImportRun.findFirst({
          where: { ...scope(org), rankKeyword: keyword },
          orderBy: { freshnessGeneration: "desc" },
        });
        const complete = await tx.sourceImportRun.findFirst({
          where: { ...scope(org), rankKeyword: keyword, status: "completed" },
          orderBy: [{ importedAt: "desc" }, { freshnessGeneration: "desc" }],
        });
        const latestAttempt = latest ? view(latest) : null;
        const fresh =
          complete?.coverageEndDate &&
          complete.coverageEndDate >= currentBusinessDate();
        const targetsMatch =
          complete &&
          (await runWithAdIngestTransaction(tx, async () => {
            const plan = KeywordSerpSourcePlanSchema.parse(complete.plan);
            const tracker = await this.rank.getTrackerByKeyword(keyword, org);
            const own = await this.rank.listOwnVendorItems(org);
            return (
              hash([...(tracker?.vendorItemIds ?? [])].sort()) ===
                hash([...plan.explicitVendorItemIds].sort()) &&
              hash(
                own
                  .map(({ vendorItemId, productName }) => ({
                    vendorItemId,
                    productName,
                  }))
                  .sort(byVendorId),
              ) === hash([...plan.ownItems].sort(byVendorId))
            );
          }));
        return {
          status: !complete
            ? "MISSING"
            : fresh && targetsMatch && latestAttempt?.state !== "FAILED"
              ? "READY"
              : "STALE",
          refreshing: latestAttempt?.state === "RUNNING",
          latestAttempt,
          latestComplete: complete ? view(complete) : null,
        } satisfies KeywordSerpSource;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async capture(org: string, id: string) {
    const snapshot = await this.prisma.channelScrapeSnapshot.findFirst({
      where: {
        organizationId: org,
        sourceImportRunId: id,
        source: SOURCE,
        sourceImportRun: { ...scope(org), status: "completed" },
      },
      select: { rawJson: true },
    });
    if (!snapshot)
      throw new NotFoundException("COMPLETE_SERP_CAPTURE_NOT_FOUND");
    return { attemptId: id, capture: snapshot.rawJson };
  }

  async complete(
    org: string,
    id: string,
    token: string,
    capture: KeywordSerpCapture,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, org);
        const row = await this.find(tx, org, id);
        this.fence(row, token);
        const checksum = hash(capture);
        if (row.status !== "running") {
          if (row.contentChecksum === checksum) return view(row);
          throw new ConflictException("SOURCE_TERMINAL_REPLAY_CONFLICT");
        }
        if (expired(row)) throw new ConflictException("ATTEMPT_EXPIRED");
        const plan = KeywordSerpSourcePlanSchema.parse(row.plan);
        const normalized = this.ingest.normalizeCapture(capture, plan, org);
        if (!validCapture(capture, plan, normalized.items)) {
          return view(
            await this.failIn(
              tx,
              row,
              "INCOMPLETE_SERP_CAPTURE",
              "Keyword SERP capture does not satisfy the frozen page plan.",
              checksum,
            ),
          );
        }
        await tx.channelScrapeSnapshot.create({
          data: {
            organizationId: org,
            sourceImportRunId: id,
            channel: "coupang",
            source: SOURCE,
            pageType: "keyword_serp",
            businessDate: normalized.businessDate,
            observedAt: normalized.capturedAt,
            rowHash: checksum,
            rawJson: json(capture),
          },
        });
        await runWithAdIngestTransaction(tx, () =>
          this.ingest.publishCapture(
            normalized,
            id,
            org,
            plan.keyword,
            capture.pagesScanned,
          ),
        );
        const complete = await tx.sourceImportRun.update({
          where: { id, organizationId: org },
          data: {
            status: "completed",
            importedAt: normalized.capturedAt,
            lastVerifiedAt: normalized.capturedAt,
            verificationCount: 1,
            contentChecksum: checksum,
            contentByteCount: Buffer.byteLength(JSON.stringify(capture)),
            rowCount: normalized.items.length,
            coverageStartDate: normalized.businessDate,
            coverageEndDate: normalized.businessDate,
            qualityReport: {
              matchedCount: normalized.matchedCount,
              targetMissCount: normalized.targetMissCount,
            },
          },
        });
        await this.alerts.resolveSourceFailure(tx, {
          organizationId: org,
          dedupeKey: alertKey(plan.keyword),
          attemptId: id,
        });
        return view(complete);
      },
      { timeout: 30_000 },
    );
  }

  async fail(
    org: string,
    id: string,
    token: string,
    code: string,
    message: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const row = await this.find(tx, org, id);
      this.fence(row, token);
      if (row.status !== "running") {
        if (
          row.status === "failed" &&
          row.errorCode === code &&
          row.errorMessage === message
        )
          return view(row);
        throw new ConflictException("SOURCE_TERMINAL_REPLAY_CONFLICT");
      }
      if (expired(row)) throw new ConflictException("ATTEMPT_EXPIRED");
      return view(await this.failIn(tx, row, code, message));
    });
  }

  private async failIn(
    tx: Tx,
    row: Attempt,
    code: string,
    message: string,
    checksum?: string,
  ) {
    const failed = await tx.sourceImportRun.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: {
        status: "failed",
        errorCode: code,
        errorMessage: message,
        ...(checksum ? { contentChecksum: checksum } : {}),
      },
    });
    await this.alerts.upsertSourceFailure(tx, {
      organizationId: row.organizationId,
      sourceType: SOURCE,
      attemptId: row.id,
      dedupeKey: alertKey(row.rankKeyword!),
      severity: "error",
      title: "쿠팡 키워드 순위 수집 실패",
      message: `${code}: ${message}`.slice(0, 300),
      href: "/advertising/keyword-rank",
    });
    return failed;
  }

  private async find(tx: Tx, org: string, id: string) {
    const row = await tx.sourceImportRun.findFirst({
      where: { ...scope(org), id },
    });
    if (!row) throw new NotFoundException("SERP_ATTEMPT_NOT_FOUND");
    return row;
  }

  private fence(row: Attempt, token: string) {
    if (row.attemptToken !== token)
      throw new ConflictException("ATTEMPT_FENCE_LOST");
  }

  private async lock(tx: Tx, org: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${org}:${SOURCE}`}, 0))::text AS lock
      FROM (SELECT ${org}::uuid AS organization_id) AS tenant WHERE organization_id = ${org}::uuid`;
  }
}

function expired(row: Attempt) {
  return (
    row.status === "running" &&
    (!row.expiresAt || row.expiresAt.getTime() <= Date.now())
  );
}
function alertKey(keyword: string) {
  return `source:${SOURCE}:${hash(keyword)}`;
}
function byVendorId(
  left: { vendorItemId: string },
  right: { vendorItemId: string },
) {
  return left.vendorItemId.localeCompare(right.vendorItemId);
}
function view(row: Attempt): KeywordSerpSourceAttempt {
  const isExpired = expired(row);
  return {
    attemptId: row.id,
    keyword: row.rankKeyword!,
    generation: String(row.freshnessGeneration),
    state:
      row.status === "completed"
        ? "COMPLETE"
        : row.status === "running" && !isExpired
          ? "RUNNING"
          : "FAILED",
    plan: KeywordSerpSourcePlanSchema.parse(row.plan),
    expiresAt: row.expiresAt!.toISOString(),
    actualCutoffAt:
      row.status === "completed" ? row.importedAt!.toISOString() : null,
    itemCount: row.rowCount,
    errorCode: isExpired ? "ATTEMPT_EXPIRED" : row.errorCode,
    errorMessage: isExpired
      ? "Keyword SERP collection expired."
      : row.errorMessage,
  } satisfies KeywordSerpSourceAttempt;
}
function validCapture(
  capture: KeywordSerpCapture,
  plan: KeywordSerpSourcePlan,
  items: Array<{
    rank: number;
    page: number | null;
    positionInPage: number | null;
  }>,
) {
  const proof = capture.pagination;
  if (
    capture.keyword !== plan.keyword ||
    proof.requestedMaxPages !== plan.maxPages ||
    capture.wall
  )
    return false;
  const complete =
    proof.stopReason === "page_limit"
      ? capture.pagesScanned === plan.maxPages &&
        proof.stoppedAtPage === plan.maxPages
      : proof.stopReason === "empty_page" &&
        capture.pagesScanned >= 1 &&
        proof.stoppedAtPage === capture.pagesScanned + 1 &&
        proof.stoppedAtPage <= plan.maxPages;
  if (!complete || !items.length) return false;
  let lastPage = 0;
  let position = 0;
  return (
    items.every((item, index) => {
      if (
        !item.page ||
        item.page < lastPage ||
        item.page > lastPage + 1 ||
        item.page > capture.pagesScanned ||
        !Number.isInteger(item.page)
      )
        return false;
      position = item.page === lastPage ? position + 1 : 1;
      lastPage = item.page;
      return item.rank === index + 1 && item.positionInPage === position;
    }) && lastPage === capture.pagesScanned
  );
}
