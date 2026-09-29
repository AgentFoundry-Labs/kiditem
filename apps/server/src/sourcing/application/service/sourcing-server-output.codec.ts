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
  /**
   * 품목 단위로 나눠 싣는 문서(섀도, KID-389). 출력 안의 `{ $document: 이름 }` 자리는 finalize에서 이 문서로 바뀐다.
   * 문서의 목록(`lists[].path`)은 원소 하나에 품목 하나씩 실려, 청크 원소 상한이 문서 전체가 아니라 품목 하나에 걸린다.
   */
  documents?: Record<string, SourceDocumentSplit>;
}

export interface SourceDocumentSplit {
  /** 목록을 비운 문서 뼈대. */
  skeleton: unknown;
  lists: Array<{ path: Array<string | number>; items: unknown[] }>;
}

/** 품목 단위로 나눈 문서의 자리 표시. */
export function sourceDocumentRef(name: string): { $document: string } {
  return { $document: name };
}

type Element =
  | { part: 'head'; head: unknown; discoveredCount: number; rejectedCount: number; qualityReport: unknown }
  | { part: 'document_item'; document: string; list: number; value: unknown }
  | { part: 'observation'; value: unknown }
  | { part: 'record'; value: unknown };

/**
 * 서버 구동 kind의 원장 출력(옛 attempt 종료의 `output`)을 `source_output` 청크 payload들로 나눈다(KID-389).
 * 청크는 JSON으로 저장되므로 `Date`는 `{ $date: ISO }`로 싸고 finalize가 되살린다 — 원장 writer는 옛 attempt와
 * 같은 `Date` 값을 받는다. 원소 순서(머리 → 관측 → typed 원장)는 청크 순번으로 지킨다.
 */
export function encodeSourceOutput(output: AuthorizedCollectionOutput, head: SourceOutputHead): unknown[][] {
  const { documents, ...rest } = head;
  const skeletons = documents
    ? Object.fromEntries(Object.entries(documents).map(([name, split]) => [name, {
      skeleton: split.skeleton,
      paths: split.lists.map((list) => list.path),
    }]))
    : undefined;
  const elements: Element[] = [
    { part: 'head', head: { ...rest, ...(skeletons ? { documents: skeletons } : {}) },
      discoveredCount: output.discoveredCount, rejectedCount: output.rejectedCount, qualityReport: output.qualityReport },
    ...Object.entries(documents ?? {}).flatMap(([document, split]) => split.lists.flatMap((list, index) =>
      list.items.map((value) => ({ part: 'document_item' as const, document, list: index, value })))),
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
  const { documents: skeletons, ...head } = first.head as SourceOutputHead & {
    documents?: Record<string, { skeleton: unknown; paths: Array<Array<string | number>> }>;
  };
  const documentItems = new Map<string, unknown[][]>();
  for (const element of rest) {
    if (element.part === 'observation') observations.push(element.value);
    else if (element.part === 'record') typedRecords.push(element.value);
    else if (element.part === 'document_item' && skeletons?.[element.document]?.paths[element.list]) {
      const lists = documentItems.get(element.document) ?? skeletons[element.document].paths.map(() => []);
      lists[element.list].push(element.value);
      documentItems.set(element.document, lists);
    } else throw invalid('source_output_malformed');
  }
  const documents = new Map(Object.entries(skeletons ?? {}).map(([name, { skeleton, paths }]) => {
    const document = structuredClone(skeleton);
    paths.forEach((path, index) => setPath(document, path, documentItems.get(name)?.[index] ?? []));
    return [name, document];
  }));
  const resolve = (value: unknown): unknown => resolveDocuments(value, documents);
  return {
    head: head as SourceOutputHead,
    output: {
      observations: resolve(observations) as AuthorizedCollectionOutput['observations'],
      typedRecords: resolve(typedRecords) as AuthorizedCollectionOutput['typedRecords'],
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

function setPath(target: unknown, path: Array<string | number>, value: unknown): void {
  let cursor = target as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) {
    cursor = cursor?.[key] as Record<string | number, unknown>;
    if (!cursor || typeof cursor !== 'object') throw invalid('source_document_path_missing');
  }
  cursor[path[path.length - 1]] = value;
}

/** `{ $document: 이름 }` 자리를 다시 모은 문서로 바꾼다. 모르는 이름이면 거절한다. */
function resolveDocuments(value: unknown, documents: Map<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveDocuments(item, documents));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.entries(value);
    if (entries.length === 1 && entries[0][0] === '$document') {
      const document = documents.get(String(entries[0][1]));
      if (document === undefined) throw invalid('source_document_missing');
      return structuredClone(document);
    }
    return Object.fromEntries(entries.map(([key, item]) => [key, resolveDocuments(item, documents)]));
  }
  return value;
}

function invalid(reason: string) {
  return new KiditemInvalidValueError('SOURCING_COLLECTION_INVALID', { details: { reason } });
}
