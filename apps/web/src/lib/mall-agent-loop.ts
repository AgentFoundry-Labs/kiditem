'use client';

import { safeStorageGet, safeStorageSet } from './browser-storage';

/**
 * 쇼핑몰 에이전트 자동 운전 — 앱이 열려 있는 동안 스스로 도는 고리.
 *
 * 사람이 버튼을 누르지 않아도 일정한 간격으로 (1) 몰 로그인 상태를 조용히 확인하고
 * (2) 업무시간이면 주문수집을 돌린다. 되돌리기 어려운 일(제출 · 삭제 · 완전품절)은 절대
 * 넣지 않는다 — 읽고 모으는 일만 한다.
 *
 * 여기는 상태와 일정만 가진다. 실제 실행은 `hooks/use-mall-agent-loop.ts` 가 하고,
 * 화면은 이 저장소를 구독해 같은 값을 본다. 탭이 여러 개여도 한 탭만 돌도록 하는 것은
 * 러너가 브라우저 잠금(`navigator.locks`)으로 막는다.
 */

const SETTINGS_KEY = 'kiditem.mall-agent-loop.v1';
/**
 * 일정도 저장한다. 이게 없으면 새로고침할 때마다 일정이 사라져 20초 뒤 한 바퀴가 새로
 * 돈다 — 화면을 몇 번 새로 열었다는 이유로 몰을 그 횟수만큼 두드리게 된다.
 */
const SCHEDULE_KEY = 'kiditem.mall-agent-loop-schedule.v1';

/** 업무시간에만 수집한다 — 몰에 부담을 주지 않고, 사람이 볼 수 있는 시간에만 움직인다. */
export const AGENT_LOOP_BUSINESS_START_HOUR = 9;
export const AGENT_LOOP_BUSINESS_END_HOUR = 18;
export const AGENT_LOOP_INTERVAL_OPTIONS_MIN = [10, 15, 30, 60] as const;
export const AGENT_LOOP_DEFAULT_INTERVAL_MIN = 30;
/** 앱을 켠 뒤 첫 실행까지 두는 시간. 화면이 다 뜨기 전에 몰을 두드리지 않는다. */
export const AGENT_LOOP_FIRST_RUN_DELAY_MS = 20_000;

export interface MallAgentLoopSettings {
  /** 자동 운전을 켤 것인가. 끄면 사람이 누를 때만 움직인다. */
  enabled: boolean;
  intervalMin: number;
}

export type MallAgentLoopStep = 'idle' | 'login' | 'orders';

export interface MallAgentLoopState {
  settings: MallAgentLoopSettings;
  /** 지금 무엇을 하고 있나. */
  step: MallAgentLoopStep;
  lastRunAt: number | null;
  nextRunAt: number | null;
  /** 마지막 한 바퀴를 사람 말로 한 줄. */
  lastSummary: string | null;
  /** '지금 실행'을 누른 횟수 — 러너가 이 값이 바뀌면 바로 한 바퀴 돈다. */
  runRequest: number;
}

const DEFAULT_SETTINGS: MallAgentLoopSettings = {
  enabled: true,
  intervalMin: AGENT_LOOP_DEFAULT_INTERVAL_MIN,
};

function readSettings(): MallAgentLoopSettings {
  const raw = safeStorageGet('local', SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<MallAgentLoopSettings>;
    const intervalMin = AGENT_LOOP_INTERVAL_OPTIONS_MIN.includes(
      parsed.intervalMin as (typeof AGENT_LOOP_INTERVAL_OPTIONS_MIN)[number],
    )
      ? (parsed.intervalMin as number)
      : AGENT_LOOP_DEFAULT_INTERVAL_MIN;
    return { enabled: parsed.enabled !== false, intervalMin };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(settings: MallAgentLoopSettings): void {
  safeStorageSet('local', SETTINGS_KEY, JSON.stringify(settings));
}

interface StoredSchedule {
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastSummary: string | null;
}

function readSchedule(): StoredSchedule {
  const empty: StoredSchedule = { lastRunAt: null, nextRunAt: null, lastSummary: null };
  const raw = safeStorageGet('local', SCHEDULE_KEY);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSchedule>;
    return {
      lastRunAt: typeof parsed.lastRunAt === 'number' ? parsed.lastRunAt : null,
      nextRunAt: typeof parsed.nextRunAt === 'number' ? parsed.nextRunAt : null,
      lastSummary: typeof parsed.lastSummary === 'string' ? parsed.lastSummary : null,
    };
  } catch {
    return empty;
  }
}

function writeSchedule(): void {
  safeStorageSet(
    'local',
    SCHEDULE_KEY,
    JSON.stringify({
      lastRunAt: state.lastRunAt,
      nextRunAt: state.nextRunAt,
      lastSummary: state.lastSummary,
    } satisfies StoredSchedule),
  );
}

let state: MallAgentLoopState = {
  settings: DEFAULT_SETTINGS,
  step: 'idle',
  lastRunAt: null,
  nextRunAt: null,
  lastSummary: null,
  runRequest: 0,
};
let hydrated = false;
const listeners = new Set<() => void>();

function emit(next: Partial<MallAgentLoopState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

/** 브라우저에서 처음 읽을 때 한 번만 저장된 설정을 불러온다. */
function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  state = { ...state, settings: readSettings(), ...readSchedule() };
}

export function subscribeMallAgentLoop(listener: () => void): () => void {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMallAgentLoopState(): MallAgentLoopState {
  hydrate();
  return state;
}

/** 서버 렌더에서는 저장소를 읽지 않는다 — 언제나 같은 기본값을 준다. */
export function getMallAgentLoopServerState(): MallAgentLoopState {
  return state;
}

export function setMallAgentLoopEnabled(enabled: boolean): void {
  const settings = { ...getMallAgentLoopState().settings, enabled };
  writeSettings(settings);
  emit({ settings, nextRunAt: enabled ? state.nextRunAt : null, step: enabled ? state.step : 'idle' });
}

export function setMallAgentLoopInterval(intervalMin: number): void {
  if (!AGENT_LOOP_INTERVAL_OPTIONS_MIN.includes(intervalMin as (typeof AGENT_LOOP_INTERVAL_OPTIONS_MIN)[number])) {
    return;
  }
  const settings = { ...getMallAgentLoopState().settings, intervalMin };
  writeSettings(settings);
  emit({ settings });
}

/** 지금 한 바퀴 돌라고 러너에게 알린다. */
export function requestMallAgentLoopRun(): void {
  emit({ runRequest: getMallAgentLoopState().runRequest + 1 });
}

export function markMallAgentLoopStep(step: MallAgentLoopStep): void {
  emit({ step });
}

export function markMallAgentLoopFinished(summary: string, at: number, nextRunAt: number | null): void {
  emit({ step: 'idle', lastRunAt: at, lastSummary: summary, nextRunAt });
  writeSchedule();
}

export function setMallAgentLoopNextRunAt(nextRunAt: number | null): void {
  emit({ nextRunAt });
  writeSchedule();
}

/**
 * 앱을 켤 때 다음 한 바퀴를 언제로 둘지. 저장된 일정이 아직 오지 않았으면 **그대로 둔다** —
 * 새로고침은 일정을 앞당기는 일이 아니다. 이미 지났거나 없을 때만 잠깐 뒤로 잡되, 마지막
 * 바퀴로부터 한 간격은 반드시 띄운다.
 */
export function resolveMallAgentLoopStartAt(now: number, intervalMs: number): number {
  const { lastRunAt, nextRunAt } = getMallAgentLoopState();
  if (nextRunAt !== null && nextRunAt > now) return nextRunAt;
  const earliest = now + AGENT_LOOP_FIRST_RUN_DELAY_MS;
  return lastRunAt === null ? earliest : Math.max(earliest, lastRunAt + intervalMs);
}

/** 수집은 업무시간에만. 로그인 확인은 시간과 상관없이 돈다. */
export function isWithinAgentBusinessHours(timestamp: number): boolean {
  const hour = new Date(timestamp).getHours();
  return hour >= AGENT_LOOP_BUSINESS_START_HOUR && hour < AGENT_LOOP_BUSINESS_END_HOUR;
}

/** 다음 한 바퀴 시각. 업무 종료를 넘기면 다음 날 업무 시작으로 미룬다. */
export function nextAgentRunAt(fromMs: number, intervalMs: number): number {
  const candidate = fromMs + intervalMs;
  const value = new Date(candidate);
  if (value.getHours() >= AGENT_LOOP_BUSINESS_START_HOUR && value.getHours() < AGENT_LOOP_BUSINESS_END_HOUR) {
    return candidate;
  }
  const next = new Date(candidate);
  if (value.getHours() >= AGENT_LOOP_BUSINESS_END_HOUR) next.setDate(next.getDate() + 1);
  next.setHours(AGENT_LOOP_BUSINESS_START_HOUR, 0, 0, 0);
  return next.getTime();
}

/** 테스트에서 저장소를 비운다. */
export function resetMallAgentLoopForTest(): void {
  state = {
    settings: DEFAULT_SETTINGS,
    step: 'idle',
    lastRunAt: null,
    nextRunAt: null,
    lastSummary: null,
    runRequest: 0,
  };
  hydrated = false;
  listeners.clear();
}

/** 테스트에서 저장된 일정을 심는다. */
export function seedMallAgentLoopScheduleForTest(schedule: Partial<StoredSchedule>): void {
  safeStorageSet(
    'local',
    SCHEDULE_KEY,
    JSON.stringify({ lastRunAt: null, nextRunAt: null, lastSummary: null, ...schedule }),
  );
}
