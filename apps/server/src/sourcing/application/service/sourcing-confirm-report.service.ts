import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt, timingSafeEqual } from 'node:crypto';
import {
  CONFIRM_PAGE_SIZE,
  CONFIRM_REPORT_MAX_ITEMS,
  confirmItemState,
  decodeConfirmPayload,
  entriesFromPayloads,
  itemKeyPrefix,
  renderConfirmHeader,
  renderConfirmPage,
  renderHelpReply,
  renderSetupReply,
  renderSetupTokenReply,
  selectionStateFor,
  type ConfirmAction,
  type ConfirmCandidate,
  type ConfirmEntry,
  type ConfirmItemState,
  type ConfirmSelectionState,
} from '../../domain/sourcing-confirm-report';
import {
  SOURCING_CONFIRM_MESSENGER_PORT,
  type ConfirmMessengerEvent,
  type SourcingConfirmMessengerPort,
} from '../port/out/provider/sourcing-confirm-messenger.port';
import {
  SourcingRecommendationService,
  type SourcingRecommendationPresenterItem,
} from './sourcing-recommendation.service';
import { SourcingReviewService } from './sourcing-review.service';

/** 최종 선택 화면과 같은 후보 목록을 본다. */
const FINAL_SURFACE_LIMIT = 100;

const ANSWER: Readonly<Record<Exclude<ConfirmAction, 'info'>, string>> = {
  approve: '승인했습니다',
  reject: '반려했습니다',
  undo: '되돌렸습니다',
};

export interface SourcingConfirmReportStatus {
  channel: 'telegram';
  configured: boolean;
  chatConfigured: boolean;
  listening: boolean;
  botUsername: string | null;
  /**
   * 설정 토큰과 함께 `/start <토큰>` 을 보낸 채팅. 설정값으로 옮겨 적는 용도다. owner · admin 에게만
   * 보이고, 채팅이 이미 정해졌으면 `null`.
   */
  setupChatId: string | null;
  /** 아직 쓰지 않은 설정 토큰의 만료 시각. owner · admin 에게만 보인다. */
  setupTokenExpiresAt: string | null;
  /** 이 서버가 켜진 뒤 보낸 마지막 보고. 서버를 다시 켜면 비어 있다. */
  lastReport: { sentAt: string; runId: string; itemCount: number } | null;
  /** 최신 추천의 최종 후보와 결정 수. 추천이 없으면 `null`. */
  candidates: {
    runId: string;
    generatedAt: string;
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  } | null;
}

export interface SourcingConfirmSetupToken {
  token: string;
  expiresAt: string;
}

export interface SourcingConfirmReportSendResult {
  runId: string;
  sentAt: string;
  /** 이번 보고에 담은 후보 수. */
  reported: number;
  /** 보낼 때 컨펌을 기다리던 후보 수. */
  pending: number;
  messages: number;
}

interface BoardItem {
  itemKey: string;
  keyPrefix: string;
  candidate: ConfirmCandidate;
  selectionState: ConfirmSelectionState;
  state: ConfirmItemState;
  version: number;
}

interface Board {
  runId: string;
  generatedAt: string;
  items: BoardItem[];
  /** 열쇠 앞자리로 찾기. 두 상품이 같은 앞자리를 가지면 `null` — 어느 쪽인지 모르면 쓰지 않는다. */
  byPrefix: Map<string, BoardItem | null>;
}

const STALE_ANSWER = '웹에서 이미 결정돼 반영하지 않았습니다';
const ORGANIZATION_NOT_BOUND = 'TELEGRAM_ORGANIZATION_NOT_BOUND';
/** 채팅 설정 토큰. 대문자 · 숫자 8자, 10분 동안 한 번만 쓴다. */
const SETUP_TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SETUP_TOKEN_LENGTH = 8;
const SETUP_TOKEN_TTL_MS = 10 * 60_000;
/** 채팅 ID와 설정 토큰을 볼 수 있는 역할. 보내기 · 토큰 발급과 같은 사람들이다. */
const MANAGER_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);

type ButtonEvent = Extract<ConfirmMessengerEvent, { kind: 'button' }>;
type TextEvent = Extract<ConfirmMessengerEvent, { kind: 'text' }>;

/**
 * 사장님 컨펌 — 최종 후보 리스트를 텔레그램으로 보고하고, 버튼 답장을 최종 선택에 남긴다.
 *
 * 결정은 최종 선택 화면이 쓰는 그 자리(`final` 선택)에 쓴다. 승인은 `selected`, 반려는
 * `removed`, 되돌리기는 `neutral` 이다. 버튼에 실린 버전이 지금 버전과 다르면(웹에서 먼저
 * 결정했으면) 반영하지 않고 그렇다고 답한다. 누를 때마다 최신 추천에서 상품을 다시 찾으므로, 보고 뒤에
 * 추천이 새로 계산돼도 같은 상품이면 새 추천에 반영되고 빠진 상품이면 빠졌다고 답한다.
 */
@Injectable()
export class SourcingConfirmReportService {
  private readonly logger = new Logger(SourcingConfirmReportService.name);
  private readonly lastReports = new Map<string, { sentAt: string; runId: string; itemCount: number }>();
  private readonly sending = new Set<string>();
  private setupChatId: string | null = null;
  /** 설정 토큰은 이 프로세스 메모리에만 둔다. Office API 는 프로세스 하나다. */
  private setupToken: { value: string; expiresAt: number } | null = null;

  constructor(
    @Inject(SOURCING_CONFIRM_MESSENGER_PORT)
    private readonly messenger: SourcingConfirmMessengerPort,
    private readonly recommendations: SourcingRecommendationService,
    private readonly reviews: SourcingReviewService,
  ) {}

  async status(organizationId: string, role: string): Promise<SourcingConfirmReportStatus> {
    const setup = this.messenger.setup();
    if (setup.organizationId === null) return disabledStatus();
    assertBound(setup.organizationId, organizationId);
    const manager = MANAGER_ROLES.has(role);
    const [botUsername, board] = await Promise.all([
      setup.configured
        ? this.messenger.identity().then((me) => me.username, () => null)
        : Promise.resolve(null),
      this.loadBoard(organizationId),
    ]);
    const count = (state: ConfirmItemState) => board?.items.filter((item) => item.state === state).length ?? 0;
    return {
      channel: 'telegram',
      configured: setup.configured,
      chatConfigured: setup.chatConfigured,
      listening: setup.listening,
      botUsername,
      setupChatId: manager && !setup.chatConfigured ? this.setupChatId : null,
      setupTokenExpiresAt: manager ? this.pendingSetupTokenExpiry() : null,
      lastReport: this.lastReports.get(organizationId) ?? null,
      candidates: board
        ? {
            runId: board.runId,
            generatedAt: board.generatedAt,
            total: board.items.length,
            pending: count('pending'),
            approved: count('approved'),
            rejected: count('rejected'),
          }
        : null,
    };
  }

  /**
   * 채팅을 정할 1회용 토큰을 만든다. 텔레그램 채팅에서 `/start <토큰>` 을 보내면 그 채팅이 설정
   * 채팅이 된다. 새로 만들면 이전 토큰은 버린다.
   */
  async issueSetupToken(organizationId: string): Promise<SourcingConfirmSetupToken> {
    requireBound(this.messenger.setup().organizationId, organizationId);
    const value = Array.from({ length: SETUP_TOKEN_LENGTH }, () => SETUP_TOKEN_ALPHABET[randomInt(SETUP_TOKEN_ALPHABET.length)]).join('');
    const expiresAt = Date.now() + SETUP_TOKEN_TTL_MS;
    this.setupToken = { value, expiresAt };
    return { token: value, expiresAt: new Date(expiresAt).toISOString() };
  }

  async sendReport(organizationId: string): Promise<SourcingConfirmReportSendResult> {
    const setup = this.messenger.setup();
    requireBound(setup.organizationId, organizationId);
    if (!setup.configured) {
      throw new ServiceUnavailableException(
        '텔레그램 보고를 쓰려면 서버에 SOURCING_CONFIRM_TELEGRAM_BOT_TOKEN 설정이 필요합니다.',
      );
    }
    if (!setup.chatConfigured) {
      throw new ServiceUnavailableException(
        '보고받을 채팅이 정해지지 않았습니다. Agent Org 텔레그램 칸에서 설정 토큰을 받아 채팅에 /start <토큰>을 보내고, 표시된 채팅 ID를 SOURCING_CONFIRM_TELEGRAM_CHAT_ID에 넣은 뒤 다시 시작하세요.',
      );
    }
    if (this.sending.has(organizationId)) {
      throw new ConflictException('보고를 보내는 중입니다. 잠시 뒤에 다시 확인해 주세요.');
    }

    this.sending.add(organizationId);
    let messages = 0;
    try {
      const board = await this.loadBoard(organizationId);
      if (!board || board.items.length === 0) {
        throw new NotFoundException('보고할 최종 후보가 아직 없습니다. 추천을 먼저 만들어 주세요.');
      }
      const pending = board.items.filter((item) => item.state === 'pending');
      if (pending.length === 0) {
        throw new ConflictException('컨펌을 기다리는 후보가 없습니다. 모두 결정됐습니다.');
      }
      const reported = pending.slice(0, CONFIRM_REPORT_MAX_ITEMS);

      await this.messenger.sendReport(renderConfirmHeader({
        generatedAt: board.generatedAt,
        total: board.items.length,
        pending: pending.length,
        reported: reported.length,
      }));
      messages += 1;
      for (let start = 0; start < reported.length; start += CONFIRM_PAGE_SIZE) {
        const entries: ConfirmEntry[] = reported.slice(start, start + CONFIRM_PAGE_SIZE).map((item, index) => ({
          no: start + index + 1,
          keyPrefix: item.keyPrefix,
          candidate: item.candidate,
          state: item.state,
          version: item.version,
        }));
        await this.messenger.sendReport(renderConfirmPage(organizationId, entries));
        messages += 1;
      }

      const sentAt = new Date().toISOString();
      this.lastReports.set(organizationId, { sentAt, runId: board.runId, itemCount: reported.length });
      return { runId: board.runId, sentAt, reported: reported.length, pending: pending.length, messages };
    } catch (error) {
      // 첫 장부터 실패했으면 원래 이유(채팅 없음 · 토큰 틀림)를 그대로 알린다. 몇 장은 이미 갔다면
      // 다시 보내기 전에 받은 만큼 보라고 알린다 — 같은 보고가 두 번 쌓이지 않게.
      if (messages > 0) {
        throw new BadGatewayException(
          `보고를 ${messages}장까지 보내고 멈췄습니다. 텔레그램에 온 보고부터 눌러 주세요.`,
        );
      }
      throw error;
    } finally {
      this.sending.delete(organizationId);
    }
  }

  async handleEvent(event: ConfirmMessengerEvent): Promise<void> {
    if (event.kind === 'text') {
      await this.handleText(event);
      return;
    }
    await this.handleButton(event);
  }

  private async handleText(event: TextEvent): Promise<void> {
    const [head, argument] = event.text.trim().split(/\s+/);
    const command = head?.split('@')[0]?.toLowerCase();
    if (command !== '/start' && command !== '/id') return;
    const setup = this.messenger.setup();
    if (setup.organizationId === null) return;
    if (!setup.chatConfigured) {
      // 토큰이 맞을 때만 이 채팅을 정한다. 아무나 /start 를 보내 채팅 ID를 상태 화면에 띄우지 못하게.
      if (argument && this.consumeSetupToken(argument)) {
        this.setupChatId = event.chatId;
        await this.messenger.reply(event.chatId, renderSetupReply(event.chatId));
      } else {
        await this.messenger.reply(event.chatId, renderSetupTokenReply());
      }
      return;
    }
    if (event.authorized) await this.messenger.reply(event.chatId, renderHelpReply());
  }

  private async handleButton(event: ButtonEvent): Promise<void> {
    if (!event.authorized) {
      await this.safeAnswer(event.replyToken, '이 보고에 답할 권한이 없습니다.');
      return;
    }
    const ref = event.payload ? decodeConfirmPayload(event.payload) : null;
    if (!ref) {
      await this.safeAnswer(event.replyToken, '버튼을 읽지 못했습니다. 새 보고를 보내 주세요.');
      return;
    }
    const bound = this.messenger.setup().organizationId;
    if (bound === null || ref.organizationId !== bound) {
      // 봇 하나는 한 조직만 쓴다. 다른 조직의 버튼 값은 서명이 맞아도 반영하지 않는다.
      this.logger.warn('묶인 조직이 아닌 텔레그램 컨펌 버튼을 반영하지 않았습니다.');
      return;
    }
    if (ref.action === 'info') {
      await this.safeAnswer(event.replyToken, '새 추천에서 빠진 상품이라 결정할 수 없습니다.');
      return;
    }

    const board = await this.loadBoard(ref.organizationId);
    const item = board?.byPrefix.get(ref.keyPrefix) ?? null;
    if (!board || !item) {
      await this.safeAnswer(event.replyToken, '새 추천에서 빠진 상품입니다.');
      await this.rewritePage(event, ref.organizationId, board);
      return;
    }

    const outcome = await this.decide(ref.organizationId, board.runId, item, ref.version, selectionStateFor(ref.action));
    if (outcome === 'stale') {
      await this.safeAnswer(event.replyToken, STALE_ANSWER);
      await this.rewritePage(event, ref.organizationId, await this.loadBoard(ref.organizationId));
      return;
    }
    const changed = outcome === 'written';
    await this.safeAnswer(event.replyToken, `${ref.no}번 ${ANSWER[ref.action]}`);
    await this.rewritePage(event, ref.organizationId, changed ? await this.loadBoard(ref.organizationId) : board);
    if (changed) this.logger.log(`텔레그램 컨펌 반영: ${ref.action} (run ${board.runId})`);
  }

  private pendingSetupTokenExpiry(): string | null {
    if (this.setupToken === null || this.setupToken.expiresAt <= Date.now()) return null;
    return new Date(this.setupToken.expiresAt).toISOString();
  }

  /** 토큰이 맞고 만료 전이면 소진하고 `true`. 만료된 토큰은 버린다. */
  private consumeSetupToken(candidate: string): boolean {
    const token = this.setupToken;
    if (token === null) return false;
    if (token.expiresAt <= Date.now()) {
      this.setupToken = null;
      return false;
    }
    const given = Buffer.from(candidate.toUpperCase());
    const expected = Buffer.from(token.value);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
    this.setupToken = null;
    return true;
  }

  /**
   * 최종 선택에 결정을 쓴다. 버튼을 그린 뒤 선택 버전이 바뀌었으면(웹에서 먼저 결정했으면) 쓰지
   * 않는다 — 사장님이 본 적 없는 상태를 덮어쓰지 않게. 이미 같은 상태면 쓰지 않는다.
   */
  private async decide(
    organizationId: string,
    recommendationRunId: string,
    item: BoardItem,
    renderedVersion: number,
    state: ConfirmSelectionState,
  ): Promise<'written' | 'unchanged' | 'stale'> {
    if (item.version !== renderedVersion) return 'stale';
    if (item.selectionState === state) return 'unchanged';
    try {
      await this.reviews.saveSelection({
        organizationId,
        workspaceKey: 'final',
        recommendationRunId,
        itemKey: item.itemKey,
        state,
        expectedVersion: item.version,
      });
      return 'written';
    } catch (error) {
      if (isVersionConflict(error)) return 'stale';
      throw error;
    }
  }

  /** 누른 메시지를 지금 상태로 다시 그린다. 실패해도 결정은 이미 남았으므로 로그만 남긴다. */
  private async rewritePage(event: ButtonEvent, organizationId: string, board: Board | null): Promise<void> {
    const page = entriesFromPayloads(event.messagePayloads);
    if (!page || page.organizationId !== organizationId) return;
    const entries: ConfirmEntry[] = page.refs.map(({ no, keyPrefix }) => {
      const item = board?.byPrefix.get(keyPrefix) ?? null;
      return { no, keyPrefix, candidate: item?.candidate ?? null, state: item?.state ?? 'pending', version: item?.version ?? 0 };
    });
    try {
      await this.messenger.editReport(event.messageId, renderConfirmPage(organizationId, entries));
    } catch (error) {
      this.logger.warn(`텔레그램 보고를 고쳐 쓰지 못했습니다: ${describeError(error)}`);
    }
  }

  private async safeAnswer(replyToken: string, text: string): Promise<void> {
    try {
      await this.messenger.answer(replyToken, text);
    } catch {
      // 오래된 버튼은 텔레그램이 답을 받지 않는다. 결정 반영과는 상관없다.
    }
  }

  private async loadBoard(organizationId: string): Promise<Board | null> {
    const envelope = await this.recommendations.latest({
      organizationId,
      surface: 'final',
      limit: FINAL_SURFACE_LIMIT,
    });
    if (!envelope.data) return null;
    const selections = await this.reviews.listSelections({
      organizationId,
      workspaceKey: 'final',
      recommendationRunId: envelope.data.runId,
    });
    const saved = new Map(selections.map((selection) => [selection.itemKey, selection]));
    const items = envelope.data.items.map((item): BoardItem => {
      const selection = saved.get(item.itemKey);
      return {
        itemKey: item.itemKey,
        keyPrefix: itemKeyPrefix(item.itemKey),
        candidate: toCandidate(item),
        selectionState: selection?.state ?? 'neutral',
        state: confirmItemState(selection?.state),
        version: selection?.version ?? 0,
      };
    });
    const byPrefix = new Map<string, BoardItem | null>();
    for (const item of items) byPrefix.set(item.keyPrefix, byPrefix.has(item.keyPrefix) ? null : item);
    return { runId: envelope.data.runId, generatedAt: envelope.generatedAt, items, byPrefix };
  }
}

/** 묶을 조직이 없으면 503, 다른 조직이면 403. */
function requireBound(bound: string | null, organizationId: string): void {
  if (bound === null) {
    throw new ServiceUnavailableException(
      '텔레그램 보고를 쓰려면 서버에 SOURCING_CONFIRM_TELEGRAM_ORGANIZATION_ID 설정이 필요합니다.',
    );
  }
  assertBound(bound, organizationId);
}

/** 봇이 묶인 조직이 아니면 거절한다. 보내기 · 상태 · 설정은 그 조직의 사람만 한다. */
function assertBound(bound: string, organizationId: string): void {
  if (bound === organizationId.toLowerCase()) return;
  throw new ForbiddenException({
    code: ORGANIZATION_NOT_BOUND,
    message: '텔레그램 컨펌 봇은 다른 조직에 연결돼 있어 이 조직에서는 쓸 수 없습니다.',
  });
}

/** 묶을 조직이 설정되지 않았을 때. 텔레그램 컨펌은 어느 조직에도 꺼져 있다. */
function disabledStatus(): SourcingConfirmReportStatus {
  return {
    channel: 'telegram',
    configured: false,
    chatConfigured: false,
    listening: false,
    botUsername: null,
    setupChatId: null,
    setupTokenExpiresAt: null,
    lastReport: null,
    candidates: null,
  };
}

function toCandidate(item: SourcingRecommendationPresenterItem): ConfirmCandidate {
  return {
    itemKey: item.itemKey,
    displayName: item.displayName,
    sourceUrl: item.sourceUrl,
    overseasPriceCny: item.overseasPriceCny,
    overseasPriceKrw: item.overseasPriceKrw,
    salePriceKrw: item.salePriceKrw,
    estimatedMarginRate: item.estimatedMarginRate,
    monthlySales: item.monthlySales,
    coupangSalePriceKrw: item.coupang?.salePriceKrw ?? null,
  };
}

function isVersionConflict(error: unknown): boolean {
  if (!(error instanceof ConflictException)) return false;
  const response = error.getResponse();
  return typeof response === 'object' && response !== null && (response as { code?: unknown }).code === 'REVIEW_SELECTION_VERSION_CONFLICT';
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
