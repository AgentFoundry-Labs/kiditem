import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  decodeConfirmPayload,
  encodeConfirmPayload,
  itemKeyPrefix,
  type ConfirmMessage,
} from '../../../domain/sourcing-confirm-report';
import type { ConfirmMessengerEvent } from '../../port/out/provider/sourcing-confirm-messenger.port';
import { SourcingConfirmReportService } from '../sourcing-confirm-report.service';

const ORG = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000010';
const keyOf = (index: number) => index.toString(16).padStart(2, '0').repeat(32);

function presenterItem(index: number) {
  return {
    itemKey: keyOf(index),
    displayName: `후보 상품 ${index}`,
    sourceUrl: `https://detail.1688.com/offer/${index}.html`,
    overseasPriceCny: 10 + index,
    overseasPriceKrw: 2000 + index,
    salePriceKrw: 9900,
    estimatedMarginRate: 30,
    monthlySales: 500,
    coupang: null,
  };
}

function setup(options: {
  items?: number;
  selections?: Array<{ itemKey: string; state: 'neutral' | 'selected' | 'removed'; version: number }>;
  configured?: boolean;
  chatConfigured?: boolean;
} = {}) {
  const items = Array.from({ length: options.items ?? 3 }, (_, index) => presenterItem(index + 1));
  let selections = options.selections ?? [];
  const messenger = {
    setup: vi.fn(() => ({
      configured: options.configured ?? true,
      chatConfigured: options.chatConfigured ?? true,
      listening: true,
    })),
    identity: vi.fn(async () => ({ username: 'kiditem_confirm_bot' })),
    sendReport: vi.fn(async (_message: ConfirmMessage) => ({ messageId: 1 })),
    editReport: vi.fn(async (_messageId: number, _message: ConfirmMessage) => undefined),
    reply: vi.fn(async (_chatId: string, _message: ConfirmMessage) => undefined),
    answer: vi.fn(async (_token: string, _text: string) => undefined),
    receive: vi.fn(),
  };
  const recommendations = {
    latest: vi.fn(async () => ({
      status: 'ready',
      generatedAt: '2026-09-13T05:20:00.000Z',
      data: { runId: RUN_ID, items, nextCursor: null },
    })),
  };
  const reviews = {
    listSelections: vi.fn(async () => selections),
    saveSelection: vi.fn(async (input: { itemKey: string; state: 'neutral' | 'selected' | 'removed'; expectedVersion: number }) => {
      selections = [
        ...selections.filter((selection) => selection.itemKey !== input.itemKey),
        { itemKey: input.itemKey, state: input.state, version: input.expectedVersion + 1 },
      ];
      return selections.at(-1);
    }),
  };
  const service = new SourcingConfirmReportService(messenger as never, recommendations as never, reviews as never);
  return { service, messenger, recommendations, reviews };
}

function button(action: 'approve' | 'reject' | 'undo', no: number, index: number, overrides: Partial<Extract<ConfirmMessengerEvent, { kind: 'button' }>> = {}) {
  const payloadFor = (act: 'approve' | 'reject' | 'undo', n: number, i: number) =>
    encodeConfirmPayload({ action: act, no: n, organizationId: ORG, keyPrefix: itemKeyPrefix(keyOf(i)) });
  return {
    kind: 'button' as const,
    replyToken: 'cb-1',
    chatId: '987654321',
    messageId: 55,
    authorized: true,
    payload: payloadFor(action, no, index),
    messagePayloads: [payloadFor('approve', 1, 1), payloadFor('reject', 1, 1), payloadFor('approve', 2, 2), payloadFor('reject', 2, 2)],
    ...overrides,
  };
}

const bodyText = (message: ConfirmMessage) => message.lines.map((line) => line.map((segment) => segment.text).join('')).join('\n');

describe('SourcingConfirmReportService', () => {
  it('⭐ 컨펌 대기 후보만 머리말 한 장 + 묶음으로 보낸다', async () => {
    const { service, messenger } = setup({
      items: 10,
      selections: [{ itemKey: keyOf(1), state: 'selected', version: 1 }],
    });

    const result = await service.sendReport(ORG);

    expect(result).toMatchObject({ runId: RUN_ID, reported: 9, pending: 9, messages: 3 });
    const sent = messenger.sendReport.mock.calls.map(([message]) => message);
    expect(bodyText(sent[0]!)).toContain('후보 10개 중 컨펌 대기 9개');
    // 이미 승인한 1번 상품은 빼고, 대기 후보를 1번부터 다시 센다.
    expect(bodyText(sent[1]!)).not.toContain('후보 상품 1\n');
    expect(bodyText(sent[1]!)).toContain('⬜ 1. 후보 상품 2');
    expect(sent.slice(1).flatMap((message) => message.buttons).length).toBe(9);
    await expect(service.status(ORG)).resolves.toMatchObject({
      botUsername: 'kiditem_confirm_bot',
      lastReport: { runId: RUN_ID, itemCount: 9 },
      candidates: { total: 10, pending: 9, approved: 1, rejected: 0 },
    });
  });

  it('설정이 없거나 기다리는 후보가 없으면 보내지 않는다', async () => {
    await expect(setup({ configured: false }).service.sendReport(ORG)).rejects.toMatchObject({ status: 503 });
    await expect(setup({ chatConfigured: false }).service.sendReport(ORG)).rejects.toMatchObject({ status: 503 });

    const decided = setup({
      items: 1,
      selections: [{ itemKey: keyOf(1), state: 'removed', version: 2 }],
    });
    await expect(decided.service.sendReport(ORG)).rejects.toMatchObject({ status: 409 });
    expect(decided.messenger.sendReport).not.toHaveBeenCalled();
  });

  it('⭐ 승인 버튼은 최종 선택에 selected 로 남기고, 누른 메시지를 되돌리기 버튼으로 고쳐 쓴다', async () => {
    const { service, messenger, reviews } = setup();

    await service.handleEvent(button('approve', 2, 2));

    expect(reviews.saveSelection).toHaveBeenCalledWith({
      organizationId: ORG,
      workspaceKey: 'final',
      recommendationRunId: RUN_ID,
      itemKey: keyOf(2),
      state: 'selected',
      expectedVersion: 0,
    });
    expect(messenger.answer).toHaveBeenCalledWith('cb-1', '2번 승인했습니다');
    const [messageId, page] = messenger.editReport.mock.calls[0]!;
    expect(messageId).toBe(55);
    expect(page.buttons.map((row) => row.map((entry) => decodeConfirmPayload(entry.payload)?.action))).toEqual([
      ['approve', 'reject'],
      ['undo'],
    ]);
  });

  it('⭐ 웹에서 먼저 바꿔 버전이 어긋나면 최신 버전으로 한 번만 다시 쓴다', async () => {
    const { service, reviews } = setup({ selections: [{ itemKey: keyOf(1), state: 'neutral', version: 3 }] });
    reviews.saveSelection.mockRejectedValueOnce(
      new ConflictException({ code: 'REVIEW_SELECTION_VERSION_CONFLICT', currentVersion: 4 }),
    );

    await service.handleEvent(button('reject', 1, 1));

    expect(reviews.saveSelection.mock.calls.map(([input]) => [input.state, input.expectedVersion])).toEqual([
      ['removed', 3],
      ['removed', 4],
    ]);
  });

  it('⭐ 허락되지 않은 사람이나 서명이 틀린 버튼은 아무것도 쓰지 않는다', async () => {
    const { service, messenger, reviews } = setup();

    await service.handleEvent(button('approve', 1, 1, { authorized: false }));
    await service.handleEvent(button('approve', 1, 1, { payload: null }));

    expect(reviews.saveSelection).not.toHaveBeenCalled();
    expect(messenger.editReport).not.toHaveBeenCalled();
    expect(messenger.answer.mock.calls.map(([, text]) => text)).toEqual([
      '이 보고에 답할 권한이 없습니다.',
      '버튼을 읽지 못했습니다. 새 보고를 보내 주세요.',
    ]);
  });

  it('새 추천에서 빠진 상품은 결정하지 않고 빠졌다고 알린다', async () => {
    const { service, messenger, reviews } = setup({ items: 1 });

    await service.handleEvent(button('approve', 2, 2));

    expect(reviews.saveSelection).not.toHaveBeenCalled();
    expect(messenger.answer).toHaveBeenCalledWith('cb-1', '새 추천에서 빠진 상품입니다.');
    const [, page] = messenger.editReport.mock.calls[0]!;
    expect(bodyText(page)).toContain('2. 새 추천에서 빠진 상품');
  });

  it('채팅이 정해지기 전 /start 에는 채팅 ID를 알려 주고, 상태에도 보인다', async () => {
    const { service, messenger } = setup({ chatConfigured: false });

    await service.handleEvent({ kind: 'text', chatId: '424242', authorized: false, text: '/start' });
    await service.handleEvent({ kind: 'text', chatId: '777', authorized: false, text: '안녕' });

    expect(messenger.reply).toHaveBeenCalledTimes(1);
    expect(bodyText(messenger.reply.mock.calls[0]![1])).toContain('이 채팅의 ID는 424242 입니다.');
    await expect(service.status(ORG)).resolves.toMatchObject({ setupChatId: '424242', chatConfigured: false });
  });
});
