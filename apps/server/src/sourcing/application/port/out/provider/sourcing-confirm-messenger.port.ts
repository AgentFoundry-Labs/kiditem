import type { ConfirmMessage } from '../../../../domain/sourcing-confirm-report';

export const SOURCING_CONFIRM_MESSENGER_PORT = Symbol('SourcingConfirmMessengerPort');

export interface ConfirmMessengerSetup {
  /** 봇 토큰이 설정됐는가. */
  configured: boolean;
  /** 보고를 받을 채팅이 설정됐는가. */
  chatConfigured: boolean;
  /** 이 서버 프로세스가 답장을 받아 읽는가. */
  listening: boolean;
}

export type ConfirmMessengerEvent =
  | {
      kind: 'button';
      /** 누른 사람에게 짧게 답할 때 쓰는 열쇠. */
      replyToken: string;
      chatId: string;
      messageId: number;
      /** 설정된 채팅에서 허용된 사람이 누른 것인가. */
      authorized: boolean;
      /** 서명이 맞는 버튼 값. 서명이 틀리거나 없으면 `null`. */
      payload: string | null;
      /** 같은 메시지에 달린 버튼 값 가운데 서명이 맞는 것 전부(순서대로). */
      messagePayloads: readonly string[];
    }
  | {
      kind: 'text';
      chatId: string;
      authorized: boolean;
      text: string;
    };

export type ConfirmMessengerReceiveResult =
  | { kind: 'ok'; events: readonly ConfirmMessengerEvent[] }
  /** 같은 봇으로 다른 곳이 이미 답장을 읽고 있다. */
  | { kind: 'conflict' }
  /** 봇 토큰이 틀렸다. 고칠 때까지 다시 시도해도 소용없다. */
  | { kind: 'unauthorized' }
  | { kind: 'unavailable'; retryAfterMs: number };

/**
 * 사장님 컨펌 보고를 주고받는 메신저.
 *
 * 토큰 · 채팅 · 허용된 사람은 어댑터가 서버 환경설정에서 읽고 밖으로 내보내지 않는다.
 * 버튼 값의 서명도 어댑터 몫이다 — 서비스는 서명 전 값만 주고받는다.
 */
export interface SourcingConfirmMessengerPort {
  setup(): ConfirmMessengerSetup;
  /** 봇 이름. 모르거나 설정 전이면 `null`. */
  identity(): Promise<{ username: string | null }>;
  /** 설정된 채팅으로 보고 한 장을 보낸다. */
  sendReport(message: ConfirmMessage): Promise<{ messageId: number }>;
  /** 설정된 채팅의 보고 한 장을 고쳐 쓴다. 내용이 같으면 조용히 넘어간다. */
  editReport(messageId: number, message: ConfirmMessage): Promise<void>;
  /** 봇에게 말을 건 채팅에 답한다(연결 안내용). */
  reply(chatId: string, message: ConfirmMessage): Promise<void>;
  /** 버튼을 누른 사람에게 짧은 알림을 띄운다. */
  answer(replyToken: string, text: string): Promise<void>;
  /** 새 답장을 한 번 기다려 받는다. */
  receive(signal: AbortSignal): Promise<ConfirmMessengerReceiveResult>;
}
