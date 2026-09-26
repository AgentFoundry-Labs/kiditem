import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import {
  SELLPIA_LOGIN_LOCK_KEY,
  SELLPIA_MANUAL_MATCH_CHUNK_KIND,
  SELLPIA_MANUAL_MATCH_KIND,
  SellpiaManualMatchScopeSchema,
} from '@kiditem/shared/sellpia-operations';
import {
  SELLPIA_MANUAL_MATCH_PARSER_VERSION,
  SELLPIA_MANUAL_MATCH_SOURCE_ORIGIN,
  SELLPIA_MANUAL_MATCH_SOURCE_PATH,
  SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
  SellpiaManualMatchPlanSchema,
  SellpiaManualMatchResultSchema,
  SellpiaManualMatchRowSchema,
  type SellpiaManualMatchResult,
  type SellpiaManualMatchRow,
  type SellpiaManualMatchSourceStatus,
} from '@kiditem/shared/sellpia-manual-match';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { OPERATION_PORT, type OperationPort } from '../../../../common/operation/application/port/in/operation.port';
import type { SellpiaManualMatchPort } from '../../port/in/listing/sellpia-manual-match.port';
import {
  SELLPIA_MANUAL_MATCH_REPOSITORY_PORT,
  type SellpiaManualMatchRepositoryPort,
} from '../../port/out/repository/sellpia-manual-match.repository.port';

type PlanContext = { organizationId: string; userId: string | null };
type FinalizeContext = { tx: OwnerTransaction; organizationId: string; operationId: string; plan: Record<string, unknown> };

/**
 * `channels.sellpia_manual_match`(KID-363)의 owner 일: plan은 활성 셀피아 SKU 코드를 대상으로 얼리고 셀피아 로그인 잠금
 * 하나를 잡는다(조직마다 셀피아 로그인이 하나 — 재고·매출·손익 kind와 서로 막는다). finalize는 `match_results` 줄을
 * 검증해 스냅샷을 바꿔 쓴다. 실패·취소는 원장에 아무것도 쓰지 않아 이전 스냅샷이 남는다.
 */
@Injectable()
export class SellpiaManualMatchService implements SellpiaManualMatchPort {
  constructor(
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
    @Inject(SELLPIA_MANUAL_MATCH_REPOSITORY_PORT) private readonly repository: SellpiaManualMatchRepositoryPort,
  ) {}

  async readSource(organizationId: string): Promise<SellpiaManualMatchSourceStatus> {
    const [latest, currentSnapshot] = await Promise.all([
      this.operations.list(organizationId, { kinds: [SELLPIA_MANUAL_MATCH_KIND], limit: 1 }),
      this.repository.getCurrentStatus(organizationId),
    ]);
    return { latestOperation: latest.operations[0] ?? null, currentSnapshot };
  }

  async plan(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult> {
    if (!SellpiaManualMatchScopeSchema.safeParse(scope).success) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'sellpia_manual_match_scope_invalid' } });
    }
    const targetCodes = await this.repository.readActiveTargetCodes(context.organizationId);
    const plan = SellpiaManualMatchPlanSchema.parse({
      sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
      parserVersion: SELLPIA_MANUAL_MATCH_PARSER_VERSION,
      sourceOrigin: SELLPIA_MANUAL_MATCH_SOURCE_ORIGIN,
      sourcePath: SELLPIA_MANUAL_MATCH_SOURCE_PATH,
      targetCount: targetCodes.length,
      targetCodes,
    });
    return { lockKeys: [SELLPIA_LOGIN_LOCK_KEY], plan };
  }

  async finalize(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<SellpiaManualMatchResult> {
    const plan = SellpiaManualMatchPlanSchema.parse(context.plan);
    const rows = matchRows(chunks);
    const targets = new Set(plan.targetCodes);
    const seen = new Set<string>();
    for (const row of rows) {
      if (!targets.has(row.productCode)) {
        throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', {
          details: { reason: 'sellpia_match_row_outside_plan', productCode: row.productCode },
        });
      }
      const identity = rowIdentity(row);
      if (seen.has(identity)) {
        throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', {
          details: { reason: 'sellpia_match_row_duplicate', productCode: row.productCode },
        });
      }
      seen.add(identity);
    }
    const status = await this.repository.publish(context.tx, {
      organizationId: context.organizationId,
      plan,
      rows: [...rows].sort((left, right) => (rowIdentity(left) < rowIdentity(right) ? -1 : 1)),
    });
    return SellpiaManualMatchResultSchema.parse({ targets: status.targetCount, matched: status.matchedTargetCount });
  }

  findByNormalizedAliases(organizationId: string, normalizedAliases: string[]) {
    return this.repository.findByNormalizedAliases(organizationId, normalizedAliases);
  }
}

/** 정렬·중복 판정에 쓰는 줄의 신원(옛 스냅샷 계약과 같은 순서). */
function rowIdentity(row: SellpiaManualMatchRow): string {
  return [row.productCode, row.aliasTitle, String(row.itemCount).padStart(10, '0'), row.matchedType].join('\u0000');
}

function matchRows(chunks: OperationStagedChunk[]): SellpiaManualMatchRow[] {
  return chunks
    .filter((chunk) => chunk.chunkKind === SELLPIA_MANUAL_MATCH_CHUNK_KIND)
    .sort((left, right) => left.sequence - right.sequence)
    .flatMap((chunk) => chunk.payload.map((item) => {
      const parsed = SellpiaManualMatchRowSchema.safeParse(item);
      if (!parsed.success) {
        throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', {
          details: { reason: 'sellpia_match_row_invalid', sequence: chunk.sequence },
        });
      }
      return parsed.data;
    }));
}
