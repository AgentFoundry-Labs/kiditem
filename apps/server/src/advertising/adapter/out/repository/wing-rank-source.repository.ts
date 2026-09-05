import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  WingRankSourcePlanSchema,
  type WingRankBatch,
  type WingRankCapture,
  type WingRankSourceBegin,
  type WingRankSourceAttempt,
  type WingRankSourcePlan,
  type WingRankSource,
  type WingRankSourceControl,
} from "@kiditem/shared/advertising";
import { SourceFailureAlerts } from "../../../../alerts/alerts.service";
import { PrismaService } from "../../../../prisma/prisma.service";
import { canonicalOwnerInputHash as hash } from "../../../../common/owner-idempotency-key";
import { currentBusinessDate } from "../../../domain/business-date";
import {
  KEYWORD_RANK_REPOSITORY_PORT,
  type KeywordRankRepositoryPort,
} from "../../../application/port/out/repository/keyword-rank.repository.port";
import { WingSalesRankIngestHandler } from "../../../application/service/wing-sales-rank-ingest.handler";
import { KeywordRankService } from "../../../application/service/keyword-rank.service";
import { runWithAdIngestTransaction } from "./ad-ingest-transaction-context";

const SOURCE = "coupang_wing_rank";
const PARSER = "wing-rank-v1";
// 2 × (60s tab + 5 × (4 × 20s request + 28s backoff) + 4 × 2.2s page delay) + 9s = 1226.6s.
const TTL_MS = 25 * 60_000;
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
export class WingRankSourceRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
    @Inject(KEYWORD_RANK_REPOSITORY_PORT)
    private readonly rank: KeywordRankRepositoryPort,
    private readonly ingest: WingSalesRankIngestHandler,
    private readonly keywordRank: KeywordRankService,
  ) {}

  async begin(org: string, key: string, input: WingRankSourceBegin) {
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
              "Wing rank collection expired.",
            )
          : replay;
        return {
          ...view(row),
          attemptToken: row.attemptToken,
        } satisfies WingRankSourceControl;
      }
      const targets = await runWithAdIngestTransaction(tx, () =>
        this.ingest.resolveTargets(org, input.keyword),
      );
      if (targets.length === 0)
        throw new UnprocessableEntityException("WING_RANK_TARGETS_MISSING");
      const plan: WingRankSourcePlan = {
        sourceType: SOURCE,
        parserVersion: PARSER,
        ...input,
        targets,
      };
      const row = await this.createIn(
        tx,
        org,
        randomUUID(),
        key,
        hash(input),
        plan,
        new Date(Date.now() + TTL_MS),
      );
      return {
        ...view(row),
        attemptToken: row.attemptToken,
      } satisfies WingRankSourceControl;
    });
  }

  async beginBatch(org: string, key: string): Promise<WingRankBatch> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, org);
        const replay = await tx.sourceImportRun.findFirst({
          where: { ...scope(org), idempotencyKey: key },
        });
        if (replay) return this.batchView(tx, org, replay);
        const { selection, assignments } = await runWithAdIngestTransaction(
          tx,
          () => this.keywordRank.resolveWingSalesRankSelection(org),
        );
        const attemptIds = selection.targets.map(() => randomUUID());
        const admittedAt = Date.now();
        const attempts: WingRankSourceAttempt[] = [];
        for (const [index, target] of selection.targets.entries()) {
          const plan: WingRankSourcePlan = {
            sourceType: SOURCE,
            parserVersion: PARSER,
            keyword: target.keyword,
            maxPages: target.maxPages,
            targets: assignments
              .filter((assignment) => assignment.keyword === target.keyword)
              .map(
                ({
                  vendorItemId,
                  productName,
                  category,
                  keyword,
                  candidateIndex,
                }) => ({
                  vendorItemId,
                  productName,
                  category,
                  keyword,
                  candidateIndex,
                }),
              ),
            ...(index === 0 ? { admission: { attemptIds, selection } } : {}),
          };
          const unitKey =
            index === 0
              ? key
              : `rank-batch:${hash({ key, keyword: target.keyword })}`;
          const row = await this.createIn(
            tx,
            org,
            attemptIds[index],
            unitKey,
            hash({ mode: "wing_pending_or_all" }),
            plan,
            new Date(admittedAt + TTL_MS + index * (TTL_MS + 2_500)),
          );
          attempts.push(view(row));
        }
        return { attempts, selection } satisfies WingRankBatch;
      },
      { timeout: 30_000 },
    );
  }

  async readBatch(org: string, key: string): Promise<WingRankBatch> {
    return this.prisma.$transaction(
      async (tx) => {
        const anchor = await tx.sourceImportRun.findFirst({
          where: { ...scope(org), idempotencyKey: key },
        });
        if (!anchor)
          throw new NotFoundException("WING_RANK_BATCH_ADMISSION_NOT_FOUND");
        return this.batchView(tx, org, anchor);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async batchView(
    tx: Tx,
    org: string,
    anchor: Attempt,
  ): Promise<WingRankBatch> {
    const admission = WingRankSourcePlanSchema.parse(anchor.plan).admission;
    if (
      anchor.requestFingerprint !== hash({ mode: "wing_pending_or_all" }) ||
      !admission ||
      admission.attemptIds[0] !== anchor.id
    )
      throw new ConflictException("SOURCE_IDEMPOTENCY_KEY_REUSED");
    const rows = await tx.sourceImportRun.findMany({
      where: { ...scope(org), id: { in: admission.attemptIds } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    if (rows.length !== admission.attemptIds.length)
      throw new NotFoundException("WING_RANK_BATCH_MEMBER_NOT_FOUND");
    return {
      attempts: admission.attemptIds.map((id) => view(byId.get(id)!)),
      selection: admission.selection,
    } satisfies WingRankBatch;
  }

  private async createIn(
    tx: Tx,
    org: string,
    id: string,
    key: string,
    fingerprint: string,
    plan: WingRankSourcePlan,
    expiresAt: Date,
  ) {
    const old = await tx.sourceImportRun.findFirst({
      where: { ...scope(org), rankKeyword: plan.keyword, status: "running" },
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
        "Wing rank collection expired.",
      );
    }
    const reused = await tx.sourceImportRun.findFirst({
      where: { ...scope(org), idempotencyKey: key },
    });
    if (reused) throw new ConflictException("SOURCE_IDEMPOTENCY_KEY_REUSED");
    const previous = await tx.sourceImportRun.aggregate({
      where: { ...scope(org), rankKeyword: plan.keyword },
      _max: { freshnessGeneration: true },
    });
    return tx.sourceImportRun.create({
      data: {
        ...scope(org),
        id,
        rankKeyword: plan.keyword,
        status: "running",
        idempotencyKey: key,
        requestFingerprint: fingerprint,
        attemptToken: randomUUID(),
        freshnessGeneration: (previous._max.freshnessGeneration ?? 0n) + 1n,
        plan: json(plan),
        expiresAt,
      },
    });
  }

  async read(org: string, id: string) {
    const row = await this.find(this.prisma, org, id);
    return {
      ...view(row),
      attemptToken: row.attemptToken,
    } satisfies WingRankSourceControl;
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
            const plan = WingRankSourcePlanSchema.parse(complete.plan);
            const targets = await this.ingest.resolveTargets(org, keyword);
            return (
              hash([...targets].sort(byVendorId)) ===
              hash([...plan.targets].sort(byVendorId))
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
        } satisfies WingRankSource;
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
      throw new NotFoundException("COMPLETE_WING_RANK_CAPTURE_NOT_FOUND");
    return { attemptId: id, capture: snapshot.rawJson };
  }

  async complete(
    org: string,
    id: string,
    token: string,
    capture: WingRankCapture,
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
        const plan = WingRankSourcePlanSchema.parse(row.plan);
        const normalized = this.ingest.normalizeCapture(
          capture,
          plan.targets,
          org,
        );
        if (!validCapture(capture, plan, normalized.items)) {
          return view(
            await this.failIn(
              tx,
              row,
              "INCOMPLETE_WING_RANK_CAPTURE",
              "Wing rank capture does not satisfy the frozen page plan.",
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
            pageType: "wing_rank",
            businessDate: normalized.businessDate,
            observedAt: normalized.capturedAt,
            rowHash: checksum,
            rawJson: json(capture),
          },
        });
        await runWithAdIngestTransaction(tx, () =>
          this.rank.replaceWingSalesRankSnapshots(
            normalized.rows.map((row) => ({ ...row, sourceImportRunId: id })),
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
              rankedCount: normalized.rankedCount,
              outOfRangeCount: normalized.outOfRangeCount,
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
    if (!row) throw new NotFoundException("WING_RANK_ATTEMPT_NOT_FOUND");
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
function view(row: Attempt): WingRankSourceAttempt {
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
    plan: WingRankSourcePlanSchema.parse(row.plan),
    expiresAt: row.expiresAt!.toISOString(),
    actualCutoffAt:
      row.status === "completed" ? row.importedAt!.toISOString() : null,
    itemCount: row.rowCount,
    errorCode: isExpired ? "ATTEMPT_EXPIRED" : row.errorCode,
    errorMessage: isExpired
      ? "Wing rank collection expired."
      : row.errorMessage,
  } satisfies WingRankSourceAttempt;
}
function validCapture(
  capture: WingRankCapture,
  plan: WingRankSourcePlan,
  items: Array<{ salesRank: number }>,
) {
  const { proof } = capture;
  const pages = proof.pages;
  if (
    capture.keyword !== plan.keyword ||
    proof.maxPages !== plan.maxPages ||
    pages.length === 0 ||
    pages.length > plan.maxPages ||
    capture.pagesScanned !== pages.length ||
    capture.collectedCount !== capture.items.length ||
    items.length !== capture.items.length
  )
    return false;
  if (
    !pages.every(
      (page, index) =>
        page.resultArrayObserved &&
        (index === 0
          ? page.searchPage === 0
          : pages[index - 1].itemCount > 0 &&
            pages[index - 1].nextSearchPage === page.searchPage &&
            page.searchPage !== pages[index - 1].searchPage),
    )
  )
    return false;
  const last = pages.at(-1)!;
  const observedCount = pages.reduce((sum, page) => sum + page.itemCount, 0);
  if (
    capture.collectedCount > observedCount ||
    (observedCount > 0 && items.length === 0) ||
    !items.every((item, index) => item.salesRank === index + 1)
  )
    return false;
  if (proof.stopReason === "empty_page") return last.itemCount === 0;
  if (last.itemCount === 0) return false;
  if (proof.stopReason === "no_next_search_page")
    return last.nextSearchPage === null;
  if (proof.stopReason === "next_page_not_advancing")
    return (
      pages.length === plan.maxPages && last.nextSearchPage === last.searchPage
    );
  return (
    proof.stopReason === "max_pages_reached" && pages.length === plan.maxPages
  );
}
