import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, type SourceImportRun } from '@prisma/client';
import {
  SABANGNET_ADMIN_ORIGIN,
  SABANGNET_MALL_LISTING_LIST_PATH,
  SABANGNET_MALL_LISTING_PAGE_SIZE,
  SABANGNET_MALL_LISTINGS_PARSER_VERSION,
  SABANGNET_MALL_LISTINGS_SOURCE_TYPE,
  SabangnetMallListingsBeginSchema,
  SabangnetMallListingsPlanSchema,
  type SabangnetMallListingsPlan,
  type SabangnetMallListingsPublication,
} from '@kiditem/shared/sabangnet-mall-listings';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { businessDateKey, kstBusinessDate } from '../../../../common/kst';
import { OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE } from '../../../../common/operator-cancel';
import { lockProductMapping } from '../../../../common/product-mapping-generation';
import {
  CHANNELS_PRODUCT_MAPPING_GENERATION_PORT,
  type ChannelsProductMappingGenerationPort,
} from '../../../application/port/out/cross-domain/product-mapping-generation.port';
import { allocatePublicationSequence } from '../../../../common/publication-sequence';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { SabangnetMallListingsRepositoryPort } from '../../../application/port/out/repository/sabangnet-mall-listings.repository.port';
import {
  sabangnetListingsByAccount,
  sabangnetSubmissionProblem,
} from '../../../domain/collection/sabangnet-mall-listings';
import { readMallAccountRowIds } from './mall-account-rows';
import {
  readSabangnetMallListingsSource,
  SABANGNET_MALL_LISTINGS_EXPIRED_MESSAGE,
  sabangnetMallListingsControl,
  sabangnetMallListingsRunWhere,
} from './sabangnet-mall-listings.reader';
import { upsertChannelCatalogIdentities } from './channel-catalog-identity-upsert';
import { deactivateCatalogAbsence } from './catalog-absence';

const SOURCE_TYPE = SABANGNET_MALL_LISTINGS_SOURCE_TYPE;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;
/** 사방넷 송신 기록 전체는 몇십 초면 읽는다. 이 안에 끝나지 않은 시도는 버린다. */
const ATTEMPT_LEASE_MS = 10 * 60_000;
/** 사방넷 첫 송신일 검색의 시작. 그 전 기록은 없다. */
const SEARCH_FROM = '20000101';
const INCOMPLETE_MESSAGE = '사방넷 송신 기록을 모두 읽지 못해 저장하지 않았습니다. 다시 가져와 주세요.';

@Injectable()
export class SabangnetMallListingsRepositoryAdapter implements SabangnetMallListingsRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
    @Inject(CHANNELS_PRODUCT_MAPPING_GENERATION_PORT)
    private readonly productMapping: ChannelsProductMappingGenerationPort,
  ) {}

  begin(input: Parameters<SabangnetMallListingsRepositoryPort['begin']>[0]) {
    const request = SabangnetMallListingsBeginSchema.parse(input.request);
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
      const active = await tx.sourceImportRun.findFirst({
        where: {
          ...sabangnetMallListingsRunWhere(input.organizationId),
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        },
      });
      if (active && expired(active)) {
        await this.failRun(tx, active, 'ATTEMPT_EXPIRED', SABANGNET_MALL_LISTINGS_EXPIRED_MESSAGE);
      }
      if (prior) return control(await findAttempt(tx, input.organizationId, prior.id));
      if (active && !expired(active)) {
        throw new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId: active.id });
      }
      const source = await readSabangnetMallListingsSource(tx, input.organizationId);
      const malls = source.malls.flatMap((mall) => mall.channelAccountId
        ? [{
            mallKey: mall.mallKey,
            channelAccountId: mall.channelAccountId,
            sabangnetShopIds: mall.sabangnetShopIds,
          }]
        : []);
      if (malls.length === 0) {
        throw new NotFoundException('SABANGNET_MALL_ACCOUNTS_NOT_FOUND');
      }
      const plan: SabangnetMallListingsPlan = SabangnetMallListingsPlanSchema.parse({
        sourceType: SOURCE_TYPE,
        parserVersion: SABANGNET_MALL_LISTINGS_PARSER_VERSION,
        sourceOrigin: SABANGNET_ADMIN_ORIGIN,
        listPath: SABANGNET_MALL_LISTING_LIST_PATH,
        pageSize: SABANGNET_MALL_LISTING_PAGE_SIZE,
        dateFrom: SEARCH_FROM,
        dateTo: businessDateKey(kstBusinessDate(new Date())).replaceAll('-', ''),
        malls,
      });
      const last = await tx.sourceImportRun.aggregate({
        where: { organizationId: input.organizationId, sourceType: SOURCE_TYPE },
        _max: { freshnessGeneration: true },
      });
      return control(await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          createdBy: input.userId,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
          plan,
          parserVersion: SABANGNET_MALL_LISTINGS_PARSER_VERSION,
          freshnessGeneration: (last._max.freshnessGeneration ?? 0n) + 1n,
          expiresAt: new Date(Date.now() + ATTEMPT_LEASE_MS),
        },
      }));
    }, TRANSACTION_OPTIONS);
  }

  async readAttempt(input: Parameters<SabangnetMallListingsRepositoryPort['readAttempt']>[0]) {
    return control(await findAttempt(this.prisma, input.organizationId, input.attemptId));
  }

  readSource(input: Parameters<SabangnetMallListingsRepositoryPort['readSource']>[0]) {
    return this.prisma.$transaction(
      (tx) => readSabangnetMallListingsSource(tx, input.organizationId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  complete(input: Parameters<SabangnetMallListingsRepositoryPort['complete']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, input.organizationId);
      const run = await findAttempt(tx, input.organizationId, input.attemptId);
      fence(run, input.token);
      const plan = SabangnetMallListingsPlanSchema.parse(run.plan);
      const { collectionRunId: _runId, ...evidence } = input.submission.collection;
      const rows = [...input.submission.rows].sort((left, right) =>
        left.sendSerial.localeCompare(right.sendSerial));
      const canonical = JSON.stringify({ collection: evidence, rows, proof: input.submission.proof });
      const contentChecksum = createHash('sha256').update(canonical).digest('hex');
      if (
        (run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
          || run.status === SOURCE_IMPORT_RUN_FAILED_STATUS)
        && run.contentChecksum === contentChecksum
      ) return control(run);
      writable(run);
      const receipt = { contentChecksum, contentByteCount: Buffer.byteLength(canonical) };

      const problem = sabangnetSubmissionProblem(plan, run.id, input.submission);
      if (problem === 'plan_fence_lost') throw new ConflictException('SABANGNET_PLAN_FENCE_LOST');
      if (problem) {
        await tx.sourceImportRun.update({
          where: { id: run.id, organizationId: input.organizationId },
          data: { ...receipt, qualityReport: { problem } },
        });
        return control(await this.failRun(
          tx,
          run,
          'SABANGNET_COLLECTION_INCOMPLETE',
          INCOMPLETE_MESSAGE,
        ));
      }

      // 계획을 세운 뒤 몰 계정 행이 바뀌었으면 쇼핑몰 현황이 보는 행과 다른 행에 쓰게 된다.
      const accounts = await readMallAccountRowIds(
        tx,
        input.organizationId,
        plan.malls.map((mall) => mall.mallKey),
      );
      if (plan.malls.some((mall) => accounts.get(mall.mallKey) !== mall.channelAccountId)) {
        await tx.sourceImportRun.update({
          where: { id: run.id, organizationId: input.organizationId },
          data: receipt,
        });
        return control(await this.failRun(
          tx,
          run,
          'SABANGNET_MALL_ACCOUNT_CHANGED',
          '가져오는 사이 몰 계정이 바뀌어 저장하지 않았습니다. 다시 가져와 주세요.',
        ));
      }

      const products = sabangnetListingsByAccount(plan, rows);
      const publication: SabangnetMallListingsPublication[] = [];
      let mappingChanged = false;
      for (const mall of plan.malls) {
        const listings = products.get(mall.channelAccountId) ?? [];
        if (listings.length > 0) {
          const upserted = await upsertChannelCatalogIdentities(tx, {
            organizationId: input.organizationId,
            channelAccountId: mall.channelAccountId,
            lastImportRunId: run.id,
            rawSource: SOURCE_TYPE,
            // 사방넷 송신 기록은 판매가·모델명(=판매자코드)·바코드를 싣지만 모델번호 칸은 없다.
            unobservedOptionFields: ['modelNumber'],
            products: listings,
          });
          mappingChanged ||= upserted.mappingIdentityChanged;
        }
        const present = listings.map((listing) => listing.externalProductId);
        const deactivated = await deactivateCatalogAbsence(tx, {
          organizationId: input.organizationId,
          channelAccountId: mall.channelAccountId,
          sourceImportRunId: run.id,
          // 같은 몰 계정에 KidItem 등록이나 몰 관리자 수집이 만든 행이 함께 있다.
          scope: { kind: 'source', sourceType: SOURCE_TYPE },
          presentExternalProductIds: present,
          // 이 원천은 리스팅 하나에 옵션 한 줄이고 둘의 외부 ID 가 같다.
          presentExternalOptionIds: present,
        });
        mappingChanged ||= deactivated.listings > 0 || deactivated.options > 0;
        publication.push({
          mallKey: mall.mallKey,
          channelAccountId: mall.channelAccountId,
          listings: listings.length,
          deactivated: deactivated.listings,
        });
      }
      if (mappingChanged) await this.productMapping.advance(tx, input.organizationId);

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
            malls: publication,
            includedCount: rows.length,
            excludedCount: input.submission.collection.recordsRead - rows.length,
            warningCount: input.submission.collection.missingMallCode,
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
        dedupeKey: dedupeKey(input.organizationId),
        attemptId: run.id,
      });
      return control(complete);
    }, TRANSACTION_OPTIONS);
  }

  fail(input: Parameters<SabangnetMallListingsRepositoryPort['fail']>[0]) {
    if (
      !input.code
      || input.code.length > 100
      || !input.message
      || input.message.length > 300
    ) throw new BadRequestException('SABANGNET_FAILURE_INVALID');
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

  cancel(input: Parameters<SabangnetMallListingsRepositoryPort['cancel']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      await lockSource(tx, input.organizationId);
      const run = await findAttempt(tx, input.organizationId, input.attemptId);
      if (run.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) return control(run);
      if (expired(run)) {
        return control(await this.failRun(
          tx,
          run,
          'ATTEMPT_EXPIRED',
          SABANGNET_MALL_LISTINGS_EXPIRED_MESSAGE,
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
    await this.alerts.recordTerminalOutcome(tx, {
      code,
      organizationId: run.organizationId,
      sourceType: SOURCE_TYPE,
      dedupeKey: dedupeKey(run.organizationId),
      attemptId: run.id,
      title: '사방넷 등록 상품 가져오기 실패',
      message,
      href: '/mall-channels',
    });
    return failed;
  }
}

function dedupeKey(organizationId: string) {
  return `channels:sabangnet-mall-listings:${organizationId}`;
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function expired(run: Pick<SourceImportRun, 'expiresAt'>) {
  return !run.expiresAt || run.expiresAt.getTime() <= Date.now();
}

function control(run: SourceImportRun) {
  return sabangnetMallListingsControl(run);
}

async function findAttempt(
  client: Pick<Prisma.TransactionClient, 'sourceImportRun'>,
  organizationId: string,
  id: string,
) {
  const run = await client.sourceImportRun.findFirst({
    where: { id, ...sabangnetMallListingsRunWhere(organizationId) },
  });
  if (!run) throw new NotFoundException('SABANGNET_ATTEMPT_NOT_FOUND');
  return run;
}

async function lockSource(tx: Prisma.TransactionClient, organizationId: string) {
  // 발행이 몰 계정 여러 곳의 리스팅을 바꾸므로 매칭 잠금을 먼저 잡는다.
  await lockProductMapping(tx, organizationId);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sabangnet-mall-listings:${organizationId}`}, 0))::text`;
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
