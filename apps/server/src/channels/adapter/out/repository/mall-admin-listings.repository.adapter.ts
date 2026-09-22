import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, type SourceImportRun } from '@prisma/client';
import {
  MALL_ADMIN_LISTING_READERS,
  MALL_ADMIN_LISTINGS_PARSER_VERSION,
  MALL_ADMIN_LISTINGS_SOURCE_TYPE,
  MallAdminListingsBeginSchema,
  MallAdminListingsPlanSchema,
  MallAdminListingsStoredPlanSchema,
  type MallAdminListingsPlan,
  type MallAdminListingsPublication,
} from '@kiditem/shared/mall-admin-listings';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE } from '../../../../common/operator-cancel';
import {
  advanceProductMappingGeneration,
  lockProductMapping,
} from '../../../../common/product-mapping-generation';
import { allocatePublicationSequence } from '../../../../common/publication-sequence';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { MallAdminListingsRepositoryPort } from '../../../application/port/out/repository/mall-admin-listings.repository.port';
import {
  mallAdminListingProducts,
  resolveMallAdminRowCodes,
  mallAdminStatusCounts,
  mallAdminSubmissionProblem,
} from '../../../domain/mall-admin-listings';
import { readMallAccountRowIds } from '../../../read/mall-account-rows';
import {
  MALL_ADMIN_LISTINGS_EXPIRED_MESSAGE,
  mallAdminListingsControl,
  mallAdminListingsRunWhere,
  readMallAdminListingsSource,
} from '../../../read/mall-admin-listings.reader';
import { upsertChannelCatalogIdentities } from './channel-catalog-identity-upsert';
import { deactivateSourceAbsence } from './source-scoped-absence';

const SOURCE_TYPE = MALL_ADMIN_LISTINGS_SOURCE_TYPE;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;
/**
 * 몰 상품 목록 전체와 (아이스크림몰은) 상품마다 상세 한 번을 읽는다. 몇 분이면 끝난다 —
 * 이 안에 끝나지 않은 시도는 버린다.
 */
const ATTEMPT_LEASE_MS = 20 * 60_000;
const INCOMPLETE_MESSAGE = '몰 상품 목록을 모두 읽지 못해 저장하지 않았습니다. 다시 가져와 주세요.';

@Injectable()
export class MallAdminListingsRepositoryAdapter implements MallAdminListingsRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  begin(input: Parameters<MallAdminListingsRepositoryPort['begin']>[0]) {
    const request = MallAdminListingsBeginSchema.parse(input.request);
    if (!input.idempotencyKey || input.idempotencyKey.length > 128) {
      throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
    }
    const fingerprint = hash(request);
    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, input.organizationId);
      const prior = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (prior && prior.requestFingerprint !== fingerprint) {
        throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
      }
      const channelAccountId = (await readMallAccountRowIds(
        tx,
        input.organizationId,
        [request.mallKey],
      )).get(request.mallKey);
      const active = channelAccountId
        ? await tx.sourceImportRun.findFirst({
            where: {
              ...mallAdminListingsRunWhere(input.organizationId, channelAccountId),
              status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
            },
          })
        : null;
      if (active && expired(active)) {
        await this.failRun(tx, active, 'ATTEMPT_EXPIRED', MALL_ADMIN_LISTINGS_EXPIRED_MESSAGE);
      }
      if (prior) return control(await findAttempt(tx, input.organizationId, prior.id));
      if (!channelAccountId) throw new NotFoundException('MALL_ADMIN_ACCOUNT_NOT_FOUND');
      if (active && !expired(active)) {
        throw new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId: active.id });
      }
      const reader = MALL_ADMIN_LISTING_READERS[request.mallKey];
      const plan: MallAdminListingsPlan = MallAdminListingsPlanSchema.parse({
        sourceType: SOURCE_TYPE,
        parserVersion: MALL_ADMIN_LISTINGS_PARSER_VERSION,
        mallKey: request.mallKey,
        channelAccountId,
        sourceOrigin: reader.origin,
        pageSize: reader.pageSize,
      });
      const last = await tx.sourceImportRun.aggregate({
        where: mallAdminListingsRunWhere(input.organizationId, channelAccountId),
        _max: { freshnessGeneration: true },
      });
      return control(await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId,
          createdBy: input.userId,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
          plan,
          parserVersion: MALL_ADMIN_LISTINGS_PARSER_VERSION,
          freshnessGeneration: (last._max.freshnessGeneration ?? 0n) + 1n,
          expiresAt: new Date(Date.now() + ATTEMPT_LEASE_MS),
        },
      }));
    }, TRANSACTION_OPTIONS);
  }

  async readAttempt(input: Parameters<MallAdminListingsRepositoryPort['readAttempt']>[0]) {
    return control(await findAttempt(this.prisma, input.organizationId, input.attemptId));
  }

  readSource(input: Parameters<MallAdminListingsRepositoryPort['readSource']>[0]) {
    return this.prisma.$transaction(
      (tx) => readMallAdminListingsSource(tx, input.organizationId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  complete(input: Parameters<MallAdminListingsRepositoryPort['complete']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, input.organizationId);
      const run = await findAttempt(tx, input.organizationId, input.attemptId);
      fence(run, input.token);
      const plan = MallAdminListingsPlanSchema.parse(run.plan);
      const { collectionRunId: _runId, ...evidence } = input.submission.collection;
      const rows = [...input.submission.rows].sort((left, right) =>
        left.mallProductCode.localeCompare(right.mallProductCode));
      const canonical = JSON.stringify({ collection: evidence, rows, proof: input.submission.proof });
      const contentChecksum = createHash('sha256').update(canonical).digest('hex');
      if (
        (run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
          || run.status === SOURCE_IMPORT_RUN_FAILED_STATUS)
        && run.contentChecksum === contentChecksum
      ) return control(run);
      writable(run);
      const receipt = { contentChecksum, contentByteCount: Buffer.byteLength(canonical) };

      const problem = mallAdminSubmissionProblem(plan, run.id, input.submission);
      if (problem === 'plan_fence_lost') throw new ConflictException('MALL_ADMIN_PLAN_FENCE_LOST');
      if (problem) {
        await tx.sourceImportRun.update({
          where: { id: run.id, organizationId: input.organizationId },
          data: { ...receipt, qualityReport: { problem } },
        });
        return control(await this.failRun(tx, run, 'MALL_COLLECTION_INCOMPLETE', INCOMPLETE_MESSAGE));
      }

      // 계획을 세운 뒤 몰 계정 행이 바뀌었으면 쇼핑몰 현황이 보는 행과 다른 행에 쓰게 된다.
      const account = (await readMallAccountRowIds(tx, input.organizationId, [plan.mallKey]))
        .get(plan.mallKey);
      if (account !== plan.channelAccountId) {
        await tx.sourceImportRun.update({
          where: { id: run.id, organizationId: input.organizationId },
          data: receipt,
        });
        return control(await this.failRun(
          tx,
          run,
          'MALL_ACCOUNT_CHANGED',
          '가져오는 사이 몰 계정이 바뀌어 저장하지 않았습니다. 다시 가져와 주세요.',
        ));
      }

      // 사방넷이 다른 번호로 준 상품은 그 번호의 리스팅에 레시피가 붙어 있다 — 그 번호가 이 계정에 있으면 그 번호를 쓴다.
      const candidateCodes = [...new Set(rows.flatMap((row) => row.alternateCodes ?? []))];
      const existingCodes = candidateCodes.length === 0
        ? new Set<string>()
        : new Set((await tx.channelListing.findMany({
          where: {
            organizationId: input.organizationId,
            channelAccountId: plan.channelAccountId,
            externalId: { in: [...candidateCodes, ...rows.map((row) => row.mallProductCode)] },
          },
          select: { externalId: true },
        })).map((listing) => listing.externalId));
      const products = mallAdminListingProducts(plan, resolveMallAdminRowCodes(rows, existingCodes));
      let mappingChanged = false;
      if (products.length > 0) {
        const upserted = await upsertChannelCatalogIdentities(tx, {
          organizationId: input.organizationId,
          channelAccountId: plan.channelAccountId,
          lastImportRunId: run.id,
          rawSource: SOURCE_TYPE,
          products,
        });
        mappingChanged = upserted.mappingIdentityChanged;
        // 몰이 목록에 사진을 함께 주는 몰(온채널)은 그 주소를 리스팅에 남긴다. 신원 upsert 는
        // 사진을 모르므로 여기서 값이 달라진 줄만 쓴다.
        for (const product of products) {
          const listingId = upserted.listingIds.get(product.externalProductId);
          if (!listingId || !product.imageUrl) continue;
          await tx.channelListing.updateMany({
            where: { id: listingId, organizationId: input.organizationId, imageUrl: null },
            data: { imageUrl: product.imageUrl },
          });
        }
      }
      const deactivated = await deactivateSourceAbsence(tx, {
        organizationId: input.organizationId,
        channelAccountId: plan.channelAccountId,
        sourceType: SOURCE_TYPE,
        sourceImportRunId: run.id,
        externalIds: products.map((product) => product.externalProductId),
      });
      mappingChanged ||= deactivated.listings > 0 || deactivated.options > 0;
      if (mappingChanged) await advanceProductMappingGeneration(tx, input.organizationId);

      const publication: MallAdminListingsPublication = {
        listings: products.length,
        deactivated: deactivated.listings,
        missingNames: rows.filter((row) => row.sellpiaName === null).length,
        codedListings: rows.filter((row) => row.sellerCode !== null).length,
        statuses: mallAdminStatusCounts(products),
      };
      const complete = await tx.sourceImportRun.update({
        where: { id: run.id, organizationId: input.organizationId },
        data: {
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          rowCount: rows.length,
          importedAt: new Date(),
          ...receipt,
          providerBackedEmptyProof: rows.length === 0,
          qualityReport: {
            proof: input.submission.proof,
            collection: evidence,
            publication,
            includedCount: rows.length,
            excludedCount: 0,
            warningCount: publication.missingNames,
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
        dedupeKey: dedupeKey(run),
        attemptId: run.id,
      });
      return control(complete);
    }, TRANSACTION_OPTIONS);
  }

  fail(input: Parameters<MallAdminListingsRepositoryPort['fail']>[0]) {
    if (
      !input.code
      || input.code.length > 100
      || !input.message
      || input.message.length > 300
    ) throw new BadRequestException('MALL_ADMIN_FAILURE_INVALID');
    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, input.organizationId);
      const run = await findAttempt(tx, input.organizationId, input.attemptId);
      fence(run, input.token);
      if (
        run.status === SOURCE_IMPORT_RUN_FAILED_STATUS
        && run.errorCode === input.code
        && run.errorMessage === input.message
      ) return control(run);
      writable(run);
      return control(await this.failRun(tx, run, input.code, input.message));
    }, TRANSACTION_OPTIONS);
  }

  cancel(input: Parameters<MallAdminListingsRepositoryPort['cancel']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, input.organizationId);
      const run = await findAttempt(tx, input.organizationId, input.attemptId);
      if (run.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) return control(run);
      if (expired(run)) {
        return control(await this.failRun(
          tx,
          run,
          'ATTEMPT_EXPIRED',
          MALL_ADMIN_LISTINGS_EXPIRED_MESSAGE,
        ));
      }
      return control(await this.failRun(tx, run, OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE));
    }, TRANSACTION_OPTIONS);
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
    // 실패를 적는 길이다. 지난 계약으로 열린 시도라도 여기서 막히면 진짜 까닭이 가려진다.
    const plan = MallAdminListingsStoredPlanSchema.parse(run.plan);
    await this.alerts.recordTerminalOutcome(tx, {
      code,
      organizationId: run.organizationId,
      sourceType: SOURCE_TYPE,
      dedupeKey: dedupeKey(run),
      attemptId: run.id,
      title: `${MALL_ADMIN_LISTING_READERS[plan.mallKey].mallName} 등록 상품 가져오기 실패`,
      message,
      href: '/mall-channels',
    });
    return failed;
  }
}

/** 몰 계정마다 알림 하나. 그 몰이 다시 가져오면 닫힌다. */
function dedupeKey(run: Pick<SourceImportRun, 'organizationId' | 'channelAccountId'>) {
  return `channels:mall-admin-listings:${run.organizationId}:${run.channelAccountId ?? 'none'}`;
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function expired(run: Pick<SourceImportRun, 'expiresAt'>) {
  return !run.expiresAt || run.expiresAt.getTime() <= Date.now();
}

function control(run: SourceImportRun) {
  return mallAdminListingsControl(run);
}

async function findAttempt(
  client: Pick<Prisma.TransactionClient, 'sourceImportRun'>,
  organizationId: string,
  id: string,
) {
  const run = await client.sourceImportRun.findFirst({
    where: { id, ...mallAdminListingsRunWhere(organizationId) },
  });
  if (!run) throw new NotFoundException('MALL_ADMIN_ATTEMPT_NOT_FOUND');
  return run;
}

async function lockSource(tx: Prisma.TransactionClient, organizationId: string) {
  // 발행이 몰 계정의 리스팅을 바꾸므로 매칭 잠금을 먼저 잡는다.
  await lockProductMapping(tx, organizationId);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mall-admin-listings:${organizationId}`}, 0))::text`;
  // queryraw-tenancy-exempt: organization-scoped advisory lock
  // The key includes the organization; this query reads no rows.
}

function fence(run: SourceImportRun, token: string) {
  if (!token || token !== run.attemptToken) throw new ConflictException('ATTEMPT_FENCE_LOST');
}

function writable(run: SourceImportRun) {
  if (run.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
    throw new ConflictException('ATTEMPT_TERMINAL_CONFLICT');
  }
  if (expired(run)) throw new ConflictException('ATTEMPT_EXPIRED');
}
