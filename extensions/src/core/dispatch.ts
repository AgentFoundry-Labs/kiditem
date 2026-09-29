import { PING_ACTION } from '@kiditem/shared/extension-actions';
import { environmentForSender, environmentForTab, isEnvironmentId, type EnvironmentId, type StorageReader } from './environment';
import { isRuntimeError } from './errors';
import type { KeepAlive } from './keep-alive';

/**
 * 확장 메시지 입구(KID-366). 외부(웹앱) 메시지는 이 dispatch 하나가 `chrome.runtime.onMessageExternal`의 **유일한**
 * 리스너로 받는다: 보내는 창 origin → 환경 → `{action}`으로 표에서 액션 → shared 스키마 검증 → 실행 → 봉투
 * `{success:true,…}|{success:false, errorCode, error, details?}`. 응답할 때까지 서비스워커를 붙든다.
 *
 * 과도기(KID-355 wave8b·wave9까지): 새 표가 모르는 액션은 옛 워커 표(`attachLegacy`, 서비스워커가 옛 `KidItemDomains`를
 * 넘긴다)로 넘기고, `ping`은 옛 표의 capability를 합친다. 옛 주문 워커(셀피아·송장·카카오)와 세션 액션이 사라지면 이 길도 지운다.
 */
export interface MessageSender {
  url?: string;
  id?: string;
  tab?: { id?: number };
}
export type SendResponse = (response: unknown) => void;

export interface ActionContext {
  environmentId: EnvironmentId;
  sender: MessageSender;
}

interface ParseSchema<I> {
  safeParse(value: unknown): { success: true; data: I } | { success: false; error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }> } };
}

export interface EntryAction<I = unknown> {
  schema: ParseSchema<I>;
  handle(input: I, context: ActionContext): Promise<object>;
}
/** 액션마다 입력 모양이 다르다 — 표는 모양을 지운 채 들고, 검증한 값만 그 액션에 넘긴다. */
export type ActionTable = Record<string, EntryAction>;

/** 옛 워커 표(`KidItemDomains`)에서 과도기 위임에 쓰는 두 가지. */
export interface LegacyExternalActions {
  forExternalAction(action: string): { validate(message: unknown): unknown; handle(input: unknown, environmentId: string): Promise<unknown> } | null;
  capabilities(): Record<string, unknown>;
}

export interface FailureEnvelope {
  success: false;
  errorCode: string;
  error: string;
  details?: Record<string, unknown>;
}

/** 던진 것을 실패 봉투로. RuntimeError·코드를 실은 옛 오류는 그 코드, 나머지는 `EXTENSION_UNKNOWN_FAILURE`. */
export function failureEnvelope(error: unknown): FailureEnvelope {
  const message = error instanceof Error && error.message ? error.message : '확장 프로그램 작업이 실패했습니다. 다시 시도해 주세요.';
  if (isRuntimeError(error)) return { success: false, errorCode: error.code, error: message, ...(error.details ? { details: error.details } : {}) };
  const code = (error as { code?: unknown } | null)?.code;
  const errorCode = typeof code === 'string' && code.trim() ? code.trim().slice(0, 100) : 'EXTENSION_UNKNOWN_FAILURE';
  return { success: false, errorCode, error: message };
}

function invalid(fields: string[], error = '요청 모양이 올바르지 않습니다.'): FailureEnvelope {
  return { success: false, errorCode: 'VALIDATION_FAILED', error, details: { fields } };
}

function isMessage(value: unknown): value is Record<string, unknown> & { action: string } {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as { action?: unknown }).action === 'string';
}

function run<I>(action: EntryAction<I>, message: unknown, context: ActionContext, keepAlive: KeepAlive, respond: SendResponse): void {
  const parsed = action.schema.safeParse(message);
  if (!parsed.success) {
    // 칸 이름만 싣는다 — 값(자격·토큰)은 오류로 돌려주지 않는다.
    respond(invalid([...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join('.')))]));
    return;
  }
  // 핸들러가 promise를 돌려주기 전에 던져도 답은 나가야 한다.
  void keepAlive.during(Promise.resolve().then(() => action.handle(parsed.data, context)))
    .then(respond, (error: unknown) => respond(failureEnvelope(error)));
}

export interface ExternalDispatchDeps {
  actions: ActionTable;
  capabilities: Record<string, boolean>;
  version(): string;
  keepAlive: KeepAlive;
}

export function createExternalDispatch(deps: ExternalDispatchDeps) {
  let legacy: LegacyExternalActions | null = null;

  function handleMessage(message: unknown, sender: MessageSender, respond: SendResponse): boolean {
    if (!isMessage(message)) return false;
    const environment = environmentForSender(sender?.url);
    if (!environment) {
      respond({ success: false, errorCode: 'FORBIDDEN', error: '허용되지 않은 화면에서 온 요청입니다.' } satisfies FailureEnvelope);
      return false;
    }
    if (message.action === PING_ACTION) {
      respond({ success: true, version: deps.version(), capabilities: { ...(legacy?.capabilities() ?? {}), ...deps.capabilities } });
      return false;
    }
    const context: ActionContext = { environmentId: environment.environmentId, sender };
    const action = Object.prototype.hasOwnProperty.call(deps.actions, message.action) ? deps.actions[message.action] : undefined;
    if (action) {
      run(action, message, context, deps.keepAlive, respond);
      return true;
    }
    // 과도기: 옛 워커가 아직 가진 액션(셀피아·송장·카카오·수집 세션).
    const old = legacy?.forExternalAction(message.action) ?? null;
    if (!old) return false;
    let input: unknown;
    try {
      input = old.validate(message);
    } catch (error) {
      respond(invalid([], error instanceof Error && error.message ? error.message : undefined));
      return false;
    }
    void deps.keepAlive.during(Promise.resolve().then(() => old.handle(input, environment.environmentId)))
      .then(respond, (error: unknown) => respond(failureEnvelope(error)));
    return true;
  }

  return {
    handleMessage,
    /** 서비스워커가 옛 `KidItemDomains`를 넘긴다(과도기, wave9에서 삭제). */
    attachLegacy(table: LegacyExternalActions) {
      legacy = table;
    },
  };
}

export interface InternalDispatchDeps {
  runtimeId: string;
  actions: ActionTable;
  keepAlive: KeepAlive;
  storage: StorageReader;
}

/**
 * 팝업·콘텐츠 스크립트가 `chrome.runtime.sendMessage`로 부르는 액션. 이 확장에서 온 것만 받고, 표에 없는 액션에는
 * 답하지 않는다(다른 리스너 몫). 환경은 팝업이 고른 `environmentId` 또는 팝업이 묶어 둔 탭(콘텐츠 스크립트)으로 정한다.
 */
export function createInternalDispatch(deps: InternalDispatchDeps) {
  function handleMessage(message: unknown, sender: MessageSender, respond: SendResponse): boolean {
    if (!isMessage(message) || sender?.id !== deps.runtimeId) return false;
    if (!Object.prototype.hasOwnProperty.call(deps.actions, message.action)) return false;
    const action = deps.actions[message.action]!;
    void (async () => {
      const environmentId = isEnvironmentId(message.environmentId)
        ? message.environmentId
        : await environmentForTab(deps.storage, sender.tab?.id);
      if (!environmentId) {
        respond(invalid(['environmentId'], '이 탭이 연결된 환경을 찾지 못했습니다. 확장 팝업에서 환경을 고른 뒤 다시 시도해 주세요.'));
        return;
      }
      run(action, message, { environmentId, sender }, deps.keepAlive, respond);
    })().catch((error: unknown) => respond(failureEnvelope(error)));
    return true;
  }
  return { handleMessage };
}
