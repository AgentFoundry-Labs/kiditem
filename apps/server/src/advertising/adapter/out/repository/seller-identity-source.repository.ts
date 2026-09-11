import { createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SellerIdentitySourcePlanSchema,
  type SellerIdentitySourceAttempt,
  type SellerIdentitySourceControl,
  type SellerIdentitySourcePlan,
  type SellerIdentitySource,
  type SellerIdentitySourceCapture,
} from '@kiditem/shared/advertising';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { CompetitorTrackingService } from '../../../application/service/competitor-tracking.service';
import { KeywordRankIngestHandler } from '../../../application/service/keyword-rank-ingest.handler';
import { runWithAdIngestTransaction } from './ad-ingest-transaction-context';
import { lockCompetitorCatalogSource } from './competitor-catalog-source-lock';
import { toBusinessDate } from '../../../domain/business-date';

const SOURCE = 'coupang_competitor_seller_identity';
const PARSER = 'seller-identity-v1';
type Row = Prisma.SourceImportRunGetPayload<{}>;
type Tx = Prisma.TransactionClient;
const scope = (organizationId: string) => ({
  organizationId,
  sourceType: SOURCE,
  parserVersion: PARSER,
});

/** One owner transaction publishes identity capture, serving enrichment and Alert. */
@Injectable()
export class SellerIdentitySourceRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
    private readonly tracking: CompetitorTrackingService,
    private readonly ingest: KeywordRankIngestHandler,
  ) {}

  async begin(org: string, key: string): Promise<SellerIdentitySourceControl> {
    // Existing receipts never repeat the selector's storefront IO.
    const existing = await this.prisma.sourceImportRun.findFirst({
      where: { ...scope(org), idempotencyKey: key },
    });
    if (existing)
      return this.prisma.$transaction(async (tx) => {
        await this.lock(tx, org);
        return control(
          await this.settleExpiry(tx, await this.find(tx, org, existing.id)),
        );
      });
    const selected = await this.tracking.getProductDetailTargets(org, 30, 200);
    const plan = SellerIdentitySourcePlanSchema.parse({
      sourceType: SOURCE,
      parserVersion: PARSER,
      days: 30,
      limit: 200,
      targets: selected.targets,
    });
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const replay = await tx.sourceImportRun.findFirst({
        where: { ...scope(org), idempotencyKey: key },
      });
      if (replay) return control(await this.settleExpiry(tx, replay));
      const expiredRows = await tx.sourceImportRun.findMany({
        where: {
          ...scope(org),
          status: 'running',
          expiresAt: { lte: new Date(Date.now()) },
        },
      });
      for (const row of expiredRows) await this.settleExpiry(tx, row);
      const active = await tx.sourceImportRun.findFirst({
        where: { ...scope(org), status: 'running' },
      });
      if (active)
        throw new ConflictException({
          code: 'ATTEMPT_IN_PROGRESS',
          attemptId: active.id,
        });
      const previous = await tx.sourceImportRun.aggregate({
        where: scope(org),
        _max: { freshnessGeneration: true },
      });
      const now = new Date(Date.now());
      const count = new Set(plan.targets.filter(eligible).map(productKey)).size;
      return control(
        await tx.sourceImportRun.create({
          data: {
            ...scope(org),
            idempotencyKey: key,
            requestFingerprint: hash({
              sourceType: SOURCE,
              parserVersion: PARSER,
            }),
            freshnessGeneration: (previous._max.freshnessGeneration ?? 0n) + 1n,
            expiresAt: new Date(now.getTime() + (5 + count) * 60_000),
            plan: json(plan),
            status: 'running',
          },
        }),
      );
    });
  }

  async read(org: string, id: string): Promise<SellerIdentitySourceControl> {
    return control(await this.find(this.prisma, org, id));
  }

  source(org: string): Promise<SellerIdentitySource> {
    return this.prisma.$transaction(
      async (tx) => {
        const latest = await tx.sourceImportRun.findFirst({
          where: scope(org),
          orderBy: { freshnessGeneration: 'desc' },
        });
        const complete = await tx.sourceImportRun.findFirst({
          where: { ...scope(org), status: 'completed' },
          orderBy: [{ importedAt: 'desc' }, { freshnessGeneration: 'desc' }],
        });
        const latestAttempt = latest ? view(latest) : null;
        return {
          status: !complete
            ? 'MISSING'
            : latestAttempt?.state === 'FAILED'
              ? 'STALE'
              : 'READY',
          refreshing: latestAttempt?.state === 'RUNNING',
          latestAttempt,
          latestComplete: complete ? view(complete) : null,
        } satisfies SellerIdentitySource;
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
        sourceImportRun: { ...scope(org), status: 'completed' },
      },
      select: { rawJson: true },
    });
    if (!snapshot)
      throw new NotFoundException('COMPLETE_IDENTITY_CAPTURE_NOT_FOUND');
    return { attemptId: id, capture: snapshot.rawJson };
  }

  complete(
    org: string,
    id: string,
    token: string,
    capture: SellerIdentitySourceCapture,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, org);
        await lockCompetitorCatalogSource(tx, org);
        const row = await this.find(tx, org, id);
        if (row.attemptToken !== token)
          throw new ConflictException('ATTEMPT_FENCE_LOST');
        const checksum = hash(capture);
        if (row.status !== 'running') {
          if (row.contentChecksum === checksum) return view(row);
          throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
        }
        if (expired(row)) throw new ConflictException('ATTEMPT_EXPIRED');
        const plan = SellerIdentitySourcePlanSchema.parse(row.plan);
        const targets = new Map(
          plan.targets
            .filter(eligible)
            .map((target) => [targetKey(target), target]),
        );
        const seen = new Set<string>();
        for (const identity of capture.identities) {
          const key = targetKey(identity);
          const target = targets.get(key);
          if (
            !target ||
            seen.has(key) ||
            target.link !== identity.link ||
            (target.productId || null) !== identity.productId ||
            (target.vendorItemId || null) !== identity.vendorItemId
          ) {
            throw new UnprocessableEntityException('IDENTITY_TARGET_MISMATCH');
          }
          seen.add(key);
        }
        if (seen.size !== targets.size) {
          return view(
            await this.failIn(
              tx,
              row,
              'IDENTITY_EVIDENCE_INCOMPLETE',
              'Seller identities do not cover every eligible frozen target.',
              checksum,
            ),
          );
        }
        const capturedAt = new Date(
          Math.max(
            Date.parse(capture.capturedAt),
            ...capture.identities.map((identity) =>
              Date.parse(identity.capturedAt),
            ),
          ),
        );
        const date = toBusinessDate(capturedAt.toISOString());
        await tx.channelScrapeSnapshot.create({
          data: {
            organizationId: org,
            sourceImportRunId: id,
            channel: 'coupang',
            source: SOURCE,
            pageType: 'seller_identity',
            observedAt: capturedAt,
            businessDate: date,
            rowHash: checksum,
            rawJson: json(capture),
          },
        });
        const applied = await runWithAdIngestTransaction(tx, () =>
          this.ingest.executeSellerIdentities(
            {
              type: 'competitor_seller_identity',
              source: 'coupang-overlap-product-detail',
              timestamp: capture.capturedAt,
              data: capture.identities,
            },
            org,
            id,
          ),
        );
        const complete = await tx.sourceImportRun.update({
          where: { id, organizationId: org },
          data: {
            status: 'completed',
            importedAt: capturedAt,
            lastVerifiedAt: capturedAt,
            verificationCount: 1,
            contentChecksum: checksum,
            contentByteCount: Buffer.byteLength(JSON.stringify(capture)),
            rowCount: capture.identities.length,
            coverageStartDate: date,
            coverageEndDate: date,
            qualityReport: {
              expectedTargetCount: targets.size,
              excludedTargetCount: plan.targets.length - targets.size,
              appliedProductCount: applied.results.reduce(
                (total, result) => total + result.resolvedProductCount,
                0,
              ),
            },
          },
        });
        await this.alerts.resolveSourceFailure(tx, {
          organizationId: org,
          dedupeKey: `source:${SOURCE}`,
          attemptId: id,
        });
        return view(complete);
      },
      { timeout: 30_000 },
    );
  }

  fail(org: string, id: string, token: string, code: string, message: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, org);
      const row = await this.find(tx, org, id);
      if (row.attemptToken !== token)
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      const checksum = hash({ code, message });
      if (row.status !== 'running') {
        if (row.contentChecksum === checksum) return view(row);
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      if (expired(row)) throw new ConflictException('ATTEMPT_EXPIRED');
      return view(await this.failIn(tx, row, code, message, checksum));
    });
  }

  private settleExpiry(tx: Tx, row: Row) {
    if (row.status !== 'running' || !expired(row)) return Promise.resolve(row);
    const code = 'ATTEMPT_EXPIRED';
    const message = 'Seller identity collection expired before publication.';
    return this.failIn(tx, row, code, message, hash({ code, message }));
  }

  private async failIn(
    tx: Tx,
    row: Row,
    code: string,
    message: string,
    checksum: string,
  ) {
    const failed = await tx.sourceImportRun.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: {
        status: 'failed',
        errorCode: code,
        errorMessage: message,
        contentChecksum: checksum,
      },
    });
    await this.alerts.recordTerminalOutcome(tx, {
      code,
      organizationId: row.organizationId,
      dedupeKey: `source:${SOURCE}`,
      sourceType: SOURCE,
      attemptId: row.id,
      title: '쿠팡 판매자 확인 실패',
      message: message,
      href: '/rank-tracking',
    });
    return failed;
  }

  private async find(tx: Pick<Tx, 'sourceImportRun'>, org: string, id: string) {
    const row = await tx.sourceImportRun.findFirst({
      where: { ...scope(org), id },
    });
    if (!row) throw new NotFoundException('SELLER_IDENTITY_ATTEMPT_NOT_FOUND');
    return row;
  }
  private async lock(tx: Tx, org: string) {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`seller-identity:${org}`}, 0))::text AS "lock"
      FROM (SELECT ${org}::uuid AS organization_id) AS tenant
      WHERE organization_id = ${org}::uuid
    `;
  }
}

function expired(row: Row) {
  return !row.expiresAt || row.expiresAt.getTime() <= Date.now();
}
function view(row: Row): SellerIdentitySourceAttempt {
  const isExpired = row.status === 'running' && expired(row);
  return {
    attemptId: row.id,
    generation: String(row.freshnessGeneration),
    state:
      row.status === 'completed'
        ? 'COMPLETE'
        : row.status === 'running' && !isExpired
          ? 'RUNNING'
          : 'FAILED',
    plan: SellerIdentitySourcePlanSchema.parse(row.plan),
    expiresAt: row.expiresAt!.toISOString(),
    actualCutoffAt: row.importedAt?.toISOString() ?? null,
    itemCount: row.rowCount,
    errorCode: isExpired ? 'ATTEMPT_EXPIRED' : row.errorCode,
    errorMessage: isExpired
      ? 'Seller identity collection expired before publication.'
      : row.errorMessage,
  };
}
function control(row: Row): SellerIdentitySourceControl {
  return { ...view(row), attemptToken: row.attemptToken };
}
function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}
function eligible(target: SellerIdentitySourcePlan['targets'][number]) {
  try {
    const url = new URL(target.link);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'www.coupang.com' &&
      /^\/vp\/products\/\d+/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
function productKey(target: SellerIdentitySourcePlan['targets'][number]) {
  return target.vendorItemId?.trim()
    ? `vendor-item:${target.vendorItemId.trim()}`
    : target.productId?.trim()
      ? `product:${target.productId.trim()}`
      : `link:${target.link}`;
}
function targetKey(target: { keyword: string; productKey: string }) {
  return JSON.stringify([target.keyword, target.productKey]);
}
