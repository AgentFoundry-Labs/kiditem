import {
  WING_CATALOG_CHUNK_KINDS,
  WING_CATALOG_DETAILS_KIND,
  WING_CATALOG_EXCEL_KIND,
  WingCatalogDeletionConfirmationItemSchema,
  WingCatalogDetailsScopeSchema,
  WingCatalogExcelScopeSchema,
  WingCatalogFullDetailsItemSchema,
  WingCatalogListResultSchema,
  WingCatalogListScopeSchema,
  WingCatalogListingBasicsItemSchema,
  type WingCatalogDetailsScope,
  type WingCatalogListResult,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import {
  accountLockKey,
  type OperationBeginResponse,
  type OperationPlanResult,
  type OperationStagedChunk,
  type OperationView,
} from '@kiditem/shared/operation';
import type { ZodType } from 'zod';
import type { WingCatalogOperationPort } from '../../port/in/wing-catalog-operation.port';
import type { ChannelIntegrityPort } from '../../port/out/integrity/channel-integrity.port';
import { z } from 'zod';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { OperationPort } from '../../../../common/operation/application/port/in/operation.port';
import type { ChannelDocumentsPort } from '../../port/out/documents/channel-documents.port';
import type { ChannelCatalogPublicationPort } from '../../port/out/repository/channel-catalog-publication.port';

/** 엑셀 파일 바이트 조각(base64)의 청크 종류. 웹 업로드와 확장 Wing 내려받기가 같은 모양으로 보낸다. */
export const WING_CATALOG_WORKBOOK_CHUNK_KIND = 'workbook' as const;
/** 조각 하나의 base64 글자 수. 청크 JSON(`["…"]`)이 1MiB 상한 아래에 머문다. */
export const WING_CATALOG_WORKBOOK_PART_CHARS = 900_000;

/** 목록·상세·엑셀 kind가 plan JSON에 남기는 공통 값. `startedBy`는 begin을 부른 사람(없으면 null). */
const PlanBaseSchema = z.object({
  channelAccountId: z.string().uuid(),
  startedBy: z.string().uuid().nullable(),
});
const DetailsPlanSchema = PlanBaseSchema.extend({
  detailTargetProductIds: z.array(z.string()),
  absentProductIds: z.array(z.string()),
});
const ExcelPlanSchema = PlanBaseSchema.extend({ observedAt: z.string().datetime({ offset: true }) });

type PlanContext = { organizationId: string; userId: string | null };
type FinalizeContext = { tx: OwnerTransaction; organizationId: string; operationId: string; plan: Record<string, unknown> };

/**
 * Wing 카탈로그 실행 kind 셋(KID-354·351)의 owner 일: scope 검증·잠금 키·plan, 그리고 finish 트랜잭션 안의 반영.
 * 모두 `account:<channelAccountId>` 하나를 잡아 한 계정의 목록·상세·엑셀이 겹치지 않는다. 원장 쓰기는
 * publication 포트가, 실행 표는 실행 계약이 맡는다.
 */
export class WingCatalogOperationService implements WingCatalogOperationPort {
  constructor(
    private readonly publication: ChannelCatalogPublicationPort,
    private readonly documents: ChannelDocumentsPort,
    private readonly operations: OperationPort,
    private readonly integrity: ChannelIntegrityPort,
  ) {}

  /**
   * 웹 업로드 = 서버가 스스로 확장 역할을 하는 엑셀 kind 실행(KID-351): 파일 sha256을 `fileHash`로 begin(같은 파일이
   * 이미 반영됐으면 계약이 거절) → 바이트를 `workbook` 청크로 → finish. 반영이 실패하면 실행을 failed로 닫아 계정
   * 잠금을 바로 푼다(원장은 finish 트랜잭션과 함께 되돌려졌다).
   */
  async uploadWorkbook(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    bytes: Uint8Array;
    observedAt?: string;
  }): Promise<{ operation: OperationView }> {
    // 같은 파일은 계정마다 한 번 반영한다(옛 `source_import_runs` fileHash가 계정 범위였다). 실행 계약의 fileHash
    // unique는 (조직, kind)라 계정 id를 지문에 넣는다.
    const fileHash = this.integrity.sha256Bytes(`${input.channelAccountId.toLowerCase()}\n`, input.bytes);
    const begun: OperationBeginResponse = await this.operations.begin(input.organizationId, {
      kind: WING_CATALOG_EXCEL_KIND,
      scope: { channelAccountId: input.channelAccountId, ...(input.observedAt ? { observedAt: input.observedAt } : {}) },
      fileHash,
    }, { userId: input.userId });
    const operationId = begun.operation.id;
    const fenced = { organizationId: input.organizationId, operationId, token: begun.token };
    try {
      const parts = this.documents.encodeWorkbookParts(input.bytes, WING_CATALOG_WORKBOOK_PART_CHARS);
      for (const [index, part] of parts.entries()) {
        const payload = [part];
        await this.operations.putChunk({
          ...fenced,
          chunkKind: WING_CATALOG_WORKBOOK_CHUNK_KIND,
          sequence: index + 1,
          request: { checksum: this.integrity.sha256(JSON.stringify(payload)), payload },
        });
      }
      return await this.operations.finish({ ...fenced, request: { outcome: 'succeeded' } });
    } catch (error) {
      await this.operations.finish({
        ...fenced,
        request: { outcome: 'failed', errorCode: errorCodeOf(error) },
      }).catch(() => undefined);
      throw error;
    }
  }

  async planList(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult> {
    const parsed = parseScope(WingCatalogListScopeSchema, scope);
    const channelAccountId = parsed.channelAccountId.toLowerCase();
    await this.publication.assertWingAccount({ organizationId: context.organizationId, channelAccountId });
    return { lockKeys: [accountLockKey(channelAccountId)], plan: { channelAccountId, startedBy: context.userId } };
  }

  async finalizeList(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<WingCatalogListResult> {
    const plan = parsePlan(PlanBaseSchema, context.plan);
    const products = chunkItems(chunks, WING_CATALOG_CHUNK_KINDS.listingBasics, WingCatalogListingBasicsItemSchema);
    assertUnique(products.map(({ externalProductId }) => externalProductId));
    const published = await this.publication.publishList(context.tx, {
      organizationId: context.organizationId,
      channelAccountId: plan.channelAccountId,
      operationId: context.operationId,
      userId: plan.startedBy,
      products,
    });
    const { detailTargetProductIds, absentProductIds } = published.plan;
    const next = detailTargetProductIds.length > 0 || absentProductIds.length > 0
      ? {
        kind: WING_CATALOG_DETAILS_KIND,
        scope: { channelAccountId: plan.channelAccountId, detailTargetProductIds, absentProductIds },
      }
      : null;
    return WingCatalogListResultSchema.parse({
      listedProductCount: products.length,
      detailTargetProductIds,
      absentProductIds,
      next,
    });
  }

  async planDetails(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult> {
    const parsed: WingCatalogDetailsScope = parseScope(WingCatalogDetailsScopeSchema, scope);
    const channelAccountId = parsed.channelAccountId.toLowerCase();
    await this.publication.assertWingAccount({ organizationId: context.organizationId, channelAccountId });
    const mismatch = await this.publication.findDetailsScopeMismatch({
      organizationId: context.organizationId,
      channelAccountId,
      detailTargetProductIds: parsed.detailTargetProductIds,
      absentProductIds: parsed.absentProductIds,
    });
    if (mismatch !== null) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: { reason: 'catalog_scope_mismatch', externalProductId: mismatch },
      });
    }
    return {
      lockKeys: [accountLockKey(channelAccountId)],
      plan: {
        channelAccountId,
        detailTargetProductIds: [...new Set(parsed.detailTargetProductIds)],
        absentProductIds: [...new Set(parsed.absentProductIds)],
        startedBy: context.userId,
      },
    };
  }

  async finalizeDetails(chunks: OperationStagedChunk[], context: FinalizeContext) {
    const plan = parsePlan(DetailsPlanSchema, context.plan);
    const products = chunkItems(chunks, WING_CATALOG_CHUNK_KINDS.fullDetails, WingCatalogFullDetailsItemSchema);
    assertUnique(products.map(({ externalProductId }) => externalProductId));
    const confirmations = chunkItems(
      chunks,
      WING_CATALOG_CHUNK_KINDS.deletionConfirmation,
      WingCatalogDeletionConfirmationItemSchema,
    );
    assertUnique(confirmations.map(({ externalProductId }) => externalProductId));
    return this.publication.publishDetails(context.tx, {
      organizationId: context.organizationId,
      channelAccountId: plan.channelAccountId,
      operationId: context.operationId,
      userId: plan.startedBy,
      detailTargetProductIds: plan.detailTargetProductIds,
      absentProductIds: plan.absentProductIds,
      products,
      confirmations,
    });
  }

  async planExcel(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult> {
    const parsed = parseScope(WingCatalogExcelScopeSchema, scope);
    const channelAccountId = parsed.channelAccountId.toLowerCase();
    await this.publication.assertWingAccount({ organizationId: context.organizationId, channelAccountId });
    return {
      lockKeys: [accountLockKey(channelAccountId)],
      // 엑셀 값은 내보내기를 요청한 시각의 스냅샷이다(KID-349). 주지 않으면 시작 시각 — 확장은 begin 직후 요청한다.
      plan: { channelAccountId, observedAt: excelObservedAt(parsed.observedAt), startedBy: context.userId },
    };
  }

  async finalizeExcel(chunks: OperationStagedChunk[], context: FinalizeContext) {
    const plan = parsePlan(ExcelPlanSchema, context.plan);
    const parts = chunkItems(chunks, WING_CATALOG_WORKBOOK_CHUNK_KIND, z.string().min(1));
    if (parts.length === 0) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'catalog_workbook_missing' } });
    }
    const workbook = this.documents.parseWingWorkbook(this.documents.decodeWorkbookParts(parts));
    return this.publication.publishWorkbook(context.tx, {
      organizationId: context.organizationId,
      channelAccountId: plan.channelAccountId,
      operationId: context.operationId,
      rows: workbook.rows,
      skippedRows: workbook.skippedRows,
      observedAt: plan.observedAt,
    });
  }
}

/** 한 chunkKind의 원소를 순번 순서로 이어 검증한다. 모양이 틀리면 저장하지 않는다. */
function chunkItems<S extends z.ZodTypeAny>(chunks: OperationStagedChunk[], chunkKind: string, schema: S): Array<z.output<S>> {
  return chunks
    .filter((chunk) => chunk.chunkKind === chunkKind)
    .sort((left, right) => left.sequence - right.sequence)
    .flatMap((chunk) => chunk.payload.map((item) => {
      const parsed = schema.safeParse(item);
      if (!parsed.success) {
        throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', {
          details: { reason: 'catalog_chunk_item_invalid', chunkKind, sequence: chunk.sequence },
        });
      }
      return parsed.data as z.output<S>;
    }));
}

function assertUnique(ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', {
        details: { reason: 'catalog_duplicate_product', externalProductId: id },
      });
    }
    seen.add(id);
  }
}

function parseScope<T>(schema: ZodType<T>, scope: unknown): T {
  const parsed = schema.safeParse(scope);
  if (parsed.success) return parsed.data;
  throw new KiditemInvalidValueError('VALIDATION_FAILED', {
    details: {
      reason: 'catalog_scope_invalid',
      errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
    },
  });
}

/** plan은 이 owner가 begin에서 쓴 값이다 — 틀리면 무결성 문제라 일반 오류로 둔다. */
function parsePlan<T>(schema: ZodType<T>, plan: unknown): T {
  return schema.parse(plan);
}

function excelObservedAt(value: string | undefined): string {
  if (value === undefined) return new Date().toISOString();
  if (Date.parse(value) > Date.now() + 60_000) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', {
      details: { reason: 'CATALOG_EXCEL_OBSERVED_AT_INVALID', field: 'observedAt' },
    });
  }
  return new Date(value).toISOString();
}

function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'CATALOG_WORKBOOK_FAILED';
}
