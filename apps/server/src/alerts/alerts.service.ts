import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { operatorErrorText, sourceLabel } from '@kiditem/shared/errors';
import { findChannel } from '@kiditem/shared/channel-registry';
import { redact } from '../common/redact';
import type {
  AlertItem,
  SourceFailureAlertInput,
} from '@kiditem/shared/alerts';
import type { Alert } from '@prisma/client';
import {
  readLatestOperationOutcomes,
  type OperationOutcomeRow,
} from '../common/operation/transaction/latest-operation-outcomes';
import {
  OPERATION_FAILURE_IGNORED_CODES,
  OPERATION_FAILURE_KINDS,
  OPERATION_FAILURE_MALL_KINDS,
  OPERATION_FAILURE_SCOPE_FIELDS,
  operationFailureHref,
} from './operation-failure-sources';

export type { SourceFailureAlertInput } from '@kiditem/shared/alerts';

/**
 * The one alert this module writes, and so the one it reads. Rows another
 * writer left in the table stay there until the schema cutover (KID-90); no
 * reader sees them.
 */
const SOURCE_FAILURE_ALERT_TYPE = 'source_failure';

/**
 * 실행 계약으로 옮긴 kind의 실패(KID-355 정책 B). 알림 표에는 이 타입으로 운영자의 읽음 표시만 남고(`dedupeKey`
 * `operation:<실행 id>`), 알림 자체는 `list`가 실행 표에서 만든다.
 */
const OPERATION_FAILURE_ALERT_TYPE = 'operation_failure';

function operationReadKey(operationId: string): string {
  return `operation:${operationId}`;
}

const CHANNEL_ACCOUNT_TARGET = 'channel_account';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 몰마다 도는 kind가 plan에 남긴 몰 이름과 채널 계정(`planFields`로 읽은 값). */
const MALL_PLAN_FIELDS = ['mallKey', 'mallName', 'channelAccountId'] as const;

function mallTarget(row: OperationOutcomeRow): { name: string | null; channelAccountId: string | null } | null {
  if (!OPERATION_FAILURE_MALL_KINDS.has(row.kind)) return null;
  const mallKey = row.fields.mallKey ?? null;
  const channelAccountId = row.fields.channelAccountId ?? null;
  return {
    name: row.fields.mallName ?? (mallKey ? findChannel(mallKey)?.name ?? null : null),
    channelAccountId: channelAccountId && UUID.test(channelAccountId) ? channelAccountId.toLowerCase() : null,
  };
}

/** 같은 밀리초에 끝났으면 뒤에 시작한 실행이, 그것도 같으면 id가 큰 쪽이 뒤다(읽기 정렬과 같은 순서). */
function finishedAfter(left: OperationOutcomeRow, right: OperationOutcomeRow): boolean {
  const byFinish = left.finishedAt.getTime() - right.finishedAt.getTime();
  if (byFinish !== 0) return byFinish > 0;
  const byStart = left.startedAt.getTime() - right.startedAt.getTime();
  return byStart !== 0 ? byStart > 0 : left.id > right.id;
}

/**
 * 원천 정체성(kind + 범위)마다 최신 실패가 알림 하나다. 그 뒤에 같은 정체성의 성공이 있으면 닫힌 알림(옛
 * `resolveSourceFailure`와 같은 뜻), 실패가 한 번도 없으면 알림이 아니다.
 */
function operationFailureItems(
  outcomes: readonly OperationOutcomeRow[],
  readOperationIds: ReadonlySet<string>,
): AlertItem[] {
  const byIdentity = new Map<string, { failed?: OperationOutcomeRow; succeeded?: OperationOutcomeRow }>();
  for (const row of outcomes) {
    const key = `${row.kind} ${row.scope}`;
    const entry = byIdentity.get(key) ?? {};
    entry[row.outcome] = row;
    byIdentity.set(key, entry);
  }
  const items: AlertItem[] = [];
  for (const { failed, succeeded } of byIdentity.values()) {
    if (!failed) continue;
    const resolvedBy = succeeded && finishedAfter(succeeded, failed) ? succeeded : null;
    const mall = mallTarget(failed);
    items.push({
      id: failed.id,
      attemptId: failed.id,
      status: resolvedBy ? 'RESOLVED' : 'OPEN',
      type: OPERATION_FAILURE_ALERT_TYPE,
      title: `${mall?.name ? `${mall.name} ` : ''}${sourceLabel(failed.kind)} 실패`,
      // 실행의 `errorMessage`는 원문(영어·울타리 사유 `expired`)이라 싣지 않는다 — 코드의 레지스트리 문장만.
      message: operatorErrorText({ code: failed.errorCode, source: failed.kind }),
      targetType: mall?.channelAccountId ? CHANNEL_ACCOUNT_TARGET : null,
      targetId: mall?.channelAccountId ?? null,
      sourceType: failed.kind,
      href: operationFailureHref(failed.kind),
      isRead: readOperationIds.has(failed.id),
      createdAt: failed.finishedAt.toISOString(),
      updatedAt: (resolvedBy ?? failed).finishedAt.toISOString(),
    });
  }
  return items;
}

function mapAlert(row: Alert): AlertItem {
  return {
    id: row.id,
    attemptId: row.attemptId,
    status: row.status as AlertItem['status'],
    type: row.type,
    title: row.title,
    message: row.message,
    targetType: row.targetType,
    targetId: row.targetId,
    sourceType: row.sourceType,
    href: row.href,
    // Read is the fact that `readAt` was stamped.
    isRead: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } satisfies AlertItem;
}

/**
 * The focused source failure + operator notification seam.
 *
 * Source owners pass their already-open Prisma transaction to the two source
 * methods below, so a source's terminal mutation and its Alert commit or roll
 * back as one PostgreSQL unit — no event, outbox, or generic alert port. This
 * module never starts a nested transaction or invokes an Operation worker.
 *
 * It was two classes with identical interfaces, one delegating to the other a
 * line at a time. One adapter is a hypothetical seam, and every test paid for
 * it twice.
 */
@Injectable()
export class SourceFailureAlerts {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The source-failure alerts for one organization, filtered by what the caller
   * is asking for rather than by which adapter it happens to hold.
   *
   * The dashboard used to read this table itself, with `isRead: false` and no
   * status filter — so a resolved-but-unread alert took one of its ten slots and
   * rendered with a green check — ordered by a different column, capped at a
   * limit the interface never mentioned. Two reads of one table, disagreeing on
   * filter, order, and limit, and producing two different badge numbers.
   *
   * `isRead` asks whether `readAt` is stamped, the same rule the item carries.
   */
  async list(
    organizationId: string,
    options: { isRead?: boolean; status?: AlertItem['status']; limit?: number } = {},
  ): Promise<AlertItem[]> {
    const [rows, operationItems] = await Promise.all([
      this.prisma.alert.findMany({
        where: { organizationId, type: SOURCE_FAILURE_ALERT_TYPE },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
      this.operationFailures(organizationId),
    ]);
    const items = [...rows.map(mapAlert), ...operationItems]
      .filter((item) => options.isRead === undefined || item.isRead === options.isRead)
      .filter((item) => !options.status || item.status === options.status)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
    return options.limit === undefined ? items : items.slice(0, options.limit);
  }

  /** 옮긴 kind의 실행 표에서 만든 알림(KID-355 정책 B). 읽음은 이 모듈 표의 `operation_failure` 행이 말한다. */
  private async operationFailures(organizationId: string): Promise<AlertItem[]> {
    const [outcomes, reads] = await Promise.all([
      readLatestOperationOutcomes(this.prisma, {
        organizationId,
        kinds: OPERATION_FAILURE_KINDS,
        scopeFields: OPERATION_FAILURE_SCOPE_FIELDS,
        ignoredErrorCodes: OPERATION_FAILURE_IGNORED_CODES,
        planFields: MALL_PLAN_FIELDS,
      }),
      this.prisma.alert.findMany({
        where: { organizationId, type: OPERATION_FAILURE_ALERT_TYPE, readAt: { not: null } },
        select: { attemptId: true },
      }),
    ]);
    const readIds = new Set(reads.flatMap((row) => (row.attemptId ? [row.attemptId] : [])));
    return operationFailureItems(outcomes, readIds);
  }

  /**
   * 알림 하나를 읽음으로. 옛 원천 실패 행이면 그 행에 `readAt`을, 아니면 실행 id로 보고 지금 열린 실행 실패 알림일
   * 때만 이 모듈 표에 읽음 행(`operation_failure`, RESOLVED)을 쓴다 — 실행 표는 common/operation 것이라 건드리지 않는다.
   */
  async dismiss(id: string, organizationId: string): Promise<void> {
    const result = await this.prisma.alert.updateMany({
      where: {
        id,
        organizationId,
        type: SOURCE_FAILURE_ALERT_TYPE,
        status: 'OPEN',
      },
      data: { readAt: new Date() },
    });
    if (result.count > 0) return;
    const item = (await this.operationFailures(organizationId)).find((candidate) => candidate.id === id);
    if (!item || item.status !== 'OPEN') throw new NotFoundException('Alert not found');
    const readAt = new Date();
    await this.prisma.alert.upsert({
      where: { organizationId_dedupeKey: { organizationId, dedupeKey: operationReadKey(id) } },
      create: {
        organizationId,
        dedupeKey: operationReadKey(id),
        attemptId: id,
        type: OPERATION_FAILURE_ALERT_TYPE,
        status: 'RESOLVED',
        title: item.title,
        sourceType: item.sourceType,
        href: item.href,
        readAt,
      },
      update: {},
    });
  }

  /**
   * Record how a source attempt ended. The module decides whether that is worth
   * an operator's attention at all, and shapes the message it will read.
   *
   * The three rules below used to be the caller's homework, and 24 call sites
   * kept them 24 different ways: credentials were scrubbed at 4 of them, the
   * column width was restated at each, and a user's cancellation was suppressed
   * under five different code spellings — or, in every `sourcing` owner, not at
   * all, so stopping a collection raised an error alert.
   */
  async recordTerminalOutcome(
    tx: Prisma.TransactionClient,
    input: SourceFailureAlertInput,
  ): Promise<void> {
    // A cancellation is the operator's own action, not a failure to show them
    // back. Every owner already names one `*_CANCELLED`, in five spellings —
    // `USER_CANCELLED`, `COLLECTION_CANCELLED`, `SOURCE_COLLECTION_CANCELLED`,
    // `SHADOW_COLLECTION_CANCELLED` — which is why the suffix is the rule and
    // not a list. `ATTEMPT_EXPIRED` deliberately still alerts: a collection that
    // never finished is something the operator wants to know about.
    if (input.code.endsWith('_CANCELLED')) {
      // Nothing at all — not even resolving what is already open. A failure the
      // source had before is still true; the operator cancelling a *new* attempt
      // did not fix it, and closing it here would hide it.
      return;
    }
    return this.upsertSourceFailure(tx, input);
  }

  private async upsertSourceFailure(
    tx: Prisma.TransactionClient,
    input: SourceFailureAlertInput,
  ): Promise<void> {
    const existing = await tx.alert.findUnique({
      where: {
        organizationId_dedupeKey: {
          organizationId: input.organizationId,
          dedupeKey: input.dedupeKey,
        },
      },
    });

    // A replay of the same attempt is intentionally a read-only operation:
    // this preserves both read state and timestamps that drive unread UI.
    if (existing?.attemptId === input.attemptId) return;

    const data = sourceFailureData(input);
    if (!existing) {
      await tx.alert.create({ data });
      return;
    }

    const result = await tx.alert.updateMany({
      where: {
        id: existing.id,
        organizationId: input.organizationId,
        dedupeKey: input.dedupeKey,
      },
      data,
    });
    if (result.count === 0) {
      throw new NotFoundException('Alert not found');
    }
  }

  async resolveSourceFailure(
    tx: Prisma.TransactionClient,
    input: Pick<SourceFailureAlertInput, 'organizationId' | 'dedupeKey' | 'attemptId'>,
  ): Promise<void> {
    // The source owner has already fenced terminal completion to the current
    // attempt in its transaction. The alert row therefore follows that
    // completion attempt instead of comparing opaque UUIDs here.
    await tx.alert.updateMany({
      where: {
        organizationId: input.organizationId,
        dedupeKey: input.dedupeKey,
        status: 'OPEN',
      },
      // Resolution does not alter read state; dismiss is the only read
      // mutation exposed by the web surface.
      data: { status: 'RESOLVED', attemptId: input.attemptId },
    });
  }

}

/** The column is 300 wide; callers were each restating that. */
const MESSAGE_LIMIT = 300;


const HANGUL = /[가-힣]/;

/**
 * 운영자가 읽는 제목·문장은 이 writer가 만든다(ADR-0023, 웹 `attemptFailureText`와 같은 규칙). producer가
 * 넘긴 `message`가 한국어면 원천 문맥을 담은 문장이라 그대로(자격 증명은 가린다), 아니면 코드의 레지스트리
 * 문장(`operatorErrorText`; 모르는 코드는 원천별 일반 문장) — 영어·변수명이 알림에 닿던 경로다. 제목은
 * producer가 한국어로 주면 그대로, 아니면 `<원천> 실패`. 확장이 종료 제출로 보낸 원문은 attempt `errorMessage`에 그대로 남는다(확장이 자기
 * `body.message`와 비교한다); 서버 자신의 실패 문장만 producer가 `operatorErrorText`로 저장한다.
 */
function sourceFailureData(input: SourceFailureAlertInput) {
  return {
    organizationId: input.organizationId,
    dedupeKey: input.dedupeKey,
    sourceType: input.sourceType,
    attemptId: input.attemptId,
    status: 'OPEN',
    type: SOURCE_FAILURE_ALERT_TYPE,
    title: HANGUL.test(input.title) ? input.title : `${sourceLabel(input.sourceType)} 실패`,
    message: (HANGUL.test(input.message)
      ? redact(input.message)
      : operatorErrorText({ code: input.code, source: input.sourceType })).slice(0, MESSAGE_LIMIT),
    href: input.href,
    // A newer failure is unread again.
    readAt: null,
  } satisfies Prisma.AlertUncheckedCreateInput;
}
