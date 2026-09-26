import { Inject, Injectable } from '@nestjs/common';
import {
  MALL_ADMIN_LISTINGS_CHUNK_KIND,
  MALL_ADMIN_LISTINGS_KIND,
  MALL_ADMIN_LISTINGS_SCAN_CHUNK_KIND,
  MallAdminListingsScopeSchema,
  isMallAdminListingOperationMall,
} from '@kiditem/shared/channels-operations';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import {
  MALL_ADMIN_LISTING_READERS,
  MALL_ADMIN_LISTINGS_PARSER_VERSION,
  MALL_ADMIN_LISTINGS_SOURCE_TYPE,
  MallAdminListingRowSchema,
  MallAdminListingsBeginSchema,
  MallAdminListingsPlanSchema,
  MallAdminListingsPublicationSchema,
  MallAdminListingsResultSchema,
  MallAdminListingsScanSchema,
  MallAdminListingsSubmissionSchema,
  isMallAdminListingMallKey,
  type MallAdminListingsResult,
} from '@kiditem/shared/mall-admin-listings';
import { accountLockKey, type OperationPlanResult, type OperationStagedChunk, type OperationView } from '@kiditem/shared/operation';
import type { ZodTypeAny, z } from 'zod';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { OPERATION_PORT, type OperationPort } from '../../../../common/operation/application/port/in/operation.port';
import { ChannelInputError as BadRequestException } from '../../../domain/exception/channel-business-error';
import { mallAdminScanProblem } from '../../../domain/collection/mall-admin-listings';
import type { MallAdminListingsOperationPort } from '../../port/in/mall-admin-listings-operation.port';
import type { MallAdminListingsPort } from '../../port/in/mall-admin-listings.port';
import {
  MALL_ADMIN_LISTINGS_OPERATION_REPOSITORY_PORT,
  MALL_ADMIN_LISTINGS_REPOSITORY_PORT,
  type MallAdminListingsOperationRepositoryPort,
  type MallAdminListingsRepositoryPort,
} from '../../port/out/repository/mall-admin-listings.repository.port';

type PlanContext = { organizationId: string; userId: string | null };
type FinalizeContext = { tx: OwnerTransaction; organizationId: string; operationId: string; plan: Record<string, unknown> };

/** 화면이 몰마다 최근 실행을 찾으려고 읽는 최근 실행 수(1차 몰 넷이 나눠 쓴다). */
const RECENT_OPERATIONS = 50;

/**
 * 몰 관리자 직접 가져오기 owner. 1차 몰(`MALL_ADMIN_LISTING_OPERATION_MALLS`)은 실행 kind
 * `channels.mall_admin_listings`(KID-363)로 — plan은 그 몰의 계정 행을 얼리고 `account:<id>` 잠금을 잡고, finalize는
 * `listing_scan` 증거로 목록 전체인지 확인한 뒤 발행한다. 나머지 몰은 옮겨질 때까지 옛 시도 경로다.
 */
@Injectable()
export class MallAdminListingsService implements MallAdminListingsPort, MallAdminListingsOperationPort {
  constructor(
    @Inject(MALL_ADMIN_LISTINGS_REPOSITORY_PORT) private readonly repository: MallAdminListingsRepositoryPort,
    @Inject(MALL_ADMIN_LISTINGS_OPERATION_REPOSITORY_PORT) private readonly operationRepository: MallAdminListingsOperationRepositoryPort,
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
  ) {}

  begin(input: Parameters<MallAdminListingsPort['begin']>[0]) {
    const parsed = MallAdminListingsBeginSchema.safeParse(input.request);
    if (!parsed.success) throw new BadRequestException('MALL_ADMIN_PLAN_INVALID');
    return this.repository.begin({ ...input, request: parsed.data });
  }

  readAttempt(input: Parameters<MallAdminListingsPort['readAttempt']>[0]) {
    return this.repository.readAttempt(input);
  }

  /** 몰마다의 현재. 옮긴 몰은 이 kind의 최근 실행·최근 성공 실행(그 몰 plan)과 그 성공의 발행 결과로 채운다. */
  async readSource(input: Parameters<MallAdminListingsPort['readSource']>[0]) {
    const [source, recent, succeeded] = await Promise.all([
      this.repository.readSource(input),
      this.operations.list(input.organizationId, { kinds: [MALL_ADMIN_LISTINGS_KIND], limit: RECENT_OPERATIONS }),
      this.operations.list(input.organizationId, { kinds: [MALL_ADMIN_LISTINGS_KIND], status: 'succeeded', limit: RECENT_OPERATIONS }),
    ]);
    const forMall = (operations: OperationView[], mallKey: string, channelAccountId: string | null) =>
      operations.find((operation) => operation.plan?.mallKey === mallKey && operation.plan?.channelAccountId === channelAccountId) ?? null;
    return {
      malls: source.malls.map((mall) => {
        if (!isMallAdminListingOperationMall(mall.mallKey)) return mall;
        const latestSucceeded = forMall(succeeded.operations, mall.mallKey, mall.channelAccountId);
        const publication = MallAdminListingsPublicationSchema.safeParse(latestSucceeded?.result
          ? Object.fromEntries(Object.entries(latestSucceeded.result).filter(([key]) => key !== 'rows'))
          : null);
        return {
          ...mall,
          latestOperation: forMall(recent.operations, mall.mallKey, mall.channelAccountId),
          latestSucceeded,
          latestPublication: publication.success ? publication.data : null,
        };
      }),
    };
  }

  complete(input: Parameters<MallAdminListingsPort['complete']>[0]) {
    const parsed = MallAdminListingsSubmissionSchema.safeParse(input.submission);
    if (!parsed.success) throw new BadRequestException('MALL_ADMIN_EVIDENCE_INVALID');
    return this.repository.complete({ ...input, submission: parsed.data });
  }

  fail(input: Parameters<MallAdminListingsPort['fail']>[0]) {
    return this.repository.fail(input);
  }

  cancel(input: Parameters<MallAdminListingsPort['cancel']>[0]) {
    return this.repository.cancel(input);
  }

  async plan(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult> {
    const parsed = MallAdminListingsScopeSchema.safeParse(scope);
    if (!parsed.success) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'mall_admin_scope_invalid' } });
    }
    const { mallKey } = parsed.data;
    if (!isMallAdminListingOperationMall(mallKey) || !isMallAdminListingMallKey(mallKey)) {
      // 아직 옮기지 않은 몰은 옛 시도 경로가 받는다(expand–contract).
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'mall_admin_operation_mall_unsupported', mallKey } });
    }
    const channelAccountId = await this.operationRepository.readMallAccountId(context.organizationId, mallKey);
    if (!channelAccountId) throw new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND', { details: { mallKey } });
    if (channelAccountId !== parsed.data.channelAccountId.toLowerCase()) {
      // 화면이 본 계정 행과 몰 허브가 고르는 행이 다르다 — 쇼핑몰 현황과 다른 행에 쓰게 된다.
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'mall_admin_account_mismatch', mallKey } });
    }
    const reader = MALL_ADMIN_LISTING_READERS[mallKey];
    const plan = MallAdminListingsPlanSchema.parse({
      sourceType: MALL_ADMIN_LISTINGS_SOURCE_TYPE,
      parserVersion: MALL_ADMIN_LISTINGS_PARSER_VERSION,
      mallKey,
      channelAccountId,
      sourceOrigin: reader.origin,
      pageSize: reader.pageSize,
    });
    return { lockKeys: [accountLockKey(channelAccountId)], plan };
  }

  async finalize(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<MallAdminListingsResult> {
    const plan = MallAdminListingsPlanSchema.parse(context.plan);
    const rows = chunkItems(chunks, MALL_ADMIN_LISTINGS_CHUNK_KIND, MallAdminListingRowSchema);
    const scans = chunkItems(chunks, MALL_ADMIN_LISTINGS_SCAN_CHUNK_KIND, MallAdminListingsScanSchema);
    if (scans.length !== 1) {
      throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', { details: { reason: 'mall_admin_scan_missing' } });
    }
    const problem = mallAdminScanProblem(plan, scans[0]!, rows);
    if (problem) throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', { details: { reason: problem, mallKey: plan.mallKey } });
    const publication = await this.operationRepository.publishOperation(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      plan,
      rows,
    });
    return MallAdminListingsResultSchema.parse({ ...publication, rows: rows.length });
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
          details: { reason: 'mall_admin_chunk_item_invalid', chunkKind, sequence: chunk.sequence },
        });
      }
      return parsed.data as z.output<S>;
    }));
}
