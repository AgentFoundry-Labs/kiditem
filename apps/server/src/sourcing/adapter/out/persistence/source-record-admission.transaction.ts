import { Prisma } from '@prisma/client';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { sourceRecordIdentityLockKey } from '../../../domain/source-record-identity';
import {
  SourceRecordDuplicateError,
  admitSourceRecord,
} from '../../../domain/source-record-admission';
import type {
  AdmittedSourceRecord,
  SourceRecordImageWrite,
  SourceRecordWrite,
} from '../../../application/port/out/repository/source-record.repository.port';
import type { SalesProductDraftPort } from '../../../application/port/out/cross-domain/sales-product-draft.port';

type Tx = Prisma.TransactionClient;

/**
 * 원본 기록 입장 — 모든 수집 경로가 이 한 자리를 지난다(KID-313).
 *
 * 식별자 advisory lock 을 잡고, 같은 원본의 기록이 있으면 그 기록을 가리키는 초안을 Channels 에 물어
 * `admitSourceRecord` 가 정한다. 거절이면 `SourceRecordDuplicateError` 를 던져 부르는 쪽 트랜잭션을
 * 되돌린다. 받아들이면 기록과 사진을 만든다. 초안은 `createDraftForSourceRecordIn` 이 같은 트랜잭션에서
 * 만든다 — 확장 수집은 상세 · 설명 두 쪽을 기록에 담은 뒤에 초안을 만든다.
 */
export async function admitSourceRecordIn(
  tx: Tx,
  input: SourceRecordWrite,
  drafts: SalesProductDraftPort,
): Promise<string> {
  // sourceRecordIdentityLockKey composes input.organizationId into the key.
  const key = sourceRecordIdentityLockKey(input);
  await tx.$queryRaw(
    // queryraw-tenancy-exempt: organization-scoped advisory lock keyed by organizationId; reads no tenant data.
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS "lock"`,
  );
  const existing = await tx.sourceRecord.findFirst({
    where: {
      organizationId: input.organizationId,
      sourcePlatform: input.sourcePlatform,
      sourceIdentityHash: input.sourceIdentityHash,
    },
    select: { id: true },
  });
  const draft = existing
    ? await drafts.findForSourceRecord(input.organizationId, existing.id, ownerTransaction(tx))
    : null;
  const admission = admitSourceRecord(existing
    ? {
      sourceRecordId: existing.id,
      salesProductId: draft?.salesProductId ?? null,
      salesProductStatus: draft?.status ?? null,
    }
    : null);
  if (admission.kind === 'refuse') throw new SourceRecordDuplicateError(admission);

  const record = await tx.sourceRecord.create({
    data: {
      organizationId: input.organizationId,
      sourceUrl: input.sourceUrl,
      sourcePlatform: input.sourcePlatform,
      externalOfferId: input.externalOfferId,
      variantKeyNormalized: input.variantKeyNormalized,
      sourceIdentityHash: input.sourceIdentityHash,
      rawData: input.rawData as Prisma.InputJsonValue,
      name: input.name,
      description: input.description,
      category: input.category,
      tags: input.tags,
      thumbnailUrl: input.thumbnailUrl,
      imageUrl: input.imageUrl,
      costCny: input.costCny ?? undefined,
      triggeredByUserId: input.triggeredByUserId,
    },
    select: { id: true },
  });
  await addSourceRecordImagesIn(tx, input.organizationId, record.id, input.images);
  return record.id;
}

/** 입장과 초안을 한 번에 — 수집 한 쪽이 곧 원본 하나인 경로(URL 수집 · Agent). */
export async function admitSourceRecordWithDraftIn(
  tx: Tx,
  input: SourceRecordWrite,
  drafts: SalesProductDraftPort,
): Promise<AdmittedSourceRecord> {
  const sourceRecordId = await admitSourceRecordIn(tx, input, drafts);
  const salesProductId = await createDraftForSourceRecordIn(tx, input.organizationId, sourceRecordId, drafts);
  return { sourceRecordId, salesProductId };
}

/**
 * 방금 입장한 원본 기록에서 초안을 만든다. 초안은 원본의 이름 · 설명 · 사진 · 출처만 첫 내용으로
 * 받는다 — 원가와 원문은 복사하지 않는다(초안은 원본 기록을 읽는다).
 */
export async function createDraftForSourceRecordIn(
  tx: Tx,
  organizationId: string,
  sourceRecordId: string,
  drafts: SalesProductDraftPort,
): Promise<string> {
  const record = await tx.sourceRecord.findFirstOrThrow({
    where: { id: sourceRecordId, organizationId },
    select: {
      name: true,
      description: true,
      sourcePlatform: true,
      sourceUrl: true,
      images: {
        where: { organizationId },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        select: { url: true },
      },
    },
  });
  const { salesProductId } = await drafts.createDraft(ownerTransaction(tx), organizationId, {
    sourceRecordId,
    name: record.name,
    description: record.description,
    imageUrls: [...new Set(record.images.map((image) => image.url))],
    sourcePlatform: record.sourcePlatform,
    sourceUrl: record.sourceUrl,
  });
  return salesProductId;
}

/** 원본 기록의 사진을 더한다. 같은 주소 · 역할은 두 번 넣지 않는다(상세 · 설명 두 쪽이 겹칠 수 있다). */
export async function addSourceRecordImagesIn(
  tx: Tx,
  organizationId: string,
  sourceRecordId: string,
  images: readonly SourceRecordImageWrite[],
): Promise<void> {
  if (images.length === 0) return;
  const existing = await tx.sourceRecordImage.findMany({
    where: { organizationId, sourceRecordId },
    select: { url: true, role: true },
  });
  const seen = new Set(existing.map((image) => `${image.role}\u001f${image.url}`));
  const fresh = images.filter((image) => {
    const key = `${image.role}\u001f${image.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (fresh.length === 0) return;
  await tx.sourceRecordImage.createMany({
    data: fresh.map((image) => ({
      organizationId,
      sourceRecordId,
      url: image.url,
      role: image.role,
      label: image.label,
      sortOrder: image.sortOrder,
      source: image.source,
      isPrimary: image.isPrimary,
    })),
  });
}
