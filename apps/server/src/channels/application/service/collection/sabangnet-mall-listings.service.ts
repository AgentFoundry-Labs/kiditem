import { Inject, Injectable } from '@nestjs/common';
import {
  SABANGNET_LOGIN_LOCK_KEY,
  SABANGNET_MALL_LISTINGS_CHUNK_KIND,
  SABANGNET_MALL_LISTINGS_KIND,
  SABANGNET_MALL_LISTINGS_SCAN_CHUNK_KIND,
  SabangnetMallListingsScopeSchema,
} from '@kiditem/shared/channels-operations';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import {
  SABANGNET_ADMIN_ORIGIN,
  SABANGNET_MALL_LISTING_LIST_PATH,
  SABANGNET_MALL_LISTING_PAGE_SIZE,
  SABANGNET_MALL_LISTINGS_PARSER_VERSION,
  SABANGNET_MALL_LISTINGS_SOURCE_TYPE,
  SabangnetMallListingRowSchema,
  SabangnetMallListingsPlanSchema,
  SabangnetMallListingsResultSchema,
  SabangnetMallListingsScanSchema,
  type SabangnetMallListingsResult,
  type SabangnetMallListingsSource,
} from '@kiditem/shared/sabangnet-mall-listings';
import type { ZodTypeAny, z } from 'zod';
import { businessDateKey, kstBusinessDate } from '../../../../common/kst';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { OPERATION_PORT, type OperationPort } from '../../../../common/operation/application/port/in/operation.port';
import { sabangnetSubmissionProblem } from '../../../domain/collection/sabangnet-mall-listings';
import type { SabangnetMallListingsPort } from '../../port/in/sabangnet-mall-listings.port';
import {
  SABANGNET_MALL_LISTINGS_REPOSITORY_PORT,
  type SabangnetMallListingsRepositoryPort,
} from '../../port/out/repository/sabangnet-mall-listings.repository.port';

/** 사방넷 첫 송신일 검색의 시작. 그 전 기록은 없다. */
const SEARCH_FROM = '20000101';

type PlanContext = { organizationId: string; userId: string | null };
type FinalizeContext = { tx: OwnerTransaction; organizationId: string; operationId: string; plan: Record<string, unknown> };

/**
 * `channels.sabangnet_mall_listings`(KID-363)의 owner 일: plan은 몰 계정 행을 얼리고 사방넷 로그인 잠금 하나를 잡는다
 * (조직마다 사방넷 로그인이 하나이고 한 실행이 몰 여러 곳을 읽는다). finalize는 `listing_scan` 증거로 송신 기록 전체인지
 * 확인한 뒤에만 몰마다 발행한다. 화면의 현재는 몰 계정 행 + 이 kind의 최근 실행이다.
 */
@Injectable()
export class SabangnetMallListingsService implements SabangnetMallListingsPort {
  constructor(
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
    @Inject(SABANGNET_MALL_LISTINGS_REPOSITORY_PORT) private readonly repository: SabangnetMallListingsRepositoryPort,
  ) {}

  async readSource(organizationId: string): Promise<SabangnetMallListingsSource> {
    const [malls, latest, succeeded] = await Promise.all([
      this.repository.readMalls(organizationId),
      this.operations.list(organizationId, { kinds: [SABANGNET_MALL_LISTINGS_KIND], limit: 1 }),
      this.operations.list(organizationId, { kinds: [SABANGNET_MALL_LISTINGS_KIND], status: 'succeeded', limit: 1 }),
    ]);
    const latestSucceeded = succeeded.operations[0] ?? null;
    const result = SabangnetMallListingsResultSchema.safeParse(latestSucceeded?.result);
    return {
      ready: malls.some((mall) => mall.channelAccountId !== null),
      malls,
      latestOperation: latest.operations[0] ?? null,
      latestSucceeded,
      latestPublication: result.success ? result.data.malls : [],
    };
  }

  async plan(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult> {
    if (!SabangnetMallListingsScopeSchema.safeParse(scope).success) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'sabangnet_scope_invalid' } });
    }
    const malls = (await this.repository.readMalls(context.organizationId)).flatMap((mall) => mall.channelAccountId
      ? [{ mallKey: mall.mallKey, channelAccountId: mall.channelAccountId, sabangnetShopIds: mall.sabangnetShopIds }]
      : []);
    if (malls.length === 0) {
      throw new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND', { details: { reason: 'sabangnet_mall_accounts_missing' } });
    }
    const plan = SabangnetMallListingsPlanSchema.parse({
      sourceType: SABANGNET_MALL_LISTINGS_SOURCE_TYPE,
      parserVersion: SABANGNET_MALL_LISTINGS_PARSER_VERSION,
      sourceOrigin: SABANGNET_ADMIN_ORIGIN,
      listPath: SABANGNET_MALL_LISTING_LIST_PATH,
      pageSize: SABANGNET_MALL_LISTING_PAGE_SIZE,
      dateFrom: SEARCH_FROM,
      dateTo: businessDateKey(kstBusinessDate(new Date())).replaceAll('-', ''),
      malls,
    });
    return { lockKeys: [SABANGNET_LOGIN_LOCK_KEY], plan };
  }

  async finalize(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<SabangnetMallListingsResult> {
    const plan = SabangnetMallListingsPlanSchema.parse(context.plan);
    const rows = chunkItems(chunks, SABANGNET_MALL_LISTINGS_CHUNK_KIND, SabangnetMallListingRowSchema);
    const scans = chunkItems(chunks, SABANGNET_MALL_LISTINGS_SCAN_CHUNK_KIND, SabangnetMallListingsScanSchema);
    if (scans.length !== 1) {
      throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', { details: { reason: 'sabangnet_scan_missing' } });
    }
    const problem = sabangnetSubmissionProblem(plan, scans[0]!, rows);
    if (problem) throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', { details: { reason: problem } });
    const malls = await this.repository.publish(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      plan,
      rows,
    });
    return SabangnetMallListingsResultSchema.parse({ malls, rows: rows.length });
  }
}

/** 한 chunkKind의 원소를 순번 순서로 이어 검증한다. 모양이 틀리면 저장하지 않는다. */
function chunkItems<S extends ZodTypeAny>(chunks: OperationStagedChunk[], chunkKind: string, schema: S): Array<z.output<S>> {
  return chunks
    .filter((chunk) => chunk.chunkKind === chunkKind)
    .sort((left, right) => left.sequence - right.sequence)
    .flatMap((chunk) => chunk.payload.map((item) => {
      const parsed = schema.safeParse(item);
      if (!parsed.success) {
        throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', {
          details: { reason: 'sabangnet_chunk_item_invalid', chunkKind, sequence: chunk.sequence },
        });
      }
      return parsed.data as z.output<S>;
    }));
}
