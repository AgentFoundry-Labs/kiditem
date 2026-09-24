import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { operatorErrorText, sourceLabel } from '@kiditem/shared/errors';
import { redact } from '../common/redact';
import type {
  AlertItem,
  SourceFailureAlertInput,
} from '@kiditem/shared/alerts';
import type { Alert } from '@prisma/client';

export type { SourceFailureAlertInput } from '@kiditem/shared/alerts';

/**
 * The one alert this module writes, and so the one it reads. Rows another
 * writer left in the table stay there until the schema cutover (KID-90); no
 * reader sees them.
 */
const SOURCE_FAILURE_ALERT_TYPE = 'source_failure';

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
    const rows = await this.prisma.alert.findMany({
      where: {
        organizationId,
        type: SOURCE_FAILURE_ALERT_TYPE,
        ...(options.isRead === undefined
          ? {}
          : { readAt: options.isRead ? { not: null } : null }),
        ...(options.status ? { status: options.status } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      ...(options.limit === undefined ? {} : { take: options.limit }),
    });
    return rows.map(mapAlert);
  }

  async dismiss(id: string, organizationId: string): Promise<void> {
    const result = await this.prisma.alert.updateMany({
      where: {
        id,
        organizationId,
        status: 'OPEN',
      },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Alert not found');
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
