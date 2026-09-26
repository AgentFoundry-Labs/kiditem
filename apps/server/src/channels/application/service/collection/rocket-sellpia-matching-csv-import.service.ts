import { Inject, Injectable } from '@nestjs/common';
import {
  ROCKET_MATCHING_CSV_CHUNK_KIND,
  ROCKET_MATCHING_CSV_KIND,
  RocketMatchingCsvResultSchema,
  RocketMatchingCsvScopeSchema,
  type RocketMatchingCsvResult,
} from '@kiditem/shared/channels-operations';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import {
  accountLockKey,
  type OperationPlanResult,
  type OperationStagedChunk,
  type OperationView,
} from '@kiditem/shared/operation';
import { z } from 'zod';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { OPERATION_PORT, type OperationPort } from '../../../../common/operation/application/port/in/operation.port';
import type {
  ImportRocketSellpiaMatchingCsvInput,
  RocketSellpiaMatchingCsvImportPort,
} from '../../port/in/rocket-sellpia-matching-csv-import.port';
import { CHANNEL_DOCUMENTS_PORT, type ChannelDocumentsPort } from '../../port/out/documents/channel-documents.port';
import type { ParsedRocketSellpiaMatchingCsvRow } from '../../port/out/documents/channel-document.models';
import { CHANNEL_INTEGRITY_PORT, type ChannelIntegrityPort } from '../../port/out/integrity/channel-integrity.port';
import {
  ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT,
  type RocketSellpiaMatchingCsvImportRepositoryPort,
} from '../../port/out/repository/rocket-sellpia-matching-csv-import.repository.port';

/** 청크 하나의 직렬화 바이트 상한. 계약 상한(1MiB) 아래에 여유를 둔다. */
export const ROCKET_MATCHING_CSV_CHUNK_BYTES = 900_000;

const nullableText = z.string().nullable();
/** 서버가 파싱해 스스로 보낸 행이다 — finalize가 다시 확인하는 것은 청크 저장소를 믿지 않기 때문이다. */
const CsvRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  externalSkuId: z.string().min(1),
  vendorItemId: nullableText,
  productName: z.string(),
  supplierStatus: nullableText,
  channelBarcode: nullableText,
  sellpiaProductName: nullableText,
  sellpiaBarcode: nullableText,
  matchMethod: nullableText,
  confidence: nullableText,
  sellpiaStoredMatch: z.boolean(),
  kiditemSynchronized: z.boolean(),
  matchStatus: nullableText,
  evidence: nullableText,
  rawJson: z.record(z.string()),
}).strict();

const PlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  fileName: z.string(),
  startedBy: z.string().uuid().nullable(),
});

type PlanContext = { organizationId: string; userId: string | null };
type FinalizeContext = { tx: OwnerTransaction; organizationId: string; operationId: string; plan: Record<string, unknown> };

/**
 * 로켓-셀피아 매칭 CSV = `channels.rocket_matching_csv` 실행 하나(ADR-0025, KID-363). 웹 업로드를 받은 서버가
 * 스스로 producer가 된다(Wing 엑셀 kind와 같은 모양): 파일 지문으로 begin → 파싱한 행을 `csv_rows` 청크로 →
 * finish. skuId 중복은 파서가 거절한다. 반영(리스팅·옵션 신원, `lastOperationId`)은 finish 트랜잭션 안에서만 한다. 같은 파일은 계정마다 한 번.
 */
@Injectable()
export class RocketSellpiaMatchingCsvImportService implements RocketSellpiaMatchingCsvImportPort {
  constructor(
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
    @Inject(CHANNEL_DOCUMENTS_PORT) private readonly documents: ChannelDocumentsPort,
    @Inject(CHANNEL_INTEGRITY_PORT) private readonly integrity: ChannelIntegrityPort,
    @Inject(ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT)
    private readonly repository: RocketSellpiaMatchingCsvImportRepositoryPort,
  ) {}

  async importMatchingCsv(input: ImportRocketSellpiaMatchingCsvInput): Promise<{ operation: OperationView }> {
    const parsed = this.documents.parseRocketMatchingCsv(input.bytes);
    if (parsed.rows.length === 0) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'matching_csv_empty' } });
    }
    // 같은 파일은 계정마다 한 번 반영한다(옛 `source_import_runs` fileHash가 계정 범위였다). 계약의 fileHash
    // unique는 (조직, kind)라 계정 id를 지문에 넣는다 — Wing 엑셀 kind와 같은 규칙.
    const fileHash = this.integrity.sha256Bytes(`${input.channelAccountId.toLowerCase()}\n`, input.bytes);
    const begun = await this.operations.begin(input.organizationId, {
      kind: ROCKET_MATCHING_CSV_KIND,
      scope: { channelAccountId: input.channelAccountId, fileName: input.fileName },
      fileHash,
    }, { userId: input.userId });
    const fenced = { organizationId: input.organizationId, operationId: begun.operation.id, token: begun.token };
    try {
      for (const [index, payload] of chunkRows(parsed.rows).entries()) {
        await this.operations.putChunk({
          ...fenced,
          chunkKind: ROCKET_MATCHING_CSV_CHUNK_KIND,
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

  async planCsv(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult> {
    const parsed = RocketMatchingCsvScopeSchema.safeParse(scope);
    if (!parsed.success) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: {
          reason: 'matching_csv_scope_invalid',
          errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
        },
      });
    }
    const channelAccountId = parsed.data.channelAccountId.toLowerCase();
    await this.repository.assertRocketAccount({ organizationId: context.organizationId, channelAccountId });
    return {
      lockKeys: [accountLockKey(channelAccountId)],
      plan: { channelAccountId, fileName: parsed.data.fileName, startedBy: context.userId },
    };
  }

  async finalizeCsv(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<RocketMatchingCsvResult> {
    const plan = PlanSchema.parse(context.plan);
    const rows = csvRows(chunks);
    if (rows.length === 0) {
      throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', { details: { reason: 'matching_csv_rows_missing' } });
    }
    const changes = await this.repository.publishMatchingCsv(context.tx, {
      organizationId: context.organizationId,
      channelAccountId: plan.channelAccountId,
      operationId: context.operationId,
      rows,
    });
    return RocketMatchingCsvResultSchema.parse({ rowCount: rows.length, ...changes });
  }
}

/** 행을 직렬화 바이트 상한 아래 묶음으로 나눈다(순서 유지). */
function chunkRows(rows: readonly ParsedRocketSellpiaMatchingCsvRow[]): ParsedRocketSellpiaMatchingCsvRow[][] {
  const encoder = new TextEncoder();
  const chunks: ParsedRocketSellpiaMatchingCsvRow[][] = [];
  let current: ParsedRocketSellpiaMatchingCsvRow[] = [];
  let bytes = 2;
  for (const row of rows) {
    const size = encoder.encode(JSON.stringify(row)).length + 1;
    if (current.length > 0 && bytes + size > ROCKET_MATCHING_CSV_CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      bytes = 2;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function csvRows(chunks: OperationStagedChunk[]): ParsedRocketSellpiaMatchingCsvRow[] {
  return chunks
    .filter((chunk) => chunk.chunkKind === ROCKET_MATCHING_CSV_CHUNK_KIND)
    .sort((left, right) => left.sequence - right.sequence)
    .flatMap((chunk) => chunk.payload.map((item) => {
      const parsed = CsvRowSchema.safeParse(item);
      if (!parsed.success) {
        throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', {
          details: { reason: 'matching_csv_row_invalid', sequence: chunk.sequence },
        });
      }
      return parsed.data;
    }));
}

function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'MATCHING_CSV_FAILED';
}
