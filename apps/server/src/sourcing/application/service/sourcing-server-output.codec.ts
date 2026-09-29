import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import { SOURCING_SERVER_CHUNK_KIND } from '@kiditem/shared/sourcing-operation';
import type { SourceRecordWrite } from '../port/out/repository/source-record.repository.port';
import type { AuthorizedCollectionOutput } from '../port/out/repository/sourcing-collection.repository.port';

/** 청크 하나의 예산(직렬화 바이트). 계약 상한 1MiB에 봉투·checksum 여유를 둔다. */
const CHUNK_BUDGET_BYTES = 900_000;

/** 원장 출력과 함께 finalize로 가는 값: 내용 지문, 원천 관측 창, 경고, URL 수집의 원본 기록. */
export interface SourceOutputHead {
  contentChecksum: string;
  windowStartAt: Date | null;
  windowEndAt: Date | null;
  warnings?: string[];
  /** URL 수집만: finalize가 같은 트랜잭션에서 입장시킬 원본 기록. */
  sourceRecord?: SourceRecordWrite;
}

type Element =
  | { part: 'head'; head: unknown; discoveredCount: number; rejectedCount: number; qualityReport: unknown }
  | { part: 'observation'; value: unknown }
  | { part: 'record'; value: unknown };

/**
 * 서버 구동 kind의 원장 출력(옛 attempt 종료의 `output`)을 `source_output` 청크 payload들로 나눈다(KID-389).
 * 청크는 JSON으로 저장되므로 `Date`는 `{ $date: ISO }`로 싸고 finalize가 되살린다 — 원장 writer는 옛 attempt와
 * 같은 `Date` 값을 받는다. 원소 순서(머리 → 관측 → typed 원장)는 청크 순번으로 지킨다.
 */
export function encodeSourceOutput(output: AuthorizedCollectionOutput, head: SourceOutputHead): unknown[][] {
  const elements: Element[] = [
    { part: 'head', head, discoveredCount: output.discoveredCount, rejectedCount: output.rejectedCount, qualityReport: output.qualityReport },
    ...output.observations.map((value) => ({ part: 'observation' as const, value })),
    ...output.typedRecords.map((value) => ({ part: 'record' as const, value })),
  ];
  const chunks: unknown[][] = [];
  let current: unknown[] = [];
  let size = 2;
  for (const element of elements) {
    const encoded = encodeDates(element);
    const bytes = Buffer.byteLength(JSON.stringify(encoded)) + 1;
    if (bytes + 2 > CHUNK_BUDGET_BYTES) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'source_output_element_too_large', part: element.part } });
    }
    if (current.length > 0 && size + bytes > CHUNK_BUDGET_BYTES) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(encoded);
    size += bytes;
  }
  chunks.push(current);
  return chunks;
}

/** finalize 쪽: 청크를 순번대로 이어 원장 출력과 머리를 되살린다. 머리가 없거나 모르는 청크면 거절한다. */
export function decodeSourceOutput(chunks: readonly OperationStagedChunk[]): { output: AuthorizedCollectionOutput; head: SourceOutputHead } {
  if (chunks.some((chunk) => chunk.chunkKind !== SOURCING_SERVER_CHUNK_KIND)) throw invalid('unknown_chunk_kind');
  const elements = [...chunks]
    .sort((left, right) => left.sequence - right.sequence)
    .flatMap((chunk) => chunk.payload)
    .map((element) => decodeDates(element) as Element);
  const [first, ...rest] = elements;
  if (!first || first.part !== 'head' || rest.some((element) => element.part === 'head')) throw invalid('source_output_head_missing');
  const observations: unknown[] = [];
  const typedRecords: unknown[] = [];
  for (const element of rest) {
    if (element.part === 'observation') observations.push(element.value);
    else if (element.part === 'record') typedRecords.push(element.value);
    else throw invalid('source_output_malformed');
  }
  return {
    head: first.head as SourceOutputHead,
    output: {
      observations: observations as AuthorizedCollectionOutput['observations'],
      typedRecords: typedRecords as AuthorizedCollectionOutput['typedRecords'],
      discoveredCount: first.discoveredCount,
      rejectedCount: first.rejectedCount,
      qualityReport: first.qualityReport as Record<string, unknown>,
    },
  };
}

function encodeDates(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(encodeDates);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encodeDates(item)]));
  }
  return value;
}

function decodeDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeDates);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 1 && entries[0][0] === '$date' && typeof entries[0][1] === 'string') return new Date(entries[0][1]);
    return Object.fromEntries(entries.map(([key, item]) => [key, decodeDates(item)]));
  }
  return value;
}

function invalid(reason: string) {
  return new KiditemInvalidValueError('SOURCING_COLLECTION_INVALID', { details: { reason } });
}
