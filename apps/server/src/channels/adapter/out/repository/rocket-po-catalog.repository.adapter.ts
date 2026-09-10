import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, type SourceImportRun } from '@prisma/client';
import {
  RocketPoSourceBeginSchema,
  RocketPoSourcePlanSchema,
  type RocketPoSourceControl,
  type RocketPoSourcePlan,
  type RocketPoCatalogRow,
} from '@kiditem/shared/rocket-purchase-preview';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { RocketPoCatalogRepositoryPort } from '../../../application/port/out/repository/rocket-po-catalog.repository.port';
import {
  advanceProductMappingGeneration,
  lockProductMapping,
} from '../../../../common/product-mapping-generation';
import { upsertChannelCatalogIdentities } from './channel-catalog-identity-upsert';
import {
  createRocketPoCatalogSnapshot,
  listSavedRocketPos,
  loadSavedRocketCollection,
  ROCKET_PO_CATALOG_SOURCE_TYPE,
} from './rocket-po-catalog-snapshot.repository';

const SOURCE_TYPE = ROCKET_PO_CATALOG_SOURCE_TYPE;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

@Injectable()
export class RocketPoCatalogRepositoryAdapter implements RocketPoCatalogRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  begin(input: Parameters<RocketPoCatalogRepositoryPort['begin']>[0]) {
    const request = RocketPoSourceBeginSchema.parse(input.request);
    if (!input.idempotencyKey || input.idempotencyKey.length > 128)
      throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
    const fingerprint = hash(request);
    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, input.organizationId, request.channelAccountId);
      const prior = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (prior && prior.requestFingerprint !== fingerprint)
        throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
      const active = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: request.channelAccountId,
          status: 'running',
        },
      });
      if (active && expired(active))
        await this.failRun(
          tx,
          active,
          'ATTEMPT_EXPIRED',
          '로켓 PO 수집 시간이 만료되었습니다. 다시 수집해주세요.',
        );
      if (prior) return control(await findAttempt(tx, input.organizationId, prior.id));
      if (active && !expired(active))
        throw new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId: active.id });
      const account = await readAccount(tx, input.organizationId, request.channelAccountId);
      const plan: RocketPoSourcePlan = {
        ...request,
        sourceType: SOURCE_TYPE,
        parserVersion: 'rocket-po-v1',
        vendorExpectations: {
          rocketVendorId: account.vendorId,
          sharedCoupangVendorId: account.shared?.vendorId ?? null,
        },
      };
      const last = await tx.sourceImportRun.aggregate({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: request.channelAccountId,
        },
        _max: { freshnessGeneration: true },
      });
      return control(
        await tx.sourceImportRun.create({
          data: {
            organizationId: input.organizationId,
            sourceType: SOURCE_TYPE,
            channelAccountId: request.channelAccountId,
            createdBy: input.userId,
            status: 'running',
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: fingerprint,
            plan,
            parserVersion: 'rocket-po-v1',
            freshnessGeneration: (last._max.freshnessGeneration ?? 0n) + 1n,
            expiresAt: new Date(Date.now() + 600_000),
          },
        }),
      );
    }, TRANSACTION_OPTIONS);
  }

  async readAttempt(input: Parameters<RocketPoCatalogRepositoryPort['readAttempt']>[0]) {
    return control(await findAttempt(this.prisma, input.organizationId, input.attemptId));
  }

  readSource(input: Parameters<RocketPoCatalogRepositoryPort['readSource']>[0]) {
    return this.prisma.$transaction(
      async (tx) => {
        const account = await tx.channelAccount.findFirst({
          where: {
            id: input.channelAccountId,
            organizationId: input.organizationId,
            channel: 'rocket',
          },
          select: { id: true },
        });
        if (!account) throw new NotFoundException('Rocket channel account not found');
        const where = {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          sourceType: SOURCE_TYPE,
          parserVersion: 'rocket-po-v1',
        };
        const latest = await tx.sourceImportRun.findFirst({
          where,
          orderBy: { freshnessGeneration: 'desc' },
        });
        const complete = await tx.sourceImportRun.findFirst({
          where: { ...where, status: 'complete' },
          orderBy: { freshnessGeneration: 'desc' },
        });
        const latestAttempt = latest ? publicControl(latest) : null;
        return {
          status: !complete
            ? ('MISSING' as const)
            : latestAttempt?.state === 'FAILED'
              ? ('STALE' as const)
              : ('READY' as const),
          refreshing: latestAttempt?.state === 'RUNNING',
          latestAttempt,
          latestComplete: complete ? publicControl(complete) : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async failRun(
    tx: Prisma.TransactionClient,
    run: SourceImportRun,
    code: string,
    message: string,
  ) {
    const failed = await tx.sourceImportRun.update({
      where: { id: run.id, organizationId: run.organizationId },
      data: { status: 'failed', errorCode: code, errorMessage: message },
    });
    await this.alerts.upsertSourceFailure(tx, {
      organizationId: run.organizationId,
      sourceType: SOURCE_TYPE,
      dedupeKey: `channels:rocket-po:${run.channelAccountId}`,
      attemptId: run.id,
      severity: 'error',
      title: '로켓 PO 수집 실패',
      message,
      href: '/rocket-orders',
    });
    return failed;
  }

  async complete(input: Parameters<RocketPoCatalogRepositoryPort['complete']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const original = await findAttempt(tx, input.organizationId, input.attemptId);
      await lockSource(tx, input.organizationId, original.channelAccountId!);
      const run = await findAttempt(tx, input.organizationId, input.attemptId);
      fence(run, input.token);
      const plan = RocketPoSourcePlanSchema.parse(run.plan);
      const { collection, proof } = input.submission;
      const rows = [...input.submission.rows].sort((a, b) => a.poLineId.localeCompare(b.poLineId));
      if (
        collection.collectionRunId !== run.id ||
        proof.from !== plan.from ||
        proof.to !== plan.to ||
        proof.status !== plan.status ||
        proof.dateType !== plan.dateType
      ) {
        throw new ConflictException('ROCKET_PO_PLAN_FENCE_LOST');
      }
      const { collectionRunId: _id, ...evidence } = collection;
      const canonical = JSON.stringify({ collection: evidence, rows, proof });
      const contentChecksum = createHash('sha256').update(canonical).digest('hex');
      if (
        (run.status === 'complete' || run.status === 'failed') &&
        run.contentChecksum === contentChecksum
      )
        return control(run);
      writable(run);
      const invalid =
        collection.truncated ||
        collection.failedPoNumbers.length > 0 ||
        collection.listPagesRead < 1 ||
        collection.listPagesRead !== collection.totalListPages ||
        collection.detailPoCount !== new Set(rows.map((row) => row.poNumber)).size ||
        new Set(rows.map((row) => row.poLineId)).size !== rows.length ||
        (rows.length > 0 &&
          (!collection.vendorId || rows.some((row) => row.vendorId !== collection.vendorId))) ||
        (plan.requireConfirmation && rows.some((row) => !row.confirmation || !row.barcode));
      const receipt = { contentChecksum, contentByteCount: Buffer.byteLength(canonical) };
      if (invalid) {
        await tx.sourceImportRun.update({
          where: { id: run.id, organizationId: input.organizationId },
          data: receipt,
        });
        return control(
          await this.failRun(
            tx,
            run,
            'ROCKET_PO_COLLECTION_INCOMPLETE',
            '로켓 PO 수집 근거가 완전하지 않습니다. 다시 수집해주세요.',
          ),
        );
      }
      let account: Awaited<ReturnType<typeof readAccount>>;
      try {
        account = await readAccount(tx, input.organizationId, plan.channelAccountId);
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
        await tx.sourceImportRun.update({
          where: { id: run.id, organizationId: input.organizationId },
          data: receipt,
        });
        return control(
          await this.failRun(
            tx,
            run,
            'ROCKET_PO_ACCOUNT_UNAVAILABLE',
            '선택한 로켓 계정을 사용할 수 없습니다.',
          ),
        );
      }
      const frozen = plan.vendorExpectations;
      const expected = [
        frozen.rocketVendorId,
        frozen.sharedCoupangVendorId,
        account.vendorId,
        account.shared?.vendorId,
      ].filter(Boolean);
      if (
        (frozen.rocketVendorId && frozen.rocketVendorId !== account.vendorId) ||
        (frozen.sharedCoupangVendorId &&
          frozen.sharedCoupangVendorId !== account.shared?.vendorId) ||
        (rows.length > 0 && expected.some((vendor) => vendor !== collection.vendorId))
      ) {
        await tx.sourceImportRun.update({
          where: { id: run.id, organizationId: input.organizationId },
          data: receipt,
        });
        return control(
          await this.failRun(
            tx,
            run,
            'ROCKET_PO_VENDOR_MISMATCH',
            '선택한 계정과 수집한 로켓 공급자 정보가 다릅니다.',
          ),
        );
      }
      if (rows.length) {
        if (!account.vendorId) {
          const claimed = await tx.channelAccount.updateMany({
            where: {
              id: plan.channelAccountId,
              organizationId: input.organizationId,
              channel: 'rocket',
              status: 'active',
              vendorId: account.storedVendorId,
            },
            data: { vendorId: collection.vendorId },
          });
          if (claimed.count !== 1)
            throw new ConflictException('Rocket vendor identity changed before publication');
        }
        if (account.shared && !account.shared.vendorId) {
          const claimed = await tx.channelAccount.updateMany({
            where: {
              id: account.shared.id,
              organizationId: input.organizationId,
              channel: 'coupang',
              status: 'active',
              vendorId: account.shared.storedVendorId,
            },
            data: { vendorId: collection.vendorId },
          });
          if (claimed.count !== 1)
            throw new ConflictException('Rocket vendor identity changed before publication');
          await advanceProductMappingGeneration(tx, input.organizationId);
        }
      }
      const publication = {
        organizationId: input.organizationId,
        channelAccountId: plan.channelAccountId,
        vendorId: collection.vendorId,
        collection,
        rows,
      };
      if (rows.length)
        await upsertChannelCatalogIdentities(tx, {
          organizationId: input.organizationId,
          channelAccountId: plan.channelAccountId,
          lastImportRunId: run.id,
          rawSource: SOURCE_TYPE,
          products: productsFromRows(rows),
        });
      await createRocketPoCatalogSnapshot(tx, publication, run.id);
      const complete = await tx.sourceImportRun.update({
        where: { id: run.id, organizationId: input.organizationId },
        data: {
          status: 'complete',
          rowCount: rows.length,
          importedAt: new Date(),
          ...receipt,
          providerBackedEmptyProof: rows.length === 0,
          coverageStartDate: new Date(plan.from + 'T00:00:00.000Z'),
          coverageEndDate: new Date(plan.to + 'T00:00:00.000Z'),
          qualityReport: { proof, includedCount: rows.length, excludedCount: 0, warningCount: 0 },
          publicationSequence: await nextPublicationSequence(tx, input.organizationId),
        },
      });
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: `channels:rocket-po:${plan.channelAccountId}`,
        attemptId: run.id,
      });
      return control(complete);
    }, TRANSACTION_OPTIONS);
  }

  fail(input: Parameters<RocketPoCatalogRepositoryPort['fail']>[0]) {
    if (!input.code || input.code.length > 100 || !input.message || input.message.length > 300)
      throw new BadRequestException('ROCKET_PO_FAILURE_INVALID');
    return this.prisma.$transaction(async (tx) => {
      const original = await findAttempt(tx, input.organizationId, input.attemptId);
      await lockSource(tx, input.organizationId, original.channelAccountId!);
      const run = await findAttempt(tx, input.organizationId, input.attemptId);
      fence(run, input.token);
      if (
        run.status === 'failed' &&
        run.errorCode === input.code &&
        run.errorMessage === input.message
      )
        return control(run);
      writable(run);
      return control(await this.failRun(tx, run, input.code, input.message));
    }, TRANSACTION_OPTIONS);
  }

  readComplete(input: Parameters<RocketPoCatalogRepositoryPort['readComplete']>[0]) {
    return this.prisma.$transaction(
      async (tx) => {
        const run = await findAttempt(tx, input.organizationId, input.sourceImportRunId);
        if (run.channelAccountId !== input.channelAccountId || run.status !== 'complete')
          throw new NotFoundException('ROCKET_PO_COMPLETE_NOT_FOUND');
        const saved = await loadSavedRocketCollection(tx, input);
        if (!saved) throw new NotFoundException('ROCKET_PO_COMPLETE_NOT_FOUND');
        return {
          ...saved,
          catalog: {
            sourceImportRunId: run.id,
            channelAccountId: input.channelAccountId,
            generation: String(run.freshnessGeneration),
            actualCutoffAt: run.importedAt!.toISOString(),
            rowCount: run.rowCount,
          },
          identities: await resolveIdentities(tx, { ...input, rows: saved.rows }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  listSavedPos(input: Parameters<RocketPoCatalogRepositoryPort['listSavedPos']>[0]) {
    return listSavedRocketPos(this.prisma, input);
  }

  loadSavedCollection(input: Parameters<RocketPoCatalogRepositoryPort['loadSavedCollection']>[0]) {
    return loadSavedRocketCollection(this.prisma, input);
  }
}

function productsFromRows(rows: RocketPoCatalogRow[]) {
  const byProduct = new Map<string, RocketPoCatalogRow>();
  for (const row of rows) {
    if (!byProduct.has(row.productNo)) byProduct.set(row.productNo, row);
  }
  return [...byProduct.values()].map((row) => ({
    externalProductId: row.productNo,
    registeredName: row.productName,
    displayName: row.productName,
    category: null,
    manufacturer: null,
    brand: null,
    productStatus: 'observed',
    raw: { source: SOURCE_TYPE, poLineId: row.poLineId },
    options: [
      {
        externalOptionId: row.productNo,
        optionName: row.productName,
        salePrice: null,
        sellerSku: row.productNo,
        barcode: row.barcode || null,
        modelNumber: null,
        skuStatus: 'observed',
        attributes: {},
        raw: { source: SOURCE_TYPE, poLineId: row.poLineId },
      },
    ],
  }));
}

async function resolveIdentities(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelAccountId: string; rows: RocketPoCatalogRow[] },
) {
  const productNos = [...new Set(input.rows.map(({ productNo }) => productNo))];
  const listings = await tx.channelListing.findMany({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      externalId: { in: productNos },
    },
    select: { id: true },
  });
  const options = await tx.channelListingOption.findMany({
    where: {
      organizationId: input.organizationId,
      listingId: { in: listings.map(({ id }) => id) },
      externalOptionId: { in: productNos },
    },
    select: { id: true, externalOptionId: true },
  });
  const optionByExternalId = new Map(options.map((option) => [option.externalOptionId, option.id]));
  return input.rows.map((row) => {
    const channelSkuId = optionByExternalId.get(row.productNo);
    if (!channelSkuId) {
      throw new ConflictException(`Rocket identity ${row.productNo} was not persisted`);
    }
    return { poLineId: row.poLineId, channelSkuId };
  });
}

async function nextPublicationSequence(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<bigint> {
  const lockKey = `channel-catalog-sequence:${organizationId}:${SOURCE_TYPE}`;
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
  `;
  const rows = await tx.$queryRaw<Array<{ publicationSequence: bigint }>>`
    SELECT COALESCE(MAX(publication_sequence), 0::bigint) + 1 AS "publicationSequence"
    FROM source_import_runs
    WHERE organization_id = ${organizationId}::uuid
      AND source_type = ${SOURCE_TYPE}
  `;
  if (rows[0]?.publicationSequence === undefined) {
    throw new ConflictException('Could not allocate Rocket publication sequence');
  }
  return rows[0].publicationSequence;
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function expired(run: SourceImportRun) {
  return !run.expiresAt || run.expiresAt.getTime() <= Date.now();
}
function control(run: SourceImportRun): RocketPoSourceControl {
  const effectiveExpired = run.status === 'running' && expired(run);
  return {
    attemptId: run.id,
    attemptToken: run.attemptToken,
    channelAccountId: run.channelAccountId!,
    state:
      effectiveExpired || run.status === 'failed'
        ? 'FAILED'
        : run.status === 'complete'
          ? 'COMPLETE'
          : 'RUNNING',
    generation: String(run.freshnessGeneration),
    plan: RocketPoSourcePlanSchema.parse(run.plan),
    expiresAt: run.expiresAt!.toISOString(),
    actualCutoffAt: run.importedAt?.toISOString() ?? null,
    errorCode: effectiveExpired ? 'ATTEMPT_EXPIRED' : run.errorCode,
    errorMessage: effectiveExpired
      ? '로켓 PO 수집 시간이 만료되었습니다. 다시 수집해주세요.'
      : run.errorMessage,
  } satisfies RocketPoSourceControl;
}
function publicControl(run: SourceImportRun) {
  const { attemptToken: _token, ...result } = control(run);
  return result;
}
async function findAttempt(tx: Prisma.TransactionClient, organizationId: string, id: string) {
  const run = await tx.sourceImportRun.findFirst({
    where: { id, organizationId, sourceType: SOURCE_TYPE, parserVersion: 'rocket-po-v1' },
  });
  if (!run) throw new NotFoundException('ROCKET_PO_ATTEMPT_NOT_FOUND');
  return run;
}
async function lockSource(
  tx: Prisma.TransactionClient,
  organizationId: string,
  channelAccountId: string,
) {
  await lockProductMapping(tx, organizationId);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`rocket-po-catalog:${organizationId}:${channelAccountId}`}, 0))::text`;
  // queryraw-tenancy-exempt: organization-scoped advisory lock
  // The key includes the organization and account; this query reads no rows.
}
async function readAccount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  channelAccountId: string,
) {
  const account = await tx.channelAccount.findFirst({
    where: { id: channelAccountId, organizationId, channel: 'rocket', status: 'active' },
    select: { vendorId: true },
  });
  if (!account) throw new NotFoundException('Active Rocket channel account not found');
  const shared = await tx.channelAccount.findFirst({
    where: { organizationId, channel: 'coupang', status: 'active', isPrimary: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, vendorId: true },
  });
  return {
    storedVendorId: account.vendorId,
    vendorId: account.vendorId?.trim() || null,
    shared: shared
      ? { ...shared, storedVendorId: shared.vendorId, vendorId: shared.vendorId?.trim() || null }
      : null,
  };
}

function fence(run: SourceImportRun, token: string) {
  if (!token || token !== run.attemptToken) throw new ConflictException('ATTEMPT_FENCE_LOST');
}
function writable(run: SourceImportRun) {
  if (run.status !== 'running') throw new ConflictException('ATTEMPT_TERMINAL_CONFLICT');
  if (expired(run)) throw new ConflictException('ATTEMPT_EXPIRED');
}
