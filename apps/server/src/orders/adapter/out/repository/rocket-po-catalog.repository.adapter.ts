import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, type SourceImportRun } from '@prisma/client';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import {
  RocketPoSourceBeginSchema,
  RocketPoSourcePlanSchema,
  type RocketPoSourceControl,
  type RocketPoSourcePlan,
  type RocketPoCatalogRow,
} from '@kiditem/shared/rocket-purchase-preview';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE } from '../../../../common/operator-cancel';
import type { RocketPoCatalogRepositoryPort } from '../../../application/port/out/repository/rocket-po-catalog.repository.port';
import {
  lockProductMapping,
} from '../../../../common/product-mapping-generation';
import { allocatePublicationSequence } from '../../../../common/publication-sequence';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { CHANNEL_CATALOG_IDENTITY_PORT, type ChannelCatalogIdentityPort } from '../../../../channels/application/port/in/collection/catalog-identity.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { createRocketPoCatalogSnapshot } from './rocket-po-catalog-snapshot.repository';
import {
  readCurrentRocketPos,
  readRocketPoCompleteCollection,
  readRocketPoSnapshot,
  readRocketPoSource,
  ROCKET_PO_CATALOG_PARSER_VERSION,
  ROCKET_PO_CATALOG_SOURCE_TYPE,
} from '../../../read/rocket-po-catalog.reader';

const SOURCE_TYPE = ROCKET_PO_CATALOG_SOURCE_TYPE;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

@Injectable()
export class RocketPoCatalogRepositoryAdapter implements RocketPoCatalogRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly accounts: ChannelAccountPort,
    @Inject(CHANNEL_CATALOG_IDENTITY_PORT) private readonly identities: ChannelCatalogIdentityPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly listings: ChannelListingQueryPort,
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
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        },
      });
      if (active && expired(active))
        await this.failRun(
          tx,
          active,
          'ATTEMPT_EXPIRED',
          '로켓 PO 수집 시간이 만료되었습니다. 다시 수집해주세요.',
        );
      if (prior)
        return control(await findAttempt(tx, input.organizationId, prior.id));
      if (active && !expired(active))
        throw new ConflictException({
          code: 'ATTEMPT_IN_PROGRESS',
          attemptId: active.id,
        });
      const account = await readAccount(
        tx,
        input.organizationId,
        request.channelAccountId,
        this.accounts,
      );
      const plan: RocketPoSourcePlan = {
        ...request,
        sourceType: SOURCE_TYPE,
        parserVersion: ROCKET_PO_CATALOG_PARSER_VERSION,
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
            status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: fingerprint,
            plan,
            parserVersion: ROCKET_PO_CATALOG_PARSER_VERSION,
            freshnessGeneration: (last._max.freshnessGeneration ?? 0n) + 1n,
            expiresAt: new Date(Date.now() + 600_000),
          },
        }),
      );
    }, TRANSACTION_OPTIONS);
  }

  async readAttempt(
    input: Parameters<RocketPoCatalogRepositoryPort['readAttempt']>[0],
  ) {
    return control(
      await findAttempt(this.prisma, input.organizationId, input.attemptId),
    );
  }

  readSource(
    input: Parameters<RocketPoCatalogRepositoryPort['readSource']>[0],
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const source = await readRocketPoSource(tx, input, this.accounts);
        if (!source)
          throw new NotFoundException('Rocket channel account not found');
        return source;
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
      data: { status: SOURCE_IMPORT_RUN_FAILED_STATUS, errorCode: code, errorMessage: message },
    });
    await this.alerts.recordTerminalOutcome(tx, {
      code,
      organizationId: run.organizationId,
      sourceType: SOURCE_TYPE,
      dedupeKey: `channels:rocket-po:${run.channelAccountId}`,
      attemptId: run.id,
      title: '로켓 PO 수집 실패',
      message,
      href: '/rocket-orders',
    });
    return failed;
  }

  async complete(
    input: Parameters<RocketPoCatalogRepositoryPort['complete']>[0],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const original = await findAttempt(
        tx,
        input.organizationId,
        input.attemptId,
      );
      await lockSource(tx, input.organizationId, original.channelAccountId!);
      const run = await findAttempt(tx, input.organizationId, input.attemptId);
      fence(run, input.token);
      const plan = RocketPoSourcePlanSchema.parse(run.plan);
      const { collection, proof } = input.submission;
      const rows = [...input.submission.rows].sort((a, b) =>
        a.poLineId.localeCompare(b.poLineId),
      );
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
      const contentChecksum = createHash('sha256')
        .update(canonical)
        .digest('hex');
      if (
        (run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS ||
          run.status === SOURCE_IMPORT_RUN_FAILED_STATUS) &&
        run.contentChecksum === contentChecksum
      )
        return control(run);
      writable(run);
      const invalid =
        collection.truncated ||
        collection.failedPoNumbers.length > 0 ||
        collection.listPagesRead < 1 ||
        collection.listPagesRead !== collection.totalListPages ||
        collection.detailPoCount !==
          new Set(rows.map((row) => row.poNumber)).size ||
        new Set(rows.map((row) => row.poLineId)).size !== rows.length ||
        (rows.length > 0 &&
          (!collection.vendorId ||
            rows.some((row) => row.vendorId !== collection.vendorId))) ||
        (plan.requireConfirmation &&
          rows.some((row) => !row.confirmation || !row.barcode));
      const receipt = {
        contentChecksum,
        contentByteCount: Buffer.byteLength(canonical),
      };
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
        account = await readAccount(
          tx,
          input.organizationId,
          plan.channelAccountId,
          this.accounts,
        );
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
        (rows.length > 0 &&
          expected.some((vendor) => vendor !== collection.vendorId))
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
          await this.accounts.claimProviderIdentity(ownerTransaction(tx), {
            organizationId: input.organizationId, accountId: plan.channelAccountId,
            channel: 'rocket', expectedVendorId: account.storedVendorId, vendorId: collection.vendorId,
          });
        }
        if (account.shared && !account.shared.vendorId) {
          await this.accounts.claimProviderIdentity(ownerTransaction(tx), {
            organizationId: input.organizationId, accountId: account.shared.id,
            channel: 'coupang', expectedVendorId: account.shared.storedVendorId, vendorId: collection.vendorId,
          });
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
        await this.identities.publishObservedIdentities(ownerTransaction(tx), {
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
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          rowCount: rows.length,
          importedAt: new Date(),
          ...receipt,
          providerBackedEmptyProof: rows.length === 0,
          coverageStartDate: new Date(plan.from + 'T00:00:00.000Z'),
          coverageEndDate: new Date(plan.to + 'T00:00:00.000Z'),
          qualityReport: {
            proof,
            collection,
            includedCount: rows.length,
            excludedCount: 0,
            warningCount: 0,
          },
          publicationSequence: await allocatePublicationSequence(
            tx,
            input.organizationId,
            SOURCE_TYPE,
          ),
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
    if (
      !input.code ||
      input.code.length > 100 ||
      !input.message ||
      input.message.length > 300
    )
      throw new BadRequestException('ROCKET_PO_FAILURE_INVALID');
    return this.prisma.$transaction(async (tx) => {
      const original = await findAttempt(
        tx,
        input.organizationId,
        input.attemptId,
      );
      await lockSource(tx, input.organizationId, original.channelAccountId!);
      const run = await findAttempt(tx, input.organizationId, input.attemptId);
      fence(run, input.token);
      if (
        run.status === SOURCE_IMPORT_RUN_FAILED_STATUS &&
        run.errorCode === input.code &&
        run.errorMessage === input.message
      )
        return control(run);
      writable(run);
      return control(await this.failRun(tx, run, input.code, input.message));
    }, TRANSACTION_OPTIONS);
  }

  cancel(input: Parameters<RocketPoCatalogRepositoryPort['cancel']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const original = await findAttempt(
        tx,
        input.organizationId,
        input.attemptId,
      );
      await lockSource(tx, input.organizationId, original.channelAccountId!);
      const run = await findAttempt(tx, input.organizationId, input.attemptId);
      if (run.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) return control(run);
      if (expired(run))
        return control(
          await this.failRun(
            tx,
            run,
            'ATTEMPT_EXPIRED',
            '로켓 PO 수집 시간이 만료되었습니다. 다시 수집해주세요.',
          ),
        );
      return control(
        await this.failRun(tx, run, OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE),
      );
    }, TRANSACTION_OPTIONS);
  }

  readComplete(
    input: Parameters<RocketPoCatalogRepositoryPort['readComplete']>[0],
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const saved = await readRocketPoCompleteCollection(tx, input, this.listings);
        if (!saved) throw new NotFoundException('ROCKET_PO_COMPLETE_NOT_FOUND');
        return saved;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  listSavedPos(
    input: Parameters<RocketPoCatalogRepositoryPort['listSavedPos']>[0],
  ) {
    return this.prisma.$transaction((tx) => readCurrentRocketPos(tx, input), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  loadSavedCollection(
    input: Parameters<RocketPoCatalogRepositoryPort['loadSavedCollection']>[0],
  ) {
    return this.prisma.$transaction((tx) => readRocketPoSnapshot(tx, input), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
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

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function expired(run: SourceImportRun) {
  return !run.expiresAt || run.expiresAt.getTime() <= Date.now();
}
function control(run: SourceImportRun): RocketPoSourceControl {
  const effectiveExpired = run.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && expired(run);
  return {
    attemptId: run.id,
    attemptToken: run.attemptToken,
    channelAccountId: run.channelAccountId!,
    state:
      effectiveExpired || run.status === SOURCE_IMPORT_RUN_FAILED_STATUS
        ? 'FAILED'
        : run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
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
async function findAttempt(
  tx: Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const run = await tx.sourceImportRun.findFirst({
    where: {
      id,
      organizationId,
      sourceType: SOURCE_TYPE,
      parserVersion: ROCKET_PO_CATALOG_PARSER_VERSION,
    },
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
  accounts: ChannelAccountPort,
) {
  const [account] = await accounts.readProviderIdentities(ownerTransaction(tx), {
    organizationId, channel: 'rocket', accountIds: [channelAccountId],
  });
  if (!account || account.status !== 'active') throw new NotFoundException('Active Rocket channel account not found');
  const shared = await accounts.resolveActiveProvider(ownerTransaction(tx), {
    organizationId, channel: 'coupang', primaryOnly: true,
  });
  return {
    storedVendorId: account.vendorId,
    vendorId: account.vendorId?.trim() || null,
    shared: shared ? { ...shared, storedVendorId: shared.vendorId, vendorId: shared.vendorId?.trim() || null } : null,
  };
}

function fence(run: SourceImportRun, token: string) {
  if (!token || token !== run.attemptToken)
    throw new ConflictException('ATTEMPT_FENCE_LOST');
}
function writable(run: SourceImportRun) {
  if (run.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS)
    throw new ConflictException('ATTEMPT_TERMINAL_CONFLICT');
  if (expired(run)) throw new ConflictException('ATTEMPT_EXPIRED');
}
