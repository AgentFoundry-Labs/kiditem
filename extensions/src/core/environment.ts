import { RuntimeError } from './errors';

/**
 * KidItem 환경 표(KID-366, 옛 `environment-context.js` ENVIRONMENTS를 옮겼다). 확장 하나가 로컬과 사무실을 함께 섬기고,
 * 환경은 메시지가 말하는 값이 아니라 **보내는 창의 origin**으로만 정한다. 표에 없는 origin은 환경이 없다(거절).
 */
export type EnvironmentId = 'local' | 'office';

export interface EnvironmentProfile {
  environmentId: EnvironmentId;
  webOrigin: string;
  apiOrigin: string;
  /** 그 환경 웹 탭을 찾는 주소 무늬(재로그인 힌트를 보낼 곳). */
  webUrlPattern: string;
}

const ENVIRONMENTS: Readonly<Record<EnvironmentId, EnvironmentProfile>> = {
  local: { environmentId: 'local', webOrigin: 'http://localhost:3000', apiOrigin: 'http://localhost:4000', webUrlPattern: 'http://localhost:3000/*' },
  office: { environmentId: 'office', webOrigin: 'http://kiditem-office', apiOrigin: 'http://kiditem-office', webUrlPattern: 'http://kiditem-office/*' },
};

export const ENVIRONMENT_IDS: readonly EnvironmentId[] = ['local', 'office'];

/** 보내는 창 주소(`sender.url`)의 origin이 표에 있으면 그 환경. */
export function environmentForSender(url: string | undefined): EnvironmentProfile | null {
  let origin: string;
  try {
    origin = new URL(url ?? '').origin;
  } catch {
    return null;
  }
  return ENVIRONMENT_IDS.map((id) => ENVIRONMENTS[id]).find((environment) => environment.webOrigin === origin) ?? null;
}

export function isEnvironmentId(value: unknown): value is EnvironmentId {
  return typeof value === 'string' && (ENVIRONMENT_IDS as readonly string[]).includes(value);
}

export function requireEnvironment(environmentId: string): EnvironmentProfile {
  if (!isEnvironmentId(environmentId)) throw new RuntimeError('VALIDATION_FAILED', '알 수 없는 환경입니다.', { environmentId });
  return ENVIRONMENTS[environmentId];
}

/**
 * 팝업이 Wing 탭을 환경에 묶어 둔 저장 키(옛 `coupang/environment-runtime.js`가 쓴다 — 과도기에 같은 키를 읽기만 한다).
 * 콘텐츠 스크립트가 보낸 메시지(Wing 재고 내보내기)의 환경은 이 묶음으로 정한다.
 */
export const TAB_BINDINGS_KEY = 'kiditem_coupang_environment_tab_bindings_v1';

export interface StorageReader {
  get(key: string): Promise<Record<string, unknown>>;
}

export async function environmentForTab(storage: StorageReader, tabId: number | undefined): Promise<EnvironmentId | null> {
  if (typeof tabId !== 'number' || !Number.isInteger(tabId) || tabId <= 0) return null;
  const stored = (await storage.get(TAB_BINDINGS_KEY))?.[TAB_BINDINGS_KEY];
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
  const environmentId = (stored as Record<string, unknown>)[String(tabId)];
  return isEnvironmentId(environmentId) ? environmentId : null;
}
