'use client';

// Orders 작업 실행 kind 6종(KID-366 wave8b, `@kiditem/shared/orders-action-operations`) — 옛 확장 워커 액션(셀피아 전송·
// 후처리·자동송장·스냅샷, 쿠팡 배송 목록, 몰 송장 업로드)의 자리. 웹은 확장에 `operation.start`만 보내고, 결과는 서버가 든
// 실행 `result`를 `GET /api/operations/:id`로 읽는다. 몰·셀피아에 제출했지만 확인하지 못한 실행(`reconciling`)은 운영자가
// 확인하거나 닫는다(`POST /api/orders/action-operations/:id/confirm|close`).
// 주문 화면과 쿠팡 쉽먼트 화면(두 route group)이 함께 써서 공용 lib에 둔다.

import type { z } from 'zod';
import {
  isOperationTerminal,
  OperationFinishResponseSchema,
  type OperationKind,
  type OperationView,
} from '@kiditem/shared/operation';
import {
  COUPANG_SHIPMENT_LIST_KIND,
  CoupangShipmentListResultSchema,
  MALL_TRACKING_UPLOAD_KIND,
  MallTrackingUploadResultSchema,
  MallTrackingUploadScopeSchema,
  ORDERS_ACTION_OPERATION_CAPABILITY,
  SELLPIA_AUTO_INVOICE_KIND,
  SELLPIA_ORDER_SNAPSHOT_KIND,
  SELLPIA_ORDER_TRANSFER_KIND,
  SELLPIA_POST_TRANSFER_KIND,
  SellpiaAutoInvoiceResultSchema,
  SellpiaOrderSnapshotResultSchema,
  SellpiaOrderTransferResultSchema,
  SellpiaOrderTransferScopeSchema,
  SellpiaPostTransferResultSchema,
  type CoupangShipmentListResult,
  type MallTrackingUploadResult,
  type MallTrackingUploadScope,
  type SellpiaAutoInvoiceResult,
  type SellpiaOrderSnapshotResult,
  type SellpiaOrderTransferResult,
  type SellpiaOrderTransferScope,
  type SellpiaPostTransferResult,
} from '@kiditem/shared/orders-action-operations';
import { apiClient } from './api-client';
import { noteOperationLoginFailureForMall, operationLoginOptions, ROCKET_LOGIN_MALL_KEY } from './operation-login';
import { requestOperationStart } from './operation-start';
import { attemptFailureText } from './operator-error';

/** 기다림 상한. 옛 액션 응답 제한 가운데 가장 긴 것(후처리 240초)보다 넉넉히. */
const WAIT_LIMIT_MS = 300_000;
const POLL_MS = 2_000;

/** 성공이면 result, 제출했지만 확인하지 못했으면(`reconciling`) 운영자 확인이 필요하다는 표시. */
export type OrderActionOutcome<T> =
  | Readonly<{ status: 'succeeded'; operationId: string; result: T }>
  | Readonly<{ status: 'needs_confirmation'; operationId: string }>;

export interface OrderActionWaitOptions {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}

/** 실패·중단으로 끝난 실행. `code`는 서버 등록 코드 — 화면은 문장이 아니라 이 값으로 가른다. */
export class OrderActionFailure extends Error {
  readonly operation: OperationView;
  readonly code: string | null;

  constructor(operation: OperationView, message: string) {
    super(message);
    this.name = 'OrderActionFailure';
    this.operation = operation;
    this.code = operation.errorCode;
  }
}

/** 기다림 상한이 지났는데 실행이 아직 돈다. 실행은 확장에서 이어진다. */
export class OrderActionStillRunning extends Error {
  readonly operationId: string;

  constructor(operationId: string) {
    super('실행이 아직 끝나지 않았습니다. 잠시 후 다시 확인해 주세요.');
    this.name = 'OrderActionStillRunning';
    this.operationId = operationId;
  }
}

const RESULT_UNREADABLE = '실행은 끝났지만 결과를 읽지 못했습니다. 확장 프로그램과 웹을 새로 고친 뒤 다시 확인해 주세요.';

async function startOrderAction(kind: OperationKind, scope: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<string> {
  const outcome = await requestOperationStart(kind, scope, { capability: ORDERS_ACTION_OPERATION_CAPABILITY, ...extra });
  if (outcome.outcome === 'refused') throw new Error(outcome.message);
  if (!outcome.operationId) throw new Error('확장 프로그램이 실행 번호를 알려 주지 않았습니다. 잠시 후 다시 시도해 주세요.');
  return outcome.operationId;
}

async function waitForOrderAction<T>(
  kind: OperationKind,
  operationId: string,
  schema: z.ZodType<T>,
  options: OrderActionWaitOptions,
  onFinished?: (operation: OperationView) => void,
): Promise<OrderActionOutcome<T>> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + (options.timeoutMs ?? WAIT_LIMIT_MS);
  for (;;) {
    const { operation } = OperationFinishResponseSchema.parse(
      await apiClient.get(`/api/operations/${encodeURIComponent(operationId)}`),
    );
    if (operation.kind !== kind) throw new Error('다른 종류의 실행입니다.');
    if (operation.status === 'reconciling') return { status: 'needs_confirmation', operationId };
    if (isOperationTerminal(operation.status)) {
      onFinished?.(operation);
      if (operation.status !== 'succeeded') {
        throw new OrderActionFailure(operation, attemptFailureText(operation, kind) ?? '실행이 실패했습니다.');
      }
      const parsed = schema.safeParse(operation.result);
      if (!parsed.success) throw new Error(RESULT_UNREADABLE);
      return { status: 'succeeded', operationId, result: parsed.data };
    }
    if (now() >= deadline) throw new OrderActionStillRunning(operationId);
    await sleep(POLL_MS);
  }
}

/** 셀피아 주문 전송: 원천 실행(몰 주문·직배송·수동 업로드)의 파일을 서버가 다시 만들어 확장이 셀피아에 올린다. */
export async function startSellpiaOrderTransfer(
  scope: SellpiaOrderTransferScope,
  options: OrderActionWaitOptions = {},
): Promise<OrderActionOutcome<SellpiaOrderTransferResult>> {
  const parsed = SellpiaOrderTransferScopeSchema.parse(scope);
  const operationId = await startOrderAction(SELLPIA_ORDER_TRANSFER_KIND, parsed);
  return waitForOrderAction(SELLPIA_ORDER_TRANSFER_KIND, operationId, SellpiaOrderTransferResultSchema, options);
}

/** 셀피아 후처리(등록 → 자동합포·자동재고매칭, 화면 전체). */
export async function runSellpiaPostTransfer(options: OrderActionWaitOptions = {}): Promise<OrderActionOutcome<SellpiaPostTransferResult>> {
  const operationId = await startOrderAction(SELLPIA_POST_TRANSFER_KIND, {});
  return waitForOrderAction(SELLPIA_POST_TRANSFER_KIND, operationId, SellpiaPostTransferResultSchema, options);
}

/** ⚠️되돌리기 어려움: 셀피아 송장 자동채번. 대상은 서버가 정한다(최근 24시간 전송 − 이미 발급). 화면 확인 뒤에만 부른다. */
export async function runSellpiaAutoInvoice(options: OrderActionWaitOptions = {}): Promise<OrderActionOutcome<SellpiaAutoInvoiceResult>> {
  const operationId = await startOrderAction(SELLPIA_AUTO_INVOICE_KIND, {});
  return waitForOrderAction(SELLPIA_AUTO_INVOICE_KIND, operationId, SellpiaAutoInvoiceResultSchema, options);
}

/** 셀피아 주문 스냅샷(읽기): 대기목록·재고매칭 두 화면의 주문. 읽기 kind라 `reconciling`이 없다. */
export async function collectSellpiaOrderSnapshotOperation(options: OrderActionWaitOptions = {}): Promise<SellpiaOrderSnapshotResult> {
  const operationId = await startOrderAction(SELLPIA_ORDER_SNAPSHOT_KIND, {});
  const outcome = await waitForOrderAction(SELLPIA_ORDER_SNAPSHOT_KIND, operationId, SellpiaOrderSnapshotResultSchema, options);
  if (outcome.status !== 'succeeded') throw new Error(RESULT_UNREADABLE);
  return outcome.result;
}

/** 쿠팡 배송 목록(읽기): 발송일 하나의 쉽먼트 행. 로그인 화면이면 확장이 로켓 계정 저장 자격으로 로그인한다. */
export async function collectCoupangShipmentList(date: string, options: OrderActionWaitOptions = {}): Promise<CoupangShipmentListResult> {
  const operationId = await startOrderAction(COUPANG_SHIPMENT_LIST_KIND, { date }, await operationLoginOptions(ROCKET_LOGIN_MALL_KEY));
  const outcome = await waitForOrderAction(
    COUPANG_SHIPMENT_LIST_KIND,
    operationId,
    CoupangShipmentListResultSchema,
    options,
    // 로켓 계정 자격을 서플라이어 허브가 거절했으면 그 계정의 자동 로그인을 멈춘다(KID-377).
    (operation) => noteOperationLoginFailureForMall(ROCKET_LOGIN_MALL_KEY, operation),
  );
  if (outcome.status !== 'succeeded') throw new Error(RESULT_UNREADABLE);
  return outcome.result;
}

/** ⚠️되돌리기 어려움: 몰(온채널·키드키즈) 송장 업로드. 행은 서버가 송장 조회 실행의 캡처에서 그 몰 것만 고른다. */
export async function uploadMallTracking(
  scope: MallTrackingUploadScope,
  options: OrderActionWaitOptions = {},
): Promise<OrderActionOutcome<MallTrackingUploadResult>> {
  const operationId = await startOrderAction(MALL_TRACKING_UPLOAD_KIND, MallTrackingUploadScopeSchema.parse(scope));
  return waitForOrderAction(MALL_TRACKING_UPLOAD_KIND, operationId, MallTrackingUploadResultSchema, options);
}

const actionPath = (operationId: string, action: 'confirm' | 'close') =>
  `/api/orders/action-operations/${encodeURIComponent(operationId)}/${action}`;

/** 운영자가 몰·셀피아에서 제출을 확인했다 — `reconciling` 실행을 성공으로 닫는다. */
export async function confirmOrderActionOperation(operationId: string): Promise<OperationView | null> {
  return readResolved(await apiClient.post<unknown>(actionPath(operationId, 'confirm'), {}));
}

/** 운영자가 몰·셀피아에서 보니 제출되지 않았다 — `reconciling` 실행을 실패로 닫는다. */
export async function closeOrderActionOperation(operationId: string, reason: string): Promise<OperationView | null> {
  return readResolved(await apiClient.post<unknown>(actionPath(operationId, 'close'), { reason }));
}

function readResolved(response: unknown): OperationView | null {
  const parsed = OperationFinishResponseSchema.safeParse(response);
  return parsed.success ? parsed.data.operation : null;
}
